import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './security/runtime';
import { makeOpenApi } from './openapi';
async function bootstrap() {
  const app=await NestFactory.create(AppModule,{bodyParser:false});
  const {json}=await import('express');app.use(json({limit:'32kb'}));
  configureApp(app);
  if(process.env.NODE_ENV!=='production') SwaggerModule.setup('api/docs',app,makeOpenApi(app));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT??3000),process.env.HOST??'127.0.0.1');
}
bootstrap().catch(()=>{console.error('STARTUP_FAILED: check configuration and database permissions; existing data was not reset.');process.exitCode=1;});
