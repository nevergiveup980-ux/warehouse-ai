# RUNLU Warehouse OS V7 — Complete Architecture Blueprint 1.0

**Strategy:** Full Architecture, Modular Construction.

## Domain modules known from day one
Identity & Access; Product Master; Purchase/Job Orders; Receiving; Put-away; Flooring Inventory; Carpet Roll Inventory; Cutting; Remnants; Transfer; Shipping; Return; Samples; Tasks; History/Audit; Warehouse Map; Labels/Scanning; Voice; Dashboard/Command Center; Alerts; Migration.

## Dependency rule
Modules share stable IDs and database contracts, never mutable browser datasets. A failure in one module cannot globally pause unrelated modules.

## Ownership and transaction boundaries
- Product owns product identity/specification, not stock balance.
- Inventory owns movements and derived balances.
- Carpet owns physical roll identity/measurement state.
- Cutting owns CUT commands/events; it may mutate only the targeted roll(s) in its database transaction.
- Receiving owns receipt commands/events and creates inventory movements.
- Transfer owns location movements.
- Shipping owns outbound movements.
- Return owns compensating inbound movements; it never rewrites history.
- Supplier Return owns outbound movements back to a supplier; historical work-only records never manufacture stock movement.
- Orders own customer/special-order identity and lifecycle. They reference inventory commands but do not overwrite stock balances.
- History consumes immutable events and owns no operational state.
- Dashboard/Map/Voice are projections/interfaces; they cannot become systems of record.

## Cross-cutting contracts
Every write is a server transaction with UUID command idempotency, tenant scope, actor/device provenance, optimistic entity version, invariant validation, immutable event, and deterministic result.

No global Cloud Master pause exists in V7. Conflict scope is entity/command only.

Offline mode stores bounded commands in IndexedDB. Reconnect resubmits the same command UUID. Server idempotency makes retry safe.

## Failure isolation tests required before release
1. Product review issue does not block Cutting.
2. Cutting conflict on RC-A does not block RC-B or Receiving.
3. Dashboard/Map failure cannot block writes.
4. Full browser cache cannot destroy an accepted server command.
5. Network loss before commit = retry same command; after commit = same result, no duplicate.
6. Two devices submit same command UUID = one mutation.
7. Two devices submit different CUTs against same roll/version = one commits, one receives stale-version rejection.
8. Repeated Save x10 = one mutation.
9. Historical orphan/duplicate remains quarantined in migration staging, never pauses production.
10. Deleted/retired Product remains referentially valid for history.

## Construction waves
Wave 0: architecture, schema, invariants, migration staging, test harness.
Wave 1: Product + Receiving + Inventory + Carpet + Cutting + Transfer + Shipping + Return.
Wave 2: Orders + Remnants + Samples + Tasks + Labels/Scanning.
Wave 3: Map + Dashboard + Alerts + Voice.
Wave 4: V6 migration reconciliation, parallel production validation, controlled cutover.

Architecture changes after Blueprint 1.0 require an explicit architecture decision record and regression impact review.
