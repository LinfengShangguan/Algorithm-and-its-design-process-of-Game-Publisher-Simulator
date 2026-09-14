import {it,expect} from 'vitest';
import {newGame,advanceDay} from '../../src/simulation/game';
import {defaultTerms,submitAction} from '../../src/simulation/actions';
import {estimateAcceptance,negotiationScore} from '../../src/simulation/negotiation';
import {money} from '../../src/domain/values';
import {expense,settleDue} from '../../src/simulation/finance';
import {encode,decode} from '../../src/infrastructure/save-store';
it('acceptance estimates match the resolution noise model without mutating the world',()=>{
 const s=newGame('0123456789abcdef0123456789abcdef','Probability test'),before=structuredClone(s),p=s.proposals[0]!,base=defaultTerms(p);
 const generous=estimateAcceptance(s,p,base),weak={...base,funding:money(BigInt(p.funding)/2n),advance:money(0n),publisherRate:1000000,ip:'publisher' as const,control:'lead' as const};
 expect(generous.accept).toBeGreaterThan(estimateAcceptance(s,p,weak).accept);
 for(let share=0;share<=1000000;share+=10000){const terms={...weak,publisherRate:share},e=estimateAcceptance(s,p,terms),score=negotiationScore(s,p,terms);expect(e.accept+e.counter+e.reject).toBe(100);expect(Math.min(e.accept,e.counter,e.reject)).toBeGreaterThanOrEqual(0);let count=0;for(let i=0;i<10000;i++)if(score+((i+.5)/10000*2-1)*.05>=.65)count++;expect(Math.abs(e.accept-count/100)).toBeLessThanOrEqual(.51);}
 expect(s).toEqual(before);
});
it('contract replies persist once and ordinary notifications do not reset chosen time speed',()=>{
 let s=newGame('0123456789abcdef0123456789abcdef','Reply test');const p=s.proposals[0]!;
 s=submitAction(s,{kind:'offer',projectId:p.id,terms:defaultTerms(p)},'offer',s.revision);
 for(let i=0;i<12;i++){const r=advanceDay(s);expect(r.pause).toBe(false);s=r.state;}
 const replies=s.notices.filter(n=>n.event?.kind==='contract-reply');expect(replies).toHaveLength(1);expect(replies[0]!.read).toBe(false);expect(decode(encode(s)).notices).toEqual(s.notices);
});

it('financial distress still explicitly pauses while subsequent ordinary days do not',()=>{
 let s=newGame('0123456789abcdef0123456789abcdef','Distress test');expense(s,'loss',BigInt(s.company.cash),'loss',null);settleDue(s);
 const crisis=advanceDay(s);expect(crisis.state.company.status).toBe('DISTRESSED');expect(crisis.pause).toBe(true);
 const next=advanceDay(crisis.state);expect(next.pause).toBe(false);
});
