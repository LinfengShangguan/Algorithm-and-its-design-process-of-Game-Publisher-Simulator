import baseline from '../config/mvp-baseline-1.json';
import type { GameState, Proposal } from '../domain/state';
import { day, money, roundHalfUp } from '../domain/values';
import { entry, expense, income, payNow } from './finance';
import { clip, roll } from './generation';
import { notify } from './actions';

export function experience(p:Proposal) {return clip(.55*p.quality+.25*Math.min(1,p.completedWork/p.totalWork)+.2*p.polish-.35*clip((p.unknownBugs+p.openBugs)/Math.max(1,.1*p.totalWork)));}
export function recordDaily(s:GameState) {
  for(const p of s.proposals.filter(p=>p.cooperation==='ACTIVE')) {
    const d=s.developers.find(d=>d.id===p.developerId)!;
    const peers=s.proposals.filter(other=>other.cooperation==='ACTIVE'&&other.developerId===d.id).length;
    const developing=p.firstRelease===null||p.activeSupport||p.pendingWork!==null||s.campaigns.some(c=>c.projectId===p.id&&!c.stopped&&c.remainingWork>0);
    const needed=developing?BigInt(p.dailyCost):0n,have=BigInt(p.workingFunds),paid=needed<have?needed:have;
    p.workingFunds=money(have-paid);
    const funded=needed>0n?Number(paid)/Number(needed):0;
    const capacity=100/7*(.4+.6*d.production)*(.5+.5*d.management)*(.5+.5*d.morale)*(1-.5*d.fatigue)*funded/peers*(s.currentDay<p.riskUntil?.7:1);
    let qa=0;
    if(BigInt(p.qaDaily)>0n&&BigInt(s.company.cash)>=BigInt(p.qaDaily)) {payNow(s,`qa:${p.id}:${s.currentDay}`,BigInt(p.qaDaily),'每日 QA',p);qa=Number(p.qaDaily)/100000*.04;}
    let reach=s.currentDay<p.exposureUntil?.10:0,evidence=.05;
    let marketingExperience=p.published?.experience??p.candidate?.experience??experience(p);
    for(const c of s.campaigns.filter(c=>c.projectId===p.id&&!c.stopped&&c.starts<=s.currentDay&&c.ends>=s.currentDay&&c.remainingWork<=0)) {
      let intensity=0;
      if(c.channel==='advertising') {
        if(BigInt(c.budget)>BigInt(s.company.cash)){c.stopped=true;notify(s,`${p.name} 广告因现金不足停止，可调整预算后重开。`,true);continue;}
        payNow(s,`ads:${c.id}:${s.currentDay}`,BigInt(c.budget),'广告投放',p);c.spent=money(BigInt(c.spent)+BigInt(c.budget));
        intensity=Number(c.budget)/(Number(c.budget)+5000000);
      } else {
        const duration=c.ends-c.starts+1,scale=Number(baseline.marketing[c.channel].scale);
        // Divide both allocated spend and reference scale by duration: stable daily strength.
        intensity=(Number(c.budget)/duration)/(Number(c.budget)/duration+scale/duration);
      }
      const cfg=baseline.marketing[c.channel];reach=1-(1-reach)*(1-cfg.effectiveness*intensity);
      if(cfg.evidence>evidence){evidence=cfg.evidence;marketingExperience=c.experience;}
    }
    s.dailyInputs.push({projectId:p.id,day:s.currentDay,capacity,qa,onSale:p.product==='ON_SALE',price:p.discount&&p.discount.until>=s.currentDay?p.discount.price:p.price,experience:p.published?.experience??p.candidate?.experience??experience(p),marketingExperience,reach,evidence});
    if(p.discount&&p.discount.until<s.currentDay)p.discount=null;
  }
}
function develop(s:GameState,p:Proposal) {
  if(p.cooperation!=='ACTIVE')return;
  const inputs=s.dailyInputs.filter(i=>i.projectId===p.id),d=s.developers.find(d=>d.id===p.developerId)!;
  let capacity=inputs.reduce((a,i)=>a+i.capacity,0);
  const qa=inputs.reduce((a,i)=>a+i.qa,0),initial=capacity;
  for(const c of s.campaigns.filter(c=>c.projectId===p.id&&!c.stopped&&c.remainingWork>0)) {
    const used=Math.min(capacity*.2,c.remainingWork);c.remainingWork-=used;capacity-=used;
    if(c.starts<=s.currentDay&&c.remainingWork>0){c.starts=day(s.currentDay+1);c.ends=day(c.ends+7);}
  }
  if(p.pendingWork) {
    const task=p.pendingWork,used=Math.min(capacity*.5,task.remaining);task.remaining-=used;capacity-=used;
    if(task.focus==='repair'){const fix=Math.min(p.openBugs,used*.7);p.openBugs-=fix;p.verification+=fix;}
    else if(task.focus==='quality')p.quality=clip(p.quality+used/Math.max(1,p.totalWork)*.6*(1-p.quality));
    else{p.completedWork+=used;p.totalWork+=used;}
    if(task.remaining<=.00001){p.pendingWork=null;notify(s,`${p.name} 专项工作完成，请查看候选版本并决定是否发布。`,true);}
  }
  const content=Math.min(capacity*.6,Math.max(0,p.totalWork-p.completedWork));
  if(content>0){const newQuality=clip(.6*d.creative+.4*p.hiddenQuality+(roll(s,p.id,'quality',s.currentDay)*2-1)*.04);p.quality=(p.quality*p.completedWork+newQuality*content)/(p.completedWork+content);p.completedWork+=content;}
  p.unknownBugs+=content*.06*(1-.8*d.technical)*(1+.5*d.fatigue);
  const discover=Math.min(p.unknownBugs,qa);p.unknownBugs-=discover;p.openBugs+=discover;
  const repairCapacity=capacity-content-capacity*.15;
  const fix=Math.min(p.openBugs,Math.max(0,repairCapacity)*.7*(.5+.5*d.technical));p.openBugs-=fix;p.verification+=fix;p.unknownBugs+=fix*.1*(1-d.technical);
  p.verification-=Math.min(p.verification,Math.max(0,qa-discover)*.8);
  p.polish=clip(p.polish+.8*(capacity*.15)/Math.max(1,p.totalWork)*(1-p.polish));
  p.reportedProgress=Math.min(1,p.completedWork/p.totalWork);p.reportDay=s.currentDay;
  if(initial>0) p.candidate={version:(p.candidate?.version??0)+1,date:s.currentDay,completion:p.reportedProgress,experience:experience(p)};
  const estimate=clip(p.quality+(roll(s,p.id,'quality-report',s.currentDay)*2-1)*.08);p.reportedQuality=[clip(estimate-.12),clip(estimate+.12)];
  if(p.targetDay<s.currentDay&&p.reportedProgress<.99&&s.currentDay-p.targetDay<7)notify(s,`${p.name} 未赶上内部开发目标，可以缩减范围、调整日期或提前发售。`,true);
}
function sales(s:GameState,p:Proposal) {
  p.lastSales=0;const market=s.genres.find(g=>g.id===p.genre)!,ref=Number(baseline.genres.find(g=>g.id===p.genre)!.referencePrice);
  for(const i of s.dailyInputs.filter(i=>i.projectId===p.id).sort((a,b)=>a.day-b.day)) {
    p.awareness=clip(p.awareness*.997+(1-p.awareness)*i.reach);
    const target=clip(.5*p.hiddenQuality+.3*i.marketingExperience+.2*(market.demand/1.5)-.35*market.competition);
    p.interest=clip(p.interest+.12*i.evidence*(target-p.interest));
    p.hype=clip(p.hype+.25*i.reach*(p.hiddenQuality-p.hype)-.015*p.hype);
    p.trust=clip(p.trust+.2*i.evidence*(clip(.5+i.experience-p.hype)-p.trust));
    const remaining=p.audience-p.bought,churn=Math.floor(p.wishlist*.001);
    p.wishlist=p.wishlist-churn+Math.floor((remaining-p.wishlist+churn)*p.awareness*p.interest*.004);
    if(!i.onSale||remaining===0)continue;
    const price=Number(i.price),intent=clip(.35*p.interest+.30*i.experience+.20*p.trust+.15*(market.demand/1.5));
    const prob=clip(.003*intent*Math.min(1.6,(ref/price)**.8)*(1-.45*market.competition)*(1+.8*p.mouth)*(1+(roll(s,p.id,'sales',i.day)*2-1)*.15));
    const sw=Math.floor(p.wishlist*clip(prob*3)),sg=Math.floor((remaining-p.wishlist)*p.awareness*prob),units=sw+sg;
    if(!units)continue;
    p.wishlist-=sw;p.bought+=units;p.owners+=units;p.totalSales+=units;p.lastSales+=units;
    const gross=BigInt(units)*BigInt(i.price),net=gross-roundHalfUp(gross*300000n,1000000n);
    const contract=p.contract!;const k=BigInt(contract.unrecouped),recouped=contract.terms.recoup?(net<k?net:k):0n;
    const pub=recouped+roundHalfUp((net-recouped)*BigInt(contract.terms.publisherRate),1000000n);
    contract.unrecouped=money(k-recouped);
    const key=`sales:${p.id}:${i.day}`;
    income(s,key,pub,'销售回款',p.id,s.currentDay+28);
    const sat=clip(i.experience-.6*Math.max(0,p.hype-i.experience)-.25*Math.max(0,price/ref-1));
    s.batches.push({key,projectId:p.id,day:i.day,units,price:i.price,gross:money(gross),net:money(net),publisher:money(pub),developer:money(net-pub),recouped:money(recouped),satisfaction:sat,reviewed:false,refunded:false,refundUnits:0,claimKey:key});
  }
  if(p.firstRelease!==null) p.history.push({day:s.currentDay,sales:p.lastSales,experience:p.published?.experience??0});
}
function outcomes(s:GameState) {
  const newPositive=new Map<string,number>();
  for(const b of s.batches) {
    const p=s.proposals.find(p=>p.id===b.projectId)!;
    if(s.currentDay-b.day<7)continue;
    if(!b.reviewed){const n=Math.floor(b.units*.08),y=Math.floor(n*b.satisfaction);p.reviews+=n;p.positive+=y;b.reviewed=true;newPositive.set(p.id,(newPositive.get(p.id)??0)+y);}
    if(!b.refunded){
      b.refunded=true;b.refundUnits=Math.floor(b.units*clip(.02+.12*(1-b.satisfaction)));p.owners-=b.refundUnits;
      if(b.refundUnits===0)continue;
      const reversal=roundHalfUp(BigInt(b.publisher)*BigInt(b.refundUnits),BigInt(b.units));
      const recovery=roundHalfUp(BigInt(b.recouped)*BigInt(b.refundUnits),BigInt(b.units));
      if(p.contract)p.contract.unrecouped=money(BigInt(p.contract.unrecouped)+recovery);
      entry(s,`${b.key}:refund-income`,'income-reversal',reversal,'旧订单退款冲回',p.id);
      const claim=s.claims.find(c=>c.key===b.claimKey)!,unpaid=BigInt(claim.amount)-BigInt(claim.settled),offset=reversal<unpaid?reversal:unpaid;
      claim.amount=money(BigInt(claim.amount)-offset);
      if(reversal>offset)s.claims.push({key:`${b.key}:refund-payable`,projectId:p.id,due:day(s.currentDay+7),amount:money(reversal-offset),settled:money(0n),direction:'out',category:'refund',label:'已到账订单退款'});
    }
  }
  for(const p of s.proposals)p.mouth=clip(p.mouth*.8+120*(newPositive.get(p.id)??0)/p.audience*.7);
}
export function weekly(s:GameState) {
  for(const p of s.proposals)develop(s,p);
  for(const p of s.proposals) sales(s,p);
  outcomes(s);
  for(const d of s.developers){const used=s.dailyInputs.filter(i=>s.proposals.find(p=>p.id===i.projectId)?.developerId===d.id).reduce((a,i)=>a+i.capacity,0);const u=clip(used/50);d.fatigue=clip(d.fatigue+.08*u-.12*(1-u));d.morale=clip(d.morale+.04*(1-d.fatigue)-(s.claims.some(c=>c.category==='funding'&&c.due<s.currentDay&&c.amount!==c.settled&&s.proposals.find(p=>p.id===c.projectId)?.developerId===d.id)?.10:0));}
  for(const m of s.genres){const target=.65+roll(s,m.id,'trend',Math.floor(s.currentDay/182)*182)*.7;m.demand=Math.max(.5,Math.min(1.5,m.demand+.08*(target-m.demand)+(roll(s,m.id,'demand',s.currentDay)*2-1)*.03));m.competition=.15+roll(s,m.id,'competition',Math.floor(s.currentDay/56)*56)*.45;}
  for(const p of s.proposals.filter(p=>p.cooperation==='ACTIVE')){
    if(s.currentDay>=p.exposureCooldown&&roll(s,p.id,'exposure',s.currentDay)<.015){p.exposureUntil=s.currentDay+8;p.exposureCooldown=s.currentDay+84;notify(s,`${p.name} 获得创作者自然曝光。接下来一周可能出现额外流量。`,true);}
    const d=s.developers.find(d=>d.id===p.developerId)!,risk=clip(.45*d.fatigue+.3*(1-d.morale)+.25*(1-d.management));
    if(s.currentDay>=p.riskCooldown&&roll(s,p.id,'risk',s.currentDay)<.18*Math.max(0,risk-.65)/.35){p.riskUntil=s.currentDay+6;p.riskCooldown=s.currentDay+28;notify(s,`${p.name} 团队交付风险上升，未来数日产能下降。`,true);}
  }
  s.dailyInputs=[];
}
export function contractBills(s:GameState) {
  for(const p of s.proposals.filter(p=>p.cooperation==='ACTIVE'))
    for(const i of p.contract!.installments)if(!i.recognized&&i.due<=s.currentDay){expense(s,i.key,BigInt(i.amount),'合同开发拨款',p.id,i.due,'funding');i.recognized=true;}
}
export function dailyBills(s:GameState) {
  expense(s,`overhead:${s.currentDay}`,BigInt(baseline.dailyOverhead),'公司管理费',null);
  for(const p of s.proposals.filter(p=>p.cooperation==='ACTIVE')) {
    if(p.firstRelease!==null){const mandatory=s.currentDay-p.firstRelease<180,base=BigInt(p.contract!.supportDaily),amount=p.activeSupport?base*2n:mandatory?base:0n;
      expense(s,`support:${p.id}:${s.currentDay}`,amount,p.activeSupport?'积极支持':'合同最低支持',p.id);}
    if(p.releaseDay!==null&&p.releaseDay<=s.currentDay){p.releaseDay=null;
      if(!p.launchBuild||BigInt(s.company.cash)<1000000n){notify(s,`${p.name} 上市失败：请检查候选版本和上线费，重新排期。`,true);continue;}
      payNow(s,`launch:${p.id}`,1000000n,'正式上线',p);p.product='ON_SALE';p.firstRelease=s.currentDay;p.published=structuredClone(p.launchBuild);p.launchBuild=null;p.awareness=clip(p.awareness+.06);
      notify(s,`${p.name} 正式发售。销量在周末结算，回款需要 28 日。`,true);
    }
  }
}
