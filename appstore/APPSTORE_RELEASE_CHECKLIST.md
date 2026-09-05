# RUNLU Warehouse OS — App Store Release Checklist

Source baseline: `main` stable V6.12.21 / Build 114 (2026-09-03).

## Release identity
- App name: RUNLU Warehouse OS
- Bundle ID candidate: `ca.runlu.warehouseos`
- Version: 1.0.0
- iPhone/iPad app, portrait-first but responsive
- Build with Xcode 26+ and an iOS 26 SDK for App Store submission

## Packaging strategy
- Keep `main` production web deployment unchanged.
- Build the App Store binary from `appstore/warehouse-ios-v1`.
- Bundle the Warehouse OS web runtime inside the iOS app; do not make the first screen a remote website wrapper.
- Use Capacitor 8 stable, not Capacitor 9 prerelease.
- Preserve offline local storage and current Supabase synchronization behavior.
- Add native capability bridge for haptics, share, camera, and app metadata.

## P0 — must be complete before review
- [ ] Run on a physical iPhone and confirm cold launch, login, offline launch, background/foreground resume.
- [ ] Confirm Build 114 inventory, orders, receiving, transfer, sample checkout and supplier pickup flows.
- [ ] Add an in-app Privacy entry that opens the published Warehouse OS privacy policy.
- [ ] Because the app supports `Create App Login`, add a clear account-deletion initiation path in the app and a working backend/web deletion flow.
- [ ] Publish Privacy Policy URL and User Privacy Choices / deletion URL on `runlu.ca`.
- [ ] Complete App Privacy answers for account identifiers, business/warehouse records, camera/scan content, diagnostics/usage if collected, and third-party processors actually used.
- [ ] Add iOS permission strings for camera/photos/microphone only for capabilities actually requested by the binary.
- [ ] Prepare reviewer access: either a dedicated sanitized review account or an in-app demo mode. Never give production warehouse credentials.
- [ ] Remove or replace any customer/company-specific seed data that should not ship in the public app.
- [ ] Verify links, support email/site, Terms, privacy and deletion pages from inside the installed app.

## P1 — App Store product page
- [ ] App icon 1024×1024, no transparency.
- [ ] iPhone screenshots using current accepted device sizes; screenshots must not contain alpha/transparency.
- [ ] Name <= 30 characters; subtitle <= 30 characters.
- [ ] Description, keywords, support URL, marketing URL.
- [ ] Updated age-rating questionnaire.
- [ ] App Review contact phone in international format.
- [ ] Review notes explaining warehouse workflows, camera scanning, cloud sync, offline mode and review credentials/demo path.

## P1 — quality / native value
- [ ] Camera scan opens reliably from installed iOS app.
- [ ] Native haptic feedback does not interfere with warehouse workflow.
- [ ] Native Share path for exported labels/reports where useful.
- [ ] Printing/export paths are tested on iOS.
- [ ] Safe-area layout checked on modern iPhone models.
- [ ] No debug console, test credentials, API admin secrets or service-role keys in the bundle.

## Submission sequence
1. Build and test locally on iPhone.
2. Archive in Xcode.
3. Upload to App Store Connect / TestFlight.
4. Internal TestFlight smoke test.
5. Fill product-page metadata and App Privacy.
6. Attach build, reviewer access and review notes.
7. Submit for App Review.

## Current blockers identified from Build 114
1. There is no native iOS project in `main`; the App Store branch now contains the Capacitor packaging foundation.
2. The app exposes `Create App Login`, but no account-delete control was found in the Build 114 UI/code. This must be solved before review.
3. A public, app-specific privacy/deletion URL still needs to be published and linked in-app.
