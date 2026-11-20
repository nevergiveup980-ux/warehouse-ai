-- Isolated, transaction-rolled-back acceptance test.
-- Uses a TEMP table and a TEMP trigger. No warehouse_records writes.
-- Execute only in a controlled SQL session; all changes ROLLBACK at end.
BEGIN;
CREATE TEMP TABLE runlu_carpet_guard_fixture (
 user_id uuid NOT NULL,
 dataset_key text NOT NULL,
 record_id text NOT NULL,
 payload jsonb NOT NULL,
 deleted_at timestamptz,
 PRIMARY KEY(user_id,dataset_key,record_id)
) ON COMMIT DROP;
CREATE FUNCTION pg_temp.runlu_guard_fixture()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_roll text := upper(btrim(coalesce(NEW.payload->>'roll','')));
 v_mfr text := upper(btrim(coalesce(NEW.payload->>'manufacturerRoll','')));
BEGIN
 IF NEW.dataset_key <> 'runlu_carpet_inventory_v52' OR NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;
 IF v_roll='' OR v_mfr IN ('','0000','N/A','NA','UNKNOWN','NONE','-') THEN RETURN NEW; END IF;
 IF EXISTS (SELECT 1 FROM runlu_carpet_guard_fixture r WHERE r.user_id=NEW.user_id
 AND r.dataset_key=NEW.dataset_key AND r.deleted_at IS NULL AND r.record_id<>NEW.record_id
 AND upper(btrim(coalesce(r.payload->>'roll','')))=v_roll
 AND upper(btrim(coalesce(r.payload->>'manufacturerRoll','')))=v_mfr)
 THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='possible_duplicate_physical_roll'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fixture_guard BEFORE INSERT ON runlu_carpet_guard_fixture
FOR EACH ROW EXECUTE FUNCTION pg_temp.runlu_guard_fixture();

DO $$
DECLARE u uuid:='11111111-1111-4111-8111-111111111111'; rejected boolean:=false; n integer;
BEGIN
 INSERT INTO runlu_carpet_guard_fixture VALUES
 (u,'runlu_carpet_inventory_v52','original','{"roll":"RC2376","manufacturerRoll":"1000212894"}',null);
 BEGIN
  INSERT INTO runlu_carpet_guard_fixture VALUES
  (u,'runlu_carpet_inventory_v52','replay','{"roll":"rc2376 ","manufacturerRoll":" 1000212894"}',null);
 EXCEPTION WHEN SQLSTATE 'P0001' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'FAIL: duplicate was accepted'; END IF;
 INSERT INTO runlu_carpet_guard_fixture VALUES
 (u,'runlu_carpet_inventory_v52','different-mfr','{"roll":"RC2376","manufacturerRoll":"DIFFERENT"}',null),
 (u,'runlu_carpet_inventory_v52','different-roll','{"roll":"RC2377","manufacturerRoll":"1000212894"}',null),
 (u,'runlu_carpet_inventory_v52','placeholder-a','{"roll":"RC2378","manufacturerRoll":"0000"}',null),
 (u,'runlu_carpet_inventory_v52','placeholder-b','{"roll":"RC2378","manufacturerRoll":"0000"}',null);
 SELECT count(*) INTO n FROM runlu_carpet_guard_fixture;
 IF n<>5 THEN RAISE EXCEPTION 'FAIL: expected five fixture rows, got %',n; END IF;
 RAISE NOTICE 'PASS: duplicate rejected, distinct roll/mfr and placeholders accepted (fixture only)';
END $$;
ROLLBACK;

-- Separate production integration tests are still required for advisory locking,
-- RLS, RPC error propagation, concurrent sessions, UPDATE, and soft-delete.
