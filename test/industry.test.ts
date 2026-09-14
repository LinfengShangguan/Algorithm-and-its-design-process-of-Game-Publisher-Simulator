import {it,expect} from 'vitest';
import {newGame,advanceDay,migrateState,validateState} from '../../src/simulation/game';
import {submitAction,defaultTerms} from '../../src/simulation/actions';
import {encode,decode} from '../../src/infrastructure/save-store';
import {playerView} from '../../src/application/projection';
const seed='0123456789abcdef0123456789abcdef';
it('varies starting opportunities, contact names and proposal windows across worlds',()=>{
 const counts=new Set<number>(),durations=new Set<number>(),replies=new Set<number>();
 for(let i=0;i<24;i++){
  let s=newGame(i.toString(16).padStart(32,'0'),'测试发行');counts.add(s.proposals.length);
  expect(new Set(s.developers.map(d=>d.name.length)).size).toBeGreaterThan(4);
  for(const p of s.proposals){durations.add(p.expiresDay-p.createdDay);expect(p.expiresDay-p.createdDay).toBeGreaterThanOrEqual(22);expect(p.expiresDay-p.createdDay).toBeLessThanOrEqual(90);}
  const p=s.proposals[0]!;s=submitAction(s,{kind:'offer',projectId:p.id,terms:defaultTerms(p)},'offer',s.revision);s=advanceDay(s).state;
  const o=s.proposals[0]!.offer!;replies.add(o.responseDay-o.sentDay);
 }
 expect(counts.size).toBeGreaterThan(2);expect(durations.size).toBeGreaterThan(10);expect(replies.size).toBeGreaterThan(2);
});
it('arrivals are staggered, studios persist and save/load preserves the next opportunity',()=>{
 let s=newGame(seed,'连续经营');const ids=s.developers.map(d=>d.id),arrivals:number[]=[];
 for(let i=0;i<150;i++){
  const length=s.proposals.length;s=advanceDay(s).state;
  if(s.proposals.length>length)arrivals.push(s.currentDay);
  if(i===73)expect(advanceDay(decode(encode(s)))).toEqual(advanceDay(s));
  expect(s.developers.map(d=>d.id)).toEqual(ids);
  const available=s.proposals.filter(p=>p.cooperation==='PROSPECT'&&p.expiresDay>=s.currentDay);
  expect(new Set(available.map(p=>p.developerId)).size).toBe(available.length);
 }
 expect(arrivals.length).toBeGreaterThan(5);expect(arrivals.some(d=>d%28!==0)).toBe(true);
 expect(new Set(arrivals.slice(1).map((d,i)=>d-arrivals[i]!)).size).toBeGreaterThan(2);
 expect(s.proposals.some(p=>p.expiresDay<s.currentDay)).toBe(true);
 expect(playerView(s,0).developers).toHaveLength(12);validateState(s);
});
it('upgrades alpha-2 without altering finances, active offers or project identities',()=>{
 let s=newGame(seed,'旧版公司');const p=s.proposals[0]!;
 s=submitAction(s,{kind:'offer',projectId:p.id,terms:defaultTerms(p)},'offer',s.revision);s=advanceDay(s).state;
 delete s.industryVersion;s.developers[0]!.name='旧的四字';
 const before=structuredClone(s),next=migrateState(s);
 expect(next.industryVersion).toBe(1);expect(next.proposals).toEqual(before.proposals);expect(next.company).toEqual(before.company);expect(next.ledger).toEqual(before.ledger);
 expect(s).toEqual(before);expect(next.developers[0]!.name).not.toBe('旧的四字');
});
