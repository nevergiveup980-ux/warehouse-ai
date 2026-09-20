import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.7";

const PRODUCTION_PROJECT_REF = "ekrnknlawekeoszzkamd";
const DEVICE = "V7_ORDER_EXCEPTION_WORKBENCH";

function json(status: number, body: unknown, origin = "*") {
  if (status === 204) {
    return new Response(null, {
      status,
      headers: {
        "cache-control": "no-store",
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization,content-type",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "x-content-type-options": "nosniff",
      },
    });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "x-content-type-options": "nosniff",
    },
  });
}

function projectRefFromUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : "";
  } catch {
    return "";
  }
}

function projectRefFromDbUrl(url: string) {
  try {
    const host = new URL(url).hostname;
    const direct = host.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
    if (direct) return direct[1];
    const pooler = host.match(/^aws-[^.]+-pooler\.([a-z0-9]+)\.supabase\.com$/i);
    if (pooler) return pooler[1];
    return "";
  } catch {
    return "";
  }
}

function validUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function publishableKey() {
  const modern = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (typeof parsed?.default === "string" && parsed.default) return parsed.default;
    } catch {
      // Fall through to legacy anon key during the 2026 key migration window.
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

async function authenticatedUser(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("USER_AUTH_REQUIRED");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const key = publishableKey();
  if (!supabaseUrl || !key) throw new Error("AUTH_ENV_MISSING");

  const supabase = createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
  const token = auth.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("USER_AUTH_INVALID");
  return data.user;
}

async function withClaim<T>(
  sql: postgres.Sql,
  userId: string,
  work: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claim.sub',${userId},true)`;
    return await work(tx);
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "*";
  if (req.method === "OPTIONS") return json(204, {}, origin);
  if (!["GET", "POST"].includes(req.method)) return json(405, { error: "METHOD_NOT_ALLOWED" }, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const currentProjectRef = projectRefFromUrl(supabaseUrl);

  // Hard safety boundary: this engineering workbench must never operate on the
  // current production Supabase project, even if accidentally deployed there.
  if (!currentProjectRef || currentProjectRef === PRODUCTION_PROJECT_REF) {
    return json(403, { error: "PRODUCTION_PROJECT_FORBIDDEN" }, origin);
  }

  let user;
  try {
    user = await authenticatedUser(req);
  } catch (err) {
    return json(401, { error: err instanceof Error ? err.message : "USER_AUTH_FAILED" }, origin);
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) return json(500, { error: "DB_URL_MISSING" }, origin);

  const dbProjectRef = projectRefFromDbUrl(dbUrl);
  if (dbProjectRef === PRODUCTION_PROJECT_REF) {
    return json(403, { error: "PRODUCTION_DATABASE_FORBIDDEN" }, origin);
  }
  if (dbProjectRef && dbProjectRef !== currentProjectRef) {
    return json(403, { error: "PROJECT_DATABASE_MISMATCH" }, origin);
  }

  const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const action = url.searchParams.get("action") || "list";
      const tenantId = url.searchParams.get("tenant_id");
      if (!validUuid(tenantId)) return json(400, { error: "TENANT_ID_REQUIRED" }, origin);

      if (action === "list") {
        const status = url.searchParams.get("status") || "open";
        if (!["open", "resolved", "needs_review"].includes(status)) {
          return json(400, { error: "INVALID_STATUS" }, origin);
        }
        const result = await withClaim(sql, user.id, async (tx) => {
          const rows = await tx`
            select warehouse_v7.list_order_exception_workbench(
              ${tenantId}::uuid,${status}::text
            )::text as body
          `;
          return JSON.parse(rows[0]?.body || "{}");
        });
        return json(200, { ok: true, data: result }, origin);
      }

      if (action === "get") {
        const caseId = url.searchParams.get("case_id");
        if (!validUuid(caseId)) return json(400, { error: "CASE_ID_REQUIRED" }, origin);
        const result = await withClaim(sql, user.id, async (tx) => {
          const rows = await tx`
            select warehouse_v7.get_order_exception_workbench_case(
              ${tenantId}::uuid,${caseId}::uuid
            )::text as body
          `;
          return rows[0]?.body ? JSON.parse(rows[0].body) : null;
        });
        return json(result ? 200 : 404, result
          ? { ok: true, data: result }
          : { ok: false, error: "CASE_NOT_FOUND" }, origin);
      }

      return json(400, { error: "UNKNOWN_ACTION" }, origin);
    }

    const body = await req.json().catch(() => null);
    if (!body || body.action !== "resolve") {
      return json(400, { error: "UNKNOWN_ACTION" }, origin);
    }

    const tenantId = body.tenant_id;
    const caseId = body.case_id;
    const commandId = body.command_id;
    if (!validUuid(tenantId)) return json(400, { error: "TENANT_ID_REQUIRED" }, origin);
    if (!validUuid(caseId)) return json(400, { error: "CASE_ID_REQUIRED" }, origin);
    if (!validUuid(commandId)) return json(400, { error: "COMMAND_ID_REQUIRED" }, origin);

    const expectedVersion = Number(body.expected_version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return json(400, { error: "EXPECTED_VERSION_REQUIRED" }, origin);
    }

    const orderKind = String(body.order_kind || "");
    const lifecycle = String(body.lifecycle || "");
    const fulfillment = String(body.fulfillment_status || "");
    const fields = body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? body.fields
      : {};
    const resolutionNote = String(body.resolution_note || "");

    const result = await withClaim(sql, user.id, async (tx) => {
      const rows = await tx`
        select warehouse_v7.resolve_order_exception_create_order(
          ${tenantId}::uuid,
          ${commandId}::uuid,
          ${caseId}::uuid,
          ${expectedVersion}::bigint,
          ${orderKind}::text,
          ${lifecycle}::text,
          ${fulfillment}::text,
          ${JSON.stringify(fields)}::jsonb,
          ${resolutionNote}::text,
          ${user.id}::uuid,
          ${DEVICE}::text
        )::text as body
      `;
      return JSON.parse(rows[0]?.body || "{}");
    });

    const status = result?.status === "committed" ? 200 : 409;
    return json(status, { ok: status === 200, data: result }, origin);
  } catch (err) {
    const message = err instanceof Error ? err.message : "WORKBENCH_API_ERROR";
    const safe = message.includes("TENANT_MEMBERSHIP_REQUIRED") ? "TENANT_MEMBERSHIP_REQUIRED"
      : message.includes("ORDER_EXCEPTION_REVIEW_ROLE_REQUIRED") ? "ORDER_EXCEPTION_REVIEW_ROLE_REQUIRED"
      : message.includes("permission denied") ? "PERMISSION_DENIED"
      : "WORKBENCH_API_ERROR";
    return json(safe === "WORKBENCH_API_ERROR" ? 500 : 403, { error: safe }, origin);
  } finally {
    await sql.end({ timeout: 1 });
  }
});
