import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
export function makeOpenApi(app:INestApplication) {
  const document=SwaggerModule.createDocument(app,new DocumentBuilder().setTitle('Duri Date Backend').setVersion('2.0.0')
    .setDescription('Authenticated asynchronous place resolution and existing board APIs. Catalog versions and revisions are mandatory. Job failure is distinct from HTTP lookup success.').addBearerAuth().build());
  const nullableString={type:'string' as const,nullable:true};
  const region={type:'object' as const,required:['status','provinceId','districtId','dateAreaId','catalogVersion','reasonCodes'],properties:{
    status:{type:'string' as const,enum:['mapped','partial','unmapped','policy_blocked']},provinceId:nullableString,districtId:nullableString,dateAreaId:nullableString,
    catalogVersion:{type:'string' as const},reasonCodes:{type:'array' as const,items:{type:'string' as const}}}};
  const place={type:'object' as const,nullable:true,required:['provider','providerPlaceId','name','url'],properties:{provider:{type:'string' as const,enum:['naver','kakao']},providerPlaceId:nullableString,name:{type:'string' as const},url:nullableString}};
  document.components??={};document.components.schemas??={};
  document.components.schemas.Resolution={type:'object',required:['resolutionId','clientCardId','inputRevision','revision','status','attempt','attempts','matchMethod','reasonCodes','candidates','place','region','error','createdAt','updatedAt','expiresAt','nextRetryAt'],properties:{
    resolutionId:{type:'string',format:'uuid'},clientCardId:{type:'string'},inputRevision:{type:'integer'},revision:{type:'integer'},sourceType:{type:'string'},
    status:{type:'string',enum:['queued','processing','resolved','needs_confirmation','no_match','unsupported','failed']},attempt:{type:'integer'},
    matchMethod:{type:'string',nullable:true,enum:['automatic','user',null]},reasonCodes:{type:'array',items:{type:'string'}},place,region,
    candidates:{type:'array',items:{type:'object',required:['candidateId','place','region','reasonCodes','expiresAt','expired'],properties:{candidateId:{type:'string',format:'uuid'},place,region,reasonCodes:{type:'array',items:{type:'string'}},expiresAt:{type:'string',format:'date-time'},expired:{type:'boolean'}}}},
    attempts:{type:'array',items:{type:'object',properties:{number:{type:'integer'},startedAt:{type:'string'},finishedAt:{type:'string'},errorCode:{type:'string'}}}},
    error:{type:'object',nullable:true,properties:{code:{type:'string'},retryable:{type:'boolean'},retryAfterMs:{type:'number'}}},
    createdAt:{type:'string',format:'date-time'},updatedAt:{type:'string',format:'date-time'},expiresAt:{type:'string',format:'date-time'},nextRetryAt:{type:'string',nullable:true,format:'date-time'}}};
  for(const [path,item] of Object.entries(document.paths))for(const [method,operation] of Object.entries(item)) {
    if(!operation||!['get','post','patch','delete'].includes(method))continue;
    const op=operation as any;
    for(const [code,description] of Object.entries({400:'Invalid input or candidate',401:'Authentication required',403:'Board access forbidden',404:'Not found or not owned',409:'Idempotency / revision / state / catalog conflict',410:'Shared card was deleted',429:'Rate limited',500:'Internal error',503:'Storage or upstream unavailable'})) {
      op.responses[code]={description,content:{'application/json':{schema:{type:'object',properties:{code:{type:'string'},message:{oneOf:[{type:'string'},{type:'array',items:{type:'string'}}]},retryAfterMs:{type:'number'}}}}}};
    }
    if(path.includes('/place-resolutions') && method!=='delete') {
      const status=method==='post'&&!path.endsWith('/selection')?'202':'200';
      op.responses[status]={description:status==='202'?'Accepted durably; poll GET. Same logical key replays current job.':'Current job. HTTP 200 does not imply resolved status.',content:{'application/json':{schema:{$ref:'#/components/schemas/Resolution'}}}};
    }
  }
  return document;
}
