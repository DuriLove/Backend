const {test}=require('node:test');const assert=require('node:assert/strict');
process.env.NODE_ENV='test';process.env.JWT_SECRET='integration-test-only-'.repeat(4);process.env.DATABASE_FILE=':memory:';process.env.WORKER_ENABLED='false';
const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../dist/app.module');const {configureApp}=require('../dist/security/runtime');
const {ResolutionsService}=require('../dist/resolutions/resolutions.service');const {ProvidersService}=require('../dist/resolutions/providers.service');const {RegionsService}=require('../dist/regions/regions.service');
const {JsonStoreService}=require('../dist/store/json-store.service');const {makeOpenApi}=require('../dist/openapi');
const {hashSync}=require('bcryptjs');
test('HTTP: signup/login, 401/403/404, 202, poll, selection, retry, validation and Swagger',async()=>{
 const app=await NestFactory.create(AppModule,{logger:false,bodyParser:false});app.use(require('express').json({limit:'32kb'}));configureApp(app);await app.listen(0,'127.0.0.1');
 const base=await app.getUrl();const request=async(path,{method='GET',body,token,key}={})=>{const response=await fetch(base+'/api/v1'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});let json;try{json=await response.json();}catch{}return {status:response.status,body:json,requestId:response.headers.get('x-request-id')};};
 try{
 assert.equal((await request('/health')).status,200);assert.equal((await request('/boards')).status,401);
 const signup=await request('/auth/signup',{method:'POST',body:{name:'테스트',email:'fixture@example.com',password:'test-password-only'}});assert.equal(signup.status,201);const token=signup.body.accessToken;
 assert.equal((await request('/auth/login',{method:'POST',body:{email:'fixture@example.com',password:'wrong'}})).status,401);
 assert.equal((await request('/auth/login',{method:'POST',body:{email:'fixture@example.com',password:'test-password-only'}})).status,201);
 assert.equal((await request('/auth/me',{token})).body.name,'테스트');assert.equal((await request('/auth/me',{token:'bad'})).status,401);
 const board=await request('/boards',{method:'POST',token,body:{name:'fixture'}});assert.equal(board.status,201);
 const other=await request('/auth/signup',{method:'POST',body:{name:'타인',email:'other@example.com',password:'test-password-only'}});const otherToken=other.body.accessToken;
 assert.equal((await request('/boards/'+board.body.id+'/state',{token:otherToken})).status,403);
 const catalog=await request('/region-catalog',{token});assert.equal(catalog.status,200);
 const body={clientCardId:'card-1',inputRevision:1,sourceType:'kakao_map',sharedText:'테스트카페\nhttps://place.map.kakao.com/123',regionCatalogVersion:catalog.body.version};
 assert.equal((await request('/place-resolutions',{method:'POST',token,body})).status,400);
 assert.equal((await request('/place-resolutions',{method:'POST',token,key:'http-test-key',body:{...body,userId:'other'}})).status,400);
 assert.equal((await request('/place-resolutions',{method:'POST',token,key:'http-test-key',body:{...body,inputRevision:-1}})).status,400);
 const accepted=await request('/place-resolutions',{method:'POST',token,key:'http-test-key',body});assert.equal(accepted.status,202);assert.equal(accepted.body.status,'queued');assert(accepted.requestId);
 assert.equal((await request('/place-resolutions',{method:'POST',token,key:'http-test-key',body})).body.resolutionId,accepted.body.resolutionId);
 assert.equal((await request('/place-resolutions',{method:'POST',token,key:'http-test-key',body:{...body,sharedText:'different'}})).status,409);
 const path='/place-resolutions/'+accepted.body.resolutionId;
 for(const [suffix,method,payload] of [['','GET'],['/selection','POST',{candidateId:'fake',expectedRevision:1}],['/retry','POST',{expectedRevision:1}],['','DELETE']])assert.equal((await request(path+suffix,{token:otherToken,method,body:payload,key:'retry-http-key'})).status,404);
 const providers=app.get(ProvidersService);providers.search=async()=>[{provider:'kakao',providerPlaceId:'999',name:'테스트카페',url:'https://place.map.kakao.com/999',address:'서울 중구',roadAddress:''}];providers.placeStorageAllowed=()=>true;providers.regionStorageAllowed=()=>true;
 await app.get(ResolutionsService).tick();const polled=await request(path,{token});assert.equal(polled.status,200);assert.equal(polled.body.status,'needs_confirmation');
 const selected=await request(path+'/selection',{token,method:'POST',body:{candidateId:polled.body.candidates[0].candidateId,expectedRevision:polled.body.revision}});assert.equal(selected.status,200);assert.equal(selected.body.matchMethod,'user');
 assert.equal((await request('/links/unfurl',{method:'POST',token,body:{url:'http://127.0.0.1/internal'}})).status,400);
 assert.equal((await request('/place-resolutions',{method:'POST',token,key:'oversize-key',body:{...body,sharedText:'x'.repeat(40000)}})).status,413);
 const spec=makeOpenApi(app);assert(spec.paths['/api/v1/place-resolutions'].post.responses['202'].content['application/json'].schema.$ref);assert(spec.components.schemas.Resolution.properties.region);
 const removed=await request(path,{token,method:'DELETE'});assert.equal(removed.status,204);assert.equal((await request(path,{token})).status,404);
 }finally{await app.close();}
});
