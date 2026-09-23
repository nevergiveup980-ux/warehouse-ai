# Warehouse OS V7 — Production Opening Reconciliation Checkpoint

Captured: 2026-09-23
Source snapshot MD5: `27f36fc740ac29800d7463bfe6fec140`
Source live rows: **787**
GitHub Actions evidence: **Warehouse V7 Real Snapshot Dry Run #173 — SUCCESS**
Cutover result: **PRODUCTION_OPENING_IMPORT_RECONCILED**

## Production V7 canonical counts

- Products: **311**
- Locations: **97**
- Stock items: **82**
- Carpet rolls: **208**
- Committed commands: **290**
- Inventory movements: **290**
- Events: **290**
- Invalid quarantine-to-canonical links: **0**

Active carpet measure-state split:
- FULL: **76**
- CAL: **39**
- TM: **93**

Integrity checks after reconciliation:
- Active carpet rolls with zero/negative remaining length: **0**
- Carpet rolls with remaining length greater than original length: **0**
- Negative stock items: **0**
- Active tenant memberships: **1 owner**

## Release posture

The production opening data migration is reconciled and the V7 production API is active.
The V7 web shell is deployed from `main` under `v7/warehouse-v7.html`.

Do not replace the root V6 production UI until operational UI parity/fallback is explicitly verified.
The current V7 shell covers the core Wave 1 operations (Inventory, Receive, Cut, Transfer,
Ship, Return, History); V6-only operational modules must not be silently removed during
the default-entry cutover.
