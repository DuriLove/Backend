import { Injectable, Controller, Get, Headers, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
@Injectable()
export class MetricsService {
  private readonly startedAt=new Date().toISOString();
  private readonly buckets=new Map<string,{count:number;failures:number;samples:number[]}>();
  record(name:string,ms:number,failed=false){
    const b=this.buckets.get(name)??{count:0,failures:0,samples:[]};b.count++;if(failed)b.failures++;b.samples.push(ms);
    if(b.samples.length>1024)b.samples.shift();this.buckets.set(name,b);
  }
  snapshot(){return {startedAt:this.startedAt,sampleWindow:1024,metrics:Object.fromEntries([...this.buckets].map(([name,b])=>{
    const sorted=[...b.samples].sort((a,b)=>a-b);const percentile=(p:number)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]??0;
    return [name,{count:b.count,failures:b.failures,p50Ms:percentile(.5),p95Ms:percentile(.95)}];
  }))};}
}
@Controller('operations/metrics')
export class MetricsController {
  constructor(private readonly metrics:MetricsService,private readonly config:ConfigService){}
  @Get() get(@Headers('x-operations-token') token?:string){
    const expected=this.config.get<string>('OPERATIONS_TOKEN');
    if(!expected||expected.length<32||!token||Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected))) throw new NotFoundException();
    return this.metrics.snapshot();
  }
}
