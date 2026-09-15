-- RUNLU Warehouse OS · candidate migration for Build129 / V0.5r2
-- NOT applied by this repository change. The RPC serializes cut-linked dataset commits
-- for one authenticated user and uses expected updated_at versions to reject stale writers.

create table if not exists public.warehouse_cut_commits (
  user_id uuid not null references auth.users(id) on delete cascade,
  execution_key text not null,
  operation_id text,
  carpet_record_id text,
  roll text,
  device_id text,
  committed_at timestamptz not null default now(),
  primary key (user_id, execution_key)
);

alter table public.warehouse_cut_commits enable row level security;
revoke all on table public.warehouse_cut_commits from anon, authenticated;

create or replace function public.commit_warehouse_carpet_cut_v1(
  p_execution_key text,
  p_operation_id text,
  p_carpet_record_id text,
  p_roll text,
  p_device_id text,
  p_expected_versions jsonb,
  p_payloads jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_keys text[] := array[
    'runlu_carpet_inventory_v52',
    'runlu_cutting_log_v52',
    'runlu_orders_v20',
    'runlu_event_history_v52'
  ];
  v_key text;
  v_current timestamptz;
  v_expected_text text;
  v_current_versions jsonb := '{}'::jsonb;
  v_new_versions jsonb := '{}'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_already boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if coalesce(length(trim(p_execution_key)),0) < 4 then
    raise exception 'A valid carpet-cut execution key is required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_expected_versions,'{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_payloads,'{}'::jsonb)) <> 'object' then
    raise exception 'Expected versions and payloads must be JSON objects' using errcode = '22023';
  end if;

  -- One cut-cloud transaction per user at a time, including the first write when rows may not exist yet.
  perform pg_advisory_xact_lock(hashtext(v_user::text), hashtext('warehouse_carpet_cut_v1'));

  select exists(
    select 1 from public.warehouse_cut_commits
    where user_id=v_user and execution_key=p_execution_key
  ) into v_already;

  if v_already then
    foreach v_key in array v_keys loop
      select updated_at into v_current
      from public.user_datasets
      where user_id=v_user and dataset_key=v_key;
      v_current_versions := jsonb_set(v_current_versions,array[v_key],coalesce(to_jsonb(v_current),'null'::jsonb),true);
    end loop;
    return jsonb_build_object(
      'status','already_committed',
      'execution_key',p_execution_key,
      'versions',v_current_versions
    );
  end if;

  foreach v_key in array v_keys loop
    if not (p_payloads ? v_key) or jsonb_typeof(p_payloads -> v_key) <> 'array' then
      raise exception 'Missing or invalid dataset payload: %', v_key using errcode = '22023';
    end if;

    v_current := null;
    select updated_at into v_current
    from public.user_datasets
    where user_id=v_user and dataset_key=v_key;

    v_current_versions := jsonb_set(v_current_versions,array[v_key],coalesce(to_jsonb(v_current),'null'::jsonb),true);
    v_expected_text := p_expected_versions ->> v_key;

    if (v_current is null and v_expected_text is not null)
       or (v_current is not null and v_expected_text is null)
       or (v_current is not null and v_expected_text is not null and v_current <> v_expected_text::timestamptz) then
      v_conflicts := v_conflicts || jsonb_build_array(v_key);
    end if;
  end loop;

  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object(
      'status','conflict',
      'execution_key',p_execution_key,
      'conflicts',v_conflicts,
      'versions',v_current_versions
    );
  end if;

  insert into public.warehouse_cut_commits(user_id,execution_key,operation_id,carpet_record_id,roll,device_id)
  values(v_user,p_execution_key,p_operation_id,p_carpet_record_id,p_roll,p_device_id);

  foreach v_key in array v_keys loop
    insert into public.user_datasets(user_id,dataset_key,payload,device_id)
    values(v_user,v_key,p_payloads -> v_key,p_device_id)
    on conflict(user_id,dataset_key) do update
      set payload=excluded.payload,
          device_id=excluded.device_id
    returning updated_at into v_current;
    v_new_versions := jsonb_set(v_new_versions,array[v_key],to_jsonb(v_current),true);
  end loop;

  return jsonb_build_object(
    'status','committed',
    'execution_key',p_execution_key,
    'versions',v_new_versions
  );
end;
$$;

revoke all on function public.commit_warehouse_carpet_cut_v1(text,text,text,text,text,jsonb,jsonb) from public, anon;
grant execute on function public.commit_warehouse_carpet_cut_v1(text,text,text,text,text,jsonb,jsonb) to authenticated;
