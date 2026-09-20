# Cloud Carpet Record Contract V2

Engineering contract only. Production remains unchanged until a separate cutover is explicitly approved.

## Identity

- `physicalInstanceId` is the immutable machine identity for one physical carpet roll.
- For future V2 cloud records, `warehouse_records.record_id` must equal `physicalInstanceId`.
- `payload.roll` is the warehouse-facing company roll number and is normalized as trim + uppercase.
- An ordinary company roll number may map to one active physical instance.
- `CHC022` and `CHC023` are explicit legacy shared-number exceptions and may map to multiple active physical instances.

## Non-identity fields

- `manufacturerRoll` is reference-only. It never participates in uniqueness, deduplication, or mutation routing.
- `sourceRoll` is lineage/reference-only. It never participates in uniqueness or deduplication.
- Product, colour, location, remaining length, and FULL/CAL/TM are attributes/state, not physical identity.

## Mutation behavior

- Updating length, location, measure status, or other state for the same physical instance updates the existing record.
- Creating a second active physical instance with an ordinary company roll number is blocked.
- Creating another CHC022/CHC023 physical instance is allowed when it has its own physicalInstanceId.
- Changing a physicalInstanceId is blocked.
- Changing the company roll number of an existing physical instance is sent to review rather than silently accepted.

## Legacy transition

Legacy `payload.id` is migration evidence only. Repeated cloud rows sharing the same legacy `payload.id` are collapsed during rehearsal. A legacy alias that points to more than one company roll number is quarantined for review. No production rewrite is performed by this contract or its audit tooling.
