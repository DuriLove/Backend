function summarize(rows){const providers={};for(const source of ['naver_map','kakao_map']){
const rs=rows.filter(r=>r.sourceType===source),auto=rs.filter(r=>r.matchMethod==='automatic');
const valid=rs.filter(r=>r.validPlaceSample===true),validAuto=valid.filter(r=>r.matchMethod==='automatic');
const allIdentifiable=auto.length>0&&auto.every(r=>r.expected.provider&&r.expected.providerPlaceId);
providers[source]={sampleCount:rs.length,validPlaceSampleCount:valid.length,automaticCount:auto.length,identityVerifiedAutomaticCount:auto.filter(r=>r.identityVerified).length,correctAutomaticCount:auto.filter(r=>r.checked&&r.identityVerified).length,automaticAccuracy:allIdentifiable?auto.filter(r=>r.checked&&r.identityVerified).length/auto.length:null,automaticRate:valid.length?validAuto.length/valid.length:null,externalRequestSamples:rs.filter(r=>r.httpCallCount>0).length,failedSamples:rs.filter(r=>r.actual.status==='failed').length,pendingSamples:rs.filter(r=>['queued','processing'].includes(r.actual.status)).length};
}return providers;}
module.exports={summarize};
