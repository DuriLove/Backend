export type Provider = 'kakao' | 'naver';
export type ResolutionStatus = 'queued' | 'processing' | 'resolved' | 'needs_confirmation' | 'no_match' | 'unsupported' | 'failed';
export type RegionResult = {
  status: 'mapped' | 'partial' | 'unmapped' | 'policy_blocked';
  provinceId: string | null; districtId: string | null; dateAreaId: null;
  catalogVersion: string; reasonCodes: string[];
};
export type Place = { provider: Provider; providerPlaceId: string | null; name: string; url: string | null };
export type Candidate = { candidateId: string; place: Place; region: RegionResult; reasonCodes: string[]; expiresAt: string };
export type ResolutionInput = {
  clientCardId: string; inputRevision: number; sharedText: string; sharedUrl?: string;
  sourceType: 'naver_map' | 'kakao_map' | 'unknown'; regionCatalogVersion: string;
};
export type ResolutionError = { code: string; retryable: boolean; retryAfterMs?: number };
export type Attempt = { number: number; startedAt: string; finishedAt?: string; errorCode?: string };
export type Resolution = {
  resolutionId: string; userId: string; idempotencyKey: string; fingerprint: string; input: ResolutionInput;
  revision: number; status: ResolutionStatus; attempt: number; attempts: Attempt[];
  createdAt: string; updatedAt: string; expiresAt: string; nextAttemptAt: number;
  leaseToken?: string; leaseUntil?: number;
  matchMethod: 'automatic' | 'user' | null; reasonCodes: string[];
  candidates: Candidate[]; place: Place | null; region: RegionResult; error: ResolutionError | null;
  selection?: { candidateId: string; expectedRevision: number };
  retries: { key: string; fingerprint: string }[];
};
export type SearchPlace = Place & { address: string; roadAddress: string; longitude?: number; latitude?: number };
