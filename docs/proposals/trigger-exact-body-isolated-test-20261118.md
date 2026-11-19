# Exact draft trigger isolated smoke test — 2026-11-18

The test extracted the current function body from `docs/proposals/carpet-duplicate-insert-guard.REVIEW_ONLY.sql` and changed **only** its function name and source table to temporary equivalents. It ran in Supabase SQL with `BEGIN` / `ROLLBACK`, and returned without SQL errors.

Verified scenarios:
1. Insert RC2376 / manufacturerRoll 1000212894.
2. Insert another RC2376 / manufacturerRoll 1000214072 (legitimate distinct roll).
3. Update the first record's length with unchanged identity.
4. Reject insertion of a different record ID with the first roll/manufacturerRoll (P0001).
5. Reject update of the second record to the first record's identity (P0001).

The DO test raised a failure exception if either forbidden operation was accepted or the fixture row count differed from two. No production inventory rows were modified.

## Outstanding blockers
- The trigger intentionally does not guard missing/placeholder manufacturerRoll; the RPC candidate must reject ambiguous inserts, and **direct table writes still bypass this ambiguity protection**.
- `warehouse_apply_mutation` can be called independently and must be assessed for write privileges and bypass risk.
- A trigger P0001 caught in the outer RPC exception handler may roll back mutation-log inserts; confirm client retry/idempotency behavior.
- Concurrent transactions and real authenticated RPC integration have not been tested.
- Do not deploy either SQL candidate or merge PR #229 until those gaps are resolved.
