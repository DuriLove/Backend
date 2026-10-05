import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { LinksModule } from './links/links.module';
import { ResolutionsModule } from './resolutions/resolutions.module';
import { SecurityModule } from './security/security.module';
import { HealthController, validateConfig } from './security/runtime';
import { StoreModule } from './store/store.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: process.env.NODE_ENV === 'test', validate: validateConfig }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h', algorithm: 'HS256', issuer: 'duri-date', audience: 'duri-date-app' },
        verifyOptions: { algorithms: ['HS256'], issuer: 'duri-date', audience: 'duri-date-app' },
      }),
    }),
    StoreModule,
    SecurityModule,
    ResolutionsModule,
    AuthModule,
    BoardsModule,
    LinksModule,
  ],
})
export class AppModule {}
