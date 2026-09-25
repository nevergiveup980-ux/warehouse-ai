\set ON_ERROR_STOP on
begin;
create extension if not exists pgcrypto;
select gen_random_uuid() as tenant \gset
select gen_random_uuid() as actor \gset
select gen_random_uuid() as loc \gset
select gen_random_uuid() as product \gset
select gen_random_uuid() as roll \gset
select gen_random_uuid() as pcmd \gset
select gen_random_uuid() as rcmd \gset
insert into warehouse_v7.tenant_member(tenant_id,user_id,role) values(:'tenant',:'actor','owner');
insert into warehouse_v7.location(tenant_id,id,code) values(:'tenant',:'loc','7B');
set local request.jwt.claim.sub = :'actor';
select warehouse_v7.create_product(:'tenant',:'pcmd',:'product','Marshall 30 OZ/SY','Ice Breaker 2653',null,'1/16_IN',null,'{}'::jsonb,:'actor','test');
select warehouse_v7.create_product(:'tenant',:'pcmd',:'product','Marshall 30 OZ/SY','Ice Breaker 2653',null,'1/16_IN',null,'{}'::jsonb,:'actor','test');
select warehouse_v7.receive_carpet_roll(:'tenant',:'rcmd',:'roll','RC2355','1000185284',:'product',:'loc',31496,'CAL','{}'::jsonb,:'actor','test');
select case when exists(select 1 from warehouse_v7.carpet_roll where tenant_id=:'tenant' and id=:'roll' and roll_number='RC2355' and manufacturer_roll='1000185284' and remaining_sixteenths=31496 and measure_status='CAL') then 1 else 1/0 end as carpet_row_ok;
select case when (select count(*) from warehouse_v7.inventory_movement where command_id=:'rcmd')=1 then 1 else 1/0 end as movement_ok;
select case when (select count(*) from warehouse_v7.event where command_id=:'rcmd')=1 then 1 else 1/0 end as event_ok;
rollback;
\echo 'carpet receiving regression: PASS'
