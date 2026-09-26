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
select tenant_id,id,roll_number,manufacturer_roll,remaining_sixteenths,measure_status from warehouse_v7.carpet_roll where tenant_id=:'tenant' and id=:'roll';
select count(*) as carpet_row_ok from warehouse_v7.carpet_roll where tenant_id=:'tenant' and id=:'roll' and roll_number='RC2355' and manufacturer_roll='1000185284' and remaining_sixteenths=31496 and measure_status='CAL';
select tenant_id,command_id,carpet_roll_id,movement_type,quantity,unit,to_location_id from warehouse_v7.inventory_movement where tenant_id=:'tenant' and carpet_roll_id=:'roll';
select count(*) as movement_ok from warehouse_v7.inventory_movement where tenant_id=:'tenant' and command_id=:'rcmd' and carpet_roll_id=:'roll' and movement_type='RECEIVE_CARPET';
select case when (select count(*) from warehouse_v7.event where tenant_id=:'tenant' and command_id=:'rcmd' and entity_type='carpet_roll' and entity_id=:'roll' and event_type='CARPET_RECEIVED')=1 then 1 else 1/0 end as event_ok;
rollback;
\echo 'carpet receiving regression: PASS'
