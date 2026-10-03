import { HttpException, Injectable } from '@nestjs/common';
import { SafeHttpService, LINK_HOSTS, UpstreamError } from '../security/safe-http.service';
import { guessShareProvider, mapProvider } from '../common/share-utils';

function meta(html: string, key: string) {
  const property = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const reversed = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`,
    'i',
  );
  return html.match(property)?.[1] ?? html.match(reversed)?.[1] ?? null;
}

function pageTitle(html: string) {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null;
}

@Injectable()
export class LinksService {
  constructor(private readonly http: SafeHttpService) {}
  async unfurl(url: string) {
    try {
      const response = await this.http.get(url.trim(), LINK_HOSTS);
      const html = response.body;
      const providerGuess = guessShareProvider(response.url);
      return { url: response.url, title: meta(html, 'og:title') ?? pageTitle(html),
        description: meta(html, 'og:description') ?? meta(html, 'description'), imageUrl: meta(html, 'og:image'),
        source: mapProvider(providerGuess), providerGuess };
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw new HttpException({ code: error.code, retryable: error.retryable }, error.retryable ? 503 : 400);
      }
      throw error;
    }
  }
}
