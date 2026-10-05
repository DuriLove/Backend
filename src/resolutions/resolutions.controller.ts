import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user';
import type { PublicUser } from '../types';
import { RegionsService } from '../regions/regions.service';
import { ResolutionsService } from './resolutions.service';
import { CreateResolutionDto, SelectCandidateDto, RetryResolutionDto } from './resolutions.dto';
@ApiTags('장소 판별') @ApiBearerAuth() @UseGuards(JwtAuthGuard)
@Controller('place-resolutions')
export class ResolutionsController {
  constructor(private readonly service:ResolutionsService) {}
  @Post() @HttpCode(202) @ApiOperation({summary:'공유 입력 비동기 접수'}) @ApiHeader({name:'Idempotency-Key',required:true})
  create(@CurrentUser() user:PublicUser,@Headers('idempotency-key') key:string|undefined,@Body() dto:CreateResolutionDto){return this.service.create(user.id,key,dto);}
  @Get(':id') @ApiOperation({summary:'본인 작업 상태 및 후보 조회'})
  get(@CurrentUser() user:PublicUser,@Param('id') id:string){return this.service.get(user.id,id);}
  @Post(':id/selection') @HttpCode(200) @ApiOperation({summary:'서버 후보를 revision 조건으로 확정'})
  select(@CurrentUser() user:PublicUser,@Param('id') id:string,@Body() dto:SelectCandidateDto){return this.service.select(user.id,id,dto);}
  @Post(':id/retry') @HttpCode(202) @ApiOperation({summary:'재시도 가능한 실패 작업 재접수'}) @ApiHeader({name:'Idempotency-Key',required:true})
  retry(@CurrentUser() user:PublicUser,@Param('id') id:string,@Headers('idempotency-key') key:string|undefined,@Body() dto:RetryResolutionDto){return this.service.retry(user.id,id,key,dto);}
  @Delete(':id') @HttpCode(204) @ApiOperation({summary:'본인 작업과 저장된 공유 원문 삭제; 진행 중 결과 적용 차단'})
  remove(@CurrentUser() user:PublicUser,@Param('id') id:string){return this.service.remove(user.id,id);}
}
@ApiTags('지역') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('region-catalog')
export class RegionsController {
  constructor(private readonly regions:RegionsService){}
  @Get() @ApiOperation({summary:'버전이 있는 앱 지역 카탈로그'}) get(){return this.regions.manifest();}
}
