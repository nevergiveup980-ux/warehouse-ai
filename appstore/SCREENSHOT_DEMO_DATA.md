# RUNLU Warehouse OS — Safe App Store Demo Data

Status: **fictional screenshot/reviewer fixture only**

This data is intentionally generic and must never be replaced with production warehouse records when preparing App Store screenshots.

## Workspace

- Company: `Northstar Flooring Supply`
- Warehouse: `Main Warehouse`
- Warehouse code: `MAIN`
- Template: `Flooring / Building Materials`
- Currency: `CAD`
- Cut allowance at clean install: `Off / 0`

## Local users

Use role labels as display names; do not use real employee names.

- `Warehouse Owner` — Owner
- `Warehouse Admin` — Administrator
- `Warehouse Manager` — Manager
- `Warehouse Staff` — Staff
- `Read Only` — Viewer

## Locations

- `A01` — Carpet Rolls
- `A02` — Carpet Rolls
- `B01` — Boxed Flooring
- `B02` — Boxed Flooring
- `C01` — Underlayment
- `D01` — Adhesive / Sundries

## Products

### Carpet

1. Collection: `Coastal Loop`
   - Colour: `Blue Grey`
   - SKU: `CARP-COAST-BG`
   - Unit: `FT`
   - Location: `A01`
   - Roll: `R-1001`
   - Length: `118 ft 6 in`

2. Collection: `Harbour Texture`
   - Colour: `Sand`
   - SKU: `CARP-HARB-SD`
   - Unit: `FT`
   - Location: `A02`
   - Roll: `R-1002`
   - Length: `94 ft 0 in`

### Boxed flooring

3. Product: `Summit SPC Plank`
   - Colour: `Natural Oak`
   - SKU: `SPC-SUMMIT-NO`
   - Unit: `CARTON`
   - Location: `B01`
   - Quantity: `42`

4. Product: `Riverbend Laminate`
   - Colour: `Warm Walnut`
   - SKU: `LAM-RIVER-WW`
   - Unit: `CARTON`
   - Location: `B02`
   - Quantity: `28`

### Underlayment

5. Product: `QuietStep Underlayment`
   - SKU: `UND-QUIETSTEP`
   - Unit: `ROLL`
   - Location: `C01`
   - Quantity: `18`

### Adhesive

6. Product: `ProBond Flooring Adhesive`
   - SKU: `ADH-PROBOND`
   - Unit: `PAIL`
   - Location: `D01`
   - Quantity: `9`

## Purchase orders

### PO-DEMO-001

Supplier: `Sample Surface Supply`

- Summit SPC Plank / Natural Oak — 16 cartons — Received
- QuietStep Underlayment — 8 rolls — Received
- ProBond Flooring Adhesive — 4 pails — Pending

### PO-DEMO-002

Supplier: `Demo Flooring Distribution`

- Coastal Loop / Blue Grey — 1 roll — Pending
- Riverbend Laminate / Warm Walnut — 12 cartons — Pending

## Transfer example

Transfer ID: `TR-DEMO-001`

- Product: Summit SPC Plank / Natural Oak
- Quantity: 6 cartons
- From: `B01`
- To: `B02`
- Status: Completed

## Carpet cut example

Use `Coastal Loop / Blue Grey / R-1001`.

Clean-state screenshot:

- Requested cut: `12 ft 0 in`
- Cut allowance: `Off / 0`

Optional configurable-rule screenshot only:

- Organization changes cut allowance to `2 inches`
- Requested cut: `12 ft 0 in`
- UI must clearly present 2 inches as a customer-configured warehouse setting, not an industry standard.

## Return example

Return ID: `RET-DEMO-001`

- Product: Riverbend Laminate / Warm Walnut
- Quantity: 2 cartons
- Return destination: `B02`
- Status: Returned to Inventory

## Sample / small-item example

Sample ID: `SAMPLE-DEMO-001`

- Product: Summit SPC Plank / Natural Oak
- Location: `Sample Rack 01`
- Status: Available

## Screenshot safety rules

- No production company names
- No real customer names
- No real supplier names
- No historical production PO numbers
- No personal operator names
- No production quantities
- No RUNLU production Supabase credentials
- No Cloud AI / Cloud Vision controls
- No old pricing hypothesis
- No 3-inch default wording or behavior
