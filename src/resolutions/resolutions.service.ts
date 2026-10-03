import { MetricsService } from '../security/metrics.service';
import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { JsonStoreService } from '../store/json-store.service';
import { RegionsService } from '../regions/regions.service';
import { SafeHttpService, MAP_HOSTS, UpstreamError } from '../security/safe-http.service';
import { ProvidersService } from './providers.service';
import { parseShare, normalizeAddress, normalizeName } from './share-input';
import type { Database } from '../types';
import type { Resolution, ResolutionInput, Candidate, ResolutionError } from './resolution.types';
import type { CreateResolutionDto, SelectCandidateDto, RetryResolutionDto } from './resolutions.dto';
const MAX_ATTEMPTS = 3, LEASE_MS = 35_000, JOB_TTL = 7*86400_000, CANDIDATE_TTL = 15*60_000;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = () => new Date().toISOString();

@Injectable()
export class ResolutionsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private readonly logger = new Logger(ResolutionsService.name);
  constructor(private readonly store: JsonStoreService, private readonly regions: RegionsService,
    private readonly providers: ProvidersService, private readonly http: SafeHttpService, private readonly config: ConfigService, @Optional() private readonly metrics?: MetricsService) {}
  onModuleInit() {
    if (this.config.get<string>('WORKER_ENABLED', 'true') !== 'true') return;
    this.timer = setInterval(() => { if (!this.running) {
      this.running = this.tick().catch(()=>this.logger.error('WORKER_STORAGE_FAILURE')).finally(()=>{this.running=undefined;});
    } },250);
    this.timer.unref();
  }
  async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.running; }
  private key(value: string | undefined) {
    if (!value || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new BadRequestException({code:'INVALID_IDEMPOTENCY_KEY'});
    return value;
  }
  private owned(db: Database, userId: string, id: string) {
    const job = db.resolutions.find(j=>j.resolutionId===id && j.userId===userId && Date.parse(j.expiresAt)>Date.now());
    if (!job) throw new NotFoundException({code:'RESOLUTION_NOT_FOUND'});
    return job;
  }
  view(job: Resolution) {
    return {resolutionId:job.resolutionId, clientCardId:job.input.clientCardId,inputRevision:job.input.inputRevision,
      sourceType:job.input.sourceType,revision:job.revision,status:job.status,attempt:job.attempt,attempts:job.attempts,
      matchMethod:job.matchMethod,reasonCodes:job.reasonCodes,place:job.place,region:job.region,error:job.error,
      candidates:job.candidates.map(c=>({...c,expired:Date.parse(c.expiresAt)<=Date.now()})),
      createdAt:job.createdAt,updatedAt:job.updatedAt,expiresAt:job.expiresAt,
      nextRetryAt:job.status==='failed' && job.error?.retryable ? new Date(job.nextAttemptAt).toISOString() : null};
  }
  async create(userId: string, key: string | undefined, dto: CreateResolutionDto) {
    const idempotencyKey = this.key(key);
    if (!dto.sharedText.trim() && !dto.sharedUrl) throw new BadRequestException({code:'EMPTY_SHARE_INPUT'});
    const input: ResolutionInput = {clientCardId:dto.clientCardId,inputRevision:dto.inputRevision,sourceType:dto.sourceType,
      sharedText:dto.sharedText,...(dto.sharedUrl ? {sharedUrl:dto.sharedUrl.trim()} : {}),regionCatalogVersion:dto.regionCatalogVersion};
    const fingerprint = hash(input);
    const job = await this.store.mutate(db=>{
      const prior = db.resolutions.find(j=>j.userId===userId && j.idempotencyKey===idempotencyKey && Date.parse(j.expiresAt)>Date.now());
      if (prior) { if (prior.fingerprint!==fingerprint) throw new ConflictException({code:'IDEMPOTENCY_CONFLICT'}); return prior; }
      this.regions.assertVersion(input.regionCatalogVersion);
      const previous = db.resolutions.filter(j=>j.userId===userId && j.input.clientCardId===input.clientCardId && Date.parse(j.expiresAt)>Date.now());
      if (previous.some(j=>j.input.inputRevision>=input.inputRevision)) throw new ConflictException({code:'INPUT_REVISION_CONFLICT'});
      const created: Resolution = {resolutionId:randomUUID(),userId,idempotencyKey,fingerprint,input,revision:1,status:'queued',attempt:0,
        attempts:[],createdAt:iso(),updatedAt:iso(),expiresAt:new Date(Date.now()+JOB_TTL).toISOString(),nextAttemptAt:Date.now(),
        matchMethod:null,reasonCodes:[],candidates:[],place:null,region:this.regions.empty('PENDING'),error:null,retries:[]};
      db.resolutions.push(created); return created;
    });
    return this.view(job);
  }
  get(userId: string,id: string) { return this.view(this.owned(this.store.snapshot(),userId,id)); }
  async select(userId: string,id: string,dto: SelectCandidateDto) {
    return this.view(await this.store.mutate(db=>{
      const job=this.owned(db,userId,id);
      if (job.status==='resolved' && job.selection?.candidateId===dto.candidateId && job.selection.expectedRevision===dto.expectedRevision) return job;
      if (job.status!=='needs_confirmation' || job.revision!==dto.expectedRevision) throw new ConflictException({code:'STALE_REVISION_OR_STATE'});
      const candidate=job.candidates.find(c=>c.candidateId===dto.candidateId);
      if (!candidate) {
        if (job.reasonCodes.includes('CANDIDATES_EXPIRED')) throw new ConflictException({code:'CANDIDATE_EXPIRED'});
        throw new BadRequestException({code:'INVALID_CANDIDATE'});
      }
      if (Date.parse(candidate.expiresAt)<=Date.now()) throw new ConflictException({code:'CANDIDATE_EXPIRED'});
      if (!this.providers.placeStorageAllowed(candidate.place.provider)) throw new ConflictException({code:'PLACE_STORAGE_POLICY_BLOCKED'});
      job.place=candidate.place; job.region=this.providers.regionStorageAllowed(candidate.place.provider) ? candidate.region : this.regions.empty('REGION_STORAGE_POLICY_BLOCKED',true);
      job.status='resolved';job.matchMethod='user';job.reasonCodes=['USER_SELECTED'];job.error=null;
      job.selection={...dto};job.candidates=[];job.revision++;job.updatedAt=iso();return job;
    }));
  }
  async retry(userId:string,id:string,key:string|undefined,dto:RetryResolutionDto) {
    const requestKey=this.key(key), fingerprint=hash(dto);
    return this.view(await this.store.mutate(db=>{
      const job=this.owned(db,userId,id);
      const old=job.retries.find(r=>r.key===requestKey);
      if (old) { if(old.fingerprint!==fingerprint) throw new ConflictException({code:'IDEMPOTENCY_CONFLICT'}); return job; }
      if(job.revision!==dto.expectedRevision || job.status!=='failed' || !job.error?.retryable || job.attempt>=MAX_ATTEMPTS) throw new ConflictException({code:'NOT_RETRYABLE_OR_STALE'});
      if(Date.now()<job.nextAttemptAt) throw new ConflictException({code:'RETRY_NOT_DUE',retryAfterMs:job.nextAttemptAt-Date.now()});
      job.retries.push({key:requestKey,fingerprint});job.status='queued';job.error=null;job.revision++;job.updatedAt=iso();return job;
    }));
  }
  async remove(userId:string,id:string) {
    await this.store.mutate(db=> {const job=this.owned(db,userId,id); db.resolutions=db.resolutions.filter(j=>j!==job);});
  }
  private fail(job: Resolution,error: ResolutionError) {
    const delay=Math.max(error.retryAfterMs??0,1000*2**Math.max(0,job.attempt-1));
    const withinRetention=Number.isFinite(delay)&&Date.now()+delay<Date.parse(job.expiresAt);
    job.status='failed';job.error={...error,retryable:error.retryable && job.attempt<MAX_ATTEMPTS && withinRetention};job.reasonCodes=[error.code];
    job.nextAttemptAt=withinRetention?Date.now()+delay:Date.parse(job.expiresAt);
    job.leaseToken=undefined;job.leaseUntil=undefined;job.revision++;job.updatedAt=iso();
    const attempt=job.attempts.at(-1);if(attempt){attempt.finishedAt=iso();attempt.errorCode=error.code;}
  }
  async tick() {
    const now=Date.now();
    const snapshot=this.store.snapshot();
    if(!snapshot.resolutions.some(j=>Date.parse(j.expiresAt)<=now || (j.status==='processing' && (j.leaseUntil??0)<=now) ||
      ((j.status==='queued'||(j.status==='failed'&&j.error?.retryable))&&j.nextAttemptAt<=now) || j.candidates.some(c=>Date.parse(c.expiresAt)<=now))) return;
    const claimed=await this.store.mutate(db=>{
      db.resolutions=db.resolutions.filter(j=>Date.parse(j.expiresAt)>now);
      for(const job of db.resolutions){
        if(job.status==='queued' && now-Date.parse(job.updatedAt)>300_000) this.fail(job,{code:'QUEUE_TIMEOUT',retryable:false});
        const validCandidates=job.candidates.filter(c=>Date.parse(c.expiresAt)>now);
        if (validCandidates.length !== job.candidates.length) {
          job.candidates=validCandidates;job.revision++;job.updatedAt=iso();job.reasonCodes=['CANDIDATES_EXPIRED'];
        }
        if(job.status==='processing'&&(job.leaseUntil??0)<=now) this.fail(job,{code:'WORKER_LEASE_EXPIRED',retryable:true});
      }
      const job=db.resolutions.find(j=>(j.status==='queued'||(j.status==='failed'&&j.error?.retryable))&&j.nextAttemptAt<=now);
      if(!job)return null;
      job.status='processing';job.attempt++;job.revision++;job.updatedAt=iso();job.error=null;job.candidates=[];
      job.leaseToken=randomUUID();job.leaseUntil=now+LEASE_MS;job.attempts.push({number:job.attempt,startedAt:iso()});return job;
    });
    if(!claimed)return;
    const started=Date.now();
    try {
      let deadline: ReturnType<typeof setTimeout>;
      const result=await Promise.race([this.analyze(claimed),new Promise<never>((_,reject)=>{
        deadline=setTimeout(()=>reject(new UpstreamError('JOB_TIMEOUT',true)),30_000);
      })]).finally(()=>clearTimeout(deadline!));
      await this.store.mutate(db=>{
        const job=db.resolutions.find(j=>j.resolutionId===claimed.resolutionId);
        if(!job||job.status!=='processing'||job.leaseToken!==claimed.leaseToken)return;
        if((job.leaseUntil??0)<=Date.now()) {this.fail(job,{code:'JOB_TIMEOUT',retryable:true});return;}
        Object.assign(job,result);job.leaseToken=undefined;job.leaseUntil=undefined;job.revision++;job.updatedAt=iso();job.attempts.at(-1)!.finishedAt=iso();
      });
    } catch(error) {
      const failure=error instanceof UpstreamError ? {code:error.code,retryable:error.retryable,retryAfterMs:error.retryAfterMs} : {code:'RESOLUTION_INTERNAL_ERROR',retryable:false};
      await this.store.mutate(db=>{
        const job=db.resolutions.find(j=>j.resolutionId===claimed.resolutionId);
        if(job?.status==='processing'&&job.leaseToken===claimed.leaseToken)this.fail(job,failure);
      });
    }
    const current=this.store.snapshot().resolutions.find(j=>j.resolutionId===claimed.resolutionId);
    this.metrics?.record(`resolution.${current?.status??'deleted'}`,Date.now()-started,current?.status==='failed');
    this.logger.log(JSON.stringify({resolutionId:claimed.resolutionId,status:current?.status,attempt:claimed.attempt,elapsedMs:Date.now()-started,errorCode:current?.error?.code}));
  }
  private async analyze(job:Resolution):Promise<Partial<Resolution>> {
    let parsed=parseShare(job.input);
    if(parsed.unsupported)return {status:'unsupported',reasonCodes:[parsed.unsupported]};
    if(parsed.short){const expanded=await this.http.get(parsed.url!,MAP_HOSTS);parsed=parseShare(job.input,expanded.url);}
    if(parsed.unsupported||parsed.short)return {status:'unsupported',reasonCodes:[parsed.unsupported??'SHORT_LINK_UNRESOLVED']};
    if(!parsed.name)return {status:'needs_confirmation',reasonCodes:['PLACE_NAME_REQUIRED'],candidates:[]};
    const provider=this.providers.lookupProvider(parsed.provider!);
    const places=await this.providers.search(provider,`${parsed.name} ${parsed.address}`.trim());
    if(!places.length)return {status:'no_match',reasonCodes:['NO_SEARCH_RESULTS']};
    const exact=places.filter(p=>{
      if (normalizeName(p.name)!==normalizeName(parsed.name)) return false;
      const addressMatch=Boolean(parsed.address && [p.address,p.roadAddress].some(a=>normalizeAddress(a)===normalizeAddress(parsed.address)));
      if (parsed.address && !addressMatch) return false;
      if (provider===parsed.provider && p.providerPlaceId && parsed.placeId) return p.providerPlaceId===parsed.placeId;
      return addressMatch;
    });
    const candidates:Candidate[]=places.map(p=>({candidateId:randomUUID(),place:{provider:p.provider,providerPlaceId:p.providerPlaceId,name:p.name,url:p.url},
      region:this.providers.regionStorageAllowed(provider) ? this.regions.mapAddress(p.address||p.roadAddress) : this.regions.empty('REGION_STORAGE_POLICY_BLOCKED',true),
      reasonCodes:['USER_CONFIRMATION_REQUIRED'],expiresAt:new Date(Date.now()+CANDIDATE_TTL).toISOString()}));
    if(exact.length===1){
      const selected=exact[0];const region=await this.providers.region(selected);
      if(!region.reasonCodes.includes('ADDRESS_COORDINATE_CONFLICT')) {
        return {status:'resolved',matchMethod:'automatic',place:candidates[places.indexOf(selected)].place,region,candidates:[],
          reasonCodes:[provider===parsed.provider&&selected.providerPlaceId===parsed.placeId?'PROVIDER_ID_AND_NAME_MATCH':'NAME_AND_ADDRESS_MATCH']};
      }
      candidates[places.indexOf(selected)].region=region;
      return {status:'needs_confirmation',reasonCodes:['ADDRESS_COORDINATE_CONFLICT'],candidates};
    }
    return {status:'needs_confirmation',reasonCodes:['INSUFFICIENT_UNIQUE_MATCH_EVIDENCE'],candidates};
  }
}
