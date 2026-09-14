import { z } from 'zod';
import baseline from '../config/mvp-baseline-1.json';
import { daySchema, idSchema, moneySchema, scalarSchema } from './values';
export const developerSchema = z.strictObject({ id: idSchema, name: z.string().max(60), creative: scalarSchema, technical: scalarSchema, production: scalarSchema, management: scalarSchema });
export const proposalSchema = z.strictObject({
  id: idSchema, developerId: idSchema, name: z.string().max(80), genre: z.enum(['action', 'rpg', 'strategy']),
  createdDay: daySchema, expiresDay: daySchema, funding: moneySchema, advance: moneySchema,
  reportedProgress: scalarSchema, estimatedWeeks: z.number().int().min(1).max(200),
  hiddenQuality: scalarSchema, audience: z.number().int().positive()
});
export const legacyStateSchema = z.strictObject({
  schemaVersion: z.literal(1), rulesVersion: z.literal('foundation-1'), rngVersion: z.literal('hash-v1'),
  config: z.custom<typeof baseline>(v => JSON.stringify(v) === JSON.stringify(baseline), '不支持的配置'),
  configHash: z.string().regex(/^[0-9a-f]{64}$/), seedHex: z.string().regex(/^[0-9a-f]{32}$/),
  currentDay: daySchema, revision: z.number().int().nonnegative(), nextProjectId: z.number().int().positive(),
  company: z.strictObject({ name: z.string().min(1).max(40), cash: moneySchema, reputation: scalarSchema }),
  developers: z.array(developerSchema).length(12), proposals: z.array(proposalSchema).max(100000),
  weeklySettlements: z.array(daySchema), monthlyReports: z.array(z.strictObject({ month: z.string().regex(/^\d{4}-\d{2}$/), day: daySchema, cash: moneySchema })),
  assessmentShown: z.boolean()
});
const integer = z.number().int().nonnegative();
const quantity = z.number().finite().nonnegative();
export const termsSchema = z.strictObject({ funding: moneySchema, advance: moneySchema, publisherRate: z.number().int().min(0).max(1000000), recoup: z.boolean(), ip: z.enum(['developer','publisher']), control: z.enum(['limited','shared','lead']) });
export const actionPayloadSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('research'), projectId: idSchema, method: z.enum(['prototype','technical','team','market','playtest']) }),
  z.strictObject({ kind: z.literal('pass'), projectId: idSchema, reconsider: z.boolean() }),
  z.strictObject({ kind: z.literal('offer'), projectId: idSchema, terms: termsSchema }),
  z.strictObject({ kind: z.literal('sign'), projectId: idSchema, offerId: z.string() }),
  z.strictObject({ kind: z.literal('exit'), projectId: idSchema, negotiated: z.boolean() }),
  z.strictObject({ kind: z.literal('cancel-product'), projectId: idSchema }),
  z.strictObject({ kind: z.literal('fund'), projectId: idSchema, amount: moneySchema }),
  z.strictObject({ kind: z.literal('scope'), projectId: idSchema, ratio: z.union([z.literal(0.8),z.literal(1.2)]) }),
  z.strictObject({ kind: z.literal('qa'), projectId: idSchema, daily: moneySchema }),
  z.strictObject({ kind: z.literal('work'), projectId: idSchema, points: z.number().int().min(10).max(150), focus: z.enum(['repair','quality','content']) }),
  z.strictObject({ kind: z.literal('target'), projectId: idSchema, date: daySchema }),
  z.strictObject({ kind: z.literal('campaign'), projectId: idSchema, channel: z.enum(['advertising','trailer','demo','creator']), budget: moneySchema, duration: z.number().int().min(7).max(28) }),
  z.strictObject({ kind: z.literal('stop-campaign'), projectId: idSchema, campaignId: z.string() }),
  z.strictObject({ kind: z.literal('announce'), projectId: idSchema, date: daySchema }),
  z.strictObject({ kind: z.literal('release'), projectId: idSchema, date: daySchema, price: moneySchema }),
  z.strictObject({ kind: z.literal('unschedule'), projectId: idSchema }),
  z.strictObject({ kind: z.literal('price'), projectId: idSchema, price: moneySchema }),
  z.strictObject({ kind: z.literal('discount'), projectId: idSchema, percent: z.number().int().min(0).max(75), duration: z.number().int().min(7).max(28) }),
  z.strictObject({ kind: z.literal('publish'), projectId: idSchema }),
  z.strictObject({ kind: z.literal('support'), projectId: idSchema, active: z.boolean() }),
  z.strictObject({ kind: z.literal('listing'), projectId: idSchema, listed: z.boolean() }),
  z.strictObject({ kind: z.literal('budget'), projectId: idSchema, amount: moneySchema }),
  z.strictObject({ kind: z.literal('pay'), claimId: z.string(), amount: moneySchema }),
  z.strictObject({ kind: z.literal('close') })
]);
export type ActionPayload = z.infer<typeof actionPayloadSchema>;
export type Terms = z.infer<typeof termsSchema>;
const offerSchema = z.strictObject({ id: z.string(), terms: termsSchema, sentDay: daySchema, responseDay: daySchema, expiresDay: daySchema, status: z.enum(['waiting','accepted','counter','rejected','expired']), message: z.string() });
const contractSchema = z.strictObject({ id: z.string(), terms: termsSchema, signedDay: daySchema, installments: z.array(z.strictObject({ key: z.string(), due: daySchema, amount: moneySchema, recognized: z.boolean() })), penalty: moneySchema, compensationRate: integer, unrecouped: moneySchema, supportDaily: moneySchema });
const buildSchema = z.strictObject({ version: integer, date: daySchema, experience: scalarSchema, completion: scalarSchema });
const projectSchema = proposalSchema.extend({
  cooperation: z.enum(['PROSPECT','PASSED','ACTIVE','EXIT_SETTLEMENT','TERMINATED']), product: z.enum(['UNRELEASED','ON_SALE','DELISTED','CANCELLED']),
  offer: offerSchema.nullable(), contract: contractSchema.nullable(),
  totalWork: quantity, completedWork: quantity, quality: scalarSchema, polish: scalarSchema, unknownBugs: quantity, openBugs: quantity, verification: quantity,
  workingFunds: moneySchema, dailyCost: moneySchema, workPrice: moneySchema, qaDaily: moneySchema, targetDay: daySchema,
  reportedQuality: z.tuple([scalarSchema,scalarSchema]).nullable(), reportDay: daySchema.nullable(),
  candidate: buildSchema.nullable(), launchBuild: buildSchema.nullable(), published: buildSchema.nullable(), firstRelease: daySchema.nullable(), releaseDay: daySchema.nullable(), announcedDay: daySchema.nullable(),
  price: moneySchema, discount: z.strictObject({ percent: integer, until: daySchema, price: moneySchema }).nullable(), activeSupport: z.boolean(), budget: moneySchema,
  awareness: scalarSchema, interest: scalarSchema, hype: scalarSchema, trust: scalarSchema, mouth: scalarSchema, wishlist: integer, bought: integer, owners: integer, reviews: integer, positive: integer,
  lastSales: integer, totalSales: integer, exitedDay: daySchema.nullable(), handoverDay: daySchema.nullable(),
  pendingWork: z.strictObject({ points: quantity, remaining: quantity, focus: z.enum(['repair','quality','content']) }).nullable(),
  exposureUntil: integer, exposureCooldown: integer, riskUntil: integer, riskCooldown: integer,
  history: z.array(z.strictObject({ day: daySchema, sales: integer, experience: scalarSchema }))
});
const researchSchema = z.strictObject({ id: z.string(), projectId: idSchema, method: z.enum(['prototype','technical','team','market','playtest']), sampleDay: daySchema, dueDay: daySchema, range: z.tuple([scalarSchema,scalarSchema]), completed: z.boolean(), text: z.string() });
const campaignSchema = z.strictObject({ id: z.string(), projectId: idSchema, channel: z.enum(['advertising','trailer','demo','creator']), starts: daySchema, ends: daySchema, budget: moneySchema, spent: moneySchema, stopped: z.boolean(), experience: scalarSchema, remainingWork: quantity });
export const stateSchema = legacyStateSchema.omit({ schemaVersion: true, rulesVersion: true, proposals: true, company: true, developers: true, monthlyReports: true }).extend({
  schemaVersion: z.literal(2), rulesVersion: z.literal('playable-1'), businessStartDay: daySchema, migrated: z.boolean(),
  industryVersion: z.literal(1).optional(),
  company: z.strictObject({ name: z.string().min(1).max(40), cash: moneySchema, reputation: scalarSchema, status: z.enum(['OPERATING','DISTRESSED','CLOSED']), closedReason: z.string() }),
  developers: z.array(developerSchema.extend({ fatigue: scalarSchema, morale: scalarSchema, relationship: scalarSchema })).length(12),
  proposals: z.array(projectSchema), research: z.array(researchSchema), campaigns: z.array(campaignSchema),
  nextActionId: integer,
  actions: z.array(z.strictObject({ id: z.string(), requestId: z.string(), due: daySchema, status: z.enum(['pending','completed','failed','cancelled']), payload: actionPayloadSchema, error: z.string(), cost: moneySchema })),
  notices: z.array(z.strictObject({ id: z.string(), day: daySchema, text: z.string(), important: z.boolean(), read: z.boolean(), event: z.strictObject({kind:z.literal('contract-reply'),projectId:idSchema,offerId:z.string(),outcome:z.enum(['accepted','counter','rejected'])}).optional() })),
  ledger: z.array(z.strictObject({ key: z.string(), day: daySchema, projectId: idSchema.nullable(), kind: z.enum(['expense','income','payment','receipt','income-reversal']), amount: moneySchema, label: z.string() })),
  claims: z.array(z.strictObject({ key: z.string(), projectId: idSchema.nullable(), due: daySchema, amount: moneySchema, settled: moneySchema, direction: z.enum(['in','out']), category: z.enum(['general','funding','revenue','refund']), label: z.string() })),
  dailyInputs: z.array(z.strictObject({ projectId: idSchema, day: daySchema, capacity: quantity, qa: quantity, onSale: z.boolean(), price: moneySchema, experience: scalarSchema, marketingExperience: scalarSchema, reach: scalarSchema, evidence: scalarSchema })),
  batches: z.array(z.strictObject({ key: z.string(), projectId: idSchema, day: daySchema, units: integer, price: moneySchema, gross: moneySchema, net: moneySchema, publisher: moneySchema, developer: moneySchema, recouped: moneySchema, satisfaction: scalarSchema, reviewed: z.boolean(), refunded: z.boolean(), refundUnits: integer, claimKey: z.string() })),
  genres: z.array(z.strictObject({ id: z.string(), demand: z.number().min(0.5).max(1.5), competition: scalarSchema })),
  monthlyReports: z.array(z.strictObject({ month: z.string(), day: daySchema, cash: moneySchema, opening: moneySchema, receipts: moneySchema, payments: moneySchema, income: moneySchema, refunds: moneySchema, expenses: moneySchema, payable: moneySchema, receivable: moneySchema }))
});
export type GameState = z.infer<typeof stateSchema>;
export type Proposal = z.infer<typeof projectSchema>;
export type Claim = GameState['claims'][number];
