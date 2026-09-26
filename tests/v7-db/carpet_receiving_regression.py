import os, uuid, psycopg
DSN=os.getenv("DATABASE_URL","postgresql://postgres:postgres@localhost:5432/warehouse_v7_test")
tenant=uuid.uuid4(); actor=uuid.uuid4(); loc=uuid.uuid4(); product=uuid.uuid4(); roll=uuid.uuid4()
with psycopg.connect(DSN) as db:
 with db.cursor() as c:
  c.execute("insert into warehouse_v7.tenant(id,name) values(%s,'T')",(tenant,)); c.execute("insert into warehouse_v7.tenant_membership(tenant_id,user_id,role) values(%s,%s,'owner')",(tenant,actor)); c.execute("insert into warehouse_v7.location(tenant_id,id,code) values(%s,%s,'7B')",(tenant,loc))
  cmd=uuid.uuid4(); c.execute("select warehouse_v7.create_product(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(tenant,cmd,product,'Marshall 30 OZ/SY','Ice Breaker 2653',None,'1/16_IN',None,'{}',actor,'test')); assert c.fetchone()[0]['status']=='committed'
  # replay same command must converge
  c.execute("select warehouse_v7.create_product(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(tenant,cmd,product,'Marshall 30 OZ/SY','Ice Breaker 2653',None,'1/16_IN',None,'{}',actor,'test')); assert c.fetchone()[0]['status']=='committed'
  rcmd=uuid.uuid4(); c.execute("select warehouse_v7.receive_carpet_roll(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(tenant,rcmd,roll,'RC2355','1000185284',product,loc,31496,'FULL','{}',actor,'test')); assert c.fetchone()[0]['status']=='committed'
  c.execute("select remaining_sixteenths,measure_status from warehouse_v7.carpet_roll where tenant_id=%s and id=%s",(tenant,roll)); assert c.fetchone()==(31496,'FULL')
  c.execute("select count(*) from warehouse_v7.inventory_movement where tenant_id=%s and command_id=%s",(tenant,rcmd)); assert c.fetchone()[0]==1
  c.execute("select count(*) from warehouse_v7.event where tenant_id=%s and command_id=%s",(tenant,rcmd)); assert c.fetchone()[0]==1
print("carpet receiving regression: PASS")
