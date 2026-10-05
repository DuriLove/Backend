import { isSelectableRegionId } from '../regions/regionCatalog';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  GoneException,
} from '@nestjs/common';
import {
  inviteCode,
  isHttpUrl,
  isValidCalendarDay,
  shareCardId,
  uniqueId,
} from '../common/ids';
import {
  defaultShareTitle,
  extractHttpUrls,
  guessShareProvider,
  mapProvider,
} from '../common/share-utils';
import { JsonStoreService } from '../store/json-store.service';
import type {
  BoardRecord,
  BoardState,
  IncomingShareRecord,
  PlaceCard,
  PlannedDate,
  PublicUser,
} from '../types';
import type {
  AddPlacesDto,
  CreateBoardDto,
  CreateCardDto,
  CreateDateDto,
  IngestShareDto,
  JoinBoardDto,
  MoveDto,
  ReorderPlacesDto,
  ResolveShareDto,
  UpdateCardDto,
  UpdateDateDto,
} from './dto/board.dto';

@Injectable()
export class BoardsService {
  constructor(private readonly store: JsonStoreService) {}

  list(userId: string) {
    const db = this.store.snapshot();
    return db.boards
      .filter((board) => board.memberIds.includes(userId))
      .map((board) => this.toBoard(board));
  }

  get(userId: string, boardId: string) {
    return this.toBoard(this.requireBoard(userId, boardId));
  }

  async create(userId: string, dto: CreateBoardDto) {
    return this.store.mutate((db) => {
      const id = uniqueId('board', db.boards.map((board) => board.id));
      const board: BoardRecord = {
        id,
        name: dto.name.trim(),
        memberIds: [userId],
        inviteCode: this.freshInvite(db.boards),
        candidateSet: {
          id: `candidate-set-${id}`,
          boardId: id,
          title: '이번 데이트',
          cardIds: [],
        },
        deletedShareRecordIds: [],
      };
      db.boards.push(board);
      return this.toBoard(board, db);
    });
  }

  async join(userId: string, dto: JoinBoardDto) {
    const code = dto.inviteCode.trim().toUpperCase();
    return this.store.mutate((db) => {
      const board = db.boards.find((item) => item.inviteCode === code);
      if (!board) {
        throw new NotFoundException({ code: 'BOARD_NOT_FOUND', message: '초대 코드가 없어요.' });
      }
      if (!board.memberIds.includes(userId)) {
        if (board.memberIds.length >= 2) {
          throw new ConflictException({
            code: 'BOARD_FULL',
            message: '이 보드는 두 명만 함께할 수 있어요.',
          });
        }
        board.memberIds.push(userId);
      }
      return this.toBoard(board, db);
    });
  }

  state(userId: string, boardId: string): BoardState {
    const board = this.requireBoard(userId, boardId);
    const db = this.store.snapshot();
    return {
      cards: db.cards.filter((card) => card.boardId === boardId),
      candidateSet: board.candidateSet,
      dates: db.dates.filter((date) => date.boardId === boardId),
      deletedShareRecordIds: board.deletedShareRecordIds,
    };
  }

  async createCard(userId: string, boardId: string, dto: CreateCardDto) {
    const title = dto.title.trim();
    const originalUrl = dto.originalUrl.trim();
    if (!title) throw new BadRequestException({ code: 'INVALID_TITLE' });
    if (!isHttpUrl(originalUrl)) throw new BadRequestException({ code: 'INVALID_URL' });

    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      if (dto.originShareRecordId && board.deletedShareRecordIds.includes(dto.originShareRecordId)) {
        throw new GoneException({ code: 'SHARE_CARD_DELETED' });
      }
      if (dto.originShareRecordId && !db.shares.some(s => s.id === dto.originShareRecordId && s.boardId === boardId)) {
        throw new NotFoundException({ code: 'SHARE_NOT_FOUND' });
      }
      const card: PlaceCard = {
        id: uniqueId('place', db.cards.map((item) => item.id)),
        boardId,
        title,
        memo: dto.memo?.trim() || undefined,
        imageUrl: dto.imageUrl?.trim() || undefined,
        source: dto.source,
        originalUrl,
        createdBy: userId,
        createdAt: new Date().toISOString(),
        reactions: {},
        originShareRecordId: dto.originShareRecordId,
      };
      db.cards.unshift(card);
      return card;
    });
  }

  async updateCard(userId: string, boardId: string, cardId: string, dto: UpdateCardDto) {
    const title = dto.title.trim();
    if (!title) throw new BadRequestException({ code: 'INVALID_TITLE' });
    const memo = dto.memo?.trim() || undefined;

    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const card = db.cards.find((item) => item.id === cardId && item.boardId === boardId);
      if (!card) throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      card.title = title;
      card.memo = memo;
      return card;
    });
  }

  async deleteCard(userId: string, boardId: string, cardId: string) {
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      const index = db.cards.findIndex((item) => item.id === cardId && item.boardId === boardId);
      if (index < 0) throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      const [card] = db.cards.splice(index, 1);
      board.candidateSet.cardIds = board.candidateSet.cardIds.filter((id) => id !== cardId);
      for (const date of db.dates) {
        if (date.boardId === boardId) {
          date.cardIds = date.cardIds.filter((id) => id !== cardId);
        }
      }
      if (
        card.originShareRecordId &&
        !board.deletedShareRecordIds.includes(card.originShareRecordId)
      ) {
        board.deletedShareRecordIds.push(card.originShareRecordId);
      }
      for (const share of db.shares) {
        if (share.boardId === boardId && (share.convertedCardId === cardId || share.linkedCardId === cardId) &&
            !board.deletedShareRecordIds.includes(share.id)) board.deletedShareRecordIds.push(share.id);
      }
      return card;
    });
  }

  async toggleReaction(userId: string, boardId: string, cardId: string) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const card = db.cards.find((item) => item.id === cardId && item.boardId === boardId);
      if (!card) throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      card.reactions[userId] = !card.reactions[userId];
      return card;
    });
  }

  async addCandidate(userId: string, boardId: string, cardId: string) {
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      if (!db.cards.some((card) => card.id === cardId && card.boardId === boardId)) {
        throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      }
      if (board.candidateSet.cardIds.includes(cardId)) {
        return { kind: 'already-present' as const, candidateSet: board.candidateSet };
      }
      board.candidateSet.cardIds.push(cardId);
      return { kind: 'added' as const, candidateSet: board.candidateSet };
    });
  }

  async removeCandidate(userId: string, boardId: string, cardId: string) {
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      board.candidateSet.cardIds = board.candidateSet.cardIds.filter((id) => id !== cardId);
      return board.candidateSet;
    });
  }

  async moveCandidate(userId: string, boardId: string, cardId: string, dto: MoveDto) {
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      const from = board.candidateSet.cardIds.indexOf(cardId);
      const to = from + (dto.direction === 'up' ? -1 : 1);
      if (from < 0 || to < 0 || to >= board.candidateSet.cardIds.length) {
        return { changed: false, candidateSet: board.candidateSet };
      }
      const cardIds = [...board.candidateSet.cardIds];
      [cardIds[from], cardIds[to]] = [cardIds[to], cardIds[from]];
      board.candidateSet.cardIds = cardIds;
      return { changed: true, candidateSet: board.candidateSet };
    });
  }

  async createDate(userId: string, boardId: string, dto: CreateDateDto) {
    const name = dto.name.trim();
    const date = dto.date === undefined ? null : dto.date;
    const regionId = dto.regionId ?? null;
    if (regionId !== null && !isSelectableRegionId(regionId)) throw new BadRequestException({ code: 'INVALID_REGION' });
    const initialCardId = dto.initialCardId === '' ? null : dto.initialCardId ?? null;
    if (!name) throw new BadRequestException({ code: 'INVALID_NAME' });
    if (!isValidCalendarDay(date)) throw new BadRequestException({ code: 'INVALID_DATE' });

    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const boardDates = db.dates.filter((item) => item.boardId === boardId);
      if (dto.requestId) {
        const matches = boardDates.filter((item) => item.creationRequestId === dto.requestId);
        if (matches.length > 0) {
          const existing = matches[0];
          const original = existing.creationRequest;
          if (
            matches.length !== 1 ||
            !original ||
            original.name !== name ||
            original.date !== date ||
            original.initialCardId !== initialCardId ||
            (original.regionId ?? null) !== regionId
          ) {
            throw new ConflictException({ code: 'REQUEST_CONFLICT' });
          }
          return existing;
        }
      }
      if (initialCardId && !db.cards.some((card) => card.id === initialCardId && card.boardId === boardId)) {
        throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      }
      const planned: PlannedDate = {
        id: uniqueId('date', db.dates.map((item) => item.id)),
        boardId,
        name,
        date,
        regionId,
        cardIds: initialCardId ? [initialCardId] : [],
        ...(dto.requestId
          ? {
              creationRequestId: dto.requestId,
              creationRequest: { name, date, initialCardId, regionId },
            }
          : {}),
      };
      db.dates.push(planned);
      return planned;
    });
  }

  async updateDate(userId: string, boardId: string, dateId: string, dto: UpdateDateDto) {
    const name = dto.name.trim();
    const date = dto.date === undefined ? null : dto.date;
    if (!name) throw new BadRequestException({ code: 'INVALID_NAME' });
    if (!isValidCalendarDay(date)) throw new BadRequestException({ code: 'INVALID_DATE' });

    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const current = db.dates.find((item) => item.id === dateId && item.boardId === boardId);
      if (!current) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      if (dto.regionId != null && dto.regionId !== current.regionId && !isSelectableRegionId(dto.regionId)) throw new BadRequestException({ code: 'INVALID_REGION' });
      current.name = name;
      current.date = date;
      if (dto.regionId !== undefined) current.regionId = dto.regionId;
      return current;
    });
  }

  async deleteDate(userId: string, boardId: string, dateId: string) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const index = db.dates.findIndex((item) => item.id === dateId && item.boardId === boardId);
      if (index < 0) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      const [removed] = db.dates.splice(index, 1);
      return removed;
    });
  }

  async addPlaces(userId: string, boardId: string, dateId: string, dto: AddPlacesDto) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const date = db.dates.find((item) => item.id === dateId && item.boardId === boardId);
      if (!date) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      const valid = new Set(
        db.cards.filter((card) => card.boardId === boardId).map((card) => card.id),
      );
      if (dto.cardIds.some((cardId) => !valid.has(cardId))) {
        throw new NotFoundException({ code: 'CARD_NOT_FOUND' });
      }
      const appended = [...date.cardIds];
      for (const cardId of dto.cardIds) {
        if (!appended.includes(cardId)) appended.push(cardId);
      }
      date.cardIds = appended;
      return date;
    });
  }

  async removePlace(userId: string, boardId: string, dateId: string, cardId: string) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const date = db.dates.find((item) => item.id === dateId && item.boardId === boardId);
      if (!date) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      date.cardIds = date.cardIds.filter((id) => id !== cardId);
      return date;
    });
  }

  async movePlace(userId: string, boardId: string, dateId: string, cardId: string, dto: MoveDto) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const date = db.dates.find((item) => item.id === dateId && item.boardId === boardId);
      if (!date) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      const from = date.cardIds.indexOf(cardId);
      const to = from + (dto.direction === 'up' ? -1 : 1);
      if (from < 0 || to < 0 || to >= date.cardIds.length) {
        return { changed: false, date };
      }
      const cardIds = [...date.cardIds];
      [cardIds[from], cardIds[to]] = [cardIds[to], cardIds[from]];
      date.cardIds = cardIds;
      return { changed: true, date };
    });
  }

  async reorderPlaces(userId: string, boardId: string, dateId: string, dto: ReorderPlacesDto) {
    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const date = db.dates.find((item) => item.id === dateId && item.boardId === boardId);
      if (!date) throw new NotFoundException({ code: 'DATE_NOT_FOUND' });
      const current = date.cardIds;
      if (
        dto.expectedCardIds.length !== current.length ||
        dto.expectedCardIds.some((id, index) => id !== current[index])
      ) {
        throw new ConflictException({ code: 'STALE_ORDER' });
      }
      const known = new Set(
        db.cards.filter((card) => card.boardId === boardId).map((card) => card.id),
      );
      if (
        dto.cardIds.length !== current.length ||
        new Set(dto.cardIds).size !== dto.cardIds.length ||
        dto.cardIds.some((id) => !known.has(id) || !current.includes(id))
      ) {
        throw new BadRequestException({ code: 'INVALID_ORDER' });
      }
      date.cardIds = [...dto.cardIds];
      return date;
    });
  }

  listShares(userId: string, boardId: string) {
    this.requireBoard(userId, boardId);
    return this.store
      .snapshot()
      .shares.filter((share) => share.boardId === boardId)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  }

  async ingestShare(userId: string, boardId: string, dto: IngestShareDto) {
    const rawValue = dto.rawValue;
    const urlCandidates = extractHttpUrls(rawValue);
    const providerGuess = guessShareProvider(rawValue);
    const resolvedUrl = urlCandidates.length === 1 ? urlCandidates[0] : undefined;

    return this.store.mutate((db) => {
      this.requireBoardFrom(db, userId, boardId);
      const record: IncomingShareRecord = {
        id: uniqueId('share', db.shares.map((item) => item.id)),
        boardId,
        receivedAt: new Date().toISOString(),
        rawValue,
        mimeType: dto.mimeType ?? null,
        shareType: dto.shareType ?? 'text',
        urlCandidates,
        providerGuess,
        status: resolvedUrl ? 'received' : 'needs-review',
        ...(resolvedUrl
          ? { resolvedUrl, resolutionSource: 'extracted' as const }
          : {}),
      };
      db.shares.unshift(record);
      return record;
    });
  }

  async resolveShare(userId: string, boardId: string, recordId: string, dto: ResolveShareDto) {
    if (!isHttpUrl(dto.resolvedUrl)) throw new BadRequestException({ code: 'INVALID_URL' });
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      if (board.deletedShareRecordIds.includes(recordId)) throw new GoneException({ code: 'SHARE_CARD_DELETED' });
      const record = db.shares.find((item) => item.id === recordId && item.boardId === boardId);
      if (!record) throw new NotFoundException({ code: 'SHARE_NOT_FOUND' });
      if (record.convertedCardId || record.linkedCardId) throw new ConflictException({ code: 'SHARE_ALREADY_CONVERTED' });
      record.resolvedUrl = dto.resolvedUrl.trim();
      record.resolutionSource = 'user';
      record.status = 'received';
      return record;
    });
  }

  async convertShare(userId: string, boardId: string, recordId: string) {
    return this.store.mutate((db) => {
      const board = this.requireBoardFrom(db, userId, boardId);
      if (board.deletedShareRecordIds.includes(recordId)) throw new GoneException({ code: 'SHARE_CARD_DELETED' });
      const record = db.shares.find((item) => item.id === recordId && item.boardId === boardId);
      if (!record) throw new NotFoundException({ code: 'SHARE_NOT_FOUND' });
      if (record.status === 'needs-review' || !record.resolvedUrl || !record.resolutionSource) {
        return { kind: 'needs-review' as const, record };
      }
      const existingByUrl = db.cards.find(
        (card) => card.boardId === boardId && card.originalUrl === record.resolvedUrl,
      );
      if (existingByUrl) {
        record.status = 'linked-existing';
        record.linkedCardId = existingByUrl.id;
        record.linkedAt = new Date().toISOString();
        return { kind: 'linked-existing' as const, card: existingByUrl, record };
      }

      const deterministicId = shareCardId(record.id);
      const existingById = db.cards.find((card) => card.id === deterministicId);
      if (existingById) {
        record.status = 'converted';
        record.convertedCardId = existingById.id;
        record.convertedAt = new Date().toISOString();
        return { kind: 'converted' as const, card: existingById, record, reused: true };
      }

      const card: PlaceCard = {
        id: deterministicId,
        boardId,
        title: defaultShareTitle(record.providerGuess),
        source: mapProvider(record.providerGuess),
        originalUrl: record.resolvedUrl,
        createdBy: userId,
        createdAt: record.receivedAt,
        reactions: {},
        originShareRecordId: record.id,
      };
      db.cards.unshift(card);
      record.status = 'converted';
      record.convertedCardId = card.id;
      record.convertedAt = new Date().toISOString();
      return { kind: 'converted' as const, card, record, reused: false };
    });
  }

  private requireBoard(userId: string, boardId: string) {
    return this.requireBoardFrom(this.store.snapshot(), userId, boardId);
  }

  private requireBoardFrom(
    db: ReturnType<JsonStoreService['snapshot']>,
    userId: string,
    boardId: string,
  ) {
    const board = db.boards.find((item) => item.id === boardId);
    if (!board) throw new NotFoundException({ code: 'BOARD_NOT_FOUND' });
    if (!board.memberIds.includes(userId)) {
      throw new ForbiddenException({ code: 'NOT_A_MEMBER' });
    }
    return board;
  }

  private freshInvite(boards: BoardRecord[]) {
    let code = inviteCode();
    const used = new Set(boards.map((board) => board.inviteCode));
    while (used.has(code)) code = inviteCode();
    return code;
  }

  private toBoard(board: BoardRecord, db = this.store.snapshot()) {
    const users = db.users;
    const members: PublicUser[] = board.memberIds.map((id) => {
      const user = users.find((item) => item.id === id);
      return { id, name: user?.name ?? '알 수 없음' };
    });
    return {
      id: board.id,
      name: board.name,
      members,
      inviteCode: board.inviteCode,
    };
  }
}
