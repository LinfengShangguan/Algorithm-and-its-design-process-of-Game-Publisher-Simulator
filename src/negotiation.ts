import type { GameState,Proposal,Terms } from '../domain/state';
import { studioProfile } from './industry';
/** Uses present deal terms only. Never samples or exposes the future random draw. */
export function negotiationScore(s:GameState,p:Proposal,t:Terms){
 const d=s.developers.find(d=>d.id===p.developerId)!;
 const preference=studioProfile(p.developerId).style;
 const preferenceBonus=preference==='重视创作自主权'?(t.ip==='developer'?.035:-.04):preference==='重视收益分成'?(1-t.publisherRate/1000000-.6)*.15:preference==='偏好充足开发资金'?(Number(t.funding)/Number(p.funding)-1)*.05:(Number(t.advance)/Number(p.advance)-1)*.04;
 return preferenceBonus+.25*Math.min(1,Number(t.funding)/Number(p.funding))+.1*Math.min(1,Number(t.advance)/Number(p.advance))+.25*Math.min(1,(1-t.publisherRate/1000000)/.6)+.15*(t.ip==='developer'?1:.2)+.1*({limited:1,shared:.7,lead:.3}[t.control])+.05*(t.recoup?.55:1)+.1*.7+.1*(d.relationship-.5)+.1*(s.company.reputation-.5);
}
export function estimateAcceptance(s:GameState,p:Proposal,t:Terms){
 const center=negotiationScore(s,p,t),clamp=(v:number)=>Math.max(0,Math.min(1,v));
 const accept=Math.round(clamp((center+.05-.65)/.1)*100),reject=Math.round(clamp((.45-center+.05)/.1)*100);
 return {accept,counter:100-accept-reject,reject};
}
