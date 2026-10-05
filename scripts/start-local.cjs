// Local-only settings; storage enablement is an operator decision, not provider approval.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');process.chdir(root);
const directory=path.join(root,'data','local');fs.mkdirSync(directory,{recursive:true,mode:0o700});
const settingsFile=path.join(directory,'settings.json');
const settings=fs.existsSync(settingsFile)?JSON.parse(fs.readFileSync(settingsFile,'utf8')):{};
const kakaoStorage=settings.kakaoStorageEnabled===true?'true':'false';
const naverStorage=settings.naverStorageEnabled===true?'true':'false';
const lookupProvider=['source','kakao','naver'].includes(settings.lookupProvider)?settings.lookupProvider:'kakao';
const secretFile=path.join(directory,'jwt-secret');let secret;
try{secret=crypto.randomBytes(48).toString('base64url');fs.writeFileSync(secretFile,secret,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;secret=fs.readFileSync(secretFile,'utf8');}
const child=spawn(process.execPath,['dist/main.js'],{cwd:root,stdio:'inherit',env:{...process.env,NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3100',JWT_SECRET:secret,DATABASE_FILE:path.join(directory,'store.sqlite'),LEGACY_DATA_FILE:'',DATA_FILE:'',WORKER_ENABLED:'true',PLACE_LOOKUP_PROVIDER:lookupProvider,KAKAO_PLACE_STORAGE_APPROVED:kakaoStorage,KAKAO_REGION_STORAGE_APPROVED:kakaoStorage,NAVER_PLACE_STORAGE_APPROVED:naverStorage,NAVER_REGION_STORAGE_APPROVED:naverStorage}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('LOCAL_START_FAILED');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??0;});
console.log('Local API: http://127.0.0.1:3100/api/v1 | API docs: http://127.0.0.1:3100/api/docs');
console.log('Isolated local DB; Kakao storage enabled: '+(kakaoStorage==='true')+'; Naver storage enabled: '+(naverStorage==='true')+'; lookup provider: '+lookupProvider+'. Provider permission is not verified. No payment or cloud setup.');
