# RUNLU Warehouse OS — App Store Connect Worksheet

Status: **internal worksheet only — do not create irreversible App Store Connect records from this file without owner approval**

## 1. New App record

Platform: `iOS`

Name candidate: `RUNLU Warehouse OS`

Primary language candidate: `English (U.S.)` or the closest preferred English locale in App Store Connect

Bundle ID candidate: `ca.runlu.warehouseos`

SKU candidate: `RUNLU-WAREHOUSE-IOS-001`

User Access candidate: `Full Access` unless the owner specifically wants to limit internal App Store Connect users.

### Irreversible / high-impact gate

Do not create the App Store Connect record until the owner explicitly approves the final Bundle ID and SKU.

Apple associates uploaded builds with the app record using bundle ID and version. After a build has been uploaded, changing the bundle ID requires creating a new app record. SKU values also should be treated as permanent internal identifiers.

Official references:

- https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/
- https://developer.apple.com/documentation/xcode/changing-the-bundle-identifier

## 2. Version identity

Marketing version: `1.0.0`

Initial build number: `1`

Current CI gate verifies:

- Display Name = `RUNLU Warehouse OS`
- Bundle ID = `ca.runlu.warehouseos`
- Marketing Version = `1.0.0`
- Build Number = `1`
- Target Device Family = iPhone + iPad

Each new uploaded binary must use a build number that is valid/unique for the upload sequence.

## 3. Product page metadata

App Name: `RUNLU Warehouse OS`

Subtitle candidate: `Warehouse OS for Flooring`

Promotional Text candidate:

`Flooring-ready warehouse operations with local accounts, barcode/OCR scanning, role controls, and encrypted customer-owned backups.`

Keywords candidate:

`flooring,warehouse,inventory,carpet,receiving,transfer,barcode,stock,building materials,PO`

Primary Category candidate: `Business`

Secondary Category candidate: `Productivity`

Marketing URL candidate: `https://runlu.ca/` or a future dedicated Warehouse OS page

Support URL draft target: `https://runlu.ca/warehouse-support.html`

Privacy Policy URL draft target: `https://runlu.ca/warehouse-privacy.html`

Privacy Choices / Data Removal URL optional target: `https://runlu.ca/warehouse-data-removal.html`

Do not publish the legal URLs until the owner approves the final public wording and the corresponding Runlu.ca branch is merged.

## 4. App Privacy candidate

Candidate answer, **only after final archive/network audit**:

`No, we do not collect data from this app.`

Reasoning and validation checklist are maintained in `APP_PRIVACY_DRAFT.md`.

## 5. Age Rating

Age Rating is required at the app level. Complete Apple’s current questionnaire from the actual shipped feature set.

Current V1 appears to contain no violence, sexual content, gambling, controlled substances, unrestricted web browsing, or user-generated public social content. Do not manually assume a rating; let App Store Connect calculate it from the completed questionnaire.

Official reference:

- https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions

## 6. Content Rights

Current V1 uses RUNLU-owned application content plus open-source/runtime dependencies. Confirm required open-source notices/licenses remain available where needed.

If screenshots/demo data are used, all company, product, supplier, PO, and operator examples must remain fictional or owned/authorized.

## 7. Encryption / Export Compliance

The app creates AES-GCM encrypted backups and uses PBKDF2 for key derivation. Complete Apple’s export-compliance questions before external TestFlight or App Review.

Do not pre-answer this by forcing an Info.plist value merely to avoid the questionnaire.

See `TESTFLIGHT_PREFLIGHT.md`.

## 8. TestFlight information

Beta App Description: prepared in `TESTFLIGHT_PREFLIGHT.md`

What to Test: prepared in `TESTFLIGHT_PREFLIGHT.md`

Feedback Email candidate: `hello@runlu.ca`

No remote test account is needed because reviewers/testers can create a local Company, Owner username/PIN, and Warehouse on first launch.

## 9. Screenshots

Planned English master set:

1. Dashboard
2. Flooring Inventory
3. Carpet Roll / Cut
4. Receiving / PO
5. Transfers
6. Barcode / OCR
7. Users / Roles
8. Encrypted Backup / Local-First

Use only clean fictional demo data. See `SCREENSHOT_CAPTURE_PLAN.md`.

Because the current native target supports both iPhone and iPad, prepare Apple-accepted screenshots for the supported iPhone display class and 13-inch iPad class as required by App Store Connect.

## 10. Pricing

**Not decided. Owner approval required.**

Do not create StoreKit subscriptions, paid pricing tiers, or pricing claims in screenshots/metadata until the owner chooses the commercial model.

## 11. Submission sequence

Recommended order:

1. Finish technical RC and real-device smoke tests.
2. Owner approves Bundle ID + SKU.
3. Create App Store Connect record.
4. Complete App Privacy, Age Rating, Content Rights, and export-compliance questions.
5. Publish approved privacy/support pages.
6. Sign/archive Build 1.
7. Upload to App Store Connect.
8. Internal TestFlight test first.
9. Fix any real-device findings; increment build number for another upload if needed.
10. Capture final screenshots from the approved clean build/demo workspace.
11. Owner approves final pricing and public metadata.
12. If useful, external TestFlight / TestFlight App Review.
13. Select the final build for App Review.
14. Submit only after all required fields are green/complete.

## 12. Lessons carried forward from Universal Invoice

- Do not rush to create irreversible records before names/IDs are stable.
- Separate technical readiness from App Store submission readiness.
- Verify privacy claims against the actual final runtime, not merely design intent.
- Treat export compliance as its own gate when encryption is present.
- Use fictional review/screenshot data from the start.
- Keep public legal wording synchronized with shipped behavior.
- Run TestFlight before relying on App Review to discover device-specific problems.
- Keep one release checklist as the source of truth so later fixes do not quietly undo earlier safety decisions.
