# Carpet soft-delete/reactivation isolated test — 2026-11-19

Executed against Supabase SQL using the actual trigger function body extracted from `carpet-duplicate-insert-guard.REVIEW_ONLY.sql`, renamed and pointed to a temporary fixture table. Test was wrapped in `BEGIN; ... ROLLBACK;`; no production warehouse rows changed.

Scenario:
1. Insert active RC2376 manufacturerRoll A, and RC2377 manufacturerRoll B.
2. Soft-delete the original RC2376 row (`deleted_at=now()`).
3. Insert a new active RC2376 manufacturerRoll A row with a different `record_id`.
4. Attempt to reactivate the original RC2376 by setting `deleted_at=null`.
5. Assert the reactivation raises SQLSTATE P0001 / `possible_duplicate_physical_roll`.
6. Assert exactly two active fixture rows remain.

Supabase execution returned without error; assertions did not fail.

This verifies **single-session soft-delete/reactivation semantics only**, not concurrency, actual authenticated RPC integration, or data migration. Production trigger remains uninstalled.
