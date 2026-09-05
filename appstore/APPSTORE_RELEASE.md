# RUNLU Warehouse OS — App Store Release V1

Status: **technical release candidate in preparation**. This file is not evidence of App Store submission.

## Product identity

- App name: `RUNLU Warehouse OS`
- Version: `1.0.0`
- Bundle ID candidate: `ca.runlu.warehouseos`
- Primary market positioning: Flooring / Building Materials warehouse operations
- Default onboarding template: Flooring / Building Materials
- Secondary templates retained: General Warehouse, Empty / Custom
- Data posture: Local-first, customer-owned storage
- RUNLU-hosted warehouse cloud: Off in V1
- Cloud AI / Cloud Vision: Off in V1
- Built-in local OCR / barcode / warehouse voice: retained

## Customer setup and access

First launch:

1. Create Company
2. Create Local Owner account
3. Choose username and 4–8 digit PIN
4. Create first Warehouse
5. Enter Warehouse OS

Local roles:

- Owner — full control, encrypted backup, workspace administration
- Administrator — company / warehouse settings and local user administration
- Manager — product, order, and direct inventory management
- Staff — operational receiving, transfer, cut/pick, shipping, returns, and counts
- Viewer — read-only access

Local account credentials are not RUNLU web accounts. PINs are stored as salted PBKDF2-SHA256 hashes rather than plaintext.

## Flooring-specific product rule

There is **no universal 3-inch cutting allowance**.

- Default cut allowance: `Off / 0`
- Customer may configure its own allowance in Warehouse Settings.
- Distribution verification rejects the historical company-specific 3-inch wording/arithmetic.

## Backup and recovery

V1 includes encrypted customer-owned backup and restore:

- AES-GCM-256 encryption
- PBKDF2-SHA256 backup key derivation
- Owner-only full backup creation
- Backup is encrypted before save/share
- RUNLU does not automatically receive a copy
- Backup password is not recoverable by RUNLU
- Restore replaces the RUNLU local workspace only after user confirmation
- Restore clears the active session and requires fresh local sign-in

## Distribution safety gates

Public App Store bundle must reject:

- production Supabase URL/key
- RUNLU Cloud Master runtime/storage
- historical production PO literals and production seed data
- `carpet_seed.js`
- Build072 family
- Build088
- Build090
- Builds094–104
- Deerfoot / Central Training internal bridge labels
- old pricing hypothesis
- public cloud account creation
- Cloud AI / Cloud Vision controls
- company-specific 3-inch allowance behavior/text
- personal operator examples such as John / Tony

Automated local round-trip tests cover Owner/Manager/Staff roles, encrypted backup, restore, password rejection, and fresh sign-in after restore.

## Native iOS gate

Required before release:

- Xcode 26+ / iOS 26 SDK or later
- Capacitor iOS project generation succeeds
- camera and microphone usage descriptions present
- unsigned iOS Simulator compilation succeeds
- native camera bridge and haptics compile

Actual Apple signing, archive, TestFlight upload, and App Store submission remain separate release steps.

## App Store review positioning

Suggested review-note summary:

> RUNLU Warehouse OS is a local-first operational warehouse application designed primarily for flooring and building-material businesses. The app supports inventory, receiving, transfers, carpet roll/cut workflows, shipping, returns, purchase orders, samples, warehouse locations, barcode/OCR scanning, local voice input, history/audit, role-based local users, and encrypted backup/restore. V1 does not require a RUNLU cloud account and does not connect to RUNLU-hosted warehouse storage. Customer operational data remains on the device unless the customer explicitly exports an encrypted backup through the operating system share/save flow.

Reviewer flow:

1. Launch app.
2. Create a sample Company, Owner username/PIN, and Warehouse.
3. Flooring / Building Materials is selected by default.
4. Enter the warehouse workspace.
5. Exercise inventory/receiving/transfer/cut/order workflows.
6. Use Settings to confirm cut allowance defaults to Off / 0.
7. Use Users to create role-limited local users.
8. Use Backup as Owner to create an encrypted backup.
9. Sign Out and verify local sign-in.

No review account needs to be supplied because V1 has no remote account dependency. Apple reviewers can create a temporary local workspace directly in the app.

## Public URLs — draft, not yet approved/live

Prepared on the separate Runlu.ca branch `appstore/warehouse-local-first-pages`:

- `https://runlu.ca/warehouse-privacy.html`
- `https://runlu.ca/warehouse-support.html`
- `https://runlu.ca/warehouse-data-removal.html`

These pages must **not** be treated as live until the website branch is approved and merged.

## Metadata draft

App name: `RUNLU Warehouse OS`

Subtitle candidate: `Warehouse OS for Flooring`

Promotional line candidate:

> Flooring-ready warehouse operations with local accounts, scanning, role controls, and encrypted customer-owned backups.

Description themes:

- flooring-ready inventory and carpet workflows
- receiving, transfers, shipping, returns, POs and samples
- customer-configurable cut allowance
- local Owner / Admin / Manager / Staff / Viewer accounts
- encrypted backup and restore
- local-first, customer-owned warehouse data
- no RUNLU warehouse cloud required

## Decisions still requiring owner approval

- App Store pricing / free-vs-paid model
- final subtitle and public marketing copy
- final privacy/support/data-removal wording before publishing to runlu.ca
- final app icon and screenshots
- irreversible App Store Connect bundle/app record choices if not already created
- Apple signing / archive / TestFlight / submission

## Final manual device checklist

Before submission on a real iPhone/iPad:

- [ ] Clean install → onboarding
- [ ] Flooring template default selected
- [ ] Cut allowance defaults Off / 0
- [ ] Owner creation and sign-in
- [ ] Admin / Manager / Staff / Viewer permission checks
- [ ] Inventory create/edit/read
- [ ] Receiving posts inventory correctly
- [ ] Transfer flow
- [ ] Carpet roll/cut flow with allowance 0
- [ ] Carpet cut flow with a non-zero customer-configured allowance
- [ ] Shipping / returns / PO / samples
- [ ] Barcode/OCR camera permission and scan
- [ ] Local voice / microphone permission
- [ ] Offline app reopen and persistence
- [ ] Encrypted backup export/save/share
- [ ] Wrong backup password rejected
- [ ] Restore on clean local state
- [ ] Restored local user can sign in
- [ ] Sign Out / Sign In
- [ ] No Cloud AI / Cloud Vision UI
- [ ] No RUNLU cloud login/sync UI
- [ ] No private company names, historical PO examples, personal operator defaults, or production data
