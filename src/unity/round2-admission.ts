import { checkWalkingSkeletonQuota } from './quota-gate.js';
export interface Round2BudgetPolicy {
 absoluteWeeklyStopUsedPercent: number;
 stepCapsPoints: readonly number[];
 resetAt: number;
 pairOrder: string;
 repairFeedback: string;
 hardCreditMultiplier: number;
}
export function validateRound2BudgetPolicy(policy: Round2BudgetPolicy): void {
 if(policy.absoluteWeeklyStopUsedPercent!==85 || JSON.stringify(policy.stepCapsPoints)!=='[2,5,6]' || policy.resetAt!==1791343381 || policy.pairOrder!=='B/C' || policy.repairFeedback!=='public-only' || policy.hardCreditMultiplier!==1.5) throw Error('ROUND2_SUPERSEDED_OR_INVALID_POLICY');
}
export function admitRound2Pair(snapshot: unknown, bCapMicros: number, cCapMicros: number, remainingCreditMicros: number, creditsPerQuotaPoint: number, now=Date.now()) {
 if(!Number.isSafeInteger(bCapMicros)||bCapMicros<1||bCapMicros!==cCapMicros||!Number.isSafeInteger(remainingCreditMicros)||remainingCreditMicros<0||!Number.isFinite(creditsPerQuotaPoint)||creditsPerQuotaPoint<=0) return {allowed:false,reason:'pair-reservation-invalid',reservedCreditMicros:0};
 const reservedCreditMicros=Math.ceil(1.5*(bCapMicros+cCapMicros));
 if(remainingCreditMicros<reservedCreditMicros)return {allowed:false,reason:'insufficient-complete-pair-credit',reservedCreditMicros};
 const quota=checkWalkingSkeletonQuota(snapshot,reservedCreditMicros/1_000_000/creditsPerQuotaPoint,now);
 return {...quota,reservedCreditMicros};
}
/** Credit stops must still go to the host grader; infrastructure must never be scored as task failure. */
export function round2GradeAdmission(receipt: {protocolDigest: string|null;error: string|null;sourceDigest: string|null;creditMicros: number|null;usageSettlement: string}, protocolDigest: string, brokerReceipts: readonly {protocolDigest:string}[]) {
 if(receipt.protocolDigest!==protocolDigest||!brokerReceipts.length||brokerReceipts.some(r=>r.protocolDigest!==protocolDigest))return {allowed:false,classification:'infrastructure',reason:'missing-or-mismatched-receipt'};
 if(receipt.creditMicros===null||receipt.sourceDigest===null)return {allowed:false,classification:'infrastructure',reason:'missing-final-source-or-counter'};
 if(receipt.error!==null&&!['NATIVE_CODEX_HARD_CREDIT_STOP','NATIVE_CODEX_CREDIT_CAP_EXCEEDED'].includes(receipt.error))return {allowed:false,classification:'infrastructure',reason:receipt.error};
 return {allowed:true,classification:'grade-final-snapshot',reason:receipt.usageSettlement==='unsettled'?'last-counter-unsettled':'settled'};
}
