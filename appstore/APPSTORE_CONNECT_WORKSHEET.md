# RUNLU Warehouse OS — App Store Connect Worksheet

Status: **internal worksheet only — owner has approved the V1 commercial model, but do not create irreversible App Store Connect records without a separate explicit release action**

## 1. New App record

Platform: `iOS`

Name candidate: `RUNLU Warehouse OS`

Primary language candidate: `English (U.S.)` or the closest preferred English locale in App Store Connect

Bundle ID candidate: `ca.runlu.warehouseos`

SKU candidate: `RUNLU-WAREHOUSE-IOS-001`

User Access candidate: `Full Access` unless the owner specifically wants to limit internal App Store Connect users.

### Irreversible / high-impact gate

Do not create the App Store Connect record until the owner explicitly approves the final Bundle ID and SKU for creation.

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

No remote review account is needed because reviewers/testers can create a local Company, Owner username/PIN, and Warehouse on first launch.

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

## 10. Pricing — OWNER APPROVED

Commercial model for V1:

- Auto-renewable monthly subscription
- Target Canadian price: **CAD $14.99 / month**
- Introductory offer: **14-day free trial**
- No free tier in V1
- No ads
- No annual plan in V1
- No separate enterprise tier in V1

Subscription group candidate: `RUNLU Warehouse OS`

Product reference name candidate: `Warehouse OS Monthly`

Product ID candidate: `ca.runlu.warehouseos.monthly`

Customer-facing plan name candidate: `Warehouse OS Monthly`

The actual storefront price must be selected from Apple’s current App Store Connect price points. The app UI must display StoreKit’s localized price/period rather than hard-coding `CAD $14.99` for every storefront.

The subscription is intended to fund continuing product maintenance, compatibility work, substantive workflow improvements, and future warehouse capabilities. V1 remains local-first: subscription entitlement does **not** imply RUNLU-hosted warehouse storage or cloud sync.

If a subscription lapses, customer warehouse data must never be deleted. The intended entitlement policy is to preserve safe read-only access plus backup/export and subscription-management access while paid operational editing is disabled until entitlement is restored.

Before launch, implement and test:

- StoreKit 2 product loading
- purchase flow
- current entitlement verification
- transaction update handling
- Restore Purchases / App Store sync
- subscription-management entry point
- trial and renewal disclosures
- expired / billing-retry / grace-period behavior
- cross-device entitlement restoration through the customer’s App Store account

See `SUBSCRIPTION_RELEASE_PLAN.md`.

Official references:

- https://developer.apple.com/app-store/review/guidelines/#subscriptions
- https://developer.apple.com/documentation/storekit

## 11. Submission sequence

Recommended order:

1. Finish technical RC and real-device smoke tests.
2. Owner approves Bundle ID + SKU creation.
3. Create App Store Connect record.
4. Create the subscription group/product with the approved commercial model and configure the 14-day introductory free trial.
5. Complete StoreKit 2 entitlement integration and local StoreKit testing, then sandbox/TestFlight subscription testing.
6. Complete App Privacy, Age Rating, Content Rights, and export-compliance questions.
7. Publish approved privacy/support pages.
8. Sign/archive the first uploadable build.
9. Upload to App Store Connect.
10. Internal TestFlight test first.
11. Fix any real-device or subscription findings; increment build number for another upload if needed.
12. Capture final screenshots from the approved clean build/demo workspace.
13. Owner approves final public metadata and storefront presentation.
14. If useful, external TestFlight / TestFlight App Review.
15. Select the final build for App Review.
16. Submit only after all required fields are green/complete.

## 12. Lessons carried forward from Universal Invoice

- Do not rush to create irreversible records before names/IDs are stable.
- Separate technical readiness from App Store submission readiness.
- Verify privacy claims against the actual final runtime, not merely design intent.
- Treat export compliance as its own gate when encryption is present.
- Use fictional review/screenshot data from the start.
- Keep public legal wording synchronized with shipped behavior.
- Run TestFlight before relying on App Review to discover device-specific problems.
- Keep one release checklist as the source of truth so later fixes do not quietly undo earlier safety decisions.
