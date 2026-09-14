import baseline from '../config/mvp-baseline-1.json';
import type { GameState, Proposal } from '../domain/state';
import { id, day, money } from '../domain/values';
import { randomAt } from './random';
import { cents } from './finance';
import { industryRoll,studioProfile } from './industry';
export const clip=(v:number)=>Math.min(1,Math.max(0,v));
export function roll(s: Pick<GameState,'seedHex'>, object: string, purpose: string, date=0) {return randomAt(s.seedHex,'business',object,`day:${date}`,purpose,'',0,'playable-1');}
export function enrich(p: Pick<Proposal,'id'|'developerId'|'name'|'genre'|'createdDay'|'expiresDay'|'funding'|'advance'|'reportedProgress'|'estimatedWeeks'|'hiddenQuality'|'audience'>, seedHex:string, currentDay:number):Proposal {
  const r=(purpose:string)=>roll({seedHex},p.id,purpose);
  const total=700+Math.floor(r('work')*701);
  const ref=baseline.genres.find(g=>g.id===p.genre)!.referencePrice;
  return {...p,cooperation:'PROSPECT',product:'UNRELEASED',offer:null,contract:null,totalWork:total,completedWork:total*p.reportedProgress,quality:p.hiddenQuality,polish:0.1+r('polish')*.35,unknownBugs:total*p.reportedProgress*.035,openBugs:0,verification:0,
    workingFunds:cents(8000000+Math.floor(r('funds')*18)*1000000),dailyCost:cents(Math.max(50000,Math.min(800000,Number(p.funding)/(p.estimatedWeeks*7)))),workPrice:cents(Math.max(50000,Math.min(300000,Number(p.funding)/(total*(1-p.reportedProgress))))),qaDaily:money(0n),targetDay:day(currentDay+p.estimatedWeeks*7),reportedQuality:null,reportDay:null,
    candidate:null,launchBuild:null,published:null,firstRelease:null,releaseDay:null,announcedDay:null,price:money(ref),discount:null,activeSupport:true,budget:p.funding,
    awareness:.02,interest:.45,hype:.4,trust:.5,mouth:0,wishlist:0,bought:0,owners:0,reviews:0,positive:0,lastSales:0,totalSales:0,exitedDay:null,handoverDay:null,pendingWork:null,exposureUntil:0,exposureCooldown:0,riskUntil:0,riskCooldown:0,history:[]};
}
export function addProposals(s:GameState) {
  const initial=s.proposals.length===0;
  if(!initial&&industryRoll(s,'market','arrival',s.currentDay)>.10+.20*s.company.reputation)return;
  const available=[...s.developers].sort((a,b)=>Number(a.id.split(':')[1])-Number(b.id.split(':')[1])).filter(d=>{
    const previous=s.proposals.filter(p=>p.developerId===d.id);
    if(previous.some(p=>p.cooperation==='ACTIVE'||p.cooperation==='EXIT_SETTLEMENT'||(p.cooperation==='PROSPECT'&&(p.expiresDay>=s.currentDay||p.offer?.status==='waiting'||!!(p.offer&&['accepted','counter'].includes(p.offer.status)&&p.offer.expiresDay>=s.currentDay)))))return false;
    const last=previous.at(-1);return !last||s.currentDay>last.expiresDay+14+Math.floor(industryRoll(s,d.id,'cooldown',last.createdDay)*40);
  }).sort((a,b)=>industryRoll(s,a.id,'availability',s.currentDay)-industryRoll(s,b.id,'availability',s.currentDay));
  const count=initial?4+Math.floor(industryRoll(s,'market','initial')*5):industryRoll(s,'market','batch',s.currentDay)>.86?2:1;
  for(const developer of available.slice(0,count)) {
    const n=s.nextProjectId++,pid=id('project:'+n),r=(purpose:string)=>roll(s,pid,purpose,s.currentDay),profile=studioProfile(developer.id);
    const genre=baseline.genres.find(g=>g.id===profile.specialty)!;
    const progress=.15+r('progress')*.4,pressure=industryRoll(s,pid,'pressure');
    const duration=Math.round(35+(1-pressure)*55-progress*22);
    s.proposals.push(enrich({id:pid,developerId:developer.id,name:baseline.projectNames[(n-1)%36]!+(n>36?' · '+(Math.floor((n-1)/36)+1):''),genre:genre.id as Proposal['genre'],createdDay:s.currentDay,expiresDay:day(s.currentDay+duration),funding:cents(60000000+Math.floor(r('funding')*37)*5000000),advance:cents(2500000+Math.floor(r('advance')*8)*2500000),reportedProgress:progress,estimatedWeeks:18+Math.floor(r('duration')*35),hiddenQuality:.35+r('quality')*.45,audience:genre.audience[0]!+Math.floor(r('audience')*(genre.audience[1]!-genre.audience[0]!+1))},s.seedHex,s.currentDay));
  }
}
