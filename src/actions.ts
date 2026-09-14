import baseline from '../config/mvp-baseline-1.json';
import { actionPayloadSchema, type GameState, type Proposal, type Terms } from '../domain/state';
import { day, money } from '../domain/values';
import { balance, exitCost, expense, payNow, settle } from './finance';
import { clip, roll } from './generation';
import { replyDays,industryRoll } from './industry';

import { negotiationScore } from './negotiation';
export function notify(s:GameState,text:string,important=false) {
  s.notices.push({id:`notice:${s.notices.length+1}`,day:s.currentDay,text,important,read:false});
}
export function findProject(s:GameState,pid:string):Proposal {
  const p=s.proposals.find(p=>p.id===pid); if(!p)throw new Error('项目不存在'); return p;
}
function checkPrice(v:string) {if(BigInt(v)<499n||BigInt(v)>5999n)throw new Error('价格范围为 $4.99—$59.99');}
export function quoteAction(s:GameState,input:unknown) {
  const a=actionPayloadSchema.parse(input),p='projectId' in a?findProject(s,a.projectId):null;
  if(s.company.status==='CLOSED')throw new Error('本局已经结束');
  if(p&&!['research','pass','offer','sign','budget'].includes(a.kind)&&p.cooperation!=='ACTIVE')throw new Error('需要有效发行合同');
  if(s.company.status==='DISTRESSED'&&['offer','sign','fund','scope','work','campaign','research'].includes(a.kind))throw new Error('公司处于资金危机，请先清偿到期款项');
  let cost=0n; const summary:string[]=[];
  if(a.kind==='research'&&p) {
    if(!['PROSPECT','ACTIVE'].includes(p.cooperation))throw new Error('当前无法访问开发商内部资料');
    if(p.cooperation==='PROSPECT'&&p.expiresDay<s.currentDay+1)throw new Error('提案已过期');
    if(s.research.some(r=>r.projectId===p.id&&r.method===a.method&&!r.completed))throw new Error('已有相同调查正在进行');
    cost=BigInt(baseline.services[a.method].cost);
    summary.push(`次日启动，${baseline.services[a.method].days} 日后交付；启动后费用不退。`);
  } else if(a.kind==='pass'&&p) {
    if(a.reconsider?p.cooperation!=='PASSED':p.cooperation!=='PROSPECT')throw new Error('当前项目状态不支持此操作');
    if(a.reconsider&&p.expiresDay<s.currentDay+1)throw new Error('提案已过期');
  } else if(a.kind==='offer'&&p) {
    if(p.cooperation!=='PROSPECT'||p.expiresDay<s.currentDay+1)throw new Error('提案不可签约或已过期');
    if(p.offer?.status==='waiting')throw new Error('请等待开发商回复本轮报价');
    if(BigInt(a.terms.funding)<BigInt(p.funding)/2n||BigInt(a.terms.funding)>BigInt(p.funding)*2n||BigInt(a.terms.advance)>BigInt(p.advance)*4n)throw new Error('开发资金须为请求额的 50%—200%，预付不超过请求额的四倍');
    summary.push('次日送达，开发商通常在 3—9 日内回应；具体回复日期会在送达后显示。报价不立即扣款。');
  } else if(a.kind==='sign'&&p) {
    if(p.cooperation!=='PROSPECT'||!p.offer||p.offer.id!==a.offerId||!['accepted','counter'].includes(p.offer.status)||p.offer.expiresDay<s.currentDay+1)throw new Error('需要有效的接受报价或反提方案');
    cost=BigInt(p.offer.terms.advance)+BigInt(p.offer.terms.funding)/4n;
    summary.push('签署已谈妥的报价：开发资金 '+BigInt(p.offer.terms.funding)/100n+' 美元，预付款 '+BigInt(p.offer.terms.advance)/100n+' 美元，发行商分成 '+p.offer.terms.publisherRate/10000+'%。当前表单的未提交改动不属于此报价。');
    summary.push('签约时支付预付款与首期 25% 开发拨款。','剩余开发资金在签约后 28、56、84 日支付。','毁约补偿为固定开发资金的 8%，加未履行拨款的 20%。');
  } else if((a.kind==='exit'||a.kind==='cancel-product')&&p) {
    if(a.kind==='cancel-product'&&(p.product!=='UNRELEASED'||p.contract?.terms.control!=='lead'))throw new Error('产品取消需要尚未发售且拥有主导权；仍可选择毁约退出');
    cost=exitCost(p,a.kind==='exit'&&a.negotiated);
    summary.push(`已有未付款 ${balance(s,'out',p.id)/100n} 美元继续保留，不重复记账。`,'已支付投入不退；未来发行收益和监督权限终止。','补偿 7 日后到期；声誉和开发商关系下降，历史退款及交接责任保留。');
    if(a.kind==='exit'&&a.negotiated)summary.push('以标准补偿的 70% 提议协商，7 日后回复；等待期间继续履约，对方可能拒绝。');
  } else if(a.kind==='fund'&&p) {
    cost=BigInt(a.amount); if(cost<1000000n||cost>300000000n)throw new Error('追加资金范围为 1 万—300 万美元');
    summary.push('立即追加开发拨款，独立记账；已付后不退，原合同条款保留。');
  } else if(a.kind==='scope'&&p) {
    if(p.product!=='UNRELEASED')throw new Error('发售后请委托免费更新');
    cost=BigInt(Math.round(p.totalWork*.2*.1))*BigInt(p.workPrice);
    summary.push('范围改变产生整合工作，可能影响进度百分比和内容吸引力。');
  } else if(a.kind==='qa') {
    if(BigInt(a.daily)>2000000n)throw new Error('QA 每日预算不超过 2 万美元');
    summary.push(`从次日起每天最多支付 ${BigInt(a.daily)/100n} 美元；可再次设置为零停止。`);
  } else if(a.kind==='work'&&p) {
    if(p.pendingWork)throw new Error('已有专项工作，完成后再委托');
    cost=BigInt(a.points)*BigInt(p.workPrice);
    summary.push('一次拨付专项资金，工作占用开发商容量；完成后须发布更新才影响已购买玩家。');
  } else if((a.kind==='target'||a.kind==='announce')&&p) {
    if(p.product!=='UNRELEASED'||a.date<s.currentDay+1||a.date>s.currentDay+730)throw new Error('日期必须在未来 730 日内且尚未发售');
  } else if(a.kind==='campaign'&&p) {
    const current=s.campaigns.find(c=>c.projectId===p.id&&c.channel===a.channel&&!c.stopped&&c.ends>=s.currentDay);
    if(current?.channel==='advertising')summary.push('替换广告日预算及后续排期；历史支出不退。');
    else if(current)throw new Error('同类活动正在准备或投放，请先结束它');
    if(a.channel==='advertising') {
      if(BigInt(a.budget)<100000n||BigInt(a.budget)>5000000n)throw new Error('广告日预算为 1000—50000 美元');
      summary.push(`按实际投放日支付 ${BigInt(a.budget)/100n} 美元，共 ${a.duration} 日；资金不足自动停止。`);
    } else if(a.channel==='creator') {
      cost=BigInt(a.budget);if(cost<3000000n||cost>15000000n)throw new Error('合作报价为 3 万—15 万美元');
    } else cost=BigInt(baseline.marketing[a.channel].cost);
    if(a.channel!=='advertising'&&!p.candidate)throw new Error('需要可展示的候选版本');
    if(a.channel==='trailer'||a.channel==='demo')summary.push('制作占用开发容量；开发资金不足会延迟活动，已发生费用不退。');
  } else if(a.kind==='stop-campaign'&&p) {
    if(!s.campaigns.some(c=>c.id===a.campaignId&&c.projectId===p.id&&!c.stopped))throw new Error('活动不存在或已经停止');
    summary.push('停止后续投放；已发生的制作与合作费用不退。');
  } else if(a.kind==='release'&&p) {
    if(p.product!=='UNRELEASED'||!p.candidate)throw new Error('需要未发售产品和可运行候选版本');
    if(a.date<s.currentDay+1||a.date>s.currentDay+730)throw new Error('发售日期必须在未来 730 日内');
    checkPrice(a.price);cost=BigInt(baseline.platform.launchFee);
    summary.push(`采用当前候选版本 v${p.candidate.version}，第 ${a.date} 日支付上线费并发售。`,'内容不完整或已知问题不会阻止你承担风险发售。');
  } else if(a.kind==='unschedule'&&p) {
    if(p.product!=='UNRELEASED'||p.releaseDay===null)throw new Error('没有可撤销的发售排期');
    summary.push('次日撤销上市排期，保留已经发生的营销费用和公开日期记录。');
  } else if(a.kind==='price')checkPrice(a.price);
  else if(a.kind==='discount'&&p&&p.product!=='ON_SALE')throw new Error('只有在售产品可以安排折扣');
  else if(a.kind==='publish'&&p) {
    if(!p.candidate||p.firstRelease===null)throw new Error('需要已发售产品及候选更新版本');
    if(p.published?.version===p.candidate.version)throw new Error('该版本已经发布');
  } else if(a.kind==='support'&&p) {
    if(p.firstRelease===null)throw new Error('发售后才能调整售后支持');
    summary.push('发售后前 180 日仍承担合同最低支持费。停止积极支持不等于下架。');
  } else if(a.kind==='listing'&&p) {
    if(p.firstRelease===null||p.product==='CANCELLED')throw new Error('产品尚未正式发售');
    if(a.listed===(p.product==='ON_SALE'))throw new Error('商店已经处于该状态');
    cost=a.listed?BigInt(baseline.platform.relistFee):0n;
    summary.push('上下架不清除合同、退款或最低支持义务，也不重置销量及评价。');
  } else if(a.kind==='pay') {
    const claim=s.claims.find(c=>c.key===a.claimId&&c.direction==='out'&&c.settled!==c.amount);
    if(!claim)throw new Error('账款不存在或已经付清');
    if(BigInt(a.amount)>BigInt(claim.amount)-BigInt(claim.settled))throw new Error('付款上限超过未付余额');
    cost=BigInt(a.amount);summary.push('最多支付指定金额，按执行时余额和现金决定实际付款。');
  } else if(a.kind==='close')summary.push(`公司现金 ${BigInt(s.company.cash)/100n} 美元，应付 ${balance(s,'out')/100n} 美元，合作中项目 ${s.proposals.filter(p=>p.cooperation==='ACTIVE').length} 个。`,'本局经营结束，未偿债务仍保留；无法继续本局时间。');
  if(p&&['scope','work','target'].includes(a.kind)&&p.contract?.terms.control!=='lead')summary.push('需要开发商同意；7 日后回复，不同意不扣实施费。');
  const deferred=['exit','cancel-product','release','pay'].includes(a.kind)||!!(p&&['scope','work','target'].includes(a.kind)&&p.contract?.terms.control!=='lead');
  if(!deferred&&cost>BigInt(s.company.cash))throw new Error('现金不足，无法提交这项付费操作');
  return {payload:a,cost:money(cost),summary,revision:s.revision};
}
export function submitAction(previous:GameState,payload:unknown,requestId:string,revision:number):GameState {
  if(previous.actions.some(a=>a.requestId===requestId))return previous;
  if(previous.revision!==revision)throw new Error('信息已更新，请重新确认操作');
  const quote=quoteAction(previous,payload),s=structuredClone(previous);
  s.actions.push({id:`action:${s.nextActionId++}`,requestId,payload:quote.payload,due:day(s.currentDay+1),status:'pending',error:'',cost:quote.cost});
  s.revision++;return s;
}
export function cancelAction(previous:GameState,id:string):GameState {
  const s=structuredClone(previous),a=s.actions.find(a=>a.id===id);
  if(!a||a.status!=='pending')throw new Error('只能撤回尚未生效的操作');
  a.status='cancelled';s.revision++;return s;
}
export function executeAction(s:GameState,a:GameState['actions'][number],approved=false) {
  const x=a.payload,p='projectId' in x?findProject(s,x.projectId):null;
  if(x.kind==='pay') {
    const claim=s.claims.find(c=>c.key===x.claimId);
    if(claim&&claim.amount===claim.settled){a.status='completed';a.error='到期自动付款已结清，无需重复支付';return;}
    if(BigInt(s.company.cash)===0n)throw new Error('没有可用现金，本次付款未执行');
  }
  const fresh=quoteAction({...s,currentDay:day(Math.max(0,s.currentDay-1))},x);
  if(BigInt(fresh.cost)>BigInt(a.cost))throw new Error('费用已经增加，需要重新确认');
  if(p&&['scope','work','target'].includes(x.kind)&&p.contract?.terms.control!=='lead'&&!approved) {
    a.due=day(s.currentDay+7);a.error='等待开发商批准';notify(s,`${p.name}：变更请求已送达，7 日后回复。`);return;
  }
  if(a.error==='等待开发商批准'&&roll(s,a.id,'approval',s.currentDay)<.18)throw new Error('开发商拒绝本次改动；未扣实施费');
  if(x.kind==='research'&&p) {
    payNow(s,a.id,BigInt(a.cost),'调查 / 玩家测试',p);
    const d=s.developers.find(d=>d.id===p.developerId)!;
    const truth=x.method==='technical'?1-clip((p.unknownBugs+p.openBugs)/Math.max(1,p.totalWork*.1)):x.method==='team'?(d.creative+d.technical+d.management)/3:x.method==='market'?p.interest:p.quality;
    const method=x.method==='playtest'?'prototype':x.method;
    const noise=baseline.information[method][0]!,width=baseline.information[method][1]!;
    const center=clip(truth+(roll(s,a.id,'report',s.currentDay)*2-1)*noise);
    s.research.push({id:a.id,projectId:p.id,method:x.method,sampleDay:s.currentDay,dueDay:day(s.currentDay+baseline.services[x.method].days),range:[clip(center-width),clip(center+width)],completed:false,text:x.method==='market'?'受众兴趣与当前曝光仍有不确定性；预算不保证销量。':x.method==='technical'?'技术审查反映采样版本，未发现问题不等于没有缺陷。':'这是有限样本的估计。实际交付与市场反馈仍可能不同。'});
  } else if(x.kind==='pass'&&p)p.cooperation=x.reconsider?'PROSPECT':'PASSED';
  else if(x.kind==='offer'&&p)p.offer={id:a.id,terms:structuredClone(x.terms),sentDay:s.currentDay,responseDay:day(s.currentDay+replyDays(s,p)),expiresDay:day(s.currentDay+replyDays(s,p)+14),status:'waiting',message:'开发商正在评估报价'};
  else if(x.kind==='sign'&&p&&p.offer) {
    const t=structuredClone(p.offer.terms),quarter=BigInt(t.funding)/4n;
    p.contract={id:a.id,terms:t,signedDay:s.currentDay,installments:[0,28,56,84].map((offset,i)=>({key:`${a.id}:fund:${i}`,due:day(s.currentDay+offset),amount:money(i===3?BigInt(t.funding)-quarter*3n:quarter),recognized:i===0})),penalty:money(BigInt(t.funding)*8n/100n),compensationRate:200000,unrecouped:money(0n),supportDaily:money(20000n)};
    payNow(s,`${a.id}:advance`,BigInt(t.advance),'签约预付',p);p.contract.unrecouped=t.advance;
    payNow(s,`${a.id}:fund:0`,quarter,'首期开发拨款',p,'funding');
    p.cooperation='ACTIVE';p.targetDay=day(s.currentDay+p.estimatedWeeks*7);
    p.candidate={version:1,date:s.currentDay,experience:clip(.55*p.quality+.25*p.reportedProgress+.2*p.polish-.35*clip((p.unknownBugs+p.openBugs)/Math.max(1,.1*p.totalWork))),completion:p.reportedProgress};
    notify(s,`${p.name} 已签约。可以配置 QA、调整范围、安排营销或发售。`,true);
  } else if((x.kind==='exit'||x.kind==='cancel-product')&&p) {
    if(x.kind==='exit'&&x.negotiated&&!approved) {
      a.due=day(s.currentDay+7);a.error='等待终止协商';notify(s,`${p.name}：终止提案已送达，期间继续履约。`);return;
    }
    if(x.kind==='exit'&&x.negotiated&&roll(s,a.id,'exit-response',s.currentDay)<.25)throw new Error('开发商拒绝协商终止；合同继续，你仍可主动毁约');
    performExit(s,p,a.id,BigInt(fresh.cost),x.kind==='exit'&&x.negotiated,x.kind==='cancel-product');
  } else if(x.kind==='fund'&&p)payNow(s,a.id,BigInt(x.amount),'追加开发拨款',p,'funding');
  else if(x.kind==='scope'&&p) {
    payNow(s,a.id,BigInt(a.cost),'范围整合',p);
    const difference=p.totalWork*.2;p.totalWork*=x.ratio;p.completedWork=Math.min(p.completedWork,p.totalWork*.98);p.totalWork+=difference*.1;
    p.interest=clip(p.interest+(x.ratio<1?-.04:.02));
  } else if(x.kind==='qa'&&p)p.qaDaily=x.daily;
  else if(x.kind==='work'&&p) {
    payNow(s,a.id,BigInt(a.cost),'专项工作 / 免费更新',p,'funding');p.pendingWork={points:x.points,remaining:x.points,focus:x.focus};
  } else if(x.kind==='target'&&p)p.targetDay=x.date;
  else if(x.kind==='announce'&&p) {p.announcedDay=x.date;notify(s,`${p.name} 的公开上市日已更新，实际发售排期须单独确认。`);}
  else if(x.kind==='campaign'&&p) {
    if(x.channel==='advertising')s.campaigns.filter(c=>c.projectId===p.id&&c.channel==='advertising'&&!c.stopped).forEach(c=>c.stopped=true);
    payNow(s,a.id,BigInt(a.cost),'营销制作 / 合作',p);
    const prep=x.channel==='trailer'?14:x.channel==='demo'?21:0;
    s.campaigns.push({id:a.id,projectId:p.id,channel:x.channel,starts:day(s.currentDay+prep),ends:day(s.currentDay+prep+x.duration-1),budget:x.channel==='advertising'||x.channel==='creator'?x.budget:a.cost,spent:x.channel==='advertising'?money(0n):a.cost,stopped:false,experience:p.candidate?.experience??p.quality,remainingWork:x.channel==='trailer'?p.totalWork*.02:x.channel==='demo'?p.totalWork*.04:0});
  } else if(x.kind==='stop-campaign')s.campaigns.find(c=>c.id===x.campaignId)!.stopped=true;
  else if(x.kind==='release'&&p) {p.releaseDay=x.date;p.price=x.price;p.launchBuild=structuredClone(p.candidate);}
  else if(x.kind==='unschedule'&&p) {p.releaseDay=null;p.launchBuild=null;}
  else if(x.kind==='price'&&p)p.price=x.price;
  else if(x.kind==='discount'&&p)p.discount=x.percent?{percent:x.percent,until:day(s.currentDay+x.duration-1),price:money(BigInt(p.price)*BigInt(100-x.percent)/100n)}:null;
  else if(x.kind==='publish'&&p)p.published=structuredClone(p.candidate);
  else if(x.kind==='support'&&p)p.activeSupport=x.active;
  else if(x.kind==='listing'&&p) {payNow(s,a.id,BigInt(a.cost),'重新上架',p);p.product=x.listed?'ON_SALE':'DELISTED';}
  else if(x.kind==='budget'&&p)p.budget=x.amount;
  else if(x.kind==='pay')settle(s,s.claims.find(c=>c.key===x.claimId)!,BigInt(x.amount));
  else if(x.kind==='close') {s.company.status='CLOSED';s.company.closedReason='玩家主动结束经营';}
  a.status='completed';a.error='';
}
export function performExit(s:GameState,p:Proposal,key:string,cost:bigint,negotiated=false,cancelled=false) {
  expense(s,`${key}:penalty`,cost,negotiated?'协商终止补偿':'主动毁约补偿',p.id,s.currentDay+7);
  p.cooperation='EXIT_SETTLEMENT';p.exitedDay=s.currentDay;p.handoverDay=day(s.currentDay+14);p.qaDaily=money(0n);p.releaseDay=null;p.launchBuild=null;p.pendingWork=null;
  if(cancelled)p.product='CANCELLED';else if(p.product==='ON_SALE')p.product='DELISTED';
  s.campaigns.filter(c=>c.projectId===p.id).forEach(c=>c.stopped=true);
  s.actions.filter(a=>a.id!==key&&a.status==='pending'&&'projectId' in a.payload&&a.payload.projectId===p.id).forEach(a=>a.status='cancelled');
  const d=s.developers.find(d=>d.id===p.developerId)!,severity=p.firstRelease!==null?1:.6,mult=negotiated?.4:1;
  d.relationship=clip(d.relationship-.35*severity*mult);s.company.reputation=clip(s.company.reputation-.15*severity*mult);
  notify(s,`${p.name} 已退出。补偿 ${cost/100n} 美元，7 日后到期；历史欠款、旧销售退款和交接责任仍保留。`,true);
}
export function resolveOffers(s:GameState) {
  for(const p of s.proposals) {
    const o=p.offer;if(!o||p.cooperation!=='PROSPECT')continue;
    if(o.status==='waiting'&&o.responseDay<=s.currentDay) {
      const t=o.terms;
      const score=negotiationScore(s,p,t)+(roll(s,o.id,'deal',o.sentDay)*2-1)*.05;
      if(score>=.65) {o.status='accepted';o.message='开发商接受条款，可以签署合同。';}
      else if(score<.45) {o.status='rejected';o.message='开发商拒绝：资金或收益条件不足，可以提交新的方案。';}
      else {o.status='counter';o.terms={...t,publisherRate:Math.min(400000,t.publisherRate),funding:p.funding,ip:'developer'};o.message='开发商反提：恢复请求资金、保留 IP，并要求至少 60% 分成。可以签署反提，也可重新报价。';}
      o.expiresDay=day(s.currentDay+6+Math.floor(industryRoll(s,p.id,'offer-lifetime',o.sentDay)*13));notify(s,`${p.name}：${o.message}`,true);s.notices.at(-1)!.event={kind:'contract-reply',projectId:p.id,offerId:o.id,outcome:o.status};
    } else if(o.expiresDay<s.currentDay&&['accepted','counter'].includes(o.status))o.status='expired';
  }
}
export function defaultTerms(p:Proposal):Terms {return {funding:p.funding,advance:p.advance,publisherRate:400000,recoup:true,ip:'developer',control:'shared'};}
