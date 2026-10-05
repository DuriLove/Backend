const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync,readFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join}=require('node:path');
process.env.NODE_ENV='test';process.env.JWT_SECRET='test-only-'.repeat(6);process.env.DATABASE_FILE=':memory:';process.env.WORKER_ENABLED='false';
const {ConfigService}=require('@nestjs/config');
const {JsonStoreService}=require('../dist/store/json-store.service');
const {BoardsService}=require('../dist/boards/boards.service');
const {ResolutionsService}=require('../dist/resolutions/resolutions.service');
const {ProvidersService}=require('../dist/resolutions/providers.service');
const {RegionsService,CATALOG_VERSION}=require('../dist/regions/regions.service');
const {SafeHttpService,UpstreamError,isPublicAddress}=require('../dist/security/safe-http.service');
const {parseShare}=require('../dist/resolutions/share-input');
const {validateConfig}=require('../dist/security/runtime');
function config(extra={}){return new ConfigService({DATABASE_FILE:':memory:',WORKER_ENABLED:'false',...extra});}
async function setup(extra={}){const store=new JsonStoreService(config(extra));store.onModuleInit();await store.mutate(db=>{db.users.push({id:'u1',name:'one',email:'one@test.local',passwordHash:'fixture'});db.users.push({id:'u2',name:'two',email:'two@test.local',passwordHash:'fixture'});});return store;}
function input(extra={}){return {clientCardId:'local-1',inputRevision:1,sourceType:'kakao_map',sharedText:'테스트카페\n서울특별시 중구 세종대로 1\nhttps://place.map.kakao.com/123',regionCatalogVersion:CATALOG_VERSION,...extra};}
const place={provider:'kakao',providerPlaceId:'123',name:'테스트카페',url:'https://place.map.kakao.com/123',address:'서울특별시 중구 세종대로 1',roadAddress:''};
function fixture(store,overrides={}){const regions=new RegionsService();const provider={lookupProvider:()=> 'kakao',placeStorageAllowed:()=>true,regionStorageAllowed:()=>true,search:async()=>[place],region:async p=>regions.mapAddress(p.address),...overrides};return {service:new ResolutionsService(store,regions,provider,new SafeHttpService(),config()),provider,regions};}
function status(code){return error=>error.getStatus?.()===code;}

test('SQLite rollback on persistence failure; snapshots cannot mutate storage',async()=>{
 const s=await setup();try {
  const copy=s.snapshot();copy.users.length=0;assert.equal(s.snapshot().users.length,2);
  s.connection.exec("CREATE TRIGGER fail_update BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT,'simulated full disk'); END;");
  await assert.rejects(s.mutate(db=>db.users.push({id:'lost'})));assert.equal(s.snapshot().users.length,2);
  s.connection.exec('DROP TRIGGER fail_update');await s.mutate(db=>db.users[0].name='saved');assert.equal(s.snapshot().users.length,2);
 }finally{s.close();}
});
test('Legacy migration preserves JSON; corrupt JSON fails without replacement; multi-connection updates survive restart',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'duri-db-'));const legacy=join(dir,'legacy.json');const sqlite=join(dir,'db.sqlite');
 const data={users:[{id:'u',name:'fixture',email:'a@b.c',passwordHash:'hash'}],boards:[],cards:[],dates:[],shares:[]};writeFileSync(legacy,JSON.stringify(data));
 const a=new JsonStoreService(config({DATABASE_FILE:sqlite,LEGACY_DATA_FILE:legacy}));a.onModuleInit();
 const b=new JsonStoreService(config({DATABASE_FILE:sqlite}));b.onModuleInit();
 await Promise.all([a.mutate(db=>db.users[0].name='updated'),b.mutate(db=>db.users[0].email='new@b.c')]);
 assert.equal(a.snapshot().users[0].email,'new@b.c');assert.equal(b.snapshot().users[0].name,'updated');a.close();b.close();
 assert.deepEqual(JSON.parse(readFileSync(legacy,'utf8')),data);
 const reopen=new JsonStoreService(config({DATABASE_FILE:sqlite}));reopen.onModuleInit();assert.equal(reopen.snapshot().users[0].name,'updated');reopen.close();
 writeFileSync(legacy,'{broken');const bad=new JsonStoreService(config({DATABASE_FILE:join(dir,'bad.sqlite'),LEGACY_DATA_FILE:legacy}));assert.throws(()=>bad.onModuleInit());assert.equal(readFileSync(legacy,'utf8'),'{broken');rmSync(dir,{recursive:true});
});
test('Deleted shared card cannot resurrect; linked shares are tombstoned; board ownership enforced',async()=>{
 const s=await setup();try{const b=new BoardsService(s);const board=await b.create('u1',{name:'test'});assert.throws(()=>b.state('u2',board.id),status(403));
 const share=await b.ingestShare('u1',board.id,{rawValue:'https://example.com/place'});const first=await b.convertShare('u1',board.id,share.id);
 const second=await b.ingestShare('u1',board.id,{rawValue:'https://example.com/place'});await b.convertShare('u1',board.id,second.id);
 const date=await b.createDate('u1',board.id,{name:'plan',initialCardId:first.card.id,requestId:'date-key'});await b.addCandidate('u1',board.id,first.card.id);
 await b.deleteCard('u1',board.id,first.card.id);
 await assert.rejects(b.convertShare('u1',board.id,share.id),status(410));await assert.rejects(b.convertShare('u1',board.id,second.id),status(410));
 assert.equal(b.state('u1',board.id).cards.length,0);assert.equal(b.state('u1',board.id).dates.find(d=>d.id===date.id).cardIds.length,0);
 assert.equal(b.state('u1',board.id).candidateSet.cardIds.length,0);
 }finally{s.close();}
});
test('Existing dates retain idempotency, stale ordering protection and 2-member board limit',async()=>{
 const s=await setup();try{const b=new BoardsService(s);const board=await b.create('u1',{name:'test'});await b.join('u2',{inviteCode:board.inviteCode});await assert.rejects(b.join('u3',{inviteCode:board.inviteCode}),status(409));
 const card=await b.createCard('u1',board.id,{title:'c',source:'other',originalUrl:'https://example.com'});
 const dto={name:'date',date:null,initialCardId:card.id,requestId:'request-1'};const [a,c]=await Promise.all([b.createDate('u1',board.id,dto),b.createDate('u1',board.id,dto)]);assert.equal(a.id,c.id);
 await assert.rejects(b.createDate('u1',board.id,{...dto,name:'changed'}),status(409));await assert.rejects(b.reorderPlaces('u1',board.id,a.id,{cardIds:[card.id],expectedCardIds:[]}),status(409));
 }finally{s.close();}
});
test('Resolution idempotency is atomic and user-scoped, input revisions and catalog checked',async()=>{
 const s=await setup();try{const {service:r}=fixture(s);const [a,b]=await Promise.all([r.create('u1','logical-key',input()),r.create('u1','logical-key',input())]);assert.equal(a.resolutionId,b.resolutionId);assert.equal(s.snapshot().resolutions.length,1);
 await assert.rejects(r.create('u1','logical-key',input({sharedText:'changed'})),status(409));await assert.rejects(r.create('u1','another-key',input()),status(409));
 await assert.rejects(r.create('u1','version-key',input({clientCardId:'other',regionCatalogVersion:'old'})),status(409));
 const other=await r.create('u2','logical-key',input());assert.notEqual(other.resolutionId,a.resolutionId);assert.throws(()=>r.get('u2',a.resolutionId),status(404));
 await assert.rejects(r.select('u2',a.resolutionId,{candidateId:'fake',expectedRevision:1}),status(404));await assert.rejects(r.retry('u2',a.resolutionId,'retry-key',{expectedRevision:1}),status(404));
 }finally{s.close();}
});
test('Exact name and address resolves, region uses parent, original share remains intact',async()=>{
 const s=await setup();try{const {service:r}=fixture(s);const j=await r.create('u1','logical-key',input());await r.tick();const out=r.get('u1',j.resolutionId);
 assert.equal(out.status,'resolved');assert.equal(out.matchMethod,'automatic');assert.equal(out.region.provinceId,'province:seoul');assert.equal(out.region.districtId,'district:seoul:fc6bc7adb4');assert.equal(s.snapshot().resolutions[0].input.sharedText,input().sharedText);
 assert.equal(out.region.dateAreaId,null);assert(!JSON.stringify(out).includes('세종대로'));assert.equal(s.snapshot().cards.length,0);
 }finally{s.close();}
});
test('Ambiguous names need confirmation, selections are atomic and idempotent, wrong candidates rejected',async()=>{
 const s=await setup();try{const {service:r}=fixture(s,{search:async()=>[place,{...place,providerPlaceId:'456',address:'부산광역시 중구 중앙대로 1'}]});
 const j=await r.create('u1','logical-key',input({sourceType:'naver_map',sharedText:'테스트카페\nhttps://map.naver.com/p/entry/place/999'}));await r.tick();let out=r.get('u1',j.resolutionId);assert.equal(out.status,'needs_confirmation');assert.equal(out.candidates.length,2);
 await assert.rejects(r.select('u1',j.resolutionId,{candidateId:'fake',expectedRevision:out.revision}),status(400));
 const dto={candidateId:out.candidates[1].candidateId,expectedRevision:out.revision};const [a,b]=await Promise.all([r.select('u1',j.resolutionId,dto),r.select('u1',j.resolutionId,dto)]);assert.deepEqual(a,b);assert.equal(a.region.provinceId,'province:busan');assert.equal(a.matchMethod,'user');
 await assert.rejects(r.select('u1',j.resolutionId,{candidateId:out.candidates[0].candidateId,expectedRevision:out.revision}),status(409));
 }finally{s.close();}
});
test('Provider ID/name/address contradictions never auto-confirm',async()=>{
 for(const override of [{providerPlaceId:'456'},{name:'다른지점'},{address:'부산광역시 중구 중앙대로 1'}]){const s=await setup();try{const {service:r}=fixture(s,{search:async()=>[{...place,...override}]});const j=await r.create('u1','logical-key',input());await r.tick();assert.equal(r.get('u1',j.resolutionId).status,'needs_confirmation');}finally{s.close();}}
});
test('Expired candidate rejected; deletion while processing prevents late results',async()=>{
 const s=await setup();try{let release;const {service:r,provider}=fixture(s,{search:()=>new Promise(resolve=>release=resolve)});
 const j=await r.create('u1','logical-key',input());const tick=r.tick();await new Promise(resolve=>setImmediate(resolve));await r.remove('u1',j.resolutionId);release([place]);await tick;assert.throws(()=>r.get('u1',j.resolutionId),status(404));
 provider.search=async()=>[place];const k=await r.create('u1','logical-2',input({sharedText:'테스트카페\nhttps://place.map.kakao.com/456'}));await r.tick();const out=r.get('u1',k.resolutionId);
 await s.mutate(db=>db.resolutions[0].candidates[0].expiresAt=new Date(0).toISOString());await assert.rejects(r.select('u1',k.resolutionId,{candidateId:out.candidates[0].candidateId,expectedRevision:out.revision}),status(409));
 }finally{s.close();}
});
test('Timeout/429 retry respects delay, manual retries are idempotent, attempts bounded',async()=>{
 const s=await setup();try{const {service:r,provider}=fixture(s,{search:async()=>{throw new UpstreamError('PROVIDER_RATE_LIMIT',true,60_000);}});const j=await r.create('u1','logical-key',input());await r.tick();let out=r.get('u1',j.resolutionId);assert.equal(out.status,'failed');assert(out.error.retryable);assert(Date.parse(out.nextRetryAt)>Date.now()+59000);
 await assert.rejects(r.retry('u1',j.resolutionId,'retry-one',{expectedRevision:out.revision}),status(409));await r.tick();assert.equal(r.get('u1',j.resolutionId).attempt,1);
 await s.mutate(db=>db.resolutions[0].nextAttemptAt=0);const dto={expectedRevision:out.revision};const [a,b]=await Promise.all([r.retry('u1',j.resolutionId,'retry-one',dto),r.retry('u1',j.resolutionId,'retry-one',dto)]);assert.equal(a.revision,b.revision);
 await r.tick();await s.mutate(db=>db.resolutions[0].nextAttemptAt=0);await r.tick();out=r.get('u1',j.resolutionId);assert.equal(out.attempt,3);assert.equal(out.error.retryable,false);
 }finally{s.close();}
});
test('Dead worker lease is recovered and duplicate workers cannot claim the same job',async()=>{
 const s=await setup();try{const {service:r}=fixture(s);const {service:r2}=fixture(s);const j=await r.create('u1','logical-key',input());
 await s.mutate(db=>Object.assign(db.resolutions[0],{status:'processing',attempt:1,leaseToken:'dead',leaseUntil:0,attempts:[{number:1,startedAt:new Date(0).toISOString()}]}));await r.tick();assert.equal(r.get('u1',j.resolutionId).error.code,'WORKER_LEASE_EXPIRED');
 await s.mutate(db=>db.resolutions[0].nextAttemptAt=0);await Promise.all([r.tick(),r2.tick()]);const out=r.get('u1',j.resolutionId);assert.equal(out.status,'resolved');assert.equal(out.attempt,2);
 }finally{s.close();}
});
test('Mapped/partial/unmapped, city wards, aliases, coordinates, conflicts',()=>{
 const r=new RegionsService();assert.equal(r.manifest().regions.filter(x=>x.kind==='province').length,17);assert.equal(r.manifest().regions.filter(x=>x.kind==='district').length,228);
 assert.notEqual(r.mapAddress('서울 중구 세종대로').districtId,r.mapAddress('부산 중구 중앙대로').districtId);assert.equal(r.mapAddress('경기도 성남시 분당구 판교로').status,'mapped');assert.equal(r.mapAddress('경기도 성남시 미지구').status,'partial');
 assert.equal(r.mapAddress('강원도 춘천시').provinceId,'province:gangwon');assert.equal(r.mapAddress('중구').status,'unmapped');assert.equal(r.mapAddress('성수').status,'unmapped');assert.equal(r.mapAddress('서울특별시 미지구').status,'partial');
 assert.throws(()=>r.validateCoordinates(37.5,127));assert.throws(()=>r.validateCoordinates(NaN,37));assert.throws(()=>r.validateCoordinates(1270000000,375000000));
 assert.equal(r.reconcile(r.mapAddress('서울 중구'),r.mapAddress('부산 중구')).reasonCodes[0],'ADDRESS_COORDINATE_CONFLICT');
});
test('Place and region policy are independent, unavailable provider does not fake a match',async()=>{
 const s=await setup();try{const {service:r}=fixture(s,{regionStorageAllowed:()=>false,region:async()=>new RegionsService().empty('REGION_STORAGE_POLICY_BLOCKED',true)});const j=await r.create('u1','logical-key',input());await r.tick();const out=r.get('u1',j.resolutionId);assert.equal(out.status,'resolved');assert.equal(out.region.status,'policy_blocked');
 const p=new ProvidersService(config(),new SafeHttpService(),s,new RegionsService());await assert.rejects(p.search('kakao','test'),e=>e.code==='PROVIDER_NOT_CONFIGURED');
 }finally{s.close();}
});
test('Share classification preserves single-place scope and URL-only fallback',async()=>{
 assert.equal(parseShare(input({sharedText:'https://map.kakao.com/?q=coffee'})).unsupported,'NOT_A_SINGLE_PLACE');assert.equal(parseShare(input({sharedText:'https://place.map.kakao.com/123 https://place.map.kakao.com/456'})).unsupported,'MULTIPLE_URLS');
 assert.equal(parseShare(input({sharedText:'https://evil.example/123'})).unsupported,'UNSUPPORTED_OR_UNSAFE_URL');assert.equal(parseShare(input({sharedText:'https://kko.to/abcd'})).short,true);
 const s=await setup();try{const {service:r}=fixture(s);const j=await r.create('u1','logical-key',input({sharedText:'https://place.map.kakao.com/123'}));await r.tick();assert.equal(r.get('u1',j.resolutionId).reasonCodes[0],'PLACE_NAME_REQUIRED');}finally{s.close();}
});
test('SSRF blocks private IPv4/IPv6, credentials, redirects, DNS rebinding; timeout and byte limit passed to transport',async()=>{
 for(const ip of ['127.0.0.1','10.1.2.3','169.254.169.254','100.64.0.1','192.168.0.1','::1','::ffff:127.0.0.1','fc00::1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip);
 assert(isPublicAddress('8.8.8.8'));const http=new SafeHttpService();for(const url of ['http://naver.me/a','https://127.0.0.1','https://naver.me.evil.test','https://name:pass@naver.me/a','https://naver.me:444/a'])assert.throws(()=>http.validate(url,['naver.me']));
 let called=0;http.addresses=async()=>[{address:'127.0.0.1',family:4}];http.pinned=async()=>{called++;};await assert.rejects(http.get('https://naver.me/a',['naver.me']),e=>e.code==='UNSAFE_ADDRESS');assert.equal(called,0);
 http.addresses=async()=>[{address:'8.8.8.8',family:4}];http.pinned=async(url,address,headers,signal,max)=>{assert.equal(address.address,'8.8.8.8');assert.equal(max,250000);return {status:302,headers:{location:'https://127.0.0.1/private'},body:'',url:url.href};};await assert.rejects(http.get('https://naver.me/a',['naver.me']),e=>e.code==='UNSAFE_URL');
 http.addresses=()=>new Promise(()=>{});await assert.rejects(http.get('https://naver.me/a',['naver.me'],{},10),e=>e.code==='PROVIDER_TIMEOUT');
});
test('Configuration refuses known/default secret and request limits survive distinct clients',async()=>{
 assert.throws(()=>validateConfig({JWT_SECRET:'change-me-duri-date-secret'}));assert.throws(()=>validateConfig({JWT_SECRET:'strong-enough'.repeat(4),KAKAO_PLACE_STORAGE_APPROVED:'yes'}));
 const s=await setup();try{assert.equal(s.consumeLimit('u',1,60000),0);assert(s.consumeLimit('u',1,60000)>0);assert.equal(s.consumeLimit('other',1,60000),0);}finally{s.close();}
});
test('Queued jobs survive server restart and expired jobs/candidates are purged',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'duri-queue-')),file=join(dir,'queue.sqlite');let s=await setup({DATABASE_FILE:file});let r=fixture(s).service;
 const j=await r.create('u1','durable-key',input());s.close();s=new JsonStoreService(config({DATABASE_FILE:file}));s.onModuleInit();r=fixture(s).service;
 try{assert.equal(r.get('u1',j.resolutionId).status,'queued');await r.tick();assert.equal(r.get('u1',j.resolutionId).status,'resolved');
 await s.mutate(db=>db.resolutions[0].expiresAt=new Date(0).toISOString());await r.tick();assert.equal(s.snapshot().resolutions.length,0);assert.throws(()=>r.get('u1',j.resolutionId),status(404));
 }finally{s.close();rmSync(dir,{recursive:true});}
});
test('An older worker result cannot overwrite a recovered attempt',async()=>{
 const s=await setup();try{let release;const old=fixture(s,{search:()=>new Promise(resolve=>release=resolve)}).service;const newer=fixture(s).service;
 const j=await old.create('u1','logical-key',input());const pending=old.tick();await new Promise(resolve=>setImmediate(resolve));await s.mutate(db=>db.resolutions[0].leaseUntil=0);
 await newer.tick();await s.mutate(db=>db.resolutions[0].nextAttemptAt=0);await newer.tick();const before=newer.get('u1',j.resolutionId);release([]);await pending;
 assert.deepEqual(newer.get('u1',j.resolutionId),before);assert.equal(before.status,'resolved');assert.equal(before.attempt,2);
 }finally{s.close();}
});
test('Queue timeout and retry dates beyond retention do not leave pending or invalid dates',async()=>{
 const s=await setup();try{const r=fixture(s).service;const j=await r.create('u1','logical-key',input());await s.mutate(db=>db.resolutions[0].updatedAt=new Date(0).toISOString());await r.tick();assert.equal(r.get('u1',j.resolutionId).error.code,'QUEUE_TIMEOUT');
 const other=fixture(s,{search:async()=>{throw new UpstreamError('PROVIDER_RATE_LIMIT',true,1e20);}}).service;const k=await other.create('u1','logical-two',input({clientCardId:'card2'}));await other.tick();assert.equal(other.get('u1',k.resolutionId).error.retryable,false);assert.equal(other.get('u1',k.resolutionId).nextRetryAt,null);
 }finally{s.close();}
});
test('Region conflict downgrades auto confirmation, and empty search is no_match',async()=>{
 const s=await setup();try{const r=fixture(s,{region:async()=>new RegionsService().empty('ADDRESS_COORDINATE_CONFLICT')}).service;const j=await r.create('u1','logical-key',input());await r.tick();assert.equal(r.get('u1',j.resolutionId).status,'needs_confirmation');
 const empty=fixture(s,{search:async()=>[]}).service;const k=await empty.create('u1','logical-two',input({clientCardId:'other'}));await empty.tick();assert.equal(empty.get('u1',k.resolutionId).status,'no_match');
 }finally{s.close();}
});
