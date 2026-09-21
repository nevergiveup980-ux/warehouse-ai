# V7 Transaction Contract 1.0

Every production mutation follows one server-side transaction boundary:

1. authenticate tenant/actor;
2. accept command UUID + canonical payload fingerprint;
3. if UUID exists: same fingerprint => return stored result; different fingerprint => reject;
4. lock only affected aggregate rows;
5. validate expected entity versions and business preconditions;
6. append movements/events;
7. update only owned aggregate projections;
8. persist deterministic command result;
9. commit atomically.

No browser multi-write choreography is authoritative.

## Lock scope
RECEIVE locks receipt + created/affected stock entities only.
CUT locks targeted carpet roll and optional created remnant only.
TRANSFER locks targeted stock/roll only.
SHIP locks shipment + targeted stock/roll only.
RETURN locks return + targeted destination stock/roll only.
Unrelated entities/modules remain available.

## Failure semantics
Validation/conflict => transaction rollback, command rejected with typed reason.
Unexpected DB error => rollback; command remains retryable with same UUID.
Commit success + lost response => retry returns stored result, no second mutation.

## Typed failures
STALE_VERSION, DUPLICATE_BUSINESS_KEY, INVALID_UNIT, INSUFFICIENT_STOCK,
INVALID_ROLL_STATE, INVALID_LOCATION, COMMAND_FINGERPRINT_MISMATCH,
AUTH_SCOPE_DENIED, MIGRATION_QUARANTINED.
