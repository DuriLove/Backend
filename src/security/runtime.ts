import { MetricsService } from './metrics.service';
import { randomUUID, createHash } from 'node:crypto';
import { Controller, Get, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JsonStoreService } from '../store/json-store.service';
import type { Request, Response, NextFunction } from 'express';
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';

export function validateConfig(config: Record<string, unknown>) {
  if(config.NAVER_API_MODE && !['hub','legacy'].includes(String(config.NAVER_API_MODE))) throw new Error('Invalid NAVER_API_MODE');
  const key=String(config.JWT_SECRET??'');
  if(Buffer.byteLength(key)<32 || /change-me|password123|replace-me/.test(key)) throw new Error('JWT_SECRET must be a randomly generated secret of at least 32 bytes');
  if(config.NODE_ENV==='production' && !config.DATABASE_FILE) throw new Error('DATABASE_FILE is required in production');
  if(config.PLACE_LOOKUP_PROVIDER && !['source','kakao','naver'].includes(String(config.PLACE_LOOKUP_PROVIDER))) throw new Error('Invalid PLACE_LOOKUP_PROVIDER');
  for(const field of ['WORKER_ENABLED','KAKAO_PLACE_STORAGE_APPROVED','KAKAO_REGION_STORAGE_APPROVED','NAVER_PLACE_STORAGE_APPROVED','NAVER_REGION_STORAGE_APPROVED']) {
    if(config[field]!==undefined && !['true','false'].includes(String(config[field]))) throw new Error(`Invalid ${field}`);
  }
  return config;
}
export function configureApp(app: INestApplication) {
  const store=app.get(JsonStoreService), config=app.get(ConfigService), metrics=app.get(MetricsService);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true,forbidNonWhitelisted:true}));
  app.enableCors({origin:config.get<string>('CORS_ORIGINS','').split(',').map(s=>s.trim()).filter(Boolean)});
  app.use((req:Request,res:Response,next:NextFunction)=>{
    const requestId=randomUUID();res.setHeader('X-Request-Id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    const started=Date.now();
    res.on('finish',()=> {metrics.record('http',Date.now()-started,res.statusCode>=500);if(config.get('NODE_ENV')!=='test') console.log(JSON.stringify({requestId,method:req.method,status:res.statusCode,elapsedMs:Date.now()-started}));});
    if(/\/auth\/(login|signup)\/?$/.test(req.path)) {
      const ip=createHash('sha256').update(req.socket.remoteAddress??'unknown').digest('hex');
      const retry=store.consumeLimit(`auth:${ip}`,20,60_000);
      if(retry){res.setHeader('Retry-After',Math.ceil(retry/1000));res.status(429).json({code:'RATE_LIMITED',requestId});return;}
    }
    next();
  });
}
@Controller('health')
export class HealthController {
  constructor(private readonly store:JsonStoreService){}
  @Get() get(){try {return {status:this.store.healthy()?'ok':'error'};}catch{throw new HttpException({code:'STORAGE_UNAVAILABLE'},503);}}
}
