\set ON_ERROR_STOP on
begin;
select to_regclass('warehouse_v7.command') is not null as command_exists;
select to_regclass('warehouse_v7.inventory_movement') is not null as movement_exists;
do $$
begin
 if to_regprocedure('warehouse_v7.cut_carpet_roll(uuid,uuid,uuid,bigint,bigint,jsonb,uuid,text)') is null then raise exception 'CUT function missing'; end if;
 if to_regprocedure('warehouse_v7.receive_stock(uuid,uuid,uuid,uuid,numeric,text,bigint,uuid,jsonb,uuid,text)') is null then raise exception 'RECEIVE function missing'; end if;
 if to_regprocedure('warehouse_v7.transfer_stock(uuid,uuid,uuid,bigint,uuid,jsonb,uuid,text)') is null then raise exception 'TRANSFER function missing'; end if;
 if to_regprocedure('warehouse_v7.transfer_stock_quantity(uuid,uuid,uuid,bigint,uuid,bigint,numeric,uuid,jsonb,uuid,text)') is null then raise exception 'TRANSFER QUANTITY function missing'; end if;
 if to_regprocedure('warehouse_v7.ship_stock(uuid,uuid,uuid,bigint,numeric,jsonb,uuid,text)') is null then raise exception 'SHIP function missing'; end if;
 if to_regprocedure('warehouse_v7.return_stock(uuid,uuid,uuid,bigint,numeric,text,uuid,uuid,jsonb,uuid,text)') is null then raise exception 'RETURN function missing'; end if;
 if to_regprocedure('warehouse_v7.transfer_carpet_roll(uuid,uuid,uuid,bigint,uuid,jsonb,uuid,text)') is null then raise exception 'CARPET TRANSFER WHOLE function missing'; end if;
 if to_regprocedure('warehouse_v7.transfer_carpet_piece(uuid,uuid,uuid,bigint,uuid,text,bigint,uuid,jsonb,uuid,text)') is null then raise exception 'CARPET TRANSFER PIECE function missing'; end if;
 if to_regprocedure('warehouse_v7.return_carpet_piece(uuid,uuid,uuid,uuid,text,bigint,uuid,uuid,jsonb,uuid,text)') is null then raise exception 'CARPET RETURN function missing'; end if;
end $$;
rollback;
