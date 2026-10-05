import { MetricsService } from '../security/metrics.service';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SafeHttpService, UpstreamError } from '../security/safe-http.service';
import { JsonStoreService } from '../store/json-store.service';
import { RegionsService } from '../regions/regions.service';
import type { Provider, SearchPlace, RegionResult } from './resolution.types';

@Injectable()
export class ProvidersService {
  constructor(private readonly config: ConfigService, private readonly http: SafeHttpService,
    private readonly store: JsonStoreService, private readonly regions: RegionsService, @Optional() private readonly metrics?: MetricsService) {}
  lookupProvider(source: Provider): Provider {
    const override = this.config.get<string>('PLACE_LOOKUP_PROVIDER', 'source');
    return override === 'kakao' || override === 'naver' ? override : source;
  }
  private naverMode() { return this.config.get<string>('NAVER_API_MODE', 'hub'); }
  placeStorageAllowed(provider: Provider) { return this.config.get<string>(`${provider.toUpperCase()}_PLACE_STORAGE_APPROVED`) === 'true'; }
  regionStorageAllowed(provider: Provider) { return this.config.get<string>(`${provider.toUpperCase()}_REGION_STORAGE_APPROVED`) === 'true'; }
  private async json(url: string, provider: Provider, headers: Record<string,string>): Promise<any> {
    const retry = this.store.consumeLimit(`provider:${provider}:minute`, 60, 60_000) || this.store.consumeLimit(`provider:${provider}:day`, 1000, 86_400_000);
    if (retry) throw new UpstreamError('PROVIDER_BUDGET_EXCEEDED',true,retry);
    const started=Date.now();
    try {
      const result = await this.http.get(url, provider === 'kakao' ? ['dapi.kakao.com'] : [this.naverMode() === 'hub' ? 'naverapihub.apigw.ntruss.com' : 'openapi.naver.com'],headers,8000,250_000,0);
      let parsed;try {parsed=JSON.parse(result.body);}catch{throw new UpstreamError('INVALID_PROVIDER_RESPONSE');}
      this.metrics?.record(`provider.${provider}`,Date.now()-started);return parsed;
    } catch(error) {this.metrics?.record(`provider.${provider}`,Date.now()-started,true);throw error;}
  }
  private credentials(provider: Provider): Record<string,string> {
    if (provider === 'kakao') {
      const key = this.config.get<string>('KAKAO_REST_API_KEY');
      if (!key) throw new UpstreamError('PROVIDER_NOT_CONFIGURED');
      return {Authorization:`KakaoAK ${key}`};
    }
    const hub = this.naverMode() === 'hub';
    const id = this.config.get<string>(hub ? 'NAVER_HUB_CLIENT_ID' : 'NAVER_CLIENT_ID');
    const secret = this.config.get<string>(hub ? 'NAVER_HUB_CLIENT_SECRET' : 'NAVER_CLIENT_SECRET');
    if (!id || !secret) throw new UpstreamError('PROVIDER_NOT_CONFIGURED');
    return hub ? {'X-NCP-APIGW-API-KEY-ID':id,'X-NCP-APIGW-API-KEY':secret} : {'X-Naver-Client-Id':id,'X-Naver-Client-Secret':secret};
  }
  async search(provider: Provider, query: string): Promise<SearchPlace[]> {
    if (!this.placeStorageAllowed(provider)) { this.credentials(provider); throw new UpstreamError('PLACE_STORAGE_POLICY_BLOCKED'); }
    return this.searchTransient(provider,query);
  }
  /** CLI verification only: caller must not persist provider fields. No HTTP route exposes this method. */
  async searchTransient(provider: Provider, query: string): Promise<SearchPlace[]> {
    const credentials = this.credentials(provider);
    const url = provider === 'kakao' ? `https://dapi.kakao.com/v2/local/search/keyword.json?size=15&query=${encodeURIComponent(query)}` :
      `${this.naverMode() === 'hub' ? 'https://naverapihub.apigw.ntruss.com/search/v1/local' : 'https://openapi.naver.com/v1/search/local.json'}?display=5&query=${encodeURIComponent(query)}`;
    const data = await this.json(url,provider,credentials);
    const documents = provider === 'kakao' ? data.documents : data.items;
    if (!Array.isArray(documents)) throw new UpstreamError('INVALID_PROVIDER_RESPONSE');
    return documents.slice(0,15).map((d: any): SearchPlace => {
      const strip = (v: unknown) => typeof v === 'string' ? v.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').trim().slice(0,1000) : '';
      const name = strip(provider === 'kakao' ? d.place_name : d.title);
      if (!name) throw new UpstreamError('INVALID_PROVIDER_RESPONSE');
      const result: SearchPlace = { provider, providerPlaceId: provider === 'kakao' && typeof d.id === 'string' ? d.id : null,
        name, url: provider === 'kakao' ? this.safePlaceUrl(d.place_url) : this.safePlaceUrl(d.link),
        address: strip(provider === 'kakao' ? d.address_name : d.address),roadAddress:strip(provider === 'kakao' ? d.road_address_name : d.roadAddress) };
      if (provider === 'kakao' && d.x && d.y) {
        const longitude = Number(d.x), latitude = Number(d.y);
        try { this.regions.validateCoordinates(longitude,latitude); } catch { throw new UpstreamError('INVALID_PROVIDER_COORDINATES'); }
        result.longitude = longitude; result.latitude = latitude;
      }
      // Naver mapx/mapy encoding is not assumed to be WGS84 degrees; address mapping is used.
      return result;
    });
  }
  private safePlaceUrl(value: unknown) {
    if (typeof value !== 'string' || value.length > 2048) return null;
    try { const u = new URL(value); return ['http:','https:'].includes(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
  }
  async region(place: SearchPlace): Promise<RegionResult> {
    if (!this.regionStorageAllowed(place.provider)) return this.regions.empty('REGION_STORAGE_POLICY_BLOCKED',true);
    return this.regionTransient(place);
  }
  /** In-memory comparison for the CLI; production jobs still pass the storage policy gate. */
  async regionTransient(place: SearchPlace): Promise<RegionResult> {
    const address = this.regions.mapAddress(place.address || place.roadAddress);
    if (place.provider !== 'kakao' || place.longitude === undefined || place.latitude === undefined) return address;
    const data = await this.json(`https://dapi.kakao.com/v2/local/geo/coord2regioncode.json?x=${place.longitude}&y=${place.latitude}&input_coord=WGS84`, 'kakao', this.credentials('kakao'));
    if (!Array.isArray(data.documents)) throw new UpstreamError('INVALID_PROVIDER_RESPONSE');
    const legal = data.documents.find((d: any)=>d.region_type === 'B');
    if (!legal) return address;
    const coordinate = this.regions.mapAddress(`${legal.region_1depth_name ?? ''} ${legal.region_2depth_name ?? ''}`);
    return this.regions.reconcile(address,coordinate);
  }
}
