# RUNLU Warehouse OS — App Store Screenshot Capture Plan

Status: **internal capture plan — screenshots not yet produced or uploaded**

## Goal

Show a real, usable Flooring / Building Materials warehouse system rather than a generic website wrapper. Screens should emphasize operational depth, local-first control, and flooring-specific workflows without exposing private production data.

## Apple screenshot constraints

- 1–10 screenshots per supported device size
- JPEG/JPG/PNG
- no alpha / transparency
- If iPhone screenshots are supplied for the current 6.9-inch display class, Apple can scale them for smaller iPhone classes where applicable.
- If the app runs on iPad, 13-inch iPad screenshots are required.

Preferred master capture targets:

- iPhone 6.9-inch portrait: use an Apple-accepted 6.9-inch native screenshot size from the simulator/device
- iPad 13-inch portrait or landscape: use an Apple-accepted 13-inch native screenshot size

Do not resize screenshots by eye. Capture from the matching simulator/device and verify exact pixel dimensions before upload.

## Safe demo workspace

Create a clean App Store-only sample company. Do not use the production warehouse database or historic company records.

Suggested sample identity:

- Company: `Northstar Flooring Supply`
- Warehouse: `Main Warehouse`
- Users: generic roles only — Owner, Manager, Staff, Viewer
- Products: fictional flooring / carpet / underlayment / adhesive items
- POs: short fictional identifiers such as `PO-DEMO-001`
- Locations: generic `A01`, `A02`, `B01`, `B02`

Avoid real customer names, private supplier records, historical POs, personal operator names, Deerfoot references, or production quantities.

## Recommended iPhone sequence

### 1. Warehouse Dashboard

Capture the main dashboard after the sample workspace contains enough clean demo data to look realistic.

Marketing message candidate: `Your Flooring Warehouse, Organized`

Show:

- products / inventory / locations / today's work
- RUNLU family visual identity
- no cloud-login or Cloud AI controls

### 2. Inventory + Flooring Products

Capture inventory with a mix of carpet rolls, boxed flooring, underlayment, and adhesive.

Marketing message candidate: `Flooring Inventory in One Place`

Show:

- product
- quantity
- unit
- location
- clear flooring-specific usefulness

### 3. Carpet Roll / Cut Workflow

Capture a carpet roll/cut workflow using a fictional product.

Marketing message candidate: `Cut Rules That Match Your Business`

Important:

- cut allowance must visibly default to Off / 0 in a clean workspace
- if demonstrating allowance, use a clearly customer-configured value and label it as configurable
- never imply 3 inches is an industry default

### 4. Receiving / Purchase Orders

Capture PO receiving with fictional records.

Marketing message candidate: `Receive Stock Without the Paper Chase`

Show:

- PO
- item lines
- received / pending status
- inventory linkage

### 5. Transfers / Warehouse Movement

Capture warehouse transfer or movement workflow.

Marketing message candidate: `Move Material With a Clear Trail`

Show:

- From Location
- To Location
- product / quantity
- status / history

### 6. Barcode / OCR Scan

Capture the real local scanning interface.

Marketing message candidate: `Scan. Confirm. Keep Moving.`

Show:

- camera/scan entry point
- barcode or local OCR result
- no Cloud Vision / AI-provider wording

### 7. Local Users + Roles

Capture local user management.

Marketing message candidate: `Right Access for Every Role`

Show:

- Owner
- Administrator
- Manager
- Staff
- Viewer

Do not show real emails or personal names.

### 8. Encrypted Backup / Local-First Control

Capture the backup screen or Settings area that explains local-first storage.

Marketing message candidate: `Your Warehouse. Your Data.`

Show:

- encrypted backup
- save/share choice
- customer-owned storage concept
- no RUNLU-hosted cloud dependency

## iPad sequence

Use the same core story, but favor landscape views where the warehouse table/map layout benefits from width.

Priority iPad captures:

1. Dashboard
2. Inventory table
3. Carpet roll/cut workspace
4. Receiving / PO
5. Warehouse map / locations
6. Transfer/history
7. Users / permissions
8. Backup / Settings

## Visual treatment

- Underlying screen must be the real App Store build.
- Light marketing headline overlays are acceptable only after clean source screenshots exist.
- Keep overlays simple and consistent with RUNLU blue family identity.
- Do not add fake reviews, customer counts, awards, ratings, or fabricated usage statistics.
- Do not show unreleased cloud features.
- Do not show prices until the pricing model is approved.

## Capture gate

Before any screenshot is considered final:

- [ ] App Store branch build is green
- [ ] sample workspace contains only fictional demo data
- [ ] shared Universal Invoice / RUNLU family icon is correct
- [ ] no production Supabase connection
- [ ] no Cloud AI / Cloud Vision UI
- [ ] no company-specific 3-inch default
- [ ] no real customer / supplier / operator / PO data
- [ ] screenshot has no alpha channel
- [ ] exact Apple-accepted pixel size verified
- [ ] status bar / device state looks clean
- [ ] English screenshots complete first

Localization overlays can be prepared later for Chinese, French, and Spanish after the English capture set is approved.
