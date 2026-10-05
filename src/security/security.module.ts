import { Global, Module } from '@nestjs/common';
import { MetricsService, MetricsController } from './metrics.service';
import { SafeHttpService } from './safe-http.service';
@Global()
@Module({ controllers: [MetricsController], providers: [SafeHttpService,MetricsService], exports: [SafeHttpService,MetricsService] })
export class SecurityModule {}
