import { extractHttpUrls } from '../common/share-utils';
import { MAP_HOSTS, SafeHttpService } from '../security/safe-http.service';
import type { Provider, ResolutionInput } from './resolution.types';
export type ParsedShare = { provider: Provider | null; url?: string; placeId?: string; name: string; address: string; unsupported?: string; short?: boolean };
export function parseShare(input: ResolutionInput, expandedUrl?: string): ParsedShare {
  const urls = [...new Set(extractHttpUrls(input.sharedText).concat(input.sharedUrl ? [input.sharedUrl] : []))];
  const empty: ParsedShare = {provider:null,name:'',address:''};
  if (urls.length > 1) return {...empty,unsupported:'MULTIPLE_URLS'};
  const raw = expandedUrl ?? urls[0];
  if (!raw) return {...empty,unsupported:'MAP_URL_REQUIRED'};
  let url: URL;
  try { const supplied = new URL(raw); if (supplied.protocol === 'http:') supplied.protocol = 'https:';
    url = new SafeHttpService().validate(supplied.href, MAP_HOSTS); } catch { return {...empty,unsupported:'UNSUPPORTED_OR_UNSAFE_URL'}; }
  const provider: Provider = url.hostname.includes('naver') ? 'naver' : 'kakao';
  if (input.sourceType !== 'unknown' && input.sourceType !== `${provider}_map`) return {...empty,unsupported:'SOURCE_TYPE_MISMATCH'};
  const lines = input.sharedText.replace(/https?:\/\/[^\s<>"'`]+/giu,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
    .filter(s=> !/^\[?(네이버\s*지도|네이버지도|카카오맵|KakaoMap|NAVER Map)\]?$/i.test(s));
  const addressIndex = lines.findIndex(s=>/^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충청|충북|충남|전라|전북|전남|경상|경북|경남|제주)\S*\s/.test(s));
  const address = addressIndex < 0 ? '' : lines[addressIndex];
  const name = (addressIndex === 0 ? '' : lines[0] ?? '').replace(/^(장소명|이름)\s*:\s*/,'');
  const result: ParsedShare = { provider, url:url.href, name, address };
  if (url.hostname === 'naver.me' || url.hostname === 'kko.to') return {...result,short:true};
  // Search/list/route URLs are not a single place, even if the shared text contains a name.
  // Naver's public short links can resolve to a search page with ONE selected place.
  const selectedNaverPlace = provider === 'naver' && url.hostname === 'map.naver.com' && /^\/p\/search\/[^/]+\/place\/\d+\/?$/.test(url.pathname);
  if ((!selectedNaverPlace && /\/(search|directions?|route|lists?|folder)(\/|$)/i.test(url.pathname)) || ['q','sName','eName','folderid'].some(k=>url.searchParams.has(k))) {
    return {...result,unsupported:'NOT_A_SINGLE_PLACE'};
  }
  const id = provider === 'naver' ? url.pathname.match(/\/(?:place|entry\/place|restaurant)\/(\d+)/)?.[1] :
    url.hostname === 'place.map.kakao.com' ? url.pathname.match(/^\/(\d+)\/?$/)?.[1] :
    url.searchParams.get('itemId') ?? url.pathname.match(/^\/link\/map\/(\d+)\/?$/)?.[1];
  if (!id) return {...result,unsupported:'UNRECOGNIZED_PLACE_LINK'};
  return {...result,placeId:id};
}
export function normalizeName(value: string) { return value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('ko-KR'); }
export function normalizeAddress(value: string) { return value.normalize('NFKC').replace(/\s+/g,' ').trim(); }
