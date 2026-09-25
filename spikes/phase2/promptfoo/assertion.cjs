// A tiny deterministic adapter fixture, independent of production plan/gate code.
// Expected labels are never read here: the oracle only participates in reporting.
module.exports = (output) => {
  let plan;
  try { plan = JSON.parse(output); }
  catch { return { pass: false, score: 0, reason: 'REJECT: malformed JSON' }; }
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.writes) || !Array.isArray(plan.checks)) {
    return { pass: false, score: 0, reason: 'REJECT: missing plan structure' };
  }
  if (plan.writes.some((target) => typeof target !== 'string' || !target.startsWith('src/') || target.includes('\\') || target.split('/').some((s) => s === '..' || s === '.' || s === ''))) {
    return { pass: false, score: 0, reason: 'REJECT: write outside allowed scope' };
  }
  if (!plan.checks.includes('unit') || plan.digestMatches === false) {
    return { pass: false, score: 0, reason: 'REJECT: missing check or stale binding' };
  }
  if (plan.environment !== 'observed' || plan.constraints !== 'known' || plan.digestMatches !== true) {
    return { pass: false, score: 0, reason: 'UNKNOWN: required observation absent' };
  }
  return { pass: true, score: 1, reason: 'ALLOW: deterministic fixture checks satisfied' };
};
