// Deerfoot field-verified carpet migration overrides.
// These are explicit human warehouse findings from the 2026-09-22 physical count.
// They affect migration classification only; source V6 rows remain immutable.
export const DEERFOOT_FIELD_VERIFICATION_20260922 = Object.freeze({
  companyRollFormat: /^RC\d{4}$/,
  invalidAliases: Object.freeze({RC22220:'RC2220'}),
  sharedCompanyRollNumbers: new Set(['CHC022','CHC023','SPO11']),
  usedUpCompanyRolls: new Set(['RC1904','RC2331','RC2332','RC2340','RC2341','RC2342']),
  verified: Object.freeze({
    RC1855:{location:'6D',measure:'TM',remainingFeet:45},
    RC2241:{location:'2A',collection:'MANCHESTER',colour:'TOWNLET',lot:'966767',manufacturerRoll:'605964B'},
    RC2242:{location:'2A',collection:'MANCHESTER',colour:'TOWNLET',lot:'967643',manufacturerRoll:'605965B'},
    RC2243:{location:'2A',collection:'MANCHESTER',colour:'TOWNLET',lot:'971067',manufacturerRoll:'609049D'},
    RC2328:{location:'3A'},RC2329:{location:'3A'},RC2330:{location:'3A'},
    RC2254:{location:'3B'},RC2276:{location:'3B'},RC2278:{location:'3B'},RC2279:{location:'3C'},
    SPO11:{location:'2B',sharedCompanyRollNumber:true},
    CHC023:{sharedCompanyRollNumber:true},
    CHC022:{sharedCompanyRollNumber:true}
  }),
  notes:Object.freeze([
    'RC company roll numbers are RC plus exactly four digits. After 9999 the numbering cycle returns to 1000.',
    'RC22220 is a legacy entry error; RC2220 is the valid company roll number.',
    'CHC022, CHC023 and SPO11 are historical shared company roll numbers and may represent multiple physical rolls.',
    'The 7B CHC023 physical roll was field-confirmed used up; other CHC023 physical rolls remain independent.',
    'Field-confirmed used-up rolls must not enter V7 active opening inventory.'
  ])
});

export function deerfootFieldDecision(payload={}){
  const roll=String(payload.roll||payload.companyRollNumber||'').trim().toUpperCase();
  const base=roll.split('-')[0];
  const rules=DEERFOOT_FIELD_VERIFICATION_20260922;
  if(rules.invalidAliases[roll]) return {kind:'corrected_company_roll',from:roll,to:rules.invalidAliases[roll]};
  if(rules.usedUpCompanyRolls.has(base)) return {kind:'used_up',companyRollNumber:base};
  if(base==='CHC023' && String(payload.location||'').trim().toUpperCase()==='7B') return {kind:'used_up',companyRollNumber:'CHC023',location:'7B'};
  if(rules.sharedCompanyRollNumbers.has(base)) return {kind:'shared_company_roll',companyRollNumber:base};
  if(base.startsWith('RC')&&!rules.companyRollFormat.test(base)) return {kind:'invalid_rc_format',companyRollNumber:base};
  return rules.verified[base]?{kind:'verified',companyRollNumber:base,...rules.verified[base]}:null;
}
