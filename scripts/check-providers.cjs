// Connection-only diagnostics: no provider response fields or credentials are saved.
require('dotenv').config({quiet:true});
const {SafeHttpService}=require('../dist/security/safe-http.service');
const {writeFileSync}=require('node:fs');
const hub=process.env.NAVER_API_MODE!=='legacy';
const targets=[
 {provider:'kakao',host:'dapi.kakao.com',path:'/v2/local/search/keyword.json?size=1',configured:Boolean(process.env.KAKAO_REST_API_KEY),headers:{Authorization:'KakaoAK '+(process.env.KAKAO_REST_API_KEY||'')}},
 {provider:'naver',host:hub?'naverapihub.apigw.ntruss.com':'openapi.naver.com',path:hub?'/search/v1/local?display=1':'/v1/search/local.json?display=1',
 configured:hub?Boolean(process.env.NAVER_HUB_CLIENT_ID&&process.env.NAVER_HUB_CLIENT_SECRET):Boolean(process.env.NAVER_CLIENT_ID&&process.env.NAVER_CLIENT_SECRET),
 headers:hub?{'X-NCP-APIGW-API-KEY-ID':process.env.NAVER_HUB_CLIENT_ID||'','X-NCP-APIGW-API-KEY':process.env.NAVER_HUB_CLIENT_SECRET||''}:{'X-Naver-Client-Id':process.env.NAVER_CLIENT_ID||'','X-Naver-Client-Secret':process.env.NAVER_CLIENT_SECRET||''}}
];
(async()=>{const rows=[];for(const target of targets){
 if(!target.configured){rows.push({provider:target.provider,host:target.host,status:'not_configured',httpCalls:0});continue;}
 const started=Date.now();
 try{const result=await new SafeHttpService().get('https://'+target.host+target.path+'&query='+encodeURIComponent('국립중앙박물관'),[target.host],target.headers);
 const body=JSON.parse(result.body);const list=target.provider==='kakao'?body.documents:body.items;
 rows.push({provider:target.provider,host:target.host,status:Array.isArray(list)?'connected':'invalid_response',httpStatus:result.status,httpCalls:1,resultCount:Array.isArray(list)?list.length:null,elapsedMs:Date.now()-started});
 }catch(error){rows.push({provider:target.provider,host:target.host,status:'failed',httpCalls:1,errorCode:error.code??'INVALID_RESPONSE',elapsedMs:Date.now()-started});}
 }
 const report={checkedAt:new Date().toISOString(),mode:'live_connectivity_only',sharedInputSamples:0,containsProviderResponseData:false,rows};
 const output=process.argv[2];if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(report,null,2));if(rows.some(r=>r.status!=='connected'))process.exitCode=2;
})().catch(()=>{console.error('PROVIDER_CHECK_FAILED');process.exitCode=1;});
