require('dotenv').config({quiet:true});
if(process.env.NODE_ENV==='production'){console.error('Demo seed is forbidden in production');process.exit(1);}
process.env.WORKER_ENABLED='false';
const {NestFactory}=require('@nestjs/core');const {AppModule}=require('../dist/app.module');const {JsonStoreService}=require('../dist/store/json-store.service');const {hash}=require('bcryptjs');
(async()=>{const app=await NestFactory.createApplicationContext(AppModule,{logger:false});try{const passwordHash=await hash('password123',12);await app.get(JsonStoreService).mutate(db=>{
 if(db.users.length||db.boards.length)throw new Error('SEED_REQUIRES_EMPTY_DATABASE');
 db.users.push({id:'user-1',name:'수민',email:'sumin@duri.local',passwordHash},{id:'user-2',name:'두리',email:'duri@duri.local',passwordHash});db.boards.push({id:'board-1',name:'우리 데이트 보드',memberIds:['user-1','user-2'],inviteCode:'DURI01',candidateSet:{id:'candidate-set-1',boardId:'board-1',title:'이번 주말 어디 갈까?',cardIds:[]},deletedShareRecordIds:[]});
 });console.log('Development demo accounts created; never use this database in production.');}finally{await app.close();}})().catch(e=>{console.error(e.message==='SEED_REQUIRES_EMPTY_DATABASE'?e.message:'SEED_FAILED');process.exitCode=1;});
