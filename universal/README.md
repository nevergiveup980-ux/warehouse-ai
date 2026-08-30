# RUNLU Warehouse OS — Universal V1

This directory is the isolated productization workspace for the general-market version of RUNLU Warehouse OS.

## Production protection

- Production branch: `main`
- Frozen source baseline: `5d588592391553399ee2e5c80af297432d0de47c`
- Baseline release: `V6.12.16 Build109`
- Productization branch: `product/universal-v1`
- Production site and current production files are not to be modified from this workspace.
- Nothing in `universal/` is part of the production deployment unless it is deliberately reviewed and promoted later.

## Product direction

Universal V1 keeps the proven warehouse workflow, but removes company-specific assumptions and introduces tenant-aware configuration.

Target flow:

`Company -> Warehouse -> Location -> Product -> Inventory / Operations`

Core V1 modules:

1. Inventory
2. Receiving
3. Transfer
4. Cut / Pick
5. Shipping
6. Returns
7. PO / Orders
8. History / Audit

Supporting capabilities:

- Barcode / QR scanning
- Today command center
- Low-stock alerts
- Warehouse map
- Multi-device sync
- Team access and roles
- Company branding and configurable units/categories

## First architectural changes

The current production application is intentionally optimized around a single operator/account. Universal V1 introduces:

- `organizations` for company/tenant isolation
- `organization_members` for team membership and roles
- `warehouses` for one or more warehouses per company
- `tenant_datasets` as a compatibility layer for the existing dataset-based application
- configuration instead of hard-coded RUNLU/company values
- role-based authorization instead of a hard-coded administrator email

The compatibility layer is deliberate: V1 should preserve the mature operational behavior before progressively normalizing individual domains into dedicated relational tables.

## Migration principle

**Do not rewrite a mature workflow merely to make the architecture look cleaner.**

The sequence is:

1. Isolate tenant/company identity.
2. Make warehouse identity explicit.
3. Preserve existing datasets and behavior behind a tenant-aware adapter.
4. Make branding, thresholds, units, categories, and workflow options configurable.
5. Validate every mature workflow against the production baseline.
6. Only then normalize high-value domains where it improves concurrency, auditability, or reporting.

## V1 release guardrails

Universal V1 is not allowed to change production `main` during development. Before any future production promotion, it must pass:

- receiving regression
- inventory increase/decrease regression
- carpet roll/cut allowance regression
- transfer lifecycle regression
- shipping regression
- returns regression
- PO/order lifecycle regression
- barcode/QR regression
- warehouse map regression
- multi-device conflict regression
- role/tenant isolation tests

## Commercial target

Initial product hypothesis:

- 14-day free trial
- US$29.99/month
- US$299.99/year
- initial allowance: 1 warehouse / up to 5 users

Pricing and App Store configuration remain product settings, not hard-coded operational logic.
