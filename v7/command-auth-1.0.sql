-- V7 authenticated command boundary.
-- Client-supplied actor must match JWT subject and tenant membership.
create or replace function warehouse_v7.assert_command_identity(p_tenant uuid,p_actor uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare u uuid;
begin
 u:=warehouse_v7.current_user_id();
 if u is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_actor is distinct from u then raise exception using errcode='42501',message='ACTOR_IDENTITY_MISMATCH'; end if;
 if not warehouse_v7.is_tenant_member(p_tenant) then raise exception using errcode='42501',message='AUTH_SCOPE_DENIED'; end if;
end $$;
