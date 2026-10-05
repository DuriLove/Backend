import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JsonStoreService } from '../store/json-store.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly store: JsonStoreService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      user?: { id: string; name: string };
    }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });

    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      const user = this.store.snapshot().users.find((item) => item.id === payload.sub);
      if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
      const retry = this.store.consumeLimit(`user:${user.id}`, 120, 60_000);
      if (retry) throw new HttpException({ code: 'RATE_LIMITED', retryAfterMs: retry }, 429);
      request.user = { id: user.id, name: user.name };
      return true;
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 429) throw error;
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });
    }
  }
}
