-- Apply only after approved deployment. No existing records are updated by this migration.
create table public.warehouse_cloud_command_receipts (
  user_id uuid not null references auth.users(id),
  request_id uuid not null,
  request_hash bytea not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.warehouse_cloud_command_receipts enable row level security;
revoke all on public.warehouse_cloud_command_receipts from public, anon, authenticated;
grant select, insert on public.warehouse_cloud_command_receipts to authenticated;
create policy own_cloud_command_read on public.warehouse_cloud_command_receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy own_cloud_command_insert on public.warehouse_cloud_command_receipts
  for insert to authenticated with check (user_id = (select auth.uid()));

create function public.warehouse_cloud_roll_key(p_payload jsonb)
returns text language sql immutable set search_path = ''
as $$
  select regexp_replace(upper(coalesce(nullif(btrim(p_payload->>'roll'), ''), p_payload->>'rollNumber', '')), '[^A-Z0-9]', '', 'g')
$$;

create function public.warehouse_cloud_guard_roll()
returns trigger language plpgsql set search_path = ''
as $$
declare
  v_roll text := public.warehouse_cloud_roll_key(new.payload);
begin
  if new.dataset_key <> 'runlu_carpet_inventory_v52' or new.deleted_at is not null then
    return new;
  end if;
  -- Existing historical duplicate groups can still be edited without changing their identity.
  if tg_op = 'UPDATE' and old.deleted_at is null and old.user_id = new.user_id
     and old.dataset_key = new.dataset_key and public.warehouse_cloud_roll_key(old.payload) = v_roll then
    return new;
  end if;
  if v_roll = '' then raise exception 'A business roll number is required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 231));
  if exists (
    select 1 from public.warehouse_records r
    where r.user_id = new.user_id and r.dataset_key = new.dataset_key
      and r.deleted_at is null and r.record_id <> new.record_id
      and public.warehouse_cloud_roll_key(r.payload) = v_roll
  ) then
    raise exception 'Business roll number already exists';
  end if;
  return new;
end;
$$;

create trigger warehouse_cloud_unique_business_roll
before insert or update of payload, deleted_at, user_id, dataset_key on public.warehouse_records
for each row execute function public.warehouse_cloud_guard_roll();

-- Existing V7 tenant-member policies remain in force.
grant select on warehouse_v7.location, warehouse_v7.product to authenticated;
grant insert on warehouse_v7.carpet_roll to authenticated;

create function public.warehouse_cloud_v7_location(p_tenant uuid, p_code text)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_code text := lower(btrim(coalesce(p_code,'')));
begin
  if v_code in ('installer returns','returned cut pieces','customer returns') then v_code := 'receiving'; end if;
  select id into strict v_id from warehouse_v7.location
  where tenant_id=p_tenant and lower(btrim(code))=v_code and lifecycle='active';
  return v_id;
exception when no_data_found or too_many_rows then
  raise exception 'Choose a unique active V7 warehouse location for this roll';
end;
$$;

revoke execute on function public.warehouse_cloud_v7_location(uuid,text) from public, anon;
grant execute on function public.warehouse_cloud_v7_location(uuid,text) to authenticated;

create function public.warehouse_cloud_commit(p_request_id uuid, p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_previous bytea;
  v_hash bytea := pg_catalog.sha256(pg_catalog.convert_to(p_changes::text,'UTF8'));
  v_change jsonb;
  v_result jsonb;
  v_current public.warehouse_records%rowtype;
  v_dataset text;
  v_record_id text;
  v_version bigint;
  v_delete boolean;
  v_payload jsonb;
  v_link warehouse_v7.carpet_roll%rowtype;
  v_cut boolean;
  v_measurement boolean;
  v_remaining bigint;
  v_expected bigint;
  v_original bigint;
  v_location uuid;
  v_product uuid;
  v_child uuid;
  v_lifecycle text;
  v_parent_id text;
  v_measure text;
begin
  if v_uid is null or p_request_id is null then raise exception 'Sign-in and request ID are required'; end if;
  if jsonb_typeof(p_changes) is distinct from 'array' then raise exception 'Expected a change list'; end if;
  if jsonb_array_length(p_changes) not between 1 and 100 then raise exception 'Invalid change count'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 231));

  select request_hash into v_previous from public.warehouse_cloud_command_receipts
  where user_id = v_uid and request_id = p_request_id;
  if found then
    if v_previous is distinct from v_hash then raise exception 'Request ID already belongs to another command'; end if;
    return jsonb_build_object('status','confirmed','replayed',true);
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_dataset := v_change->>'dataset';
    v_record_id := v_change->>'recordId';
    v_version := (v_change->>'version')::bigint;
    v_delete := coalesce((v_change->>'delete')::boolean,false);
    v_payload := v_change->'payload';
    v_cut := coalesce((v_change->>'cut')::boolean,false);
    v_parent_id := nullif(v_payload->>'sourceCloudRecordId','');
    v_measurement := coalesce((v_change->>'measurement')::boolean,false);
    if v_dataset is null or v_dataset not in (
      'runlu_product_master_v21','runlu_inventory_records_v21','runlu_carpet_inventory_v52',
      'runlu_cutting_log_v52','runlu_operations_log_v52','runlu_event_history_v52',
      'runlu_orders_v20','runlu_remnants_v55','runlu_receiving_v50','runlu_tasks_v50','runlu_tag_print_history_v53'
    ) or nullif(v_record_id,'') is null or v_version is null or v_version < 0
      or jsonb_typeof(v_payload) is distinct from 'object' then
      raise exception 'Invalid warehouse change';
    end if;

    select * into v_current from public.warehouse_records
    where user_id = v_uid and dataset_key = v_dataset and record_id = v_record_id for update;
    if found and (v_current.deleted_at is not null or v_current.version <> v_version)
       or not found and (v_version <> 0 or v_delete) then
      raise exception 'Warehouse record changed. Refresh and try again' using errcode = '40001';
    end if;
    if v_delete then
      -- The legacy warehouse login uses the authenticated administrator identity.
      if lower(coalesce(auth.jwt()->>'email','')) <> 'nevergiveup980@gmail.com'
         or v_dataset not in ('runlu_inventory_records_v21','runlu_carpet_inventory_v52') then
        raise exception 'Administrator permission is required for inventory deletion' using errcode = '42501';
      end if;
      v_payload := v_payload || '{"_runluDeleteIntent":"explicit-user-delete"}'::jsonb;
    end if;

    if v_dataset='runlu_carpet_inventory_v52' and v_version=0 and v_parent_id is not null then
      select p.payload->>'canonicalId' into v_parent_id from public.warehouse_records p
      where p.user_id=v_uid and p.dataset_key=v_dataset and p.record_id=v_parent_id and p.deleted_at is null;
      if not found then raise exception 'Parent carpet record is unavailable'; end if;
      if coalesce(v_parent_id,'') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        select * into v_link from warehouse_v7.carpet_roll where id=v_parent_id::uuid for update;
        if not found then raise exception 'Linked V7 parent could not be verified'; end if;
        perform warehouse_v7.assert_command_identity(v_link.tenant_id,v_uid);
        v_location := public.warehouse_cloud_v7_location(v_link.tenant_id,v_payload->>'location');
        v_remaining := round((v_payload->>'length')::numeric*192);
        v_original := round((v_payload->>'originalLength')::numeric*192);
        if v_remaining is null or v_remaining <= 0 or v_original is null or v_original<v_remaining then
          raise exception 'Invalid linked child roll length';
        end if;
        v_child := gen_random_uuid();
        v_lifecycle := case
          when v_payload->>'warehouseScope'='external' then 'transferred-out'
          when lower(v_payload->>'status')='used up' then 'consumed' else 'active' end;
        insert into warehouse_v7.carpet_roll(
          tenant_id,id,roll_number,manufacturer_roll,source_roll,product_id,location_id,
          original_sixteenths,remaining_sixteenths,measure_status,version,lifecycle
        ) values (
          v_link.tenant_id,v_child,v_payload->>'roll',nullif(v_payload->>'manufacturerRoll',''),v_link.roll_number,
          v_link.product_id,v_location,v_original,v_remaining,coalesce(v_payload->>'measure','TM'),1,v_lifecycle
        );
        v_payload := v_payload || jsonb_build_object('canonicalId',v_child,'canonicalVersion',1,
          'length',v_remaining::numeric/192,'remainingSixteenths',v_remaining,'originalSixteenths',v_original,
          'locationId',v_location,'measureStatus',coalesce(v_payload->>'measure','TM'),
          'lifecycle',v_lifecycle,'lifecycleStatus',upper(v_lifecycle));
      end if;
    end if;

    if v_dataset = 'runlu_carpet_inventory_v52' and v_version > 0 then
      if coalesce(v_current.payload->>'canonicalId','') ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
        select * into v_link from warehouse_v7.carpet_roll
        where id = (v_current.payload->>'canonicalId')::uuid for update;
        if not found then raise exception 'Linked V7 roll could not be verified'; end if;
        perform warehouse_v7.assert_command_identity(v_link.tenant_id,v_uid);
        if upper(btrim(v_link.roll_number)) is distinct from upper(btrim(v_current.payload->>'roll')) then
          raise exception 'The paired roll identifiers disagree. Reconcile before editing';
        end if;
        v_expected := round((v_current.payload->>'length')::numeric * 192);
        v_remaining := round((v_payload->>'length')::numeric * 192);
        if v_measurement and not v_delete and not v_cut then
          if v_payload - array['length','measure','tmRequired','updatedAt'] is distinct from
             v_current.payload - array['length','measure','tmRequired','updatedAt'] then
            raise exception 'A paired measurement cannot change other roll fields';
          end if;
          if v_link.lifecycle <> 'active' or v_expected is distinct from v_link.remaining_sixteenths
             or v_remaining is null or v_remaining <= 0 or v_remaining > v_link.original_sixteenths
             or coalesce(v_payload->>'measure','') not in ('TM','CAL') then
            raise exception 'Paired measurement could not be verified against the current roll';
          end if;
          update warehouse_v7.carpet_roll
          set remaining_sixteenths=v_remaining,measure_status=v_payload->>'measure',
              version=version+1,updated_at=now()
          where tenant_id=v_link.tenant_id and id=v_link.id and version=v_link.version
          returning version into v_expected;
          if not found then raise exception 'Paired roll changed during measurement' using errcode='40001'; end if;
          v_payload := v_payload || jsonb_build_object(
            'length',v_remaining::numeric/192,'remainingSixteenths',v_remaining,
            'measureStatus',v_payload->>'measure','canonicalVersion',v_expected
          );
        elsif v_cut and not v_delete then
          if v_expected is distinct from v_link.remaining_sixteenths
             or v_remaining is null or v_remaining < 0 or v_remaining >= v_expected then
            raise exception 'The two cloud balances disagree. Refresh or reconcile before cutting';
          end if;
          v_result := warehouse_v7.cut_carpet_roll(
            v_link.tenant_id, md5(p_request_id::text || ':' || v_record_id)::uuid, v_link.id,
            v_link.version, v_expected-v_remaining, '{}'::jsonb, v_uid, 'cloud-only'
          );
          if v_result->>'status' is distinct from 'committed'
             or (v_result->>'remaining_sixteenths')::bigint is distinct from v_remaining then
            raise exception 'V7 cut did not confirm the expected balance';
          end if;
          v_payload := v_payload || jsonb_build_object(
            'canonicalId',v_current.payload->>'canonicalId','length',v_remaining::numeric/192,'remainingSixteenths',v_remaining,
            'canonicalVersion',(v_result->>'new_version')::bigint,
            'measureStatus',v_payload->>'measure',
            'lifecycleStatus',case when v_remaining=0 then 'CONSUMED' else 'ACTIVE' end,
            'lifecycle',case when v_remaining=0 then 'consumed' else 'active' end
          );
        else
          if v_expected is distinct from v_link.remaining_sixteenths then
            raise exception 'The two cloud balances disagree. Reconcile before editing';
          end if;
          if v_delete then
            update warehouse_v7.carpet_roll set lifecycle='archived',version=version+1,updated_at=now()
            where tenant_id=v_link.tenant_id and id=v_link.id;
            if not found then raise exception 'Linked V7 roll could not be archived'; end if;
          else
            v_original := coalesce(round((v_payload->>'originalLength')::numeric*192),v_link.original_sixteenths);
            v_measure := coalesce(nullif(v_payload->>'measure',''),v_link.measure_status);
            if v_remaining is null or v_remaining<0 or v_original<v_remaining or v_measure not in ('FULL','CAL','TM') then
              raise exception 'Invalid paired roll length or measurement status';
            end if;
            v_location := v_link.location_id;
            if v_payload->>'location' is distinct from v_current.payload->>'location'
               and lower(coalesce(v_payload->>'status','')) not in ('split to rem','split to ram') then
              v_location := public.warehouse_cloud_v7_location(v_link.tenant_id,v_payload->>'location');
            end if;
            v_product := v_link.product_id;
            if v_payload->>'collection' is distinct from v_current.payload->>'collection'
               or v_payload->>'colour' is distinct from v_current.payload->>'colour' then
              select id into strict v_product from warehouse_v7.product
              where tenant_id=v_link.tenant_id and lifecycle='active'
                and lower(btrim(name))=lower(btrim(v_payload->>'collection'))
                and lower(btrim(coalesce(colour,'')))=lower(btrim(coalesce(v_payload->>'colour','')));
            end if;
            v_lifecycle := case
              when v_payload->>'warehouseScope'='external' or v_payload->>'transferredOut'='true' then 'transferred-out'
              when lower(coalesce(v_payload->>'status','')) in ('split to rem','split to ram','archived') then 'archived'
              when v_remaining=0 or lower(v_payload->>'status')='used up' then 'consumed'
              when lower(v_payload->>'status') in ('pending','check') then lower(v_payload->>'status')
              else 'active' end;
            update warehouse_v7.carpet_roll set roll_number=v_payload->>'roll',
              manufacturer_roll=nullif(v_payload->>'manufacturerRoll',''),product_id=v_product,location_id=v_location,
              original_sixteenths=v_original,remaining_sixteenths=v_remaining,measure_status=v_measure,
              lifecycle=v_lifecycle,version=version+1,updated_at=now()
            where tenant_id=v_link.tenant_id and id=v_link.id returning version into v_expected;
            if not found then raise exception 'Linked V7 roll could not be updated'; end if;
            v_payload := v_payload || jsonb_build_object('canonicalId',v_link.id,'canonicalVersion',v_expected,
              'length',v_remaining::numeric/192,'remainingSixteenths',v_remaining,'originalSixteenths',v_original,
              'locationId',v_location,'measureStatus',v_measure,'lifecycle',v_lifecycle,'lifecycleStatus',upper(v_lifecycle));
          end if;
        end if;
      elsif v_cut and (v_delete or (v_payload->>'length')::numeric is null
             or (v_payload->>'length')::numeric < 0
             or (v_payload->>'length')::numeric >= (v_current.payload->>'length')::numeric) then
        raise exception 'Cut must reduce the current balance without making it negative';
      end if;
    end if;
    if v_dataset = 'runlu_carpet_inventory_v52' and not v_delete and
       ((v_payload->>'length')::numeric is null or (v_payload->>'length')::numeric < 0) then
      raise exception 'Valid carpet length is required';
    end if;

    v_result := public.warehouse_apply_mutation(v_dataset,v_record_id,v_payload,v_version,v_delete,'cloud-only');
    if v_result->>'status' is distinct from 'ok' then
      raise exception 'Warehouse rejected the change: %', coalesce(v_result->>'reason','unconfirmed');
    end if;
  end loop;
  insert into public.warehouse_cloud_command_receipts(user_id,request_id,request_hash)
  values (v_uid,p_request_id,v_hash);
  return jsonb_build_object('status','confirmed','replayed',false);
end;
$$;

revoke execute on function public.warehouse_cloud_commit(uuid,jsonb) from public, anon;
grant execute on function public.warehouse_cloud_commit(uuid,jsonb) to authenticated;
