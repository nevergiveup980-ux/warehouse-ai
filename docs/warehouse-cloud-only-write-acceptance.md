# Cloud Only direct writes — draft acceptance

The Cloud Only forms prepare changes in memory, submit one version-checked server command, and refresh the shared Supabase projection after confirmation. The request receipt prevents duplicate application of the same request. An interrupted confirmation can be retried explicitly with the same request in the same open tab. No inventory snapshots or original offline queues are persisted, consumed or replayed by this path.

The proposed migration adds a scoped normalized business roll guard, an authenticated atomic command, and a tenant-scoped request receipt. It does not alter existing rows. Apply it only after approval and a migration rehearsal against an isolated copy with the actual Supabase extensions, V7 command functions and RLS policies. The test fixture models the deployed mutation and V7 cut contracts.

The production audit found 212 non-deleted carpet projections explicitly linked to another V7 roll through payload canonicalId. For a linked cut, the draft resolves that ID, verifies both balances and commits the V7 cut, projection and history in one transaction. Other mutations to an existing linked V7 roll fail closed pending a reviewed paired command. No matching or mutation uses the display roll as a V7 identity. This is a release blocker for a general write rollout.

The historical duplicate review found differences in every audited group under a strict comparison excluding identity and timestamp fields. The private per-group candidate register is kept outside Git. None of the groups are approved for removal.

Production status: no migration, writes, cleanup, cache clearing, merge or deployment performed.

## CR4 field failure — follow-up

The production read-only check found one non-deleted stock record for PO 181762, 88 Box at CR4. Supabase `record_id` and the payload's historical `id` are both `1792170022853`. The payload has no `inventoryId`. The old UI's `INV-20261016170022-022853` is a derived alias from that epoch ID. Old handlers looked for the alias in fields that were absent or held the numeric ID. The draft uses the canonical record key for inventory actions, history links and tag URLs. Old aliases are accepted for navigation only when a single row matches; new mutations carry that row's canonical key and expected version.

The existing PO 181762 receipt shows a posted movement from 0 to 88, and the product, rack, lot, unit and stock source match the live row. An administrator count writes the replacement total and a signed audit delta in one cloud command. Related Orders expands completed and transferred work and distinguishes exact stock links from PO references. A quantity correction writes only the difference, with the corrected order and audit records in the same transaction. New stock work records exact movement IDs. For an old posted receipt without an explicit key, the draft requires a unique match using PO/source, product, rack, lot, unit and verified posted before/after values. Other historical rows lacking provable stock movements remain editable for PO and notes; their inventory amounts stay protected. Multi-line and converted-quantity corrections are held for reconciliation.

No live mutation or device cache operation was performed. This follow-up does not resolve the earlier V7-linked roll release gate.
