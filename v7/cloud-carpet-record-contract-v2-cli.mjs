#!/usr/bin/env node
import fs from 'node:fs';
import {auditLegacyCloudCarpetRowsV2} from './cloud-carpet-record-contract-v2.mjs';

const args=process.argv.slice(2);
const input=args[0];
const reportIndex=args.indexOf('--report');
const identityIndex=args.indexOf('--identity-report');
const report=reportIndex>=0?args[reportIndex+1]:null;
const identityReport=identityIndex>=0?args[identityIndex+1]:null;
if(!input||!report){
  console.error('usage: node v7/cloud-carpet-record-contract-v2-cli.mjs <snapshot.json> --report <report.json> [--identity-report <identity.json>]');
  process.exit(2);
}
const rows=JSON.parse(fs.readFileSync(input,'utf8'));
const out=auditLegacyCloudCarpetRowsV2(rows);
if(identityReport){
  const id=JSON.parse(fs.readFileSync(identityReport,'utf8'));
  const a=out.counts,b=id.counts||{};
  const checks={
    active_source_rows:a.active_source_rows===b.active_source_rows,
    legacy_instances:a.legacy_instance_aliases===b.legacy_instance_candidates,
    duplicate_rows_collapsed:a.duplicate_source_rows_collapsed===b.duplicate_source_rows_collapsed,
    accepted_instances:a.accepted_physical_instances===b.accepted_physical_instances,
    conflict_groups:a.conflict_groups===b.conflict_groups,
    distinct_roll_numbers:a.accepted_distinct_company_roll_numbers===b.accepted_distinct_company_roll_numbers
  };
  out.identity_v2_reconciliation=checks;
  out.identity_v2_reconciliation_pass=Object.values(checks).every(Boolean);
  if(!out.identity_v2_reconciliation_pass) throw new Error('CLOUD_CONTRACT_V2_IDENTITY_RECONCILIATION_FAILED');
}
fs.writeFileSync(report,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({
  mode:out.mode,production_writes:out.production_writes,counts:out.counts,
  shared_groups:out.shared_groups,
  identity_v2_reconciliation_pass:out.identity_v2_reconciliation_pass??null
},null,2));
console.log('V7 CLOUD CARPET RECORD CONTRACT V2 AUDIT: PASS');
