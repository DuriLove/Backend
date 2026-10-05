// Real production bootstrap, isolated SQLite, restart and online backup/restore verification.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn}=require('node:child_process');const {randomBytes}=require('node:crypto');const assert=require('node:assert/strict');
const output=process.argv[2];if(output&&fs.existsSync(output))throw Error('Output exists');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'duri-production-')),checks=[];
let child,base;
const secret=randomBytes(48).toString('base64url');
const env={...process.env,NODE_ENV:'production',JWT_SECRET:secret,DATABASE_FILE:path.join(directory,'original.sqlite'),LEGACY_DATA_FILE:'',DATA_FILE:'',HOST:'127.0.0.1',CORS_ORIGINS:'',WORKER_ENABLED:'true',KAKAO_PLACE_STORAGE_APPROVED:'false',KAKAO_REGION_STORAGE_APPROVED:'false',NAVER_PLACE_STORAGE_APPROVED:'false',NAVER_REGION_STORAGE_APPROVED:'false'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function run(file,args=[],overrides={}){return new Promise((resolve,reject)=>{const c=spawn(process.execPath,[file,...args],{env:{...env,...overrides},stdio:'ignore'});c.once('error',reject);c.once('exit',code=>code===0?resolve():reject(Error('CHILD_FAILED')));});}
async function stop(){if(!child)return;const c=child;child=null;if(c.exitCode!==null)return;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{c.kill('SIGKILL');reject(Error('SHUTDOWN_TIMEOUT'));},45000);c.once('exit',()=>{clearTimeout(timer);resolve();});c.kill('SIGTERM');});}
async function start(database){const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});base=`http://127.0.0.1:${port}`;child=spawn(process.execPath,['dist/main.js'],{env:{...env,DATABASE_FILE:database,PORT:String(port)},stdio:'ignore'});let spawnError;child.on('error',e=>spawnError=e);
for(let i=0;i<100;i++){if(spawnError||child.exitCode!==null)throw Error('BOOT_FAILED');try{const r=await fetch(base+'/api/v1/health',{signal:AbortSignal.timeout(500)});if(r.ok)return;}catch{}await sleep(100);}throw Error('HEALTH_TIMEOUT');}
async function request(route,method='GET',body,token,key){const r=await fetch(base+'/api/v1'+route,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(key?{'idempotency-key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});return {status:r.status,body:await r.json().catch(()=>null)};}
(async()=>{try{
await start(env.DATABASE_FILE);checks.push('production_boot_health');
assert.equal((await fetch(base+'/api/docs')).status,404);checks.push('swagger_disabled');
const password=randomBytes(24).toString('base64url');const account={name:'Isolated smoke',email:'smoke@example.invalid',password};
const signup=await request('/auth/signup','POST',account);assert.equal(signup.status,201);let token=signup.body.accessToken;
const catalog=await request('/region-catalog','GET',null,token);assert.equal(catalog.status,200);
const input={clientCardId:'smoke-card',inputRevision:1,sourceType:'kakao_map',sharedText:'https://map.kakao.com/link/map/123',regionCatalogVersion:catalog.body.version};
const first=await request('/place-resolutions','POST',input,token,'smoke-production-1');assert.equal(first.status,202);const route='/place-resolutions/'+first.body.resolutionId;
let result;for(let i=0;i<50;i++){result=await request(route,'GET',null,token);if(result.body.status==='needs_confirmation')break;await sleep(100);}assert.equal(result.body.status,'needs_confirmation');checks.push('real_worker_processes_job_without_provider_storage');
await stop();await start(env.DATABASE_FILE);assert.equal((await request(route,'GET',null,token)).body.status,'needs_confirmation');checks.push('restart_preserves_user_token_and_job');
const backup=path.join(directory,'backup.sqlite');await run('scripts/backup.cjs',[backup]);checks.push('online_consistent_backup');
const second=await request('/place-resolutions','POST',{...input,clientCardId:'after-backup'},token,'smoke-production-2');assert.equal(second.status,202);
await stop();await start(backup);assert.equal((await request(route,'GET',null,token)).status,200);assert.equal((await request('/place-resolutions/'+second.body.resolutionId,'GET',null,token)).status,404);checks.push('restored_snapshot_excludes_post_backup_writes');
assert.equal((await request('/auth/login','POST',{email:account.email,password})).status,201);checks.push('restored_account_login');
const report={checkedAt:new Date().toISOString(),status:'passed',environment:'isolated_local_production',node:process.version,checks,externalDeployment:false,providerCalls:0,userDataTouched:false};
if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify(report));
}finally{await stop();fs.rmSync(directory,{recursive:true,force:true});}})().catch(()=>{console.error('PRODUCTION_VERIFICATION_FAILED');process.exitCode=1;});
