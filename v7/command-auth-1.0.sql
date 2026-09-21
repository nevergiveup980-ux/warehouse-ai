-- V7 role capability boundary. Membership is not automatically mutation authority.
create or replace function warehouse_v7.assert_command_identity(p_tenant uuid,p_actor uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare u uuid; r text;
begin
 u:=warehouse_v7.current_user_id();
 if u is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_actor is distinct from u then raise exception using errcode='42501',message='ACTOR_IDENTITY_MISMATCH'; end if;
 select m.role into r from warehouse_v7.tenant_member m
 where m.tenant_id=p_tenant and m.user_id=u and m.lifecycle='active';
 if r is null then raise exception using errcode='42501',message='AUTH_SCOPE_DENIED'; end if;
 if r not in ('owner','admin','operator') then raise exception using errcode='42501',message='ROLE_WRITE_DENIED'; end if;
end $$;

create or replace function warehouse_v7.assert_admin_identity(p_tenant uuid,p_actor uuid)
returns void language plpgsql stable security definer set search_path='' as $$
declare u uuid; r text;
begin
 u:=warehouse_v7.current_user_id();
 if u is null then raise exception using errcode='42501',message='AUTH_REQUIRED'; end if;
 if p_actor is distinct from u then raise exception using errcode='42501',message='ACTOR_IDENTITY_MISMATCH'; end if;
 select m.role into r from warehouse_v7.tenant_member m where m.tenant_id=p_tenant and m.user_id=u and m.lifecycle='active';
 if r is null then raise exception using errcode='42501',message='AUTH_SCOPE_DENIED'; end if;
 if r not in ('owner','admin') then raise exception using errcode='42501',message='ADMIN_ROLE_REQUIRED'; end if;
end $$;
