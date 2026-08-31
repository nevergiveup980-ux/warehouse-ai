# Universal V1 Productization Checklist

## Phase 0 — Production isolation ✅

- [x] Identify stable source baseline: V6.12.16 Build109
- [x] Freeze source commit: `5d588592391553399ee2e5c80af297432d0de47c`
- [x] Create isolated branch: `product/universal-v1`
- [x] Keep production `main`, production `index.html`, production Supabase schema, CNAME and deployment untouched

## Phase 1 — Tenant compatibility foundation 🚧

- [x] Define organization/company entity
- [x] Define organization membership and roles
- [x] Define warehouse entity
- [x] Define tenant-scoped compatibility dataset
- [x] Define append-only audit event foundation
- [x] Centralize product/company/warehouse runtime defaults
- [x] Preserve legacy dataset key map
- [ ] Implement tenant-aware cloud adapter in Universal app copy
- [ ] Implement tenant-aware local cache adapter in Universal app copy
- [ ] Add active company / active warehouse switcher

## Phase 2 — Configuration instead of company-specific assumptions

- [ ] Company name and logo
- [ ] Website / support email
- [ ] Currency / locale / timezone
- [ ] Warehouse names and codes
- [ ] Warehouse address
- [ ] Rack / bin / floor location map
- [ ] Product categories
- [ ] Units of measure
- [ ] Low-stock thresholds by category/product
- [ ] Cut allowance rules by category/template
- [ ] QR/tag destination URL
- [ ] Remove hard-coded administrator identity from Universal app

## Phase 3 — Team access

- [ ] Owner
- [ ] Administrator
- [ ] Manager
- [ ] Member
- [ ] Viewer
- [ ] Invite flow
- [ ] Suspend/remove flow
- [ ] Permission matrix by operational action
- [ ] Audit all destructive or stock-changing actions

## Phase 4 — General warehouse template

- [ ] New-company onboarding wizard
- [ ] General Warehouse template
- [ ] Empty Warehouse template
- [ ] Flooring template derived from the proven production behavior
- [ ] Template settings can be changed after setup

## Phase 5 — Mature workflow regression

Every Universal build must be checked against the production baseline for:

- [ ] Product master create/edit
- [ ] Inventory receive/increase
- [ ] Inventory issue/decrease
- [ ] Customer order lifecycle
- [ ] Special order lifecycle
- [ ] Receiving lifecycle
- [ ] Transfer / operation lifecycle
- [ ] Carpet full roll / CAL / TM behavior
- [ ] Carpet cut and allowance behavior
- [ ] Remnant behavior
- [ ] Returns to inventory
- [ ] Barcode / QR workflow
- [ ] Label printing
- [ ] Warehouse map
- [ ] Cycle count
- [ ] Backup/restore
- [ ] Multi-device conflict protection

## Phase 6 — SaaS readiness

- [ ] Separate development Supabase environment
- [ ] Separate staging deployment/domain
- [ ] Tenant isolation tests
- [ ] Data export / account deletion
- [ ] Privacy policy data map
- [ ] Terms / support path
- [ ] Usage limits enforced server-side
- [ ] 14-day trial state
- [ ] Subscription entitlement state
- [ ] US$29.99 monthly product
- [ ] US$299.99 annual product

## Phase 7 — Apple distribution

- [ ] iOS wrapper/native shell decision
- [ ] App icon and launch assets
- [ ] Camera / barcode permissions
- [ ] Notification permissions only if used
- [ ] Sign-in flow
- [ ] StoreKit subscription integration
- [ ] Restore purchases
- [ ] Subscription management link
- [ ] TestFlight internal test
- [ ] TestFlight external pilot warehouses
- [ ] App Store screenshots and metadata
- [ ] App Review notes / demo account

## Non-negotiable guardrail

No Universal V1 development commit is merged into production `main` merely because it compiles or looks correct. Promotion requires a deliberate regression review against the stable production behavior.
