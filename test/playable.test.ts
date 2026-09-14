import { describe,it,expect } from 'vitest';
import { newGame,advanceDay,validateState,migrateState } from '../../src/simulation/game';
import { defaultTerms,submitAction,cancelAction,quoteAction } from '../../src/simulation/actions';
import { day,money } from '../../src/domain/values';
import type { GameState,ActionPayload } from '../../src/domain/state';
import { decode,encode } from '../../src/infrastructure/save-store';
import { playerView } from '../../src/application/projection';
import { expense,settleDue,exitCost } from '../../src/simulation/finance';

const seed='0123456789abcdef0123456789abcdef';
function run(s:GameState,n:number){for(let i=0;i<n;i++){s=advanceDay(s).state;validateState(s);}return s;}
function submit(s:GameState,a:ActionPayload){return submitAction(s,a,`test:${s.nextActionId}`,s.revision);}
function signed(seedHex=seed){
 let s=newGame(seedHex,'经营测试'),p=s.proposals[0]!;
 s=submit(s,{kind:'offer',projectId:p.id,terms:{...defaultTerms(p),control:'lead'}});s=run(s,1);s=run(s,s.proposals[0]!.offer!.responseDay-s.currentDay);
 expect(s.proposals[0]!.offer!.status).toBe('accepted');
 s=submit(s,{kind:'sign',projectId:p.id,offerId:s.proposals[0]!.offer!.id});s=run(s,1);
 expect(s.proposals[0]!.cooperation).toBe('ACTIVE');return s;
}
describe('playable business flow',()=>{
 it('recognizes same-day installments before exit and cancels later project actions',()=>{
  let s=signed();const pid=s.proposals[0]!.id;
  s=run(s,27);s=submit(s,{kind:'exit',projectId:pid,negotiated:false});
  s=submit(s,{kind:'qa',projectId:pid,daily:money(100000n)});s=run(s,1);
  expect(s.proposals[0]!.contract!.installments[1]!.recognized).toBe(true);
  expect(s.ledger.filter(l=>l.label==='合同开发拨款'&&l.kind==='payment')).toHaveLength(1);
  expect(s.actions.at(-1)!.status).toBe('cancelled');
 });
 it('can cancel launch and plan budgets without charging or changing contract terms',()=>{
  let s=signed();const pid=s.proposals[0]!.id;
  s=run(submit(s,{kind:'release',projectId:pid,date:day(s.currentDay+10),price:money(2999n)}),1);
  s=submit(s,{kind:'unschedule',projectId:pid});s=submit(s,{kind:'budget',projectId:pid,amount:money(0n)});
  s=run(s,15);expect(s.proposals[0]!.product).toBe('UNRELEASED');expect(s.proposals[0]!.budget).toBe('0');
  expect(s.ledger.some(l=>l.label==='正式上线')).toBe(false);
 });
 it('negotiates, signs once and pays scheduled installments with exact cash reconciliation',()=>{
  let s=signed();const p=s.proposals[0]!,c=p.contract!,initialTerms=structuredClone(c.terms);
  expect(s.ledger.filter(l=>l.kind==='payment'&&l.projectId===p.id)).toHaveLength(2);
  const original=s;
  s=submit(s,{kind:'fund',projectId:p.id,amount:money(1000000n)});s=run(s,1);
  expect(s.proposals[0]!.contract!.terms).toEqual(initialTerms);
  expect(original.proposals[0]!.contract!.unrecouped).not.toEqual(s.proposals[0]!.contract!.unrecouped);
  s=run(s,84);expect(s.proposals[0]!.contract!.installments.every(i=>i.recognized)).toBe(true);
  for(const i of c.installments)expect(s.ledger.filter(l=>l.key===i.key)).toHaveLength(1);
  expect(()=>quoteAction(s,{kind:'sign',projectId:p.id,offerId:p.offer!.id})).toThrow();
 });
 it('keeps research samples hidden until delivery and preserves them across save/load',()=>{
  let s=newGame(seed,'调查测试');const p=s.proposals[0]!;
  s=run(submit(s,{kind:'research',projectId:p.id,method:'technical'}),1);
  expect(playerView(s,0).proposals[0]!.research[0]!.range).toBeNull();
  const restored=decode(encode(s));expect(run(restored,10)).toEqual(run(s,10));
  s=run(s,10);expect(playerView(s,0).proposals[0]!.research[0]!.range).not.toBeNull();
  expect(JSON.stringify(playerView(s,0))).not.toMatch(/hiddenQuality|unknownBugs|seedHex|"experience"/);
 });
 it('rolls back failed actions, deduplicates requests and permits withdrawal before execution',()=>{
  let s=signed(),p=s.proposals[0]!;
  const a:ActionPayload={kind:'fund',projectId:p.id,amount:money(300000000n)};
  s=submit(s,a);expect(submitAction(s,a,`test:${s.nextActionId-1}`,0)).toBe(s);
  expect(()=>submitAction(s,a,'stale',0)).toThrow();
  s=cancelAction(s,s.actions.at(-1)!.id);expect(s.actions.at(-1)!.status).toBe('cancelled');
  s=submit(s,a);s=submit(s,a);s=run(s,1);
  expect(s.actions.slice(-2).map(a=>a.status)).toEqual(['completed','failed']);
  expect(s.ledger.filter(l=>l.kind==='payment'&&l.label==='追加开发拨款')).toHaveLength(1);
 });
 it('markets, launches the scheduled build, settles sales and refunds without resetting history',()=>{
  let s=signed(),p=s.proposals[0]!;const pid=p.id,version=p.candidate!.version;
  s=submit(s,{kind:'campaign',projectId:pid,channel:'advertising',budget:money(300000n),duration:14});
  s=submit(s,{kind:'release',projectId:pid,date:day(s.currentDay+14),price:money(2499n)});
  s=run(s,1);const scheduled=s.proposals[0]!.launchBuild!.version;expect(scheduled).toBe(version);
  s=run(s,55);p=s.proposals[0]!;
  expect(p.product).toBe('ON_SALE');expect(p.published!.version).toBe(scheduled);expect(p.candidate!.version).toBeGreaterThan(scheduled);
  expect(p.totalSales).toBeGreaterThan(0);expect(p.reviews).toBeGreaterThan(0);expect(p.owners).toBeLessThan(p.bought);
  expect(s.ledger.some(l=>l.kind==='receipt')).toBe(true);expect(s.ledger.some(l=>l.kind==='income-reversal')).toBe(true);
  expect(s.batches.every(b=>BigInt(b.publisher)+BigInt(b.developer)===BigInt(b.net))).toBe(true);
  const beforeSales=p.totalSales;
  s=run(submit(s,{kind:'listing',projectId:pid,listed:false}),14);
  const afterDelist=s.proposals[0]!.totalSales;s=run(s,7);expect(s.proposals[0]!.totalSales).toBe(afterDelist);
  expect(afterDelist).toBeGreaterThanOrEqual(beforeSales);
  s=run(submit(s,{kind:'listing',projectId:pid,listed:true}),14);expect(s.proposals[0]!.totalSales).toBeGreaterThan(afterDelist);
  const restored=decode(encode(s));expect(run(restored,14)).toEqual(run(s,14));
 });
 it('retains owed bills on exit, releases future obligations and prevents continued project control',()=>{
  let s=signed(),p=s.proposals[0]!,pid=p.id;const terms=structuredClone(p.contract!.terms),cost=exitCost(p);
  expense(s,'unpaid-test',123400n,'历史欠款',pid,s.currentDay+30);
  const reputation=s.company.reputation;
  s=run(submit(s,{kind:'exit',projectId:pid,negotiated:false}),1);p=s.proposals[0]!;
  expect(p.cooperation).toBe('EXIT_SETTLEMENT');expect(p.contract!.terms).toEqual(terms);
  expect(s.company.reputation).toBeLessThan(reputation);
  expect(s.claims.find(c=>c.label==='主动毁约补偿')!.amount).toBe(cost.toString());
  expect(s.claims.some(c=>c.key==='unpaid-test')).toBe(true);
  expect(()=>quoteAction(s,{kind:'fund',projectId:pid,amount:money(1000000n)})).toThrow();
  s=run(s,90);expect(s.proposals[0]!.cooperation).toBe('TERMINATED');
  expect(s.ledger.filter(l=>l.label==='合同开发拨款')).toHaveLength(0);
 });
 it('handles development, QA, updates, discounts, support and final closure',()=>{
  let s=signed();const pid=s.proposals[0]!.id,progress=s.proposals[0]!.reportedProgress;
  s=submit(s,{kind:'qa',projectId:pid,daily:money(100000n)});
  s=submit(s,{kind:'work',projectId:pid,points:10,focus:'quality'});s=run(s,35);
  expect(s.proposals[0]!.pendingWork).toBeNull();expect(s.proposals[0]!.reportedProgress).toBeGreaterThan(progress);
  s=run(submit(s,{kind:'release',projectId:pid,date:day(s.currentDay+1),price:money(2999n)}),14);
  s=run(submit(s,{kind:'publish',projectId:pid}),1);
  expect(s.proposals[0]!.published!.version).toBeGreaterThan(1);
  s=run(submit(s,{kind:'discount',projectId:pid,percent:25,duration:7}),1);
  expect(s.proposals[0]!.discount!.price).toBe('2249');
  s=run(submit(s,{kind:'support',projectId:pid,active:false}),8);expect(s.proposals[0]!.discount).toBeNull();
  expect(s.ledger.some(l=>l.label==='合同最低支持')).toBe(true);
  s=run(submit(s,{kind:'close'}),1);expect(s.company.status).toBe('CLOSED');expect(advanceDay(s).state).toBe(s);
 });
 it('enters financial distress and closes after a 28-day unpaid grace period',()=>{
  let s=newGame(seed,'危机测试');expense(s,'initial-loss',BigInt(s.company.cash),'亏损',null);settleDue(s);
  s=run(s,1);expect(s.company.status).toBe('DISTRESSED');
  expect(()=>quoteAction(s,{kind:'research',projectId:s.proposals[0]!.id,method:'market'})).toThrow();
  s=run(s,28);expect(s.company.status).toBe('CLOSED');expect(s.claims.some(c=>c.amount!==c.settled)).toBe(true);
 });
 it('migrates legacy foundation state without retroactive business charges',()=>{
  const current=newGame(seed,'旧版测试');
  const old={schemaVersion:1,rulesVersion:'foundation-1',rngVersion:current.rngVersion,config:current.config,configHash:current.configHash,seedHex:seed,currentDay:day(20),revision:20,nextProjectId:current.nextProjectId,company:{name:current.company.name,cash:current.company.cash,reputation:.5},developers:current.developers.map(({fatigue:_,morale:__,relationship:___,...d})=>d),proposals:current.proposals.map(p=>({id:p.id,developerId:p.developerId,name:p.name,genre:p.genre,createdDay:p.createdDay,expiresDay:p.expiresDay,funding:p.funding,advance:p.advance,reportedProgress:p.reportedProgress,estimatedWeeks:p.estimatedWeeks,hiddenQuality:p.hiddenQuality,audience:p.audience})),weeklySettlements:[day(2),day(9),day(16)],monthlyReports:[],assessmentShown:false};
  const migrated=migrateState(old);expect(migrated.currentDay).toBe(20);expect(migrated.company.cash).toBe('500000000');expect(migrated.migrated).toBe(true);
  expect(run(migrated,1).company.cash).toBe('499900000');expect(old.schemaVersion).toBe(1);
 });
});
