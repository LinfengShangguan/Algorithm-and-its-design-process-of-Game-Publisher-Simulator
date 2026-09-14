import type { GameState } from '../domain/state';
import { calendar } from '../domain/values';
import type { Speed } from '../simulation/game';
import { balance, exitCost, sum, unfulfilled } from '../simulation/finance';
import { proposalContext, studioProfile } from '../simulation/industry';
export function playerView(s: GameState, speed: Speed, held=false) {
  return {
    company: s.company, date: calendar(s.config.startDate, s.currentDay).iso, day: s.currentDay, revision: s.revision, speed, held,
    proposals: s.proposals.map(p => ({ id:p.id,name:p.name,genre:s.config.genres.find(g=>g.id===p.genre)!.label,
      developerId:p.developerId,profile:proposalContext(s,p),remainingDays:p.expiresDay-s.currentDay,
      studio:s.developers.find(d=>d.id===p.developerId)!.name,funding:p.funding,advance:p.advance,
      reportedProgress:p.reportedProgress,estimatedWeeks:p.estimatedWeeks,
      createdDate:calendar(s.config.startDate,p.createdDay).iso,expiresDate:calendar(s.config.startDate,p.expiresDay).iso,expired:p.expiresDay<s.currentDay,
      cooperation:p.cooperation,product:p.product,offer:p.offer,contract:p.contract,
      reportedQuality:p.reportedQuality,reportDay:p.reportDay,workingFunds:p.cooperation==='ACTIVE'?p.workingFunds:null,
      openBugs:p.cooperation==='ACTIVE'?Math.round(p.openBugs):null,qaDaily:p.qaDaily,pendingWork:p.pendingWork,
      candidate:p.candidate?{version:p.candidate.version,date:p.candidate.date,completion:p.candidate.completion}:null,
      published:p.published?{version:p.published.version,date:p.published.date}:null,
      firstRelease:p.firstRelease,releaseDay:p.releaseDay,announcedDay:p.announcedDay,targetDay:p.targetDay,
      price:p.price,discount:p.discount,activeSupport:p.activeSupport,budget:p.budget,
      spent:sum(s.ledger.filter(l=>l.projectId===p.id&&l.kind==='payment').map(l=>l.amount)).toString(),
      wishlist:p.wishlist,owners:p.owners,reviews:p.reviews,positive:p.positive,lastSales:p.lastSales,totalSales:p.totalSales,
      history:p.history.map(h=>({day:h.day,sales:h.sales})),exitCost:p.contract?exitCost(p,false).toString():'0',
      research:s.research.filter(r=>r.projectId===p.id).map(r=>({id:r.id,method:r.method,sampleDay:r.sampleDay,dueDay:r.dueDay,completed:r.completed,text:r.completed?r.text:'调查进行中',range:r.completed?r.range:null})),
      campaigns:s.campaigns.filter(c=>c.projectId===p.id).map(({experience:_,...c})=>c)
    })),
    payable:balance(s,'out').toString(),receivable:balance(s,'in').toString(),
    committed:s.proposals.filter(p=>p.cooperation==='ACTIVE').reduce((total,p)=>total+unfulfilled(p),0n).toString(),
    developers:[...s.developers].sort((a,b)=>a.id.localeCompare(b.id)).map(d=>({...studioProfile(d.id),id:d.id,name:d.name,relationship:Math.round(d.relationship*100),projects:s.proposals.filter(p=>p.developerId===d.id).map(p=>p.id)})),
    claims:s.claims.filter(c=>c.amount!==c.settled),ledger:s.ledger.slice(-100),actions:s.actions.slice(-100),notices:s.notices.slice(-100),
    weeklyCount:s.weeklySettlements.length,monthlyReports:s.monthlyReports,assessmentShown:s.assessmentShown
  };
}
export type PlayerView = ReturnType<typeof playerView>;
