-- RUNLU Warehouse OS V7 Order Exception Workbench 1.0
-- Read model for the Wave 2 exception-resolution UI.
-- Engineering branch only. No production V6/V7 mutation.

create or replace function warehouse_v7.order_exception_reason_help(p_reason text)
returns jsonb
language sql
immutable
as $$
  select case p_reason
    when 'STRUCTURED_STATUS_MISSING' then jsonb_build_object(
      'title','Status confirmation required',
      'summary','The legacy order has no trustworthy structured status.',
      'action','Confirm the order lifecycle and fulfillment status from source paperwork or warehouse knowledge.'
    )
    when 'IDENTITY_CRITICAL_FIELDS_CONFLICT' then jsonb_build_object(
      'title','Identity conflict',
      'summary','Rows grouped by the same lineage key disagree on identity-critical fields.',
      'action','Confirm the canonical order identity and then confirm lifecycle/fulfillment.'
    )
    when 'STRUCTURED_STATUS_MOVED_BACKWARD' then jsonb_build_object(
      'title','Lifecycle regression',
      'summary','The legacy structured status moved backward in source time.',
      'action','Confirm the final trustworthy lifecycle and fulfillment state.'
    )
    when 'WEAK_SOURCE_IDENTITY' then jsonb_build_object(
      'title','Identity confirmation required',
      'summary','The legacy row does not contain enough structured identity to auto-import safely.',
      'action','Confirm at least one durable order identifier plus product, quantity, and unit.'
    )
    when 'UNKNOWN_STRUCTURED_STATUS' then jsonb_build_object(
      'title','Unknown legacy status',
      'summary','The source contains a structured status V7 does not recognize.',
      'action','Map the source status to a valid V7 lifecycle and fulfillment state.'
    )
    else jsonb_build_object(
      'title','Review required',
      'summary','This order needs manual review.',
      'action','Review linked source evidence before resolving.'
    )
  end
$$;

create or replace function warehouse_v7.list_order_exception_workbench(
  p_tenant uuid,
  p_status text default 'open'
)
returns jsonb
language plpgsql
security invoker
stable
as $workbench_list$
declare
  can_resolve boolean;
  result jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  if p_status is not null and p_status not in ('open','resolved','needs_review') then
    raise exception using errcode='22023',message='INVALID_ORDER_EXCEPTION_STATUS';
  end if;

  can_resolve:=warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin']);

  select jsonb_build_object(
    'tenant_id',p_tenant,
    'status_filter',p_status,
    'can_resolve',can_resolve,
    'summary',jsonb_build_object(
      'total',count(*)::int,
      'status_missing',count(*) filter(where q.reason='STRUCTURED_STATUS_MISSING')::int,
      'identity_conflict',count(*) filter(where q.reason='IDENTITY_CRITICAL_FIELDS_CONFLICT')::int,
      'lifecycle_regression',count(*) filter(where q.reason='STRUCTURED_STATUS_MOVED_BACKWARD')::int,
      'weak_identity',count(*) filter(where q.reason='WEAK_SOURCE_IDENTITY')::int,
      'unknown_status',count(*) filter(where q.reason='UNKNOWN_STRUCTURED_STATUS')::int
    ),
    'cases',coalesce(
      jsonb_agg(
        jsonb_build_object(
          'case_id',q.case_id,
          'reason',q.reason,
          'reason_help',warehouse_v7.order_exception_reason_help(q.reason),
          'status',q.status,
          'version',q.version,
          'evidence_count',q.evidence_count,
          'linked_evidence_rows',q.linked_evidence_rows,
          'required_confirmation',q.required_confirmation,
          'display_context',q.display_context,
          'opened_at',q.opened_at,
          'updated_at',q.updated_at,
          'resolved_order_id',q.resolved_order_id
        )
        order by
          case q.reason
            when 'IDENTITY_CRITICAL_FIELDS_CONFLICT' then 1
            when 'STRUCTURED_STATUS_MOVED_BACKWARD' then 2
            when 'WEAK_SOURCE_IDENTITY' then 3
            when 'UNKNOWN_STRUCTURED_STATUS' then 4
            else 5
          end,
          q.updated_at desc,
          q.case_id
      ),
      '[]'::jsonb
    )
  ) into result
  from warehouse_v7.order_exception_queue q
  where q.tenant_id=p_tenant
    and (p_status is null or q.status=p_status);

  return result;
end
$workbench_list$;

create or replace function warehouse_v7.get_order_exception_workbench_case(
  p_tenant uuid,
  p_case uuid
)
returns jsonb
language plpgsql
security invoker
stable
as $workbench_case$
declare
  q warehouse_v7.order_exception_case;
  can_resolve boolean;
  evidence jsonb;
begin
  if not warehouse_v7.is_tenant_member(p_tenant) then
    raise exception using errcode='42501',message='TENANT_MEMBERSHIP_REQUIRED';
  end if;

  select * into q
  from warehouse_v7.order_exception_case
  where tenant_id=p_tenant and id=p_case;

  if not found then
    return null;
  end if;

  can_resolve:=warehouse_v7.has_tenant_role(p_tenant,ARRAY['owner','admin']);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'evidence_id',e.id,
        'source_dataset',e.source_dataset,
        'source_record_id',e.source_record_id,
        'evidence_class',e.evidence_class,
        'source_fingerprint',e.source_fingerprint,
        'source_updated_at',e.source_updated_at,
        'structured_fields',jsonb_strip_nulls(jsonb_build_object(
          'type',e.source_payload->>'type',
          'status',e.source_payload->>'status',
          'recovery_key',e.source_payload->>'recoveryKey',
          'sales_order_number',e.source_payload->>'soNumber',
          'purchase_order_number',coalesce(
            e.source_payload->>'poNumber',
            e.source_payload->>'po'
          ),
          'customer_label',e.source_payload->>'customer',
          'product_label',e.source_payload->>'product',
          'source_location',e.source_payload->>'location',
          'quantity',e.source_payload->>'quantity',
          'unit',e.source_payload->>'unit'
        ))
      )
      order by e.source_updated_at nulls first,e.source_record_id,e.id
    ),
    '[]'::jsonb
  ) into evidence
  from warehouse_v7.order_source_evidence e
  where e.tenant_id=p_tenant and e.exception_case_id=p_case;

  return jsonb_build_object(
    'case_id',q.id,
    'case_key',q.case_key,
    'source_dataset',q.source_dataset,
    'reason',q.reason,
    'reason_help',warehouse_v7.order_exception_reason_help(q.reason),
    'status',q.status,
    'version',q.version,
    'can_resolve',can_resolve,
    'evidence_count',q.evidence_count,
    'required_confirmation',q.required_confirmation,
    'display_context',q.display_context,
    'resolved_order_id',q.resolved_order_id,
    'resolution_summary',q.resolution_summary,
    'opened_at',q.opened_at,
    'updated_at',q.updated_at,
    'resolved_at',q.resolved_at,
    'evidence',evidence
  );
end
$workbench_case$;
