import assert from 'node:assert/strict';
import '../../js/rules/date-utils.js';
import '../../js/rules/state-rules/ohio.js';
import '../../js/rules/state-rules/nevada.js';
import '../../js/rules/state-rules/north-carolina.js';
import '../../js/rules/court-profiles/ohio/wood-county-common-pleas.js';
import '../../js/rules/court-profiles/ohio/wood-county-municipal.js';
import '../../js/rules/court-registry.js';
import '../../js/rules/rule-resolver.js';
import '../../js/rules/rule-engine.js';

const case2006CR083 = {
  id: '2006CR083',
  court: {
    caseState: 'Ohio',
    county: 'Wood',
    courtName: 'Wood County Court of Common Pleas',
    caseNumber: '2006CR083'
  },
  charges: [{
    chargeName: 'Possession of Drugs',
    statuteCode: '2925.11(A)',
    chargeLevel: 'F3',
    disposition: 'Convicted',
    dischargeDate: '2010-05-07'
  }],
  outcome: { outcome: 'Convicted' }
};

const result = globalThis.RecordPathEligibilityEngine.resolveEligibilityForCase(case2006CR083);

assert.equal(result.estimatedEligibleDate, '2013-05-07');
assert.equal(result.eligibilityDate, '2013-05-07');
assert.notEqual(result.estimatedEligibleDate, '2015-05-07');
assert.equal(result.completionDate, '2010-05-07');
assert.equal(result.waitingPeriodText, '3 years');
assert.equal(result.waitingPeriodYears, 3);
assert.equal(result.ruleCitation, 'Ohio R.C. 2953.32 conviction sealing');
assert.equal(result.courtProfile?.courtName, 'Wood County Court of Common Pleas');
assert.equal(result.reliefType, 'Ohio conviction sealing');

console.log('Ohio Wood County Common Pleas eligibility test passed:', result.estimatedEligibleDate);
