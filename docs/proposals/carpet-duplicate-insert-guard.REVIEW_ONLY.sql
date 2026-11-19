-- REVIEW-ONLY PROPOSAL. DO NOT RUN ON PRODUCTION WITHOUT APPROVAL AND TESTS.
-- Existing duplicate rows are untouched.
-- Use P0001 (not 23505) because warehouse_apply_operation catches unique_violation
-- and may otherwise misreport a rejected duplicate as an operation-id replay. This guards INSERT of NEW carpet records
-- regardless of whether a caller uses warehouse_apply_operation, warehouse_apply_mutation,
-- or direct REST INSERT. Narrow matching: normalized roll + non-placeholder manufacturerRoll.
-- Important: this is NOT a complete fix for missing manufacturerRoll, historical replay,
-- or edits to business identity. Test before deployment.
BEGIN;
CREATE OR REPLACE FUNCTION public.runlu_guard_new_carpet_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $guard$
DECLARE
  v_roll text := upper(btrim(coalesce(NEW.payload->>'roll','')));
  v_mfr text := upper(btrim(coalesce(NEW.payload->>'manufacturerRoll','')));
  v_existing_id text;
BEGIN
  IF NEW.dataset_key <> 'runlu_carpet_inventory_v52' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF v_roll = '' OR v_mfr IN ('','0000','N/A','NA','UNKNOWN','NONE','-') THEN
    RETURN NEW; -- review separately; do not assume these are unique
  END IF;

  -- Existing rows may legitimately predate this guard. An update that does not\n  -- change physical identity must remain possible even when old duplicates exist.\n  IF TG_OP = 'UPDATE' THEN
   IF OLD.deleted_at IS NULL\n     AND OLD.dataset_key = NEW.dataset_key\n     AND OLD.user_id = NEW.user_id\n     AND upper(btrim(coalesce(OLD.payload->>'roll',''))) = v_roll\n     AND upper(btrim(coalesce(OLD.payload->>'manufacturerRoll',''))) = v_mfr\n     AND btrim(coalesce(OLD.payload->>'physicalKey','')) = btrim(coalesce(NEW.payload->>'physicalKey',''))\n  THEN\n    RETURN NEW;\n  END IF;\n\n  -- Serialize inserts and identity-changing updates for a given tenant+business roll to avoid concurrent replay.
  -- This advisory lock only protects writers using this trigger; the trigger is
  -- installed on the base table so both RPC and direct INSERT use it.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.user_id::text || ':runlu_carpet_inventory_v52:' || v_roll, 0
  ));

  SELECT r.record_id INTO v_existing_id
  FROM public.warehouse_records AS r
  WHERE r.user_id = NEW.user_id
    AND r.dataset_key = 'runlu_carpet_inventory_v52'
    AND r.deleted_at IS NULL
    AND r.record_id <> NEW.record_id
    AND upper(btrim(coalesce(r.payload->>'roll',''))) = v_roll
    AND upper(btrim(coalesce(r.payload->>'manufacturerRoll',''))) = v_mfr
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'possible_duplicate_physical_roll',
      DETAIL = 'A live carpet record already uses this business roll and manufacturer roll. Review before creating a second record.';
  END IF;
  RETURN NEW;
END
$guard$;

DROP TRIGGER IF EXISTS runlu_guard_new_carpet_identity_trg ON public.warehouse_records;
CREATE TRIGGER runlu_guard_new_carpet_identity_trg
BEFORE INSERT OR UPDATE OF payload, deleted_at, dataset_key, user_id ON public.warehouse_records
FOR EACH ROW EXECUTE FUNCTION public.runlu_guard_new_carpet_identity();
COMMIT;

-- ROLLBACK (after approval; does not alter inventory):
-- DROP TRIGGER IF EXISTS runlu_guard_new_carpet_identity_trg ON public.warehouse_records;
-- DROP FUNCTION IF EXISTS public.runlu_guard_new_carpet_identity();
