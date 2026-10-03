// Real samples stay in a private JSON file. This script never prints raw shares, keys, addresses or place names.
require('dotenv').config({quiet:true});
const {readFileSync,writeFileSync,existsSync}=require('node:fs');const {randomBytes}=require('node:crypto');
const args=process.argv.slice(2),sampleFile=args[0],output=args[1];
if(!sampleFile||!output||existsSync(output)){console.error('Usage: npm run poc -- /private/samples.json /new/results.json');process.exit(1);}
process.env.DATABASE_FILE=':memory:';process.env.LEGACY_DATA_FILE='';process.env.DATA_FILE='';process.env.WORKER_ENABLED='false';process.env.JWT_SECRET=randomBytes(48).toString('base64url');
const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../dist/app.module');const {ResolutionsService}=require('../dist/resolutions/resolutions.service');const {RegionsService}=require('../dist/regions/regions.service');const {SafeHttpService}=require('../dist/security/safe-http.service');
(async()=>{
 const samples=JSON.parse(readFileSync(sampleFile,'utf8'));if(!Array.isArray(samples)||!samples.length)throw new Error('SAMPLES_REQUIRED');
 for(const s of samples)if(!s.sampleId||!s.os||!s.appVersion||!s.input||!s.expected?.status)throw new Error('Each sample requires sampleId, os, appVersion, input and expected.status');
 const app=await NestFactory.createApplicationContext(AppModule,{logger:false});
 try{const service=app.get(ResolutionsService),http=app.get(SafeHttpService),version=app.get(RegionsService).manifest().version;
 let calls=0;const get=http.get.bind(http);http.get=async(...args)=>{calls++;return get(...args);};const rows=[];
 for(const [index,s] of samples.entries()){
  calls=0;const start=Date.now();const job=await service.create('private-poc-user',`poc-sample-${index}`,{...s.input,clientCardId:`sample-${index}`,inputRevision:1,regionCatalogVersion:version});await service.tick();const result=service.get('private-poc-user',job.resolutionId);
  const actual={status:result.status,provider:result.place?.provider??null,providerPlaceId:result.place?.providerPlaceId??null,provinceId:result.region.provinceId,districtId:result.region.districtId};
  const expected=Object.fromEntries(Object.entries(s.expected).filter(([key])=>['status','provider','providerPlaceId','provinceId','districtId'].includes(key)));
  const checked=Object.entries(expected).every(([k,v])=>actual[k]===v);
  const identityVerified=Boolean(s.expected.provider && s.expected.providerPlaceId && actual.provider===s.expected.provider && actual.providerPlaceId===s.expected.providerPlaceId);
  rows.push({sampleId:s.sampleId,os:s.os,appVersion:s.appVersion,sourceType:s.input.sourceType,mode:calls?'external_request_attempt':'no_external_request',validPlaceSample:s.validPlaceSample===true,actual,expected,checked,identityVerified,matchMethod:result.matchMethod,reasonCodes:result.reasonCodes,errorCode:result.error?.code??null,httpCallCount:calls,elapsedMs:Date.now()-start,candidateCount:result.candidates.length});
 }
 const providers=require('./poc-summary.cjs').summarize(rows);
 const passed=rows.every(r=>r.checked&&!['queued','processing'].includes(r.actual.status));
 writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),catalogVersion:version,passed,providers,rows,warning:'Real fixtures are limited evidence, not a guarantee for all shares. Mobile UI integration is not tested by this tool.'},null,2)+'\n',{mode:0o600,flag:'wx'});console.log('PoC results saved; no raw share text included.');if(!passed)process.exitCode=2;
 }finally{await app.close();}
})().catch(()=>{console.error('POC_FAILED: check sample schema, keys, policy flags and output path.');process.exitCode=1;});
