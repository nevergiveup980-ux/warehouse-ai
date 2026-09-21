\set ON_ERROR_STOP on
insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values
('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','admin');
select warehouse_v7.stage_legacy_record('10000000-0000-0000-0000-000000000001','legacy','dup','{"case":"duplicate"}');
select warehouse_v7.stage_legacy_record('10000000-0000-0000-0000-000000000001','legacy','orphan','{"case":"orphan"}');
select warehouse_v7.stage_legacy_record('10000000-0000-0000-0000-000000000001','legacy','conflict','{"case":"conflict"}');
select warehouse_v7.stage_legacy_record('10000000-0000-0000-0000-000000000001','legacy','RC2253','{"case":"deferred"}');
set request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
select warehouse_v7.classify_legacy_record(tenant_id,id,
 case source_record_id when 'dup' then 'duplicate' when 'orphan' then 'orphan' when 'conflict' then 'conflict' when 'RC2253' then 'deferred' end,
 'quarantine','20000000-0000-0000-0000-000000000001')
from warehouse_v7.migration_staging where tenant_id='10000000-0000-0000-0000-000000000001';
do $$ begin
 if (select count(*) from warehouse_v7.migration_staging where tenant_id='10000000-0000-0000-0000-000000000001' and classification in ('duplicate','orphan','conflict','deferred'))<>4 then raise exception 'classification isolation failed'; end if;
 if (select count(*) from warehouse_v7.stock_item where tenant_id='10000000-0000-0000-0000-000000000001')+(select count(*) from warehouse_v7.carpet_roll where tenant_id='10000000-0000-0000-0000-000000000001')<>0 then raise exception 'quarantine leaked'; end if;
end $$;
