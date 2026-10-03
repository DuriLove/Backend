import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

export class UpstreamError extends Error {
  constructor(public readonly code: string, public readonly retryable = false, public readonly retryAfterMs?: number) { super(code); }
}
const blocked = new BlockList();
for (const [ip, bits] of [ ['0.0.0.0',8], ['10.0.0.0',8], ['100.64.0.0',10], ['127.0.0.0',8],
  ['169.254.0.0',16], ['172.16.0.0',12], ['192.0.0.0',24], ['192.0.2.0',24], ['192.168.0.0',16],
  ['198.18.0.0',15], ['198.51.100.0',24], ['203.0.113.0',24], ['224.0.0.0',4], ['240.0.0.0',4] ] as const) blocked.addSubnet(ip,bits,'ipv4');
const ipv6Global = new BlockList(); ipv6Global.addSubnet('2000::',3,'ipv6');
for (const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16]] as const) blocked.addSubnet(ip,bits,'ipv6');
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,'ipv4') : family === 6 && ipv6Global.check(address,'ipv6') && !blocked.check(address,'ipv6');
}
export const MAP_HOSTS = ['naver.me','map.naver.com','m.map.naver.com','maps.naver.com','pcmap.place.naver.com',
  'm.place.naver.com','place.map.kakao.com','map.kakao.com','m.map.kakao.com','kko.to'];
export const LINK_HOSTS = [...MAP_HOSTS, 'instagram.com','www.instagram.com','m.instagram.com'];
type HttpResult = { status: number; url: string; headers: Record<string, string | string[] | undefined>; body: string };

@Injectable()
export class SafeHttpService {
  validate(url: string, allowed: readonly string[]) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new UpstreamError('INVALID_URL'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || (parsed.port && parsed.port !== '443') ||
        !allowed.includes(parsed.hostname.toLowerCase())) throw new UpstreamError('UNSAFE_URL');
    return parsed;
  }

  protected async addresses(hostname: string) { return lookup(hostname, { all: true, verbatim: true }); }

  protected pinned(url: URL, address: { address: string; family: number }, headers: Record<string,string>, signal: AbortSignal, maxBytes: number): Promise<HttpResult> {
    return new Promise((resolve, reject) => {
      const req = request(url, { method: 'GET', agent: false, signal,
        headers: { Accept: 'application/json,text/html', 'Accept-Encoding': 'identity', ...headers },
        lookup: ((_host: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
          callback(null, options.all ? [address] : address.address, address.family);
        }) as any,
      }, response => {
        const encoding = response.headers['content-encoding'];
        if ((encoding && encoding !== 'identity') || Number(response.headers['content-length'] ?? 0) > maxBytes) {
          response.destroy(); req.destroy(); reject(new UpstreamError('RESPONSE_TOO_LARGE_OR_ENCODED')); return;
        }
        // Redirect bodies are unnecessary; close immediately to avoid downloading them.
        if ([301,302,303,307,308].includes(response.statusCode ?? 0)) {
          resolve({status: response.statusCode!, url:url.href, headers:response.headers, body:''}); response.destroy(); return;
        }
        const chunks: Buffer[] = []; let length = 0;
        response.on('data', (chunk: Buffer) => {
          length += chunk.length;
          if (length > maxBytes) { response.destroy(new UpstreamError('RESPONSE_TOO_LARGE')); return; }
          chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode ?? 502, url: url.href, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
      });
      req.on('error', reject); req.end();
    });
  }

  async get(raw: string, allowed: readonly string[], headers: Record<string,string> = {}, timeoutMs = 8000, maxBytes = 250_000, redirects = 4): Promise<HttpResult> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const expired = new Promise<never>((_, reject) => { timeout = setTimeout(() => {
      controller.abort(); reject(new UpstreamError('PROVIDER_TIMEOUT', true));
    }, timeoutMs); });
    const run = async () => {
      let url = this.validate(raw, allowed);
      for (let hop = 0; ; hop++) {
        if (controller.signal.aborted) throw new UpstreamError('PROVIDER_TIMEOUT', true);
        const addresses = await this.addresses(url.hostname);
        if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new UpstreamError('UNSAFE_ADDRESS');
        const result = await this.pinned(url, addresses[0], headers, controller.signal, maxBytes);
        if ([301,302,303,307,308].includes(result.status)) {
          if (hop >= redirects || !result.headers.location || Array.isArray(result.headers.location)) throw new UpstreamError('REDIRECT_LIMIT');
          const next = this.validate(new URL(result.headers.location, url).href, allowed);
          if (next.origin !== url.origin && Object.keys(headers).length) throw new UpstreamError('CREDENTIAL_REDIRECT_BLOCKED');
          url = next; continue;
        }
        if (result.status === 429) {
          const rawRetry = String(result.headers['retry-after'] ?? '');
          const delay = /^\d+$/.test(rawRetry) ? Number(rawRetry)*1000 : Date.parse(rawRetry)-Date.now();
          throw new UpstreamError('PROVIDER_RATE_LIMIT', true, Number.isFinite(delay) ? Math.max(1000,delay) : 60_000);
        }
        if (result.status >= 500) throw new UpstreamError('PROVIDER_UNAVAILABLE', true);
        if (result.status === 403 && /disabled OPEN_MAP_AND_LOCAL service/.test(result.body)) throw new UpstreamError('PROVIDER_SERVICE_DISABLED');
        if (result.status >= 400) throw new UpstreamError(result.status === 401 || result.status === 403 ? 'PROVIDER_AUTH_FAILED' : 'LINK_NOT_FOUND');
        return result;
      }
    };
    try { return await Promise.race([run(), expired]); }
    catch (error) { if (error instanceof UpstreamError) throw error; throw new UpstreamError('PROVIDER_NETWORK_ERROR', true); }
    finally { clearTimeout(timeout!); controller.abort(); }
  }
}
