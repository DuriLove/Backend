import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { UnfurlDto } from '../boards/dto/board.dto';
import { LinksService } from './links.service';

@ApiTags('링크')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('links')
export class LinksController {
  constructor(private readonly links: LinksService) {}

  @Post('unfurl')
  @ApiOperation({ summary: '공유 URL의 제목·썸네일 추출' })
  unfurl(@Body() dto: UnfurlDto) {
    return this.links.unfurl(dto.url);
  }
}
