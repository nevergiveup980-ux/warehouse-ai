# Cloud Only direct writes — draft acceptance

The Cloud Only forms prepare changes in memory, submit one version-checked server command, and refresh the shared Supabase projection after confirmation. The request receipt prevents duplicate application of the same request. An interrupted confirmation can be retried explicitly with the same request in the same open tab. No inventory snapshots or original offline queues are persisted, consumed or replayed by this path.

The proposed migration adds a scoped normalized business roll guard, an authenticated atomic command, and a tenant-scoped request receipt. It does not alter existing rows. Apply it only after approval and a migration rehearsal against an isolated copy with the actual Supabase extensions, V7 command functions and RLS policies. The test fixture models the deployed mutation and V7 cut contracts.

The production audit found 212 non-deleted carpet projections explicitly linked to another V7 roll through payload canonicalId. For a linked cut, the draft resolves that ID, verifies both balances and commits the V7 cut, projection and history in one transaction. Other mutations to an existing linked V7 roll fail closed pending a reviewed paired command. No matching or mutation uses the display roll as a V7 identity. This is a release blocker for a general write rollout.

The historical duplicate review found differences in every audited group under a strict comparison excluding identity and timestamp fields. The private per-group candidate register is kept outside Git. None of the groups are approved for removal.

Production status: no migration, writes, cleanup, cache clearing, merge or deployment performed.
