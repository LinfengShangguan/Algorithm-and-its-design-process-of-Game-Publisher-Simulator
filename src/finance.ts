import type { GameState, Proposal, Claim } from '../domain/state';
import { money, day } from '../domain/values';

export const cents = (v: number | bigint) => money(typeof v === 'bigint' ? v : BigInt(Math.round(v)));
export const sum = (values: readonly string[]) => values.reduce((a,v) => a + BigInt(v), 0n);
export function balance(s: GameState, direction: 'in'|'out', projectId?: string) {
  return sum(s.claims.filter(c=>c.direction===direction && (!projectId || c.projectId===projectId)).map(c=>String(BigInt(c.amount)-BigInt(c.settled))));
}
export function entry(s: GameState, key: string, kind: GameState['ledger'][number]['kind'], amount: bigint, label: string, projectId: Proposal['id'] | null = null) {
  if (s.ledger.some(e=>e.key===key)) throw new Error('重复记账请求');
  s.ledger.push({key,kind,amount:money(amount),label,projectId,day:s.currentDay});
}
export function expense(s: GameState, key: string, amount: bigint, label: string, projectId: Proposal['id'] | null, due = s.currentDay as number, category: Claim['category'] = 'general') {
  if (!amount) return;
  entry(s,key,'expense',amount,label,projectId);
  s.claims.push({key,amount:money(amount),settled:money(0n),projectId,due:day(due),direction:'out',category,label});
}
export function income(s: GameState, key: string, amount: bigint, label: string, projectId: Proposal['id'], due: number) {
  entry(s,key,'income',amount,label,projectId);
  s.claims.push({key,amount:money(amount),settled:money(0n),projectId,due:day(due),direction:'in',category:'revenue',label});
}
export function settle(s: GameState, claim: Claim, maximum?: bigint) {
  let amount = BigInt(claim.amount)-BigInt(claim.settled);
  if (maximum !== undefined && amount > maximum) amount=maximum;
  if (claim.direction==='out' && amount>BigInt(s.company.cash)) amount=BigInt(s.company.cash);
  if (amount<=0n) return;
  const before=claim.settled;
  claim.settled=money(BigInt(claim.settled)+amount);
  s.company.cash=money(BigInt(s.company.cash)+(claim.direction==='in'?amount:-amount));
  entry(s,`${claim.key}:settle:${before}`,claim.direction==='in'?'receipt':'payment',amount,claim.label,claim.projectId);
  if (claim.direction==='out' && claim.category==='funding' && claim.projectId) {
    const p=s.proposals.find(p=>p.id===claim.projectId)!;
    p.workingFunds=money(BigInt(p.workingFunds)+amount);
    if (p.contract) p.contract.unrecouped=money(BigInt(p.contract.unrecouped)+amount);
  }
}
export function settleDue(s: GameState) {
  for (const direction of ['in','out'] as const) {
    const due=s.claims.filter(c=>c.direction===direction&&c.due<=s.currentDay&&c.settled!==c.amount).sort((a,b)=>a.due-b.due||a.key.localeCompare(b.key,'en'));
    due.forEach(c=>settle(s,c));
  }
}
export function payNow(s: GameState, key: string, amount: bigint, label: string, p: Proposal | null = null, category: Claim['category'] = 'general') {
  if (amount>BigInt(s.company.cash)) throw new Error('现金不足，未启动，也未扣款');
  expense(s,key,amount,label,p?.id??null,s.currentDay,category);
  const c=s.claims.find(c=>c.key===key); if(c) settle(s,c);
}
export function unfulfilled(p: Proposal) { return sum(p.contract?.installments.filter(i=>!i.recognized).map(i=>i.amount)??[]); }
export function exitCost(p: Proposal, negotiated=false) {
  if(!p.contract) return 0n;
  const b=BigInt(p.contract.penalty)+(unfulfilled(p)*BigInt(p.contract.compensationRate)+500000n)/1000000n;
  return negotiated?b*7n/10n:b;
}
