const {test}=require('node:test');const assert=require('node:assert/strict');const {summarize}=require('../scripts/poc-summary.cjs');
test('PoC excludes unsupported inputs from valid-place denominator and separates no-network/pending results',()=>{
const row={sourceType:'kakao_map',actual:{status:'resolved'},expected:{provider:'kakao',providerPlaceId:'1'},matchMethod:'automatic',identityVerified:true,checked:true,httpCallCount:2,validPlaceSample:true};
const result=summarize([row,{...row,matchMethod:null,actual:{status:'unsupported'},validPlaceSample:false,httpCallCount:0},{...row,matchMethod:null,actual:{status:'processing'},identityVerified:false,httpCallCount:0}]).kakao_map;
assert.equal(result.sampleCount,3);assert.equal(result.validPlaceSampleCount,2);assert.equal(result.automaticRate,.5);assert.equal(result.automaticAccuracy,1);assert.equal(result.externalRequestSamples,1);assert.equal(result.pendingSamples,1);
assert.equal(summarize([{...row,expected:{providerPlaceId:'1'}}]).kakao_map.automaticAccuracy,null);
assert.equal(summarize([{...row,validPlaceSample:false}]).kakao_map.automaticRate,null);
});
