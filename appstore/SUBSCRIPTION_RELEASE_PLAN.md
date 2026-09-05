# RUNLU Warehouse OS — Subscription Release Plan

Status: **commercial model approved by owner; App Store Connect objects not yet created**

## V1 commercial model

- Product: RUNLU Warehouse OS
- Audience: flooring / building-material businesses and warehouse teams
- Model: auto-renewable monthly subscription
- Target Canadian storefront price: **CAD $14.99 / month**
- Introductory offer: **14-day free trial**
- Free tier: none in V1
- Annual plan: none in V1
- Ads: none
- RUNLU-hosted warehouse cloud: none in V1

The price intentionally positions Warehouse OS as a professional business tool while remaining inexpensive relative to the operational value of inventory, carpet-roll, receiving, transfer, shipping, return, scan/OCR, role-control, and backup workflows.

## StoreKit / App Store Connect identifiers — candidates until created

- Subscription group: `RUNLU Warehouse OS`
- Product reference name: `Warehouse OS Monthly`
- Product ID: `ca.runlu.warehouseos.monthly`
- Customer-facing plan name: `Warehouse OS Monthly`
- Period: 1 month
- Intro offer: free trial, 14 days

Once created in App Store Connect, product IDs should be treated as permanent. Do not create them until the app record and final identifiers are confirmed.

## Customer-facing value proposition

Primary message:

> Professional warehouse operations for flooring teams — one simple monthly plan.

Supporting points:

- 14 days free, then the localized monthly App Store price
- cancel through Apple subscription management
- no ads
- local-first warehouse data
- encrypted customer-owned backups
- continuing compatibility, maintenance, and substantive workflow improvements

Do not claim cloud sync, multi-device warehouse-data sync, remote collaboration, or hosted storage in V1.

## Paywall requirements

The paywall must show StoreKit-provided localized pricing and trial eligibility rather than assuming every storefront uses CAD.

It should clearly present:

- plan name
- localized monthly price and billing period
- 14-day free trial only when StoreKit/App Store says the customer is eligible
- what access the subscription provides
- automatic renewal disclosure
- cancellation/management path
- Restore Purchases
- links to Privacy Policy and Terms/standard Apple terms as required for the final storefront configuration

Suggested headline:

`Run your flooring warehouse with confidence.`

Suggested body:

`Inventory, carpet rolls, receiving, transfers, shipping, returns, scanning, local roles, and encrypted backups in one professional warehouse workspace.`

Suggested CTA when eligible:

`Start 14-Day Free Trial`

Fallback CTA when not trial-eligible:

`Subscribe`

## Entitlement policy

Paid entitlement unlocks operational editing and transaction workflows.

A lapsed subscription must **never delete or silently alter customer warehouse data**. Intended post-expiry behavior:

- keep local data intact
- allow the customer to view existing records
- allow encrypted backup/export and local data deletion
- allow subscription restore/management
- disable new operational edits/transactions until entitlement becomes active again

This avoids trapping business data behind a renewal wall while preserving the value of the paid operational product.

## StoreKit 2 implementation requirements

Use StoreKit 2 in the native iOS layer and expose only the required entitlement state/actions to the Capacitor web runtime.

Required behaviors:

1. Load the subscription product by product ID.
2. Display StoreKit localized price/period.
3. Check current verified entitlements on launch and when returning to foreground.
4. Listen for transaction updates while the app is running.
5. Finish verified transactions after processing.
6. Provide purchase and restore/sync actions.
7. Handle subscribed, grace-period, billing-retry, expired, revoked/refunded, and verification-failure states conservatively.
8. Restore entitlement on another supported device signed into the same App Store account.
9. Keep subscription entitlement separate from warehouse-data synchronization; V1 data remains local-first.
10. Never grant paid access from a client-controlled localStorage flag alone.

## Testing path

Before real App Store submission:

- local StoreKit configuration for UI/state development
- Xcode StoreKit test cases for purchase, renewal, expiration, refund/revocation, and restore
- App Store sandbox purchase testing after product creation
- Internal TestFlight subscription testing
- real iPhone restore test
- iPad entitlement restore test
- offline reopen test with an already verified active entitlement
- expired entitlement read-only/data-preservation test

## App Review framing

The subscription supports ongoing value through continued maintenance, device/OS compatibility, substantive workflow improvements, and continuing development of the warehouse operating system. V1 is not sold as a hosted SaaS cloud; its continuing value is the maintained professional application and its evolving warehouse workflows.

The review notes should explicitly distinguish:

- **subscription entitlement**: restored through Apple/StoreKit
- **warehouse business data**: local to the customer device unless the customer explicitly exports a backup

## Release gate

Do not submit until all of the following are true:

- StoreKit subscription integration works in the final native build
- Restore Purchases works
- localized price/trial copy comes from StoreKit
- lapsed subscriptions preserve customer data
- App Privacy wording matches the actual subscription implementation
- legal/support URLs are live and approved
- screenshots do not imply features unavailable in V1
- App Store Connect pricing and introductory offer match this plan

