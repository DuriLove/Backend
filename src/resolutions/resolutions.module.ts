import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RegionsService } from '../regions/regions.service';
import { ProvidersService } from './providers.service';
import { ResolutionsService } from './resolutions.service';
import { ResolutionsController, RegionsController } from './resolutions.controller';
@Module({imports:[AuthModule],controllers:[ResolutionsController,RegionsController],providers:[RegionsService,ProvidersService,ResolutionsService]})
export class ResolutionsModule {}
