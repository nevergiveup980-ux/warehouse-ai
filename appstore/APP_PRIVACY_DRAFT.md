# RUNLU Warehouse OS — App Privacy Draft

Status: **internal draft only — do not submit these answers until the final signed/archive build is audited**

## Candidate App Store Connect answer

**Candidate:** `No, we do not collect data from this app.`

This candidate is based on the current Flooring Edition architecture and must remain conditional on the final runtime/network audit.

Apple defines “collect” as transmitting data off the device in a way that lets the developer or a third-party partner access it for longer than is necessary to service a real-time request. Apple also states that data processed only on the device is not “collected” for the App Privacy label.

Official references:

- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy

## Current V1 data posture

### Warehouse operational data

Examples: products, inventory, quantities, carpet rolls/cuts, purchase orders, receiving, transfers, shipping, returns, samples, locations, notes, local audit history.

Current V1 behavior:

- stored locally in the customer workspace on the device;
- not uploaded to RUNLU-hosted warehouse storage;
- no production Supabase connection in the App Store build;
- no RUNLU cloud account required.

Candidate App Privacy treatment: **not collected by RUNLU**.

### Local users

Examples: local display name, username, optional reference email, role, salted PIN hash.

Current V1 behavior:

- stored locally on the customer device;
- PIN itself is not stored in plaintext;
- no RUNLU identity/account server is used.

Candidate App Privacy treatment: **not collected by RUNLU**.

### Camera / barcode / OCR

Current V1 behavior:

- camera access is user initiated;
- barcode/OCR processing is local in the App Store build;
- Tesseract worker/core/language assets are bundled locally;
- RUNLU Cloud Vision / AI gateway is disabled;
- private production Build107 gateway-restoration code is excluded from the public runtime.

Candidate App Privacy treatment: camera/scan content is **not collected by RUNLU** when it remains on-device.

### Voice input

Current V1 behavior:

- microphone access is user initiated;
- local warehouse voice input is retained;
- Cloud Voice AI gateway is disabled in the App Store build.

Candidate App Privacy treatment: voice/audio is **not collected by RUNLU** when processed only on-device and not retained by RUNLU.

### Encrypted backup

Current V1 behavior:

- Owner can create an encrypted backup;
- encryption occurs on the device before save/share;
- RUNLU does not automatically receive a copy;
- the user chooses the destination using the operating-system save/share flow;
- the backup password is not recoverable by RUNLU.

Candidate App Privacy treatment: **not collected by RUNLU**. A customer choosing iCloud Drive, Google Drive, OneDrive, email, AirDrop, or another destination is a user-directed transfer to that chosen destination, not automatic RUNLU collection.

## Third-party code audit

Current App Store build dependencies include Capacitor App, Camera, Haptics, Share, and locally bundled OCR components. V1 must not include analytics, advertising, tracking, or RUNLU cloud-sync SDK behavior.

Before submission, verify the final archive contains no SDK or runtime behavior that transmits identifiers, warehouse records, photos, audio, usage analytics, diagnostics, or other app data to RUNLU or a third-party partner accessible beyond a real-time request.

## Network endpoint gate

The public distribution build now has a dedicated sanitizer/gate intended to remove RUNLU-hosted warehouse/cloud/AI runtime endpoints, including:

- production Warehouse Supabase;
- RUNLU Cloudflare AI gateway;
- `warehouse.runlu.ca` as a default operational QR/cloud endpoint;
- placeholder cloud endpoints used only during isolation development.

The mature local scanner remains available without the private cloud-gateway recovery hotfix.

## Tracking

Current V1 design:

- no advertising SDK;
- no advertising identifier use;
- no cross-app/site tracking;
- no data broker sharing;
- no targeted advertising.

Candidate App Privacy treatment: **No tracking**.

## Support contact caveat

If the user voluntarily opens a support page or sends an email to RUNLU, the content they choose to send may reach RUNLU outside the automatic warehouse-data flow. Apple allows some infrequent, optional, clearly user-initiated support submissions to qualify for optional disclosure when all of Apple’s criteria are met.

Do not use this exception to hide automatic or recurring collection. If the app later adds in-app telemetry, automatic logs, cloud accounts, managed cloud sync, or server-side support uploads, reassess the privacy label immediately.

## Customer-owned cloud caveat

A future customer-configured cloud connector is **not part of V1**. If such a connector is later shipped, reassess App Privacy based on the actual architecture, especially whether RUNLU or a third-party partner can access the transmitted data.

## Final privacy gate before selecting “No data collected”

- [ ] final public web bundle has no production Supabase URL/key
- [ ] no RUNLU Cloudflare AI gateway runtime
- [ ] no default RUNLU warehouse cloud endpoint
- [ ] no Cloud AI / Cloud Vision control
- [ ] no analytics SDK
- [ ] no advertising SDK
- [ ] no tracking SDK
- [ ] no automatic crash/diagnostic upload controlled by RUNLU
- [ ] local camera/OCR verified without network
- [ ] local voice verified without RUNLU server
- [ ] encrypted backup verified as user-directed save/share only
- [ ] local account creation/sign-in verified without network
- [ ] app remains functional in airplane/offline mode for core warehouse workflows
- [ ] final signed/archive build inspected, not only source files
- [ ] Privacy Policy wording matches the actual final binary

Only after all boxes are verified should App Store Connect be answered with `No, we do not collect data from this app.`
