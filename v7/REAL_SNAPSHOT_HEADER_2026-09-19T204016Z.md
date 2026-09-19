# Warehouse OS V7 — Read-only Production Snapshot Header

Captured: 2026-09-19 20:40:16.667105+00
Mode: READ ONLY
Production writes performed: 0

This header freezes the source state used to prepare the first real V6 dry run.
It is not the snapshot payload itself.

| Dataset | Live | Tombstones | Latest observed update | Read-only source digest |
|---|---:|---:|---|---|
| runlu_product_master_v21 | 68 | 8 | 2026-09-18T16:42:15.89247+00:00 | e6391a19152610b1925eea5a447b3850 |
| runlu_inventory_records_v21 | 189 | 190 | 2026-09-18T16:42:16.062044+00:00 | 144ca31c312c2d64943b26f6a7308123 |
| runlu_carpet_inventory_v52 | 530 | 10 | 2026-09-17T15:41:49.198337+00:00 | 654010652164225be10f4df9b0908fda |

The digest above is a source-side audit fingerprint over the minimal fields needed for V7 migration planning.
Immediately before a real dry run, the extraction step must generate a snapshot envelope containing:
- mode = READ_ONLY_V6_SNAPSHOT
- per-dataset live row counts
- per-dataset payload digest
- exact live rows used by the transformer

The manifest CLI rejects an envelope whose row counts or payload digest do not match its declared metadata.

Because V6 remains in daily use, any later source change creates a new snapshot header rather than mutating this one.
