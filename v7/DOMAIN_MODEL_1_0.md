# V7 Domain Model 1.0

## Aggregate ownership
| Aggregate | Owns | May reference | Must not own |
|---|---|---|---|
| Product | stable product identity/spec | supplier | stock balance, history |
| Order | customer/job demand + line lifecycle | product | physical stock |
| Receipt | PO receipt fact | product/order | global inventory snapshot |
| Stock Item | non-carpet stock identity | product/location | product specification |
| Carpet Roll | physical roll identity + remaining measure + FULL/CAL/TM | product/location | cutting history |
| Transfer | movement intent/result | stock/roll/location | entity master data |
| Shipment | outbound intent/result | order/stock/roll | historical rewrites |
| Return | compensating inbound fact | shipment/product/roll | deletion of shipment |
| Remnant | reusable physical remainder identity | source roll/product/location | source history |
| Sample | sample custody/state | product/location | saleable stock balance |
| Task | operational work item | any entity | authoritative inventory |
| Event | immutable audit fact | command/entity | mutable business state |
| Projection | read model only | events/entities | authoritative writes |

## Stable identities
Every aggregate has UUID primary identity. Human identifiers (roll number, PO, SKU, task number) are alternate business keys, never database identity.

## Command ownership
RECEIVE -> Receipt
PUT_AWAY -> Stock Item / Carpet Roll
CUT -> Carpet Roll (+ optional Remnant)
TRANSFER -> Stock Item or Carpet Roll
SHIP -> Shipment + movements
RETURN -> Return + compensating movements
ADJUST -> narrowly scoped inventory entity with reason and authorization

## State rules
- Product retirement never destroys historical references.
- Carpet Roll remaining measurement is changed only by server commands.
- Inventory quantity is derived from immutable movements plus validated projections.
- History cannot edit operational entities.
- Dashboard/Map/Voice/Scan invoke commands; they never bypass command handlers.
- Migration staging cannot directly become production state without validation/import command.

## Unit model
Carpet linear measure is stored as integer sixteenths-of-an-inch (1/16 in) to avoid floating point loss while preserving future fractional measurements. UI converts feet/inches/fractions at boundaries.
Non-carpet quantity uses decimal quantity + explicit unit code. `Product.base_unit` is the canonical physical stock-counting unit; `Product.coverage_unit` is separate display/coverage metadata and never authorizes quantity conversion. Conversions require a registered conversion rule. No implicit BOX/ROLL/EACH/PAIL/SY/GAL conversion.

## Location model
Warehouse locations are stable entities, not free-text labels. Historical labels may be retained as provenance. Moves require from/to location identities where applicable.

## Boundary rule
No aggregate may directly rewrite another aggregate's tables from browser code. Cross-aggregate effects occur only inside an explicit server transaction/command handler and emit events.
