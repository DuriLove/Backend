import type { Resolution } from './resolutions/resolution.types';
export type SourceType = 'instagram' | 'naver' | 'kakao' | 'other';
export type ShareProviderGuess = 'instagram' | 'naver' | 'kakao' | 'unknown';
export type ShareStatus = 'received' | 'needs-review' | 'converted' | 'linked-existing';
export type MoveDirection = 'up' | 'down';

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
};

export type PublicUser = {
  id: string;
  name: string;
};

export type DateCreationRequest = {
  name: string;
  date: string | null;
  initialCardId: string | null;
  regionId?: string | null;
};

export type PlaceCard = {
  id: string;
  boardId: string;
  title: string;
  memo?: string;
  imageUrl?: string;
  source: SourceType;
  originalUrl: string;
  createdBy: string;
  createdAt: string;
  reactions: Record<string, boolean>;
  originShareRecordId?: string;
};

export type DateCandidateSet = {
  id: string;
  boardId: string;
  title: string;
  cardIds: string[];
};

export type PlannedDate = {
  id: string;
  boardId: string;
  name: string;
  date: string | null;
  regionId?: string | null;
  cardIds: string[];
  creationRequestId?: string;
  creationRequest?: DateCreationRequest;
};

export type IncomingShareRecord = {
  id: string;
  boardId: string;
  receivedAt: string;
  rawValue: string;
  mimeType: string | null;
  shareType: string;
  urlCandidates: string[];
  providerGuess: ShareProviderGuess;
  status: ShareStatus;
  resolvedUrl?: string;
  resolutionSource?: 'extracted' | 'user';
  convertedCardId?: string;
  convertedAt?: string;
  linkedCardId?: string;
  linkedAt?: string;
};

export type BoardRecord = {
  id: string;
  name: string;
  memberIds: string[];
  inviteCode: string;
  candidateSet: DateCandidateSet;
  deletedShareRecordIds: string[];
};

export type BoardState = {
  cards: PlaceCard[];
  candidateSet: DateCandidateSet;
  dates: PlannedDate[];
  deletedShareRecordIds: string[];
};

export type Database = {
  resolutions: Resolution[];
  users: UserRecord[];
  boards: BoardRecord[];
  cards: PlaceCard[];
  dates: PlannedDate[];
  shares: IncomingShareRecord[];
};
