const {test}=require('node:test');const assert=require('node:assert/strict');
const {ConfigService}=require('@nestjs/config');const {ProvidersService}=require('../dist/resolutions/providers.service');const {RegionsService}=require('../dist/regions/regions.service');
const {SafeHttpService,UpstreamError}=require('../dist/security/safe-http.service');const https=require('node:https');const {EventEmitter}=require('node:events');
function setup(providerData,overrides={}){let calls=[];const config=new ConfigService({KAKAO_REST_API_KEY:'fixture-not-real',NAVER_API_MODE:'legacy',NAVER_CLIENT_ID:'fixture',NAVER_CLIENT_SECRET:'fixture',KAKAO_PLACE_STORAGE_APPROVED:'true',NAVER_PLACE_STORAGE_APPROVED:'true',KAKAO_REGION_STORAGE_APPROVED:'true',...overrides});const http={get:async(url,hosts,headers)=>{calls.push({url,hosts,headers});return {body:JSON.stringify(providerData),status:200};}};return {service:new ProvidersService(config,http,{consumeLimit:()=>0},new RegionsService()),calls,http};}
test('Kakao official field mapping, credentials confined to official host; raw response fields not retained',async()=>{
 const {service,calls}=setup({documents:[{id:'123',place_name:'카페',place_url:'https://place.map.kakao.com/123',address_name:'서울 중구',road_address_name:'서울 중구 도로 1',x:'127.1',y:'37.5',category_name:'private category',phone:'private'}]});const out=await service.search('kakao','카페 서울');assert.equal(out[0].longitude,127.1);assert.equal(out[0].latitude,37.5);assert(!('category_name'in out[0]));assert(!('phone'in out[0]));assert.equal(calls[0].hosts[0],'dapi.kakao.com');assert.equal(calls[0].headers.Authorization,'KakaoAK fixture-not-real');assert(calls[0].url.includes('query='));
});
test('Naver keeps distinct provider, strips search markup, does not invent an ID or degree coordinates',async()=>{
 const {service,calls}=setup({items:[{title:'<b>카페</b>',link:'https://example.com',address:'서울 중구',roadAddress:'서울 중구 도로 1',mapx:1271000000,mapy:375000000}]});const [out]=await service.search('naver','카페');assert.equal(out.name,'카페');assert.equal(out.provider,'naver');assert.equal(out.providerPlaceId,null);assert.equal(out.longitude,undefined);assert.equal(calls[0].hosts[0],'openapi.naver.com');
});
test('No upstream request without storage policy approval; invalid coordinates and malformed responses rejected',async()=>{
 const blocked=setup({documents:[]},{KAKAO_PLACE_STORAGE_APPROVED:'false'});await assert.rejects(blocked.service.search('kakao','x'),e=>e.code==='PLACE_STORAGE_POLICY_BLOCKED');assert.equal(blocked.calls.length,0);
 const invalid=setup({documents:[{place_name:'test',x:'37.5',y:'127'}]});await assert.rejects(invalid.service.search('kakao','x'),e=>e.code==='INVALID_PROVIDER_COORDINATES');
 const malformed=setup({unexpected:[]});await assert.rejects(malformed.service.search('kakao','x'),e=>e.code==='INVALID_PROVIDER_RESPONSE');
});
test('Coordinate region checks address conflict and never replaces original place coordinates',async()=>{
 const {service}=setup({documents:[{region_type:'B',region_1depth_name:'부산광역시',region_2depth_name:'중구',x:129,y:35}]});const place={provider:'kakao',address:'서울특별시 중구',roadAddress:'',longitude:127,latitude:37.5};const result=await service.region(place);assert.equal(result.status,'unmapped');assert(result.reasonCodes.includes('ADDRESS_COORDINATE_CONFLICT'));assert.equal(place.longitude,127);
 const emptyAddress={...place,address:''};assert.equal((await service.region(emptyAddress)).provinceId,'province:busan');
});
test('Redirect hops revalidate DNS, 429 respects Retry-After and 5xx becomes retryable failure',async()=>{
 const http=new SafeHttpService();let dns=0;http.addresses=async()=>[{address:++dns===1?'8.8.8.8':'10.0.0.1',family:4}];http.pinned=async()=>({status:302,headers:{location:'/next'},url:'https://naver.me/a',body:''});await assert.rejects(http.get('https://naver.me/a',['naver.me']),e=>e.code==='UNSAFE_ADDRESS');
 http.addresses=async()=>[{address:'8.8.8.8',family:4}];http.pinned=async()=>({status:429,headers:{'retry-after':'120'},body:''});await assert.rejects(http.get('https://naver.me/a',['naver.me']),e=>e.retryable&&e.retryAfterMs===120000);
 http.pinned=async()=>({status:503,headers:{},body:''});await assert.rejects(http.get('https://naver.me/a',['naver.me']),e=>e.code==='PROVIDER_UNAVAILABLE'&&e.retryable);
});
test('Transport enforces streaming byte limit before buffering full response',async()=>{
 const original=https.request;let destroyed=false;
 https.request=(url,opts,cb)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>{const response=new EventEmitter();response.statusCode=200;response.headers={};response.destroy=error=>{destroyed=true;if(error)response.emit('error',error);};cb(response);response.emit('data',Buffer.alloc(11));};return req;};
 try{const http=new SafeHttpService();await assert.rejects(http.pinned(new URL('https://naver.me/a'),{address:'8.8.8.8',family:4},{},new AbortController().signal,10),e=>e.code==='RESPONSE_TOO_LARGE');assert(destroyed);}finally{https.request=original;}
});

// New applications use NAVER API HUB; legacy credentials must never be sent to its host.
test('NAVER API HUB uses current path and its own credentials, without legacy fallback',async()=>{
 const {service,calls}=setup({items:[]},{NAVER_API_MODE:'hub',NAVER_HUB_CLIENT_ID:'hub-id',NAVER_HUB_CLIENT_SECRET:'hub-secret'});
 await service.search('naver','public venue');assert(calls[0].url.startsWith('https://naverapihub.apigw.ntruss.com/search/v1/local?'));
 assert.deepEqual(calls[0].hosts,['naverapihub.apigw.ntruss.com']);assert.deepEqual(calls[0].headers,{'X-NCP-APIGW-API-KEY-ID':'hub-id','X-NCP-APIGW-API-KEY':'hub-secret'});
 const missing=setup({items:[]},{NAVER_API_MODE:'hub',NAVER_HUB_CLIENT_ID:'',NAVER_HUB_CLIENT_SECRET:''});await assert.rejects(missing.service.search('naver','x'),e=>e.code==='PROVIDER_NOT_CONFIGURED');assert.equal(missing.calls.length,0);
});
test('Disabled Kakao map service is distinct from an invalid API key',async()=>{
 const http=new SafeHttpService();http.addresses=async()=>[{address:'8.8.8.8',family:4}];
 http.pinned=async()=>({status:403,headers:{},body:JSON.stringify({errorType:'NotAuthorizedError',message:'App(Duri) disabled OPEN_MAP_AND_LOCAL service.'})});
 await assert.rejects(http.get('https://dapi.kakao.com/v2/local/search/keyword.json',['dapi.kakao.com']),e=>e.code==='PROVIDER_SERVICE_DISABLED'&&!e.retryable);
 http.pinned=async()=>({status:401,headers:{},body:'{}'});
 await assert.rejects(http.get('https://dapi.kakao.com/v2/local/search/keyword.json',['dapi.kakao.com']),e=>e.code==='PROVIDER_AUTH_FAILED');
});

test('CLI transient probes leave production storage gates and persistent store untouched',async()=>{
 const {service,calls}=setup({documents:[{id:'123',place_name:'fixture',address_name:'서울 중구'}]},{KAKAO_PLACE_STORAGE_APPROVED:'false',KAKAO_REGION_STORAGE_APPROVED:'false'});
 assert.equal((await service.searchTransient('kakao','fixture')).length,1);
 assert.equal(service.placeStorageAllowed('kakao'),false);
 await assert.rejects(service.search('kakao','fixture'),e=>e.code==='PLACE_STORAGE_POLICY_BLOCKED');
 assert.equal(calls.length,1);const place={provider:'kakao',address:'서울 중구',roadAddress:''};
 assert.equal((await service.region(place)).status,'policy_blocked');assert.equal((await service.regionTransient(place)).status,'mapped');
});

test('Actual Naver selected-place search URL is supported while plain search and route remain unsupported',()=>{
 const {parseShare}=require('../dist/resolutions/share-input');
 const input={sourceType:'naver_map',sharedText:'https://naver.me/F0pLBk2Z'};
 const selected=parseShare(input,'https://map.naver.com/p/search/%EC%84%B8%EC%A2%85/place/21587842?c=14,0,0');
 assert.equal(selected.placeId,'21587842');assert.equal(selected.unsupported,undefined);assert.equal(selected.name,'');
 for(const url of ['https://map.naver.com/p/search/test','https://map.naver.com/p/directions/place/21587842','https://map.naver.com/p/search/test/place/21587842/route','https://map.naver.com/p/search/test/place/21587842?q=other'])assert(parseShare(input,url).unsupported);
});
