#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container=$(docker run -d --rm --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:17)
trap 'docker stop "$container" >/dev/null' EXIT
for _ in {1..40}; do
  if docker exec "$container" pg_isready -q -h 127.0.0.1; then break; fi
  sleep .25
done
sql() { docker exec -i "$container" psql -h 127.0.0.1 -X -v ON_ERROR_STOP=1 -U postgres "$@"; }
sql < tests/warehouse-cloud-write-fixture.sql
sql < supabase/migrations/20261124185442_warehouse_cloud_only_commands.sql
actor="set role authenticated; set test.actor='00000000-0000-0000-0000-000000000001';"
new_roll() {
  sql -qAt -c "$actor select warehouse_cloud_commit('$1','[{\"dataset\":\"runlu_carpet_inventory_v52\",\"recordId\":\"$2\",\"version\":0,\"payload\":{\"roll\":\"$3\",\"length\":50}}]');"
}
new_roll 10000000-0000-0000-0000-000000000001 one RC100 | grep -q '"confirmed"'
new_roll 10000000-0000-0000-0000-000000000001 one RC100 | grep -q '"replayed": true'
if new_roll 10000000-0000-0000-0000-000000000001 one RC101; then exit 1; fi
if new_roll 10000000-0000-0000-0000-000000000002 two rc-100; then exit 1; fi

if sql -qAt -c "$actor select warehouse_cloud_commit('10000000-0000-0000-0000-000000000003','[
 {\"dataset\":\"runlu_cutting_log_v52\",\"recordId\":\"cut\",\"version\":0,\"payload\":{}},
 {\"dataset\":\"runlu_carpet_inventory_v52\",\"recordId\":\"one\",\"version\":9,\"payload\":{\"roll\":\"RC100\",\"length\":40}}]');"; then
  exit 1
fi
test "$(sql -qAt -c "select count(*) from warehouse_records where record_id='cut'")" = 0
if sql -qAt -c "$actor select warehouse_cloud_commit('10000000-0000-0000-0000-000000000004','[
 {\"dataset\":\"runlu_carpet_inventory_v52\",\"recordId\":\"one\",\"version\":1,\"delete\":true,\"payload\":{}}]');"; then
  exit 1
fi
sql -qAt -c "insert into warehouse_v7.carpet_roll values ('10000000-0000-0000-0000-000000000000','20000000-0000-0000-0000-000000000000',9600,1);
 update warehouse_records set payload=payload||'{\"canonicalId\":\"20000000-0000-0000-0000-000000000000\"}' where record_id='one';"
sql -qAt -c "$actor select warehouse_cloud_commit('10000000-0000-0000-0000-000000000005','[
 {\"dataset\":\"runlu_carpet_inventory_v52\",\"recordId\":\"one\",\"version\":1,\"cut\":true,\"payload\":{\"roll\":\"RC100\",\"length\":40}}]');" | grep -q '"confirmed"'
test "$(sql -qAt -c 'select remaining_sixteenths from warehouse_v7.carpet_roll')" = 7680
test "$(sql -qAt -c "select payload->>'length' from warehouse_records where record_id='one'" | cut -d. -f1)" = 40

new_roll 10000000-0000-0000-0000-000000000008 disposable RC150 | grep -q '"confirmed"'
sql -qAt -c "$actor set test.email='nevergiveup980@gmail.com'; select warehouse_cloud_commit('10000000-0000-0000-0000-000000000009','[
 {\"dataset\":\"runlu_carpet_inventory_v52\",\"recordId\":\"disposable\",\"version\":1,\"delete\":true,\"payload\":{}}]');" | grep -q '"confirmed"'
test "$(sql -qAt -c "select count(*) from warehouse_records where record_id='disposable' and deleted_at is not null")" = 1

# Race two distinct command IDs and record IDs for one normalized business roll.
new_roll 10000000-0000-0000-0000-000000000006 race-a RC200 >/dev/null 2>&1 & a=$!
new_roll 10000000-0000-0000-0000-000000000007 race-b rc-200 >/dev/null 2>&1 & b=$!
success=0
if wait "$a"; then success=$((success+1)); fi
if wait "$b"; then success=$((success+1)); fi
test "$success" = 1
printf 'PASS: duplicate roll race, request replay, atomic rollback, administrator guard and paired cut\n'
