import type { GameState } from '../domain/state';
import { randomAt } from './random';
export const studios = [
 {name:'半山猫',region:'中国 · 杭州',size:6,founded:2021,specialty:'rpg',history:'两款叙事独立游戏',style:'重视创作自主权'},
 {name:'Northline Games',region:'加拿大 · 温哥华',size:24,founded:2015,specialty:'strategy',history:'三款模拟与策略作品',style:'偏好充足开发资金'},
 {name:'阿佑',region:'中国 · 成都',size:1,founded:2024,specialty:'action',history:'个人开发者，首次商业发行',style:'重视预付款与现金周转'},
 {name:'黑麦互动工作室',region:'中国 · 上海',size:13,founded:2018,specialty:'action',history:'两款商业动作游戏',style:'重视收益分成'},
 {name:'Morrow & Finch',region:'英国 · 布里斯托尔',size:8,founded:2020,specialty:'rpg',history:'一款获社区关注的剧情游戏',style:'重视创作自主权'},
 {name:'纸船',region:'中国 · 厦门',size:4,founded:2022,specialty:'strategy',history:'从游戏创作比赛起步',style:'重视预付款与现金周转'},
 {name:'Red Kite Interactive',region:'波兰 · 华沙',size:31,founded:2012,specialty:'action',history:'四款商业作品，有外包经验',style:'偏好充足开发资金'},
 {name:'小岛上的两个人',region:'中国 · 青岛',size:2,founded:2023,specialty:'rpg',history:'双人团队，首个长篇项目',style:'重视创作自主权'},
 {name:'Studio Nacre',region:'法国 · 里昂',size:11,founded:2019,specialty:'rpg',history:'两款艺术风格鲜明的作品',style:'重视收益分成'},
 {name:'铜雀游戏',region:'中国 · 武汉',size:18,founded:2017,specialty:'strategy',history:'三款策略游戏',style:'偏好充足开发资金'},
 {name:'雨燕制作组',region:'中国 · 南京',size:7,founded:2021,specialty:'action',history:'一款已发行作品',style:'重视收益分成'},
 {name:'Low Orbit',region:'澳大利亚 · 墨尔本',size:5,founded:2020,specialty:'strategy',history:'一款小众模拟游戏',style:'重视创作自主权'}
] as const;
export const studioProfile=(id:string)=>studios[(Number(id.split(':')[1])-1)%studios.length]!;
export const industryRoll=(s:Pick<GameState,'seedHex'>,key:string,purpose:string,date=0)=>randomAt(s.seedHex,'industry-v1',key,`day:${date}`,purpose);
export function proposalContext(s:GameState,p:GameState['proposals'][number]) {
 const profile=studioProfile(p.developerId);
 const pressure=industryRoll(s,p.id,'pressure');
 return {...profile,pressure:pressure>.7?'资金紧张':pressure>.35?'正在寻找合适伙伴':'资金相对宽裕',
  source:s.proposals.some(other=>other.developerId===p.developerId&&other.createdDay<p.createdDay)?'过往联系人':industryRoll(s,p.id,'source')>.55?'行业转介绍':'主动投稿'};
}
export function replyDays(s:GameState,p:GameState['proposals'][number]) {
 return 3+Math.floor(industryRoll(s,p.id,'reply',s.currentDay)*5)+(studioProfile(p.developerId).size>15?2:0);
}
