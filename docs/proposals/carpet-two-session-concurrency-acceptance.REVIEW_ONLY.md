# Two-session concurrency acceptance protocol — REVIEW ONLY

**Status:** prepared, NOT executed. Run only on a disposable PostgreSQL database, never on production inventory.

## Goal
Verify the proposed `runlu_guard_new_carpet_identity` trigger serializes two concurrent INSERT transactions for the **same tenant + business roll + manufacturer roll**. Exactly one transaction should commit; the other should fail with SQLSTATE P0001 (`possible_duplicate_physical_roll`). No deadlock or timeout.

## Disposable fixture
Create a disposable database with a simplified `public.warehouse_records` table containing `user_id uuid`, `dataset_key text`, `record_id text`, `payload jsonb`, and `deleted_at timestamptz`, plus a unique constraint on `record_id`. Install the exact REVIEW_ONLY trigger **function and trigger**, adapted only if needed to the disposable fixture. Never connect this protocol to the production project.

## Two independently connected sessions
1. **Session A**: BEGIN; INSERT record_id='race-a', user_id='11111111-1111-1111-1111-111111111111', dataset_key='runlu_carpet_inventory_v52', payload='{"roll":"RACE-001","manufacturerRoll":"MFR-001"}'; then hold the transaction open for 2 seconds before COMMIT.
2. **Session B**, while A is uncommitted: BEGIN; SET LOCAL lock_timeout='10s'; INSERT record_id='race-b' with **identical** user_id, dataset_key, roll, and manufacturerRoll; COMMIT if accepted.
3. Expected: B waits for the advisory transaction lock, then raises SQLSTATE P0001 after A commits. Query final rows: exactly one active row.
4. Repeat with B started first; then with two distinct manufacturer rolls under the same business roll (both should succeed, serialized); then with a placeholder manufacturerRoll (one succeeds, second blocked).
5. Verify a different tenant does not conflict; repeat UPDATE identity change and reactivation scenarios.
6. Capture session logs with connection/session identifiers and timestamps; fail the test if either session silently reports success when two identical physical identities were inserted.

## Acceptance evidence
Record exact PostgreSQL version, installed function checksum, start/end timestamps, exit codes, SQLSTATE, final row count, and a link to the CI run. A test using a single SQL connection, even with multiple transactions, **does not** prove concurrency.

## Remaining separate gates
- Authenticated `warehouse_apply_operation` and `warehouse_apply_mutation` integration tests, including conflict status and stable operation ID.
- Client outbox reconciliation after server rejection, network timeout, and server-side duplicate status.
- Verified backups and written rollback plan before any production migration.
