import type { ShareProviderGuess, SourceType } from '../types';

const EXPLICIT_HTTP_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const TRAILING_SENTENCE_PUNCTUATION = /[.,!?;:]+$/u;

function removeUnmatchedClosingDelimiters(value: string) {
  let candidate = value;
  for (const [opening, closing] of [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ] as const) {
    const openingCount = candidate.split(opening).length - 1;
    const closingCount = candidate.split(closing).length - 1;
    if (closingCount > openingCount && candidate.endsWith(closing)) {
      candidate = candidate.slice(0, -1);
    }
  }
  return candidate;
}

export function extractHttpUrls(rawValue: string): string[] {
  return Array.from(rawValue.matchAll(EXPLICIT_HTTP_URL_PATTERN), ([match]) => {
    const withoutPunctuation = match.replace(TRAILING_SENTENCE_PUNCTUATION, '');
    return removeUnmatchedClosingDelimiters(withoutPunctuation);
  }).filter((candidate) => {
    try {
      const parsed = new URL(candidate);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });
}

function hostnameMatches(hostname: string, domain: string) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function guessShareProvider(rawValue: string): ShareProviderGuess {
  for (const candidate of extractHttpUrls(rawValue)) {
    const hostname = new URL(candidate).hostname.toLowerCase();
    if (hostnameMatches(hostname, 'instagram.com')) return 'instagram';
    if (hostnameMatches(hostname, 'naver.com') || hostnameMatches(hostname, 'naver.me')) {
      return 'naver';
    }
    if (
      hostnameMatches(hostname, 'kakao.com') ||
      hostnameMatches(hostname, 'kko.to') ||
      hostnameMatches(hostname, 'kakaocdn.net')
    ) {
      return 'kakao';
    }
  }

  const normalized = rawValue.toLowerCase();
  if (normalized.includes('instagram')) return 'instagram';
  if (normalized.includes('naver') || normalized.includes('네이버')) return 'naver';
  if (normalized.includes('kakao') || normalized.includes('카카오')) return 'kakao';
  return 'unknown';
}

export function mapProvider(provider: ShareProviderGuess): SourceType {
  return provider === 'unknown' ? 'other' : provider;
}

export function defaultShareTitle(provider: ShareProviderGuess) {
  switch (provider) {
    case 'instagram':
      return 'Instagram 링크';
    case 'naver':
      return '네이버 지도 링크';
    case 'kakao':
      return '카카오맵 링크';
    default:
      return '공유한 링크';
  }
}
