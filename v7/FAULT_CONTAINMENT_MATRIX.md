# V7 Fault Containment Matrix

| Fault | Scope stopped | Must continue |
|---|---|---|
| RC2291 stale CUT version | RC2291 command | other rolls, receiving, transfer, shipping |
| duplicate Save same UUID | none; return original result | all operations |
| different concurrent CUTs same roll | losing command only | winning command + unrelated work |
| Product orphan in migration | staging row | production modules |
| Inventory migration duplicate | staging group | production modules |
| Dashboard crash | dashboard projection | all warehouse writes |
| Map crash | map projection | all warehouse writes |
| IndexedDB quota/device failure | affected device offline queue | cloud + other devices |
| network loss | affected device | cloud + other devices |
| Supabase write outage | write commands | clearly marked stale/read-only views |
| invalid auth/tenant scope | affected session | other authorized sessions |

## Release gate
Every row above requires an automated test before V7 production cutover.
