# Warehouse cloud write-path security audit — 2026-11-19

Read-only verification against production catalog; **no permissions or policies were changed**.

## Verified
- `warehouse_apply_operation`: SECURITY DEFINER, EXECUTE for `authenticated`, not `anon`.
- `warehouse_apply_mutation`: SECURITY INVOKER, EXECUTE for both `anon` and `authenticated`. It checks `auth.uid()` but does not enforce the full duplicate identity policy in the operation wrapper.
- `public.warehouse_records`: INSERT, UPDATE, DELETE table grants exist for `anon`, `authenticated`, and `service_role`. Grants alone do not bypass RLS.
- RLS policies for authenticated users include separate own-row SELECT/INSERT/UPDATE/DELETE policies.
- **Correction after inspecting `pg_policies.permissive`:** the `price catalog company staff only` policy is **RESTRICTIVE**, not PERMISSIVE. PostgreSQL combines restrictive policies with AND alongside the permissive own-row policies. Therefore the prior assertion that this policy overrides tenant isolation by OR was **incorrect and is withdrawn**. The non-price-catalog clause evaluates true but does not remove the separate own-row policy requirement. A dedicated isolated role/RLS test remains useful, but this specific policy is not evidence of cross-tenant access.
- The draft carpet trigger only rejects collisions where both roll and credible manufacturerRoll match; missing/placeholder manufacturerRoll can bypass it via direct table write.

## Before production deployment
1. Review all policies that share `warehouse_records` (not just carpet), and design restrictive, dataset-specific access checks with a rollback plan.
2. Verify tenant isolation in an isolated authenticated RLS test without reading or altering another user's real data. The previously alleged permissive-policy bypass has been corrected.
3. Inventory all callers of direct table writes and `warehouse_apply_mutation` before revoking grants or EXECUTE.
4. Fix ambiguous carpet identity handling at the database boundary, not only the client.
5. Add concurrency tests and full RPC integration tests.
6. Require explicit approval, backup and maintenance window for any production permission/policy change.

**Do not execute an unreviewed DROP POLICY, REVOKE or trigger migration on production.**
