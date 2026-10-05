import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user';
import { LoginDto, SignupDto } from './dto/auth.dto';
import { JwtAuthGuard } from './jwt.guard';
import type { PublicUser } from '../types';

@ApiTags('인증')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiOperation({ summary: '회원가입' })
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }

  @Post('login')
  @ApiOperation({ summary: '로그인' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '내 계정' })
  @ApiOkResponse({ description: 'id, name, email' })
  me(@CurrentUser() user: PublicUser) {
    return this.auth.me(user.id);
  }
}
