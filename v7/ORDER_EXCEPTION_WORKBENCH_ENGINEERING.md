# RUNLU Warehouse V7 — Order Exception Workbench Engineering Activation

This workbench is ready to connect, but it must not be deployed onto the current production Supabase project.

## Safety boundary

Production Supabase project ref:

`ekrnknlawekeoszzkamd`

The engineering Edge API hard-rejects this project ref with `PRODUCTION_PROJECT_FORBIDDEN`.

The connected workbench must run on a separate Supabase development branch/project. Production V6 remains read-only for migration/shadow evidence and production V7 business writes remain disabled.

## Engineering database install order

Apply these files to the isolated V7 engineering database:

1. `v7/schema-2.0.sql`
2. `v7/command-engine-1.0.sql`
3. `v7/ledger-guards-1.0.sql`
4. `v7/tenant-rls-1.0.sql`
5. `v7/command-auth-1.0.sql`
6. `v7/order-engine-1.0.sql`
7. `v7/order-rls-1.0.sql`
8. `v7/order-exception-workbench-1.0.sql`

Then seed only sanitized V6 order evidence into the engineering database. The existing rehearsal proves the expected current shape is 55 source-evidence rows, 3 canonical auto-imported orders, and 12 unresolved exception cases.

## Edge API

Source:

`v7/order-exception-api-edge.ts`

Planned function name:

`warehouse-v7-order-exception-api`

The function authenticates the caller with Supabase Auth, sets the database request user claim, and calls only the V7 workbench functions. It contains no service-role/secret key.

Use `verify_jwt=false` when deploying this engineering function because the function validates the user's access token itself with `auth.getUser()`, allowing the modern Supabase publishable-key model.

## Browser connection

The standalone shell loads:

`v7/order-exception-api-client.js`

The host application supplies runtime configuration; no token or key is stored in source:

```js
window.RUNLU_V7_WORKBENCH_CONFIG = {
  endpoint: 'https://<engineering-ref>.supabase.co/functions/v1/warehouse-v7-order-exception-api',
  tenantId: '<engineering-tenant-uuid>',
  getAccessToken: async () => {
    // Return the already-authenticated engineering user's current access token.
  }
}
```

Then open:

`v7/order-exception-workbench.html`

For a zero-write visual preview, use `?demo=1`. Demo mode cannot resolve cases.

## Retry contract

The UI creates one command UUID for a resolution attempt and preserves it across uncertain network retries. If the API returns an explicit rejected command, the UI discards that UUID so a corrected attempt can use a new command.

This preserves V7 command idempotency and avoids duplicate canonical orders after a lost HTTP response.

## Activation gate

A real connected engineering deployment is allowed only after:

- Supabase development branch/project exists and is not the production project ref.
- Order schema/RLS/workbench migrations pass there.
- Sanitized order evidence seeds successfully.
- Exactly 12 current exception cases appear for the verified snapshot.
- Authenticated Owner/Admin can resolve a disposable test case.
- Operator cannot resolve.
- Cross-tenant reads remain blocked.
- Resolution creates zero inventory movements.
- Same command UUID retry returns the same result.

Creating a new Supabase development branch can have a platform cost. Cost confirmation is required before that branch is created.
