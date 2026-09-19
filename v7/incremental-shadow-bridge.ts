import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.7";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.10.0";

const EXPECTED_REPOSITORY = "nevergiveup980-ux/warehouse-ai";
const ALLOWED_WORKFLOW_REFS = new Map([
  [
    "refs/heads/warehouse-v7-foundation",
    "/.github/workflows/warehouse-v7-incremental-shadow.yml@refs/heads/warehouse-v7-foundation",
  ],
  [
    "refs/heads/main",
    "/.github/workflows/warehouse-v7-incremental-shadow.yml@refs/heads/main",
  ],
]);
const EXPECTED_AUDIENCE = "warehouse-v7-incremental-shadow";
const WAREHOUSE_OWNER = "b360c5a0-1736-4e17-b82c-22ea720603c1";
const JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

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

async function authenticate(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("GITHUB_OIDC_REQUIRED");

  const { payload } = await jwtVerify(auth.slice(7), JWKS, {
    issuer: "https://token.actions.githubusercontent.com",
    audience: EXPECTED_AUDIENCE,
  });

  if (payload.repository !== EXPECTED_REPOSITORY) throw new Error("REPOSITORY_DENIED");
  if (payload.actor !== "nevergiveup980-ux") throw new Error("ACTOR_DENIED");
  const expectedWorkflowSuffix = typeof payload.ref === "string"
    ? ALLOWED_WORKFLOW_REFS.get(payload.ref)
    : undefined;
  if (!expectedWorkflowSuffix) throw new Error("REF_DENIED");
  if (
    typeof payload.workflow_ref !== "string" ||
    !payload.workflow_ref.endsWith(expectedWorkflowSuffix)
  ) throw new Error("WORKFLOW_DENIED");
}

function feedAfterWatermark(sql: any, limit: number) {
  return sql`
    select
      r.dataset_key,
      r.record_id,
      r.updated_at,
      r.updated_at::text as updated_at_text,
      r.payload,
      md5(r.dataset_key||':'||r.record_id||':'||r.payload::text) as source_row_md5
    from public.warehouse_records r
    cross join warehouse_v7_shadow.watermark w
    where w.feed_key='warehouse-live'
      and r.user_id=${WAREHOUSE_OWNER}::uuid
      and r.deleted_at is null
      and (
        r.dataset_key in ('runlu_receiving_v50','runlu_cutting_log_v52','runlu_orders_v20','runlu_special_orders_v51')
        or (
          r.dataset_key='runlu_operations_log_v52'
          and r.payload->>'type' in (
            'Inventory Transfer','Shipping','Customer Return',
            'Installer Return','Cut Piece Return','Return to Supplier'
          )
        )
      )
      and (r.updated_at,r.dataset_key,r.record_id) >
          (w.committed_updated_at,w.committed_dataset_key,w.committed_record_id)
    order by r.updated_at,r.dataset_key,r.record_id
    limit ${limit}
  `;
}

function sanitizeRow(row: any) {
  const p = row.payload || {};
  let payload: Record<string, unknown>;

  if (row.dataset_key === "runlu_receiving_v50") {
    payload = {
      id: p.id ?? null,
      masterId: p.masterId ?? null,
      location: p.location ?? null,
      quantity: p.quantity ?? null,
      unit: p.unit ?? null,
      inventoryBefore: p.inventoryBefore ?? null,
      inventoryAfter: p.inventoryAfter ?? null,
      inventoryPosted: p.inventoryPosted ?? null,
      status: p.status ?? null,
      date: p.date ?? null,
    };
  } else if (row.dataset_key === "runlu_cutting_log_v52") {
    payload = {
      id: p.id ?? null,
      operationId: p.operationId ?? null,
      carpetRecordId: p.carpetRecordId ?? null,
      roll: p.roll ?? null,
      beforeLength: p.beforeLength ?? null,
      requestedCutLength: p.requestedCutLength ?? null,
      plannedCutLength: p.plannedCutLength ?? null,
      actualCutLength: p.actualCutLength ?? null,
      cutLength: p.cutLength ?? null,
      allowanceInches: p.allowanceInches ?? null,
      remainingLength: p.remainingLength ?? null,
      fullRollConsumed: p.fullRollConsumed ?? null,
      numberOfCuts: p.numberOfCuts ?? null,
      date: p.date ?? null,
      time: p.time ?? null,
    };
  } else if (row.dataset_key === "runlu_orders_v20") {
    payload = {
      id: p.id ?? null,
      type: p.type ?? null,
      status: p.status ?? null,
      unit: p.unit ?? null,
      quantity: p.quantity ?? null,
      location: p.location ?? null,
      poNumber: p.poNumber ?? null,
      soNumber: p.soNumber ?? null,
      recoveryKey: p.recoveryKey ?? null,
      customer: p.customer ?? null,
      product: p.product ?? null,
      date: p.date ?? null,
      created: p.created ?? null,
    };
  } else if (row.dataset_key === "runlu_special_orders_v51") {
    payload = {
      id: p.id ?? null,
      po: p.po ?? null,
      status: p.status ?? null,
      unit: p.unit ?? null,
      quantity: p.quantity ?? null,
      location: p.location ?? null,
      recoveryKey: p.recoveryKey ?? null,
      customer: p.customer ?? null,
      product: p.product ?? null,
      supplier: p.supplier ?? null,
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
      pickedUpAt: p.pickedUpAt ?? null,
      receivedAt: p.receivedAt ?? null,
    };
  } else {
    payload = {
      id: p.id ?? null,
      type: p.type ?? null,
      status: p.status ?? null,
      unit: p.unit ?? null,
      quantity: p.quantity ?? null,
      location: p.location ?? null,
      toLocation: p.toLocation ?? null,
      productId: p.productId ?? null,
      inventoryRecordId: p.inventoryRecordId ?? null,
      roll: p.roll ?? null,
      returnedChildRoll: p.returnedChildRoll ?? null,
      inventoryMode: p.inventoryMode ?? null,
      supplier: p.supplier ?? null,
      po: p.po ?? null,
      impactApplied: p.impactApplied ?? null,
      impactResult: p.impactResult ?? null,
      itemCount: Array.isArray(p.items) ? p.items.length : 0,
    };
  }

  return {
    dataset_key: row.dataset_key,
    record_id: row.record_id,
    updated_at: String(row.updated_at_text),
    payload,
    source_row_md5: row.source_row_md5,
  };
}

Deno.serve(async (req: Request) => {
  if (!["GET", "POST"].includes(req.method)) return deny(405, "METHOD_NOT_ALLOWED");

  try {
    await authenticate(req);
  } catch (err) {
    return deny(401, err instanceof Error ? err.message : "OIDC_VALIDATION_FAILED");
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return deny(500, "DB_URL_MISSING");

  const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });

  try {
    if (req.method === "GET") {
      const states = await sql`
        select committed_updated_at::text as updated_at,
               committed_dataset_key as dataset_key,
               committed_record_id as record_id,
               version
        from warehouse_v7_shadow.watermark
        where feed_key='warehouse-live'
      `;
      const state = states[0];
      if (!state) return deny(500, "WATERMARK_STATE_MISSING");

      const rawRows = await feedAfterWatermark(sql, 251);

      const hasMore = rawRows.length > 250;
      const batchRows = rawRows.slice(0, 250);
      const fingerprintRows = await sql`
        select md5(string_agg(x,chr(10) order by ord)) as batch_fingerprint
        from unnest(${batchRows.map((r: any) => r.source_row_md5)}::text[])
             with ordinality as t(x,ord)
      `;
      const last = batchRows.length ? batchRows[batchRows.length - 1] : null;

      return ok({
        mode: "READ_ONLY_V6_INCREMENTAL_SHADOW",
        production_business_writes: 0,
        from_watermark: state,
        to_watermark: last ? {
          updated_at: String(last.updated_at_text),
          dataset_key: last.dataset_key,
          record_id: last.record_id,
        } : state,
        row_count: batchRows.length,
        batch_fingerprint: batchRows.length ? fingerprintRows[0]?.batch_fingerprint ?? null : null,
        has_more: hasMore,
        rows: batchRows.map(sanitizeRow),
        exported_at: new Date().toISOString(),
      });
    }

    const body = await req.json().catch(() => null);
    const from = body?.from_watermark;
    const batchFingerprint = String(body?.batch_fingerprint || "").toLowerCase();
    const rowCount = Number(body?.row_count);

    if (
      !from ||
      !Number.isInteger(Number(from.version)) ||
      !Number.isInteger(rowCount) ||
      rowCount < 1 ||
      rowCount > 250 ||
      !/^[0-9a-f]{32}$/.test(batchFingerprint) ||
      typeof from.updated_at !== "string" ||
      typeof from.dataset_key !== "string" ||
      typeof from.record_id !== "string"
    ) return deny(400, "INVALID_INCREMENTAL_COMMIT");

    const committed = await sql.begin(async (tx) => {
      const states = await tx`
        select committed_updated_at::text as updated_at,
               committed_dataset_key as dataset_key,
               committed_record_id as record_id,
               version
        from warehouse_v7_shadow.watermark
        where feed_key='warehouse-live'
        for update
      `;
      const state = states[0];
      if (!state) throw new Error("WATERMARK_STATE_MISSING");

      if (
        Number(state.version) !== Number(from.version) ||
        state.updated_at !== from.updated_at ||
        state.dataset_key !== from.dataset_key ||
        state.record_id !== from.record_id
      ) throw new Error("WATERMARK_CAS_MISMATCH");

      const verifyRows = await feedAfterWatermark(tx, rowCount);

      if (verifyRows.length !== rowCount) {
        throw new Error("BATCH_REVALIDATION_COUNT_MISMATCH");
      }

      const fingerprints = await tx`
        select md5(string_agg(x,chr(10) order by ord)) as batch_fingerprint
        from unnest(${verifyRows.map((r: any) => r.source_row_md5)}::text[])
             with ordinality as t(x,ord)
      `;
      const verifiedFingerprint = String(fingerprints[0]?.batch_fingerprint || "").toLowerCase();

      if (verifiedFingerprint !== batchFingerprint) {
        throw new Error("BATCH_REVALIDATION_FINGERPRINT_MISMATCH");
      }

      const updated = await tx`
        with cursor as (
          select committed_updated_at,committed_dataset_key,committed_record_id
          from warehouse_v7_shadow.watermark
          where feed_key='warehouse-live'
        ), batch as (
          select r.updated_at,r.dataset_key,r.record_id
          from public.warehouse_records r
          cross join cursor w
          where r.user_id=${WAREHOUSE_OWNER}::uuid
            and r.deleted_at is null
            and (
              r.dataset_key in ('runlu_receiving_v50','runlu_cutting_log_v52','runlu_orders_v20','runlu_special_orders_v51')
              or (
                r.dataset_key='runlu_operations_log_v52'
                and r.payload->>'type' in (
                  'Inventory Transfer','Shipping','Customer Return',
                  'Installer Return','Cut Piece Return','Return to Supplier'
                )
              )
            )
            and (r.updated_at,r.dataset_key,r.record_id) >
                (w.committed_updated_at,w.committed_dataset_key,w.committed_record_id)
          order by r.updated_at,r.dataset_key,r.record_id
          limit ${rowCount}
        ), last_row as (
          select updated_at,dataset_key,record_id
          from batch
          order by updated_at desc,dataset_key desc,record_id desc
          limit 1
        )
        update warehouse_v7_shadow.watermark w
        set committed_updated_at=l.updated_at,
            committed_dataset_key=l.dataset_key,
            committed_record_id=l.record_id,
            version=w.version+1,
            last_batch_fingerprint=${batchFingerprint},
            last_row_count=${rowCount},
            last_run_at=now(),
            updated_at=now()
        from last_row l
        where w.feed_key='warehouse-live'
          and w.version=${Number(from.version)}
        returning w.committed_updated_at::text as updated_at,
                  w.committed_dataset_key as dataset_key,
                  w.committed_record_id as record_id,
                  w.version
      `;

      if (updated.length !== 1) throw new Error("WATERMARK_UPDATE_LOST");
      return updated[0];
    });

    return ok({
      mode: "INCREMENTAL_SHADOW_WATERMARK_COMMIT",
      production_business_writes: 0,
      shadow_control_writes: 1,
      committed_watermark: committed,
      batch_fingerprint: batchFingerprint,
      row_count: rowCount,
    });
  } catch (err) {
    return deny(409, err instanceof Error ? err.message : "INCREMENTAL_SHADOW_ERROR");
  } finally {
    await sql.end({ timeout: 1 });
  }
});
