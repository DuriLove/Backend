// Public query capability check, NOT mobile-share accuracy. No provider fields persisted.
require('dotenv').config({quiet:true});
const fs=require('node:fs');const {ConfigService}=require('@nestjs/config');
const {ProvidersService}=require('../dist/resolutions/providers.service');
const {RegionsService}=require('../dist/regions/regions.service');const {JsonStoreService}=require('../dist/store/json-store.service');
const {SafeHttpService}=require('../dist/security/safe-http.service');
const output=process.argv[2];if(!output||fs.existsSync(output))throw Error('Provide a new output path');
(async()=>{const config=new ConfigService({...process.env,DATABASE_FILE:':memory:',LEGACY_DATA_FILE:'',DATA_FILE:''});
const regions=new RegionsService(),store=new JsonStoreService(config);store.onModuleInit();
const http=new SafeHttpService();let calls=0;const get=http.get.bind(http);http.get=async(...args)=>{calls++;return get(...args);};
const providers=new ProvidersService(config,http,store,regions),catalog=regions.manifest().regions;
const samples=JSON.parse(fs.readFileSync('docs/public-query-samples.json','utf8')),rows=[];
try{for(const provider of ['kakao','naver'])for(const sample of samples){
 const started=Date.now();calls=0;const row={sampleId:sample.sampleId,provider,mode:'live_public_query',os:null,appVersion:null};
 try{const places=await providers.searchTransient(provider,sample.query);
 const names=places.filter(p=>p.name.replace(/\s/g,'')===sample.query.replace(/\s/g,''));
 row.resultCount=places.length;row.exactNameCount=names.length;
 row.status=names.length===1?'unique_name':names.length?'ambiguous':'no_exact_name';
 if(names.length===1){const region=await providers.regionTransient(names[0]);
 const province=catalog.find(r=>r.kind==='province'&&r.name===sample.expectedProvince);
 const district=catalog.find(r=>r.kind==='district'&&r.parentId===province?.id&&r.name===sample.expectedDistrict);
 row.expectedRegionMatched=region.provinceId===province?.id&&region.districtId===(district?.id??null);
 row.addressCoordinateConflict=region.reasonCodes.includes('ADDRESS_COORDINATE_CONFLICT');
 if(sample===samples[0]){const again=await providers.searchTransient(provider,sample.query);row.keywordRequerySameIdentity=names[0].providerPlaceId?again.some(p=>p.providerPlaceId===names[0].providerPlaceId):null;}
 }
 }catch(e){row.status=e.code==='PROVIDER_NOT_CONFIGURED'?'not_configured':'failed';row.errorCode=e.code??'PROBE_FAILED';}
 rows.push({...row,httpCallCount:calls,elapsedMs:Date.now()-started});
}
const summary={};for(const provider of ['kakao','naver']){const rs=rows.filter(r=>r.provider===provider),times=rs.filter(r=>r.httpCallCount).map(r=>r.elapsedMs).sort((a,b)=>a-b);summary[provider]={plannedQueries:rs.length,executedQueries:rs.filter(r=>r.httpCallCount).length,httpCalls:rs.reduce((n,r)=>n+r.httpCallCount,0),uniqueNameCount:rs.filter(r=>r.status==='unique_name').length,regionMatches:rs.filter(r=>r.expectedRegionMatched).length,regionChecks:rs.filter(r=>r.expectedRegionMatched!==undefined).length,p50Ms:times.length?times[Math.ceil(times.length*.5)-1]:null,p95Ms:times.length?times[Math.ceil(times.length*.95)-1]:null,shareAutomaticAccuracy:null};}
fs.writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),mode:'live_public_query_transient',sharedInputSamples:0,providerFieldsPersisted:false,policyFlagsChanged:false,summary,rows},null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(summary));
if(rows.some(r=>r.status==='failed'||r.expectedRegionMatched===false))process.exitCode=1;
}finally{store.close();}})().catch(()=>{console.error('PUBLIC_PROBE_FAILED');process.exitCode=1;});
