-- V7 Command Engine 1.0. Engineering draft; do not apply to production.
create or replace function warehouse_v7.canonical_fingerprint(p_payload jsonb)
returns text language sql immutable strict set search_path='' as $fingerprint$
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_payload::text,'UTF8')),'hex')
$fingerprint$;

create or replace function warehouse_v7.begin_command(
 p_tenant uuid,p_command uuid,p_type text,p_entity_type text,p_entity uuid,
 p_expected bigint,p_payload jsonb,p_actor uuid,p_device text)
returns warehouse_v7.command
language plpgsql security invoker as $$
declare c warehouse_v7.command; fp text;
begin
 fp:=warehouse_v7.canonical_fingerprint(coalesce(p_payload,'{}'::jsonb));
 -- First writer creates the command. Concurrent retries never fail on the PK;
 -- they converge on the same row, which is then locked before validation.
 insert into warehouse_v7.command(tenant_id,id,command_type,entity_type,entity_id,expected_version,
   payload,payload_fingerprint,actor_id,device_id)
 values(p_tenant,p_command,p_type,p_entity_type,p_entity,p_expected,coalesce(p_payload,'{}'::jsonb),
   fp,p_actor,p_device)
 on conflict (tenant_id,id) do nothing;

 select * into c from warehouse_v7.command
 where tenant_id=p_tenant and id=p_command
 for update;
 if found then
   if c.payload is distinct from coalesce(p_payload,'{}'::jsonb)
      or c.payload_fingerprint<>fp or c.command_type<>p_type or c.entity_type<>p_entity_type
      or c.entity_id is distinct from p_entity then
     raise exception using errcode='22023', message='COMMAND_FINGERPRINT_MISMATCH';
   end if;
   return c;
 end if;
 raise exception using errcode='P0002',message='COMMAND_NOT_FOUND_AFTER_UPSERT';
end $$;

create or replace function warehouse_v7.commit_command(
 p_tenant uuid,p_command uuid,p_result jsonb)
returns warehouse_v7.command language plpgsql security invoker as $$
declare c warehouse_v7.command;
begin
 update warehouse_v7.command set status='committed',result=coalesce(p_result,'{}'::jsonb),
 committed_at=coalesce(committed_at,now())
 where tenant_id=p_tenant and id=p_command and status='accepted'
 returning * into c;
 if not found then
   select * into c from warehouse_v7.command where tenant_id=p_tenant and id=p_command;
 end if;
 if c.id is null then raise exception using errcode='P0002',message='COMMAND_NOT_FOUND'; end if;
 return c;
end $$;

create or replace function warehouse_v7.reject_command(
 p_tenant uuid,p_command uuid,p_code text,p_result jsonb default '{}'::jsonb)
returns warehouse_v7.command language plpgsql security invoker as $$
declare c warehouse_v7.command;
begin
 update warehouse_v7.command set status='rejected',rejection_code=p_code,result=p_result
 where tenant_id=p_tenant and id=p_command and status='accepted' returning * into c;
 if not found then select * into c from warehouse_v7.command where tenant_id=p_tenant and id=p_command; end if;
 if c.id is null then raise exception using errcode='P0002',message='COMMAND_NOT_FOUND'; end if;
 return c;
end $$;

-- Domain handlers must call begin_command and perform validation + row locks + event/movement
-- writes + commit_command inside the SAME outer database transaction.
