import { OpenAIProviderError } from '../providers/openai.js';

export type CallBoundary = 'admission' | 'count' | 'reservation' | 'generation' | 'settlement';
export interface CampaignErrorReceipt {
  kind: 'provider' | 'campaign' | 'unknown'; code: string;
  httpStatus: number | null; requestId: string | null; boundary: CallBoundary;
}
const providerCodes = new Set([
  'OPENAI_OPTIONS_INVALID', 'OPENAI_REQUEST_INVALID', 'OPENAI_REQUEST_TOO_LARGE', 'OPENAI_API_KEY_REQUIRED',
  'OPENAI_REDIRECT_DENIED', 'OPENAI_HTTP_ERROR', 'OPENAI_RESPONSE_TOO_LARGE', 'OPENAI_RESPONSE_INVALID',
  'OPENAI_TIMEOUT', 'OPENAI_TRANSPORT_ERROR', 'OPENAI_COUNT_INVALID', 'OPENAI_COUNT_REQUIRED', 'OPENAI_COUNT_SUPERSEDED',
]);
const campaignCodes = new Set([
  'CAMPAIGN_BINDING_DRIFT', 'CAMPAIGN_PROVIDER_DRIFT', 'CAMPAIGN_HUMAN_REVIEW_DRIFT', 'COUNT_PIN_INVALID',
  'BUDGET_AUTHORIZATION_INVALID', 'BUDGET_PATH_INVALID', 'BUDGET_AUTHORIZATION_DRIFT', 'BUDGET_RESERVATION_INVALID',
  'BUDGET_FROZEN', 'BUDGET_CAP_EXCEEDED', 'ATTEMPT_ALREADY_RESERVED_NO_BLIND_RETRY',
  'BUDGET_PENDING_RECONCILIATION', 'BUDGET_USAGE_INVALID', 'BUDGET_SETTLEMENT_INVALID',
]);

/** Never serialize exception messages, stack/cause, request bodies or transport headers. */
export function sanitizeCampaignError(error: unknown, boundary: CallBoundary): CampaignErrorReceipt {
  if (error instanceof OpenAIProviderError) {
    return { kind: 'provider', code: providerCodes.has(error.code) ? error.code : 'OPENAI_ERROR',
      httpStatus: Number.isInteger(error.httpStatus) && error.httpStatus! >= 100 && error.httpStatus! <= 599 ? error.httpStatus : null,
      requestId: typeof error.requestId === 'string' && /^req_[a-zA-Z0-9_-]{1,128}$/.test(error.requestId) ? error.requestId : null,
      boundary };
  }
  return { kind: error instanceof Error && campaignCodes.has(error.message) ? 'campaign' : 'unknown',
    code: error instanceof Error && campaignCodes.has(error.message) ? error.message : 'UNEXPECTED_ERROR',
    httpStatus: null, requestId: null, boundary };
}
