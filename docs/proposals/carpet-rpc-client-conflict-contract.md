# Warehouse OS — concrete RPC + client acceptance contract

## Evidence verified 2026-11-18
- Production `warehouse_apply_operation` returns `status='ok', reason='duplicate_carpet_record_discarded'` for a roll-only match when incoming physicalKey is blank. It records the operation as `applied`.
- Production `index.html` `recordSyncPush` only removes the head of its outbox when status is `ok` or `duplicate`; a `conflict` pauses the queue and preserves it.
- Production `cloudRequest` throws on non-2xx responses. The trigger draft raises P0001, so a database-trigger rejection currently propagates as an exception instead of a structured conflict. Integration must handle this safely.
- The most recent carpet `warehouse_mutations` timestamp is 2026-10-03, preceding the 2026-11-18 replay; this does not identify the actual caller.

## Required RPC contract (draft)
For a new carpet record where physical identity matches an existing different record ID, return:
```json
{"status":"conflict","reason":"possible_duplicate_physical_roll","record":null,"existing_record_id":"<existing id>","requires_review":true}
```
Do not return `status=ok` / `discarded=true`. Do not record `applied` in warehouse_mutations for this case.

For a legitimate second roll with the same business roll but **different credible manufacturerRoll**, never discard solely on business roll. If product/lot identity cannot be established, return `status=conflict` for manual review, rather than assuming it is a duplicate or inserting blindly.

For missing/placeholder manufacturerRoll and no trusted physicalKey, return a review-required conflict on ambiguous identity. Preserve local queue.

For duplicate operation_id, preserve existing idempotency: return `status=duplicate` with the original result; the client must not mistake a duplicated conflict as a successful write.

## Client handling changes needed before production
1. Treat `status='duplicate'` as success **only when original.status is ok and original was not discarded/blocked**.
2. Treat `status='conflict'`, `status='blocked'`, and `status='duplicate'` wrapping a conflict as queue-preserving stops.
3. Remove the local-record deletion branch for `duplicate_carpet_record_discarded`; never delete local records based solely on a cloud success-looking response.
4. Show roll number, conflict reason and queued-operation count in a readable status message.
5. Keep cloud bootstrap blocked while outbox contains unresolved operations.
6. When a P0001 trigger error reaches the API, map it to a structured conflict inside the RPC or catch it at the client without dequeueing.

## Must-pass regression scenarios
- Same roll + same credible manufacturerRoll + different record_id => conflict, local outbox retained.
- Same roll + different credible manufacturerRoll => not silently discarded.
- Same physicalKey + different record_id => conflict, local outbox retained.
- Missing physicalKey + missing manufacturerRoll => manual review, no success acknowledgement.
- Repeated operation_id with original conflict => stays blocked.
- Repeated operation_id with original success => idempotent success.
- Incomplete incoming carpet => never silently delete an existing cloud row.
- Two simultaneous inserts => at most one accepted, both responses unambiguous.
- Cloud fetch timeout => outbox retained, no local deletion.

## Scope
This document is an integration contract, not executable production SQL. Do not deploy the draft trigger alone. Existing rows must remain untouched until individually reconciled.
