-- ISOLATED TEST. Temporary fixtures only; never writes to warehouse_records.
-- Execute in Supabase SQL editor. Expected: completes without an exception.
-- All fixture changes are rolled back.
BEGIN;
CREATE TEMP TABLE runlu_carpet_fixture(record_id text primary key, roll text, manufacturer_roll text, physical_key text, active boolean default true) ON COMMIT DROP;
INSERT INTO runlu_carpet_fixture VALUES ('original','RC2376','1000212894',null,true),('other-mfr','RC2376','1000214072',null,true),('physical','RC2500','55555','pk-1',true),('placeholder','RC2400','0000',null,true);
CREATE TEMP TABLE runlu_carpet_cases(case_name text, incoming_id text, roll text, manufacturer_roll text, physical_key text, expected_conflict boolean);
INSERT INTO runlu_carpet_cases VALUES
('replay','new1','RC2376','1000212894',null,true),
('legitimate distinct manufacturer','new2','RC2376','1000214074',null,false),
('same physical key','new3','RC9999','88888','pk-1',true),
('ambiguous placeholder','new4','RC2400','',null,true),
('existing row update','original','RC2376','1000212894',null,false),
('new unrelated','new5','RC2600','20000',null,false);
DO $test$
DECLARE v_case record; v_actual boolean;
BEGIN
FOR v_case IN SELECT * FROM runlu_carpet_cases LOOP
 SELECT EXISTS(SELECT 1 FROM runlu_carpet_fixture r WHERE r.active AND r.record_id<>v_case.incoming_id
 AND ((nullif(btrim(coalesce(v_case.physical_key,'')),'') is not null AND r.physical_key=v_case.physical_key)
 OR (upper(btrim(coalesce(r.roll,'')))=upper(btrim(coalesce(v_case.roll,'')))
 AND nullif(btrim(coalesce(v_case.roll,'')),'') is not null
 AND (upper(btrim(coalesce(r.manufacturer_roll,'')))=upper(btrim(coalesce(v_case.manufacturer_roll,'')))
 OR upper(btrim(coalesce(r.manufacturer_roll,''))) in ('','0000','N/A','NA','UNKNOWN','NONE','-')
 OR upper(btrim(coalesce(v_case.manufacturer_roll,''))) in ('','0000','N/A','NA','UNKNOWN','NONE','-')))) INTO v_actual;
 IF v_case.incoming_id IN (SELECT record_id FROM runlu_carpet_fixture WHERE active) THEN v_actual:=false; END IF;
 IF v_actual IS DISTINCT FROM v_case.expected_conflict THEN RAISE EXCEPTION 'FAIL: %, got %, expected %',v_case.case_name,v_actual,v_case.expected_conflict; END IF;
END LOOP;
RAISE NOTICE 'PASS: 6 isolated identity scenarios';
END $test$;
ROLLBACK;
