import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
export class CreateResolutionDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(128) @Matches(/\S/) clientCardId!: string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) @Max(2147483647) inputRevision!: number;
  @ApiProperty({enum:['naver_map','kakao_map','unknown']}) @IsIn(['naver_map','kakao_map','unknown']) sourceType!: 'naver_map'|'kakao_map'|'unknown';
  @ApiProperty({maxLength:10000}) @IsString() @MaxLength(10000) sharedText!: string;
  @ApiPropertyOptional({maxLength:2048}) @IsOptional() @IsString() @MinLength(1) @MaxLength(2048) sharedUrl?: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) regionCatalogVersion!: string;
}
export class SelectCandidateDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(100) candidateId!: string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) @Max(2147483647) expectedRevision!: number;
}
export class RetryResolutionDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) @Max(2147483647) expectedRevision!: number;
}
