import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.10.0";

const EXPECTED_REPOSITORY = "nevergiveup980-ux/warehouse-ai";
const ALLOWED_WORKFLOW_REFS = new Map([
  [
    "refs/heads/warehouse-v7-foundation",
    [
      "/.github/workflows/warehouse-v7-real-snapshot-dryrun.yml@refs/heads/warehouse-v7-foundation",
      "/.github/workflows/warehouse-v7-order-shadow.yml@refs/heads/warehouse-v7-foundation",
    ],
  ],
  [
    "refs/heads/main",
    [
      "/.github/workflows/warehouse-v7-real-snapshot-dryrun.yml@refs/heads/main",
      "/.github/workflows/warehouse-v7-order-shadow.yml@refs/heads/main",
    ],
  ],
]);
const EXPECTED_AUDIENCE = "warehouse-v7-snapshot";
const WAREHOUSE_OWNER = "b360c5a0-1736-4e17-b82c-22ea720603c1";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

function deny(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return deny(405, "METHOD_NOT_ALLOWED");
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return deny(401, "GITHUB_OIDC_REQUIRED");

  try {
    const { payload } = await jwtVerify(auth.slice(7), JWKS, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: EXPECTED_AUDIENCE,
    });
    if (payload.repository !== EXPECTED_REPOSITORY) return deny(403, "REPOSITORY_DENIED");
    if (payload.actor !== "nevergiveup980-ux") return deny(403, "ACTOR_DENIED");
    const expectedWorkflowSuffixes = typeof payload.ref === "string"
      ? ALLOWED_WORKFLOW_REFS.get(payload.ref)
      : undefined;
    if (!expectedWorkflowSuffixes) return deny(403, "REF_DENIED");
    if (
      typeof payload.workflow_ref !== "string" ||
      !expectedWorkflowSuffixes.some((suffix) => payload.workflow_ref.endsWith(suffix))
    ) return deny(403, "WORKFLOW_DENIED");

    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return deny(500, "DB_URL_MISSING");

    const scope = new URL(req.url).searchParams.get("scope") || "core";
    if (!["core", "cut-shadow", "receive-shadow", "operation-shadow", "order-shadow"].includes(scope)) return deny(400, "SCOPE_DENIED");

    const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });
    try {


      if (scope === "order-shadow") {
        const result = await sql`
          with src as (
            select
              dataset_key,
              record_id,
              updated_at,
              payload,
              md5(dataset_key||':'||record_id||':'||payload::text) as source_row_md5,
              case
                when dataset_key='runlu_orders_v20' then jsonb_build_object(
                  'id',payload->>'id',
                  'type',payload->>'type',
                  'status',payload->>'status',
                  'unit',payload->>'unit',
                  'quantity',payload->>'quantity',
                  'location',payload->>'location',
                  'poNumber',payload->>'poNumber',
                  'soNumber',payload->>'soNumber',
                  'recoveryKey',payload->>'recoveryKey',
                  'customer',payload->>'customer',
                  'product',payload->>'product',
                  'date',payload->>'date',
                  'created',payload->>'created'
                )
                else jsonb_build_object(
                  'id',payload->>'id',
                  'po',payload->>'po',
                  'status',payload->>'status',
                  'unit',payload->>'unit',
                  'quantity',payload->>'quantity',
                  'location',payload->>'location',
                  'recoveryKey',payload->>'recoveryKey',
                  'customer',payload->>'customer',
                  'product',payload->>'product',
                  'supplier',payload->>'supplier',
                  'createdAt',payload->>'createdAt',
                  'updatedAt',payload->>'updatedAt',
                  'pickedUpAt',payload->>'pickedUpAt',
                  'receivedAt',payload->>'receivedAt'
                )
              end as shadow_payload
            from public.warehouse_records
            where user_id = ${WAREHOUSE_OWNER}::uuid
              and dataset_key in ('runlu_orders_v20','runlu_special_orders_v51')
              and deleted_at is null
          ), per_dataset as (
            select dataset_key,
                   count(*)::bigint live_rows,
                   min(updated_at) min_updated_at,
                   max(updated_at) max_updated_at,
                   md5(string_agg(source_row_md5,E'\\n' order by record_id)) content_md5
            from src group by dataset_key
          ), all_rows as (
            select count(*)::bigint live_rows,
                   md5(string_agg(source_row_md5,E'\\n' order by dataset_key,record_id)) snapshot_md5
            from src
          )
          select
            (select jsonb_agg(jsonb_build_object(
              'dataset_key',dataset_key,
              'record_id',record_id,
              'payload',shadow_payload,
              'updated_at',updated_at,
              'source_row_md5',source_row_md5
            ) order by updated_at,dataset_key,record_id) from src) rows,
            (select snapshot_md5 from all_rows) snapshot_md5,
            (select live_rows from all_rows) total_live_rows,
            (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
            now() exported_at
        `;
        const row = result[0];
        if (!row || !Array.isArray(row.rows)) return deny(500, "ORDER_SHADOW_QUERY_EMPTY");
        return ok({
          mode: "READ_ONLY_V6_ORDER_SHADOW",
          rows: row.rows,
          source_integrity: {
            algorithm: "postgres-jsonb-row-md5-chain-v1",
            snapshot_md5: row.snapshot_md5,
            total_live_rows: Number(row.total_live_rows),
            postgres_jsonb_text_verified: true,
            datasets: row.datasets,
            exported_at: row.exported_at,
          },
        });
      }

      if (scope === "operation-shadow") {
        const result = await sql`
          with src as (
            select
              dataset_key,
              record_id,
              updated_at,
              payload,
              md5(dataset_key||':'||record_id||':'||payload::text) as source_row_md5,
              jsonb_build_object(
                'id', payload->>'id',
                'type', payload->>'type',
                'status', payload->>'status',
                'unit', payload->>'unit',
                'quantity', payload->>'quantity',
                'location', payload->>'location',
                'toLocation', payload->>'toLocation',
                'productId', payload->>'productId',
                'inventoryRecordId', payload->>'inventoryRecordId',
                'roll', payload->>'roll',
                'returnedChildRoll', payload->>'returnedChildRoll',
                'inventoryMode', payload->>'inventoryMode',
                'supplier', payload->>'supplier',
                'po', payload->>'po',
                'impactApplied', payload->>'impactApplied',
                'impactResult', payload->>'impactResult',
                'itemCount', jsonb_array_length(coalesce(payload->'items','[]'::jsonb))
              ) as shadow_payload
            from public.warehouse_records
            where user_id = ${WAREHOUSE_OWNER}::uuid
              and dataset_key = 'runlu_operations_log_v52'
              and deleted_at is null
              and payload->>'type' in (
                'Inventory Transfer','Shipping','Customer Return',
                'Installer Return','Cut Piece Return','Return to Supplier'
              )
          ), per_dataset as (
            select dataset_key,
                   count(*)::bigint live_rows,
                   min(updated_at) min_updated_at,
                   max(updated_at) max_updated_at,
                   md5(string_agg(source_row_md5,E'\\n' order by record_id)) content_md5
            from src group by dataset_key
          ), all_rows as (
            select count(*)::bigint live_rows,
                   md5(string_agg(source_row_md5,E'\\n' order by dataset_key,record_id)) snapshot_md5
            from src
          )
          select
            (select jsonb_agg(jsonb_build_object(
              'dataset_key',dataset_key,
              'record_id',record_id,
              'payload',shadow_payload,
              'updated_at',updated_at,
              'source_row_md5',source_row_md5
            ) order by updated_at,record_id) from src) rows,
            (select snapshot_md5 from all_rows) snapshot_md5,
            (select live_rows from all_rows) total_live_rows,
            (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
            now() exported_at
        `;
        const row = result[0];
        if (!row || !Array.isArray(row.rows)) return deny(500, "OPERATION_SHADOW_QUERY_EMPTY");
        return ok({
          mode: "READ_ONLY_V6_OPERATION_SHADOW",
          rows: row.rows,
          source_integrity: {
            algorithm: "postgres-jsonb-row-md5-chain-v1",
            snapshot_md5: row.snapshot_md5,
            total_live_rows: Number(row.total_live_rows),
            postgres_jsonb_text_verified: true,
            datasets: row.datasets,
            exported_at: row.exported_at,
          },
        });
      }

      if (scope === "receive-shadow") {
        const result = await sql`
          with src as (
            select
              dataset_key,
              record_id,
              updated_at,
              payload,
              md5(dataset_key||':'||record_id||':'||payload::text) as source_row_md5,
              jsonb_build_object(
                'id', payload->>'id',
                'masterId', payload->>'masterId',
                'location', payload->>'location',
                'quantity', payload->>'quantity',
                'unit', payload->>'unit',
                'inventoryBefore', payload->>'inventoryBefore',
                'inventoryAfter', payload->>'inventoryAfter',
                'inventoryPosted', payload->>'inventoryPosted',
                'status', payload->>'status',
                'date', payload->>'date'
              ) as shadow_payload
            from public.warehouse_records
            where user_id = ${WAREHOUSE_OWNER}::uuid
              and dataset_key = 'runlu_receiving_v50'
              and deleted_at is null
          ), per_dataset as (
            select dataset_key,
                   count(*)::bigint live_rows,
                   min(updated_at) min_updated_at,
                   max(updated_at) max_updated_at,
                   md5(string_agg(source_row_md5,E'\\n' order by record_id)) content_md5
            from src group by dataset_key
          ), all_rows as (
            select count(*)::bigint live_rows,
                   md5(string_agg(source_row_md5,E'\\n' order by dataset_key,record_id)) snapshot_md5
            from src
          )
          select
            (select jsonb_agg(jsonb_build_object(
              'dataset_key',dataset_key,
              'record_id',record_id,
              'payload',shadow_payload,
              'updated_at',updated_at,
              'source_row_md5',source_row_md5
            ) order by updated_at,record_id) from src) rows,
            (select snapshot_md5 from all_rows) snapshot_md5,
            (select live_rows from all_rows) total_live_rows,
            (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
            now() exported_at
        `;
        const row = result[0];
        if (!row || !Array.isArray(row.rows)) return deny(500, "RECEIVE_SHADOW_QUERY_EMPTY");
        return ok({
          mode: "READ_ONLY_V6_RECEIVE_SHADOW",
          rows: row.rows,
          source_integrity: {
            algorithm: "postgres-jsonb-row-md5-chain-v1",
            snapshot_md5: row.snapshot_md5,
            total_live_rows: Number(row.total_live_rows),
            postgres_jsonb_text_verified: true,
            datasets: row.datasets,
            exported_at: row.exported_at,
          },
        });
      }

      if (scope === "cut-shadow") {
        const result = await sql`
          with src as (
            select
              dataset_key,
              record_id,
              updated_at,
              payload,
              md5(dataset_key||':'||record_id||':'||payload::text) as source_row_md5,
              jsonb_build_object(
                'id', payload->>'id',
                'operationId', payload->>'operationId',
                'carpetRecordId', payload->>'carpetRecordId',
                'roll', payload->>'roll',
                'beforeLength', payload->>'beforeLength',
                'requestedCutLength', payload->>'requestedCutLength',
                'plannedCutLength', payload->>'plannedCutLength',
                'actualCutLength', payload->>'actualCutLength',
                'cutLength', payload->>'cutLength',
                'allowanceInches', payload->>'allowanceInches',
                'remainingLength', payload->>'remainingLength',
                'fullRollConsumed', payload->>'fullRollConsumed',
                'numberOfCuts', payload->>'numberOfCuts',
                'date', payload->>'date',
                'time', payload->>'time'
              ) as shadow_payload
            from public.warehouse_records
            where user_id = ${WAREHOUSE_OWNER}::uuid
              and dataset_key = 'runlu_cutting_log_v52'
              and deleted_at is null
          ), per_dataset as (
            select dataset_key,
                   count(*)::bigint live_rows,
                   min(updated_at) min_updated_at,
                   max(updated_at) max_updated_at,
                   md5(string_agg(source_row_md5,E'\\n' order by record_id)) content_md5
            from src group by dataset_key
          ), all_rows as (
            select count(*)::bigint live_rows,
                   md5(string_agg(source_row_md5,E'\\n' order by dataset_key,record_id)) snapshot_md5
            from src
          )
          select
            (select jsonb_agg(jsonb_build_object(
              'dataset_key',dataset_key,
              'record_id',record_id,
              'payload',shadow_payload,
              'updated_at',updated_at,
              'source_row_md5',source_row_md5
            ) order by updated_at,record_id) from src) rows,
            (select snapshot_md5 from all_rows) snapshot_md5,
            (select live_rows from all_rows) total_live_rows,
            (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
            now() exported_at
        `;
        const row = result[0];
        if (!row || !Array.isArray(row.rows)) return deny(500, "CUT_SHADOW_QUERY_EMPTY");
        return ok({
          mode: "READ_ONLY_V6_CUT_SHADOW",
          rows: row.rows,
          source_integrity: {
            algorithm: "postgres-jsonb-row-md5-chain-v1",
            snapshot_md5: row.snapshot_md5,
            total_live_rows: Number(row.total_live_rows),
            postgres_jsonb_text_verified: true,
            datasets: row.datasets,
            exported_at: row.exported_at,
          },
        });
      }

      const result = await sql`
        with src as (
          select dataset_key, record_id, payload, updated_at,
                 md5(dataset_key||':'||record_id||':'||payload::text) as source_row_md5
          from public.warehouse_records
          where user_id = ${WAREHOUSE_OWNER}::uuid
            and dataset_key in ('runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52')
            and deleted_at is null
        ), per_dataset as (
          select dataset_key,count(*)::bigint live_rows,min(updated_at) min_updated_at,max(updated_at) max_updated_at,
                 md5(string_agg(source_row_md5,E'\\n' order by record_id)) content_md5
          from src group by dataset_key
        ), all_rows as (
          select count(*)::bigint live_rows,
                 md5(string_agg(source_row_md5,E'\\n' order by dataset_key,record_id)) snapshot_md5
          from src
        )
        select
          (select jsonb_agg(jsonb_build_object(
            'dataset_key',dataset_key,'record_id',record_id,'payload',payload,'updated_at',updated_at,'source_row_md5',source_row_md5
          ) order by dataset_key,record_id) from src) rows,
          (select snapshot_md5 from all_rows) snapshot_md5,
          (select live_rows from all_rows) total_live_rows,
          (select jsonb_agg(per_dataset order by dataset_key) from per_dataset) datasets,
          now() exported_at
      `;
      const row = result[0];
      if (!row || !Array.isArray(row.rows)) return deny(500, "SNAPSHOT_QUERY_EMPTY");
      return ok({
        mode: "READ_ONLY_V6_SNAPSHOT",
        rows: row.rows,
        source_integrity: {
          algorithm: "postgres-jsonb-row-md5-chain-v1",
          snapshot_md5: row.snapshot_md5,
          total_live_rows: Number(row.total_live_rows),
          postgres_jsonb_text_verified: true,
          datasets: row.datasets,
          exported_at: row.exported_at,
        },
      });
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch (_err) {
    return deny(401, "OIDC_VALIDATION_FAILED");
  }
});
