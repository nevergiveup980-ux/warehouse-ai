# V7 Invariant Catalogue 1.0

1. Command UUID is immutable and tenant-scoped.
2. Same command UUID + same fingerprint returns original deterministic result.
3. Same command UUID + different fingerprint is rejected.
4. Entity version must match expected_version for concurrency-sensitive writes.
5. Roll remaining length cannot be negative or exceed original length.
6. Active roll_number is unique per tenant; legacy duplicates enter staging, not production.
7. CUT can deduct a physical roll at most once per command.
8. Every committed stock change has exactly one causal command and one or more movements.
9. Movements and events are append-only.
10. Product retirement does not orphan stock/history.
11. Location movement cannot silently create/destroy quantity.
12. RETURN compensates a prior outbound fact; it does not erase it.
13. Migration exceptions cannot globally pause production.
14. Read projections may be rebuilt from authoritative records/events.
15. Browser state is never sufficient proof that a command committed.
16. Server result is authoritative; retry uses same command UUID.
17. Cross-tenant references are forbidden by composite tenant FKs/RLS.
18. Unknown unit conversion fails closed for that command only.
19. RC2253 remains migration-deferred until physical verification.
20. Any migration duplicate (including RC2291 candidates) is staged for identity reconciliation; no automatic destructive dedupe.
