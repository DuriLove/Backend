import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ArrayMaxSize,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: '우리 데이트 보드' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  name!: string;
}

export class JoinBoardDto {
  @ApiProperty({ example: 'DURI01' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  inviteCode!: string;
}

export class CreateCardDto {
  @ApiProperty({ example: '성수 카페' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  memo?: string;

  @ApiProperty({ enum: ['instagram', 'naver', 'kakao', 'other'] })
  @IsIn(['instagram', 'naver', 'kakao', 'other'])
  source!: 'instagram' | 'naver' | 'kakao' | 'other';

  @ApiProperty({ example: 'https://www.instagram.com/p/example/' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  originalUrl!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  originShareRecordId?: string;
}

export class UpdateCardDto {
  @ApiProperty({ example: '성수에서 가보고 싶은 카페' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  memo?: string;
}

export class CreateDateDto {
  @ApiProperty({ example: '이번 데이트' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  name!: string;

  @ApiPropertyOptional({ example: '2026-10-11', nullable: true })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(10000)
  date?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  initialCardId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  regionId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  requestId?: string;
}

export class UpdateDateDto {
  @ApiProperty({ example: '이번 데이트' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  name!: string;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(10000)
  date?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  regionId?: string | null;
}

export class AddPlacesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayNotEmpty()
  @IsString({ each: true })
  cardIds!: string[];
}

export class ReorderPlacesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  cardIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  expectedCardIds!: string[];
}

export class MoveDto {
  @ApiProperty({ enum: ['up', 'down'] })
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

export class IngestShareDto {
  @ApiProperty({ example: '여기 어때? https://naver.me/example' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  rawValue!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  mimeType?: string | null;

  @ApiPropertyOptional({ example: 'text' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  shareType?: string;
}

export class ResolveShareDto {
  @ApiProperty({ example: 'https://naver.me/example' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  resolvedUrl!: string;
}

export class UnfurlDto {
  @ApiProperty({ example: 'https://naver.me/example' })
  @IsString()
  @MaxLength(10000)
  @MinLength(1)
  @Matches(/\S/)
  url!: string;
}
