import baseline from '../config/mvp-baseline-1.json';
import { legacyStateSchema, stateSchema, type GameState } from '../domain/state';
import { calendar, day, id, money } from '../domain/values';
import { canonical, digest, randomAt } from './random';
import { addProposals, enrich } from './generation';
import { studios } from './industry';
import { executeAction, notify, resolveOffers } from './actions';
import { balance, settleDue, sum } from './finance';
import { contractBills, dailyBills, recordDaily, weekly } from './weekly';
export const CONFIG_HASH=digest(canonical(baseline));
export function validateState(input:unknown):GameState {
  const s=stateSchema.parse(input);
  if(s.configHash!==CONFIG_HASH||digest(canonical(s.config))!==CONFIG_HASH)throw new Error('不支持的配置版本');
  const ids=new Set(s.developers.map(d=>d.id));
  if(ids.size!==12||new Set(s.proposals.map(p=>p.id)).size!==s.proposals.length)throw new Error('重复实体标识');
  for(const p of s.proposals){
    if(!ids.has(p.developerId)||p.createdDay>s.currentDay||Number(p.id.split(':')[1])>=s.nextProjectId)throw new Error('项目引用损坏');
    if(p.wishlist>p.audience-p.bought||p.owners>p.bought||p.bought>p.audience||p.positive>p.reviews||p.completedWork>p.totalWork+.001)throw new Error('模拟状态越界');
    if(p.cooperation==='ACTIVE'&&!p.contract)throw new Error('有效项目缺少合同');
  }
  for(const rows of [s.ledger,s.claims,s.batches])if(new Set(rows.map(r=>r.key)).size!==rows.length)throw new Error('重复财务记录');
  if(new Set(s.actions.map(a=>a.requestId)).size!==s.actions.length)throw new Error('重复行动请求');
  const cash=BigInt(baseline.initialCash)+sum(s.ledger.filter(e=>e.kind==='receipt').map(e=>e.amount))-sum(s.ledger.filter(e=>e.kind==='payment').map(e=>e.amount));
  if(cash!==BigInt(s.company.cash))throw new Error('现金账簿不平');
  if(s.claims.some(c=>BigInt(c.settled)>BigInt(c.amount)||c.projectId!==null&&!s.proposals.some(p=>p.id===c.projectId)))throw new Error('应收应付损坏');
  if(new Set(s.weeklySettlements).size!==s.weeklySettlements.length||s.weeklySettlements.some(d=>d>s.currentDay||!calendar(baseline.startDate,d).sunday))throw new Error('重复或无效周结算');
  if(new Set(s.monthlyReports.map(r=>r.month)).size!==s.monthlyReports.length)throw new Error('重复月报');
  return s;
}
export function newGame(seedHex:string,name:string):GameState {
  if(!/^[0-9a-f]{32}$/.test(seedHex)||!name.trim()||name.length>40)throw new Error('公司名称或种子无效');
  const s:GameState={schemaVersion:2,industryVersion:1,rulesVersion:'playable-1',rngVersion:'hash-v1',config:structuredClone(baseline),configHash:CONFIG_HASH,seedHex,currentDay:day(0),businessStartDay:day(0),migrated:false,revision:0,nextProjectId:1,nextActionId:1,
    company:{name:name.trim(),cash:money(baseline.initialCash),reputation:.5,status:'OPERATING',closedReason:''},
    developers:studios.map(({name},i)=>{const did=id(`developer:${i+1}`),skill=(purpose:string)=>.35+randomAt(seedHex,'generation',did,'day:0',purpose)*.5;return {id:did,name,creative:skill('creative'),technical:skill('technical'),production:skill('production'),management:skill('management'),fatigue:.2,morale:.75,relationship:.5};}),
    proposals:[],weeklySettlements:[],monthlyReports:[],assessmentShown:false,research:[],campaigns:[],actions:[],notices:[],ledger:[],claims:[],dailyInputs:[],batches:[],genres:baseline.genres.map(g=>({id:g.id,demand:1,competition:.2}))};
  addProposals(s);notify(s,'欢迎！打开提案，先调查或直接谈判。按钮会在次日生效，收到关键回复时自动暂停。');return validateState(s);
}
export function migrateState(input:unknown):GameState {
  if(typeof input==='object'&&input!==null&&'schemaVersion' in input&&input.schemaVersion===1){
    const old=legacyStateSchema.parse(input);
    if(old.configHash!==CONFIG_HASH||old.company.cash!==baseline.initialCash)throw new Error('旧存档校验失败');
    const s=newGame(old.seedHex,old.company.name);s.currentDay=old.currentDay;s.businessStartDay=old.currentDay;s.revision=old.revision+1;s.nextProjectId=old.nextProjectId;s.migrated=true;
    s.proposals=old.proposals.map(p=>enrich(p,old.seedHex,old.currentDay));
    s.developers=old.developers.map(d=>({...d,name:studios[Number(d.id.split(':')[1])-1]!.name,fatigue:.2,morale:.75,relationship:.5}));s.weeklySettlements=old.weeklySettlements;s.assessmentShown=old.assessmentShown;
    s.monthlyReports=old.monthlyReports.map(r=>({...r,opening:r.cash,receipts:money(0n),payments:money(0n),income:money(0n),refunds:money(0n),expenses:money(0n),payable:money(0n),receivable:money(0n)}));
    notify(s,'旧基础存档已升级：保留公司、日期和提案；经营费用从下一日开始，不补扣历史费用。',true);return validateState(s);
  }
  const s=validateState(input);
  if(!s.industryVersion){s.industryVersion=1;s.developers.forEach(d=>d.name=studios[Number(d.id.split(':')[1])-1]!.name);notify(s,'行业联系人已更新。现有合同、报价期限和已付款项保留；新机会将陆续出现。');}
  return s;
}
export function advanceDay(previous:GameState):{state:GameState;pause:boolean;autosave:boolean} {
  if(previous.company.status==='CLOSED')return {state:previous,pause:true,autosave:false};
  let s=structuredClone(previous);s.currentDay=day(s.currentDay+1);s.revision++;
  settleDue(s);
  contractBills(s);settleDue(s);
  for(const actionId of s.actions.filter(a=>a.status==='pending'&&a.due<=s.currentDay).map(a=>a.id)){
    if(s.actions.find(a=>a.id===actionId)?.status!=='pending')continue;
    const candidate=structuredClone(s),a=candidate.actions.find(a=>a.id===actionId)!;
    try{executeAction(candidate,a,!!a.error);s=candidate;}
    catch(error){const failed=s.actions.find(a=>a.id===actionId)!;failed.status='failed';failed.error=error instanceof Error?error.message:'操作失败';notify(s,failed.error,true);}
  }
  resolveOffers(s);
  for(const r of s.research.filter(r=>!r.completed&&r.dueDay<=s.currentDay)){
    r.completed=true;const p=s.proposals.find(p=>p.id===r.projectId)!;
    if(p.cooperation==='ACTIVE'||p.cooperation==='PROSPECT'){if(r.method==='prototype'||r.method==='playtest'){p.reportedQuality=r.range;p.reportDay=r.sampleDay;}notify(s,`${p.name} 的调查报告已交付，请查看「评估报告」页。`,true);}
    else r.text='合作或访问权限已结束，仅保留历史调查记录。';
  }
  if(s.company.status!=='CLOSED'){dailyBills(s);settleDue(s);recordDaily(s);}
  const date=calendar(baseline.startDate,s.currentDay);
  if(date.sunday){weekly(s);s.weeklySettlements.push(s.currentDay);}
  const overdue=s.claims.filter(c=>c.direction==='out'&&c.due<=s.currentDay&&c.amount!==c.settled);
  if(s.company.status!=='CLOSED'){
    if(overdue.some(c=>s.currentDay>=c.due+28)){s.company.status='CLOSED';s.company.closedReason='到期债务超过 28 日宽限期未付清';notify(s,s.company.closedReason,true);}
    else if(overdue.length&&s.company.status==='OPERATING'){s.company.status='DISTRESSED';notify(s,'公司出现到期未付款：暂停新增投入，降低可选支出，等待回款或处理项目。',true);}
    else if(!overdue.length&&s.company.status==='DISTRESSED'){s.company.status='OPERATING';notify(s,'到期欠款已清偿，公司恢复正常经营。',true);}
  }
  if(s.company.status==='CLOSED'&&s.dailyInputs.length)weekly(s);
  if(s.company.status!=='CLOSED'){const before=s.proposals.length;addProposals(s);for(const p of s.proposals.slice(before))notify(s,s.developers.find(d=>d.id===p.developerId)!.name+' 带来了新提案《'+p.name+'》，可以在寻找合作中查看。');for(const p of s.proposals)if(p.cooperation==='PROSPECT'&&p.expiresDay-s.currentDay===5&&!p.offer)notify(s,p.name+' 的合作窗口还剩 5 日。可以接洽报价，或留待其他机会。',true);}
  for(const p of s.proposals)if(p.cooperation==='EXIT_SETTLEMENT'&&p.handoverDay!==null&&p.handoverDay<=s.currentDay&&balance(s,'out',p.id)===0n&&balance(s,'in',p.id)===0n&&!s.batches.some(b=>b.projectId===p.id&&!b.refunded))p.cooperation='TERMINATED';
  if(date.monthEnd){
    const from=s.monthlyReports.at(-1)?.day??s.businessStartDay;
    const rows=s.ledger.filter(e=>e.day>from&&e.day<=s.currentDay),by=(kind:string)=>sum(rows.filter(e=>e.kind===kind).map(e=>e.amount));
    s.monthlyReports.push({month:date.iso.slice(0,7),day:s.currentDay,cash:s.company.cash,opening:s.monthlyReports.at(-1)?.cash??money(baseline.initialCash),receipts:money(by('receipt')),payments:money(by('payment')),income:money(by('income')),refunds:money(by('income-reversal')),expenses:money(by('expense')),payable:money(balance(s,'out')),receivable:money(balance(s,'in'))});
  }
  if(!s.assessmentShown&&s.currentDay>=1095){s.assessmentShown=true;notify(s,'三年经营评估已生成。你可以查看财务与项目历史，也可以继续经营。',true);}
  return {state:s,pause:s.company.status==='CLOSED'||(previous.company.status!=='DISTRESSED'&&s.company.status==='DISTRESSED'),autosave:date.monthEnd||s.company.status==='CLOSED'||(!previous.assessmentShown&&s.assessmentShown)};
}
export type Speed=0|1|2|4|8;
export class TimeBudget {
  private remainder=0;
  reset(){this.remainder=0;}
  consume(elapsedMs:number,speed:Speed){if(speed===0){this.reset();return 0;}if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw new Error('INVALID_ELAPSED');this.remainder+=elapsedMs*speed;const days=Math.floor(this.remainder/2000);this.remainder-=days*2000;return days;}
}
