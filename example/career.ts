import {newGame,advanceDay,submitAction,quoteAction,defaultTerms,estimateAcceptance,playerView,day,money,validateState,type ActionPayload} from '../src/index';
let state=newGame('0123456789abcdef0123456789abcdef','Example Publisher');
let sequence=0;
const submit=(payload:ActionPayload)=>{const q=quoteAction(state,payload);state=submitAction(state,payload,'demo-'+(++sequence),q.revision);};
const tick=()=>{const result=advanceDay(state);state=result.state;return result;};
const projectId=state.proposals[0]!.id;
const project=()=>state.proposals.find(p=>p.id===projectId)!;
console.log('Estimated deal outcomes:',estimateAcceptance(state,project(),defaultTerms(project())));
submit({kind:'offer',projectId,terms:defaultTerms(project())});tick();
while(project().offer!.status==='waiting')tick();
if(!['accepted','counter'].includes(project().offer!.status))throw new Error('Demo offer declined');
submit({kind:'sign',projectId,offerId:project().offer!.id});tick();
// Early release is legal in playable-1; incomplete content affects market outcomes.
submit({kind:'release',projectId,date:day(state.currentDay+1),price:money(2499n)});tick();
while(state.currentDay<120&&state.company.status!=='CLOSED')tick();
validateState(state);const view=playerView(state,0);
console.log(JSON.stringify({date:view.date,company:view.company,project:view.proposals.find(p=>p.id===projectId)?.name,sales:project().totalSales,receivable:view.receivable,monthlyReports:view.monthlyReports.length},null,2));
