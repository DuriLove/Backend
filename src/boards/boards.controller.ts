import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user';
import { JwtAuthGuard } from '../auth/jwt.guard';
import type { PublicUser } from '../types';
import { BoardsService } from './boards.service';
import {
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

@ApiTags('보드')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get()
  @ApiOperation({ summary: '내 보드 목록' })
  list(@CurrentUser() user: PublicUser) {
    return this.boards.list(user.id);
  }

  @Post()
  @ApiOperation({ summary: '보드 만들기' })
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateBoardDto) {
    return this.boards.create(user.id, dto);
  }

  @Post('join')
  @ApiOperation({ summary: '초대 코드로 보드 합류 (최대 2명)' })
  join(@CurrentUser() user: PublicUser, @Body() dto: JoinBoardDto) {
    return this.boards.join(user.id, dto);
  }

  @Get(':boardId')
  @ApiOperation({ summary: '보드 정보' })
  get(@CurrentUser() user: PublicUser, @Param('boardId') boardId: string) {
    return this.boards.get(user.id, boardId);
  }

  @Get(':boardId/state')
  @ApiOperation({ summary: '보드 전체 상태 (카드·후보·데이트)' })
  state(@CurrentUser() user: PublicUser, @Param('boardId') boardId: string) {
    return this.boards.state(user.id, boardId);
  }

  @Post(':boardId/cards')
  @ApiOperation({ summary: '장소 카드 추가' })
  createCard(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateCardDto,
  ) {
    return this.boards.createCard(user.id, boardId, dto);
  }

  @Patch(':boardId/cards/:cardId')
  @ApiOperation({ summary: '카드 제목·메모 수정' })
  updateCard(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.boards.updateCard(user.id, boardId, cardId, dto);
  }

  @Delete(':boardId/cards/:cardId')
  @ApiOperation({ summary: '카드 삭제' })
  deleteCard(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.boards.deleteCard(user.id, boardId, cardId);
  }

  @Post(':boardId/cards/:cardId/reaction')
  @ApiOperation({ summary: '내 반응 토글' })
  toggleReaction(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.boards.toggleReaction(user.id, boardId, cardId);
  }

  @Post(':boardId/candidates/:cardId')
  @ApiOperation({ summary: '이번 데이트 후보에 추가' })
  addCandidate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.boards.addCandidate(user.id, boardId, cardId);
  }

  @Delete(':boardId/candidates/:cardId')
  @ApiOperation({ summary: '후보에서 제거' })
  removeCandidate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.boards.removeCandidate(user.id, boardId, cardId);
  }

  @Post(':boardId/candidates/:cardId/move')
  @ApiOperation({ summary: '후보 순서 위/아래' })
  moveCandidate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('cardId') cardId: string,
    @Body() dto: MoveDto,
  ) {
    return this.boards.moveCandidate(user.id, boardId, cardId, dto);
  }

  @Post(':boardId/dates')
  @ApiOperation({ summary: '데이트 만들기' })
  createDate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Body() dto: CreateDateDto,
  ) {
    return this.boards.createDate(user.id, boardId, dto);
  }

  @Patch(':boardId/dates/:dateId')
  @ApiOperation({ summary: '데이트 이름·날짜·지역 수정' })
  updateDate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
    @Body() dto: UpdateDateDto,
  ) {
    return this.boards.updateDate(user.id, boardId, dateId, dto);
  }

  @Delete(':boardId/dates/:dateId')
  @ApiOperation({ summary: '데이트 삭제' })
  deleteDate(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
  ) {
    return this.boards.deleteDate(user.id, boardId, dateId);
  }

  @Post(':boardId/dates/:dateId/places')
  @ApiOperation({ summary: '데이트에 장소 담기' })
  addPlaces(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
    @Body() dto: AddPlacesDto,
  ) {
    return this.boards.addPlaces(user.id, boardId, dateId, dto);
  }

  @Delete(':boardId/dates/:dateId/places/:cardId')
  @ApiOperation({ summary: '데이트에서 장소 빼기' })
  removePlace(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
    @Param('cardId') cardId: string,
  ) {
    return this.boards.removePlace(user.id, boardId, dateId, cardId);
  }

  @Post(':boardId/dates/:dateId/places/:cardId/move')
  @ApiOperation({ summary: '데이트 장소 위/아래' })
  movePlace(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
    @Param('cardId') cardId: string,
    @Body() dto: MoveDto,
  ) {
    return this.boards.movePlace(user.id, boardId, dateId, cardId, dto);
  }

  @Post(':boardId/dates/:dateId/reorder')
  @ApiOperation({ summary: '데이트 장소 드래그 순서 확정' })
  reorderPlaces(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('dateId') dateId: string,
    @Body() dto: ReorderPlacesDto,
  ) {
    return this.boards.reorderPlaces(user.id, boardId, dateId, dto);
  }

  @Get(':boardId/shares')
  @ApiOperation({ summary: '공유 보관함' })
  listShares(@CurrentUser() user: PublicUser, @Param('boardId') boardId: string) {
    return this.boards.listShares(user.id, boardId);
  }

  @Post(':boardId/shares')
  @ApiOperation({ summary: '공유 원문 수신' })
  ingestShare(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Body() dto: IngestShareDto,
  ) {
    return this.boards.ingestShare(user.id, boardId, dto);
  }

  @Patch(':boardId/shares/:recordId')
  @ApiOperation({ summary: '공유 URL 직접 지정' })
  resolveShare(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('recordId') recordId: string,
    @Body() dto: ResolveShareDto,
  ) {
    return this.boards.resolveShare(user.id, boardId, recordId, dto);
  }

  @Post(':boardId/shares/:recordId/convert')
  @ApiOperation({ summary: '공유 원문을 카드로 변환' })
  convertShare(
    @CurrentUser() user: PublicUser,
    @Param('boardId') boardId: string,
    @Param('recordId') recordId: string,
  ) {
    return this.boards.convertShare(user.id, boardId, recordId);
  }
}
