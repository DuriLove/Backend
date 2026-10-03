import {
  ConflictException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare, hash } from 'bcryptjs';
import { uniqueId } from '../common/ids';
import { JsonStoreService } from '../store/json-store.service';
import type { LoginDto, SignupDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly store: JsonStoreService,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException({ code: 'PASSWORD_TOO_LONG' });
    const email = dto.email.trim().toLowerCase();
    const name = dto.name.trim();
    const passwordHash = await hash(dto.password, 12);
    return this.store.mutate((db) => {
      if (db.users.some((user) => user.email === email)) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' });
      }
      const user = {
        id: uniqueId('user', db.users.map((item) => item.id)),
        name,
        email,
        passwordHash,
      };
      db.users.push(user);
      return this.issue(user.id, user.name);
    });
  }

  async login(dto: LoginDto) {
    if (Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException({ code: 'PASSWORD_TOO_LONG' });
    const email = dto.email.trim().toLowerCase();
    const user = this.store.snapshot().users.find((item) => item.email === email);
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: '이메일 또는 비밀번호가 올바르지 않습니다.',
      });
    }
    return this.issue(user.id, user.name);
  }

  me(userId: string) {
    const user = this.store.snapshot().users.find((item) => item.id === userId);
    if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    return { id: user.id, name: user.name, email: user.email };
  }

  private issue(id: string, name: string) {
    return {
      accessToken: this.jwt.sign({ sub: id }),
      user: { id, name },
    };
  }
}
