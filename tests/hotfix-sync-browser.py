"""Run Chromium against the released entry point with a synthetic shared cloud."""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://warehouse-isolated.test"
CLOUD = "ekrnknlawekeoszzkamd.supabase.co"
INVENTORY = "runlu_inventory_records_v21"
CARPET = "runlu_carpet_inventory_v52"
PRODUCTS = "runlu_product_master_v21"
CANONICAL_PRODUCTS = ("2e121f61-d462-49ae-9f49-640078fbc411", "028ddb01-52af-44d3-bd7a-9c8957f39665")
OUTBOX = "runlu_record_sync_outbox_v1"
MASTER_QUEUE = "runlu_cloud_master_offline_queue_v680"
GENERATION = "runlu_record_sync_generation_v1"
SESSION = "runlu_cloud_session_v54"
LEGACY_CONFLICTS = "runlu_cloud_dataset_conflicts_v659_"
RECORD_ID = "synthetic-inventory"
INITIAL = {"id": RECORD_ID, "inventoryId": RECORD_ID, "masterId": CANONICAL_PRODUCTS[0], "quantity": 5}


class Cloud:
    def __init__(self):
        self.records = {(INVENTORY, RECORD_ID): {
            "dataset_key": INVENTORY, "record_id": RECORD_ID, "payload": INITIAL, "version": 1
        }}
        for record_id in CANONICAL_PRODUCTS:
            self.records[(PRODUCTS, record_id)] = {
                "dataset_key": PRODUCTS, "record_id": record_id, "version": 1,
                "payload": {"id": record_id, "name": "Synthetic Product"}
            }
        self.writes = []
        self.legacy_writes = []

    def route(self, route):
        url = urlparse(route.request.url)
        if url.hostname == "warehouse-isolated.test":
            path = (ROOT / (url.path.lstrip("/") or "index.html")).resolve()
            if path.is_relative_to(ROOT) and path.is_file():
                return route.fulfill(path=path)
        if url.hostname != CLOUD:
            return route.abort()
        method = route.request.method
        if url.path == "/rest/v1/user_datasets":
            if method != "GET":
                self.legacy_writes.append(method)
                return route.fulfill(status=403, json={"message": "Legacy writes blocked by test"})
            return route.fulfill(json=[])
        if url.path == "/rest/v1/warehouse_cloud_state" and method == "GET":
            return route.fulfill(json=[{"mode": "active"}])
        if url.path == "/rest/v1/warehouse_records" and method == "GET":
            records = list(self.records.values())
            query = parse_qs(url.query)
            dataset = query.get("dataset_key", [""])[0]
            if dataset.startswith("eq."):
                records = [row for row in records if row["dataset_key"] == dataset[3:]]
            elif dataset.startswith("in.("):
                keys = dataset[4:-1].split(",")
                records = [row for row in records if row["dataset_key"] in keys]
            record_id = query.get("record_id", [""])[0]
            if record_id.startswith("eq."):
                records = [row for row in records if row["record_id"] == record_id[3:]]
            return route.fulfill(json=records)
        if url.path == "/rest/v1/rpc/warehouse_apply_mutation" and method == "POST":
            body = route.request.post_data_json
            key = (body["p_dataset_key"], body["p_record_id"])
            old = self.records.get(key)
            if body["p_base_version"] != (old["version"] if old else 0):
                return route.fulfill(json={"status": "conflict", "record": old})
            new = {"dataset_key": key[0], "record_id": key[1], "payload": body["p_payload"],
                   "version": (old["version"] if old else 0) + 1}
            assert not body["p_delete"], body
            self.records[key] = new
            self.writes.append(body)
            return route.fulfill(json={"status": "ok", "record": new})
        return route.fulfill(status=404, json={"message": f"Unexpected endpoint {method} {url.path}"})


def open_device(browser, cloud, options=None, seed=None):
    context = browser.new_context(service_workers="block", **(options or {}))
    context.route("**/*", cloud.route)
    values = {**(seed or {}), SESSION: json.dumps({
        "access_token": "synthetic",
        "expires_at": 4102444800,
        "user": {"id": "synthetic", "email": "nevergiveup980@gmail.com"},
    })}
    context.add_init_script(f"""if(location.origin==={json.dumps(ORIGIN)}&&!sessionStorage.getItem('fixture')){{
        for(const [key,value] of Object.entries({json.dumps(values)}))localStorage.setItem(key,value);
        sessionStorage.setItem('fixture','1');
    }}""")
    page = context.new_page()
    page.on("dialog", lambda dialog: dialog.accept())
    page.goto(ORIGIN, wait_until="load")
    page.wait_for_function("typeof runluCloudMasterSync === 'function'")
    return context, page


def read(page, key):
    raw = page.evaluate("key => localStorage.getItem(key)", key)
    return json.loads(raw) if raw is not None else None


def sync_button(page, expected):
    page.locator('button[onclick="syncWarehouseNow()"]').first.evaluate("button => button.click()")
    page.wait_for_function(
        "({key,expected}) => JSON.stringify(JSON.parse(localStorage.getItem(key))) === JSON.stringify(expected)",
        arg={"key": INVENTORY, "expected": expected},
    )


def expect_duplicate_rejected(page, dataset, extra):
    result = page.evaluate("""({dataset, extra, queue}) => {
        const before=localStorage.getItem(dataset);
        const outbox=localStorage.getItem(queue);
        const saved=save(dataset,[...(JSON.parse(before)||[]),...extra]);
        return {saved, cacheUnchanged:before===localStorage.getItem(dataset),
          queueUnchanged:outbox===localStorage.getItem(queue)};
    }""", {"dataset": dataset, "extra": extra, "queue": MASTER_QUEUE})
    assert result == {"saved": False, "cacheUnchanged": True, "queueUnchanged": True}, result


def main():
    cloud = Cloud()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("WAREHOUSE_TEST_CHROMIUM") or None)
        stale_row = {"id": "local-old", "quantity": 3}
        desktop_context, desktop = open_device(browser, cloud, seed={
            GENERATION: "old-desktop", INVENTORY: json.dumps([stale_row]),
        })
        sync_button(desktop, [INITIAL])
        saved_cache = read(desktop, "runlu_record_sync_recovery_v1:old-desktop")
        assert json.loads(saved_cache["datasets"][INVENTORY]) == [stale_row]

        mobile_context, mobile = open_device(browser, cloud, pw.devices["iPhone 13"])
        sync_button(mobile, [INITIAL])
        desktop.wait_for_function("window.RUNLUCarpetCloudIdentity && typeof save === 'function'")
        expect_duplicate_rejected(desktop, INVENTORY, [{"id": "same"}, {"id": "same"}])
        expect_duplicate_rejected(desktop, CARPET, [{"id": 1, "roll": "D001"}, {"id": 2, "roll": "d001"}])

        # A genuine save goes through the loaded wrapper and the cloud mutation.
        updated = dict(INITIAL, quantity=8)
        assert desktop.evaluate("([key, row]) => save(key,[row])", [INVENTORY, updated])
        sync_button(desktop, [updated])
        desktop.wait_for_function(
            "key => JSON.parse(localStorage.getItem(key)||'[]').length===0", arg=MASTER_QUEUE
        )
        assert cloud.records[(INVENTORY, RECORD_ID)]["payload"] == updated
        sync_button(mobile, [updated])
        for page in (desktop, mobile):
            page.reload(wait_until="load")
            assert read(page, INVENTORY) == [updated], read(page, INVENTORY)
        assert len(cloud.writes) == 1, cloud.writes

        # Exercise callable legacy handlers even though their buttons are disabled.
        blocked = desktop.evaluate("""async ({key,conflicts}) => {
            localStorage.setItem(conflicts, JSON.stringify([key]));
            const outcomes=await Promise.allSettled([
              cloudPutDataset(key,[{id:'old'}]),
              cloudPutDatasetInitial(key,[{id:'old'}],cloudSession()),
              cloudRequest('/rest/v1/user_datasets?on_conflict=user_id,dataset_key',{method:'POST'})
            ]);
            return [await cloudResolveConflictsFromDevice(),outcomes.map(o=>o.status)];
        }""", {"key": INVENTORY, "conflicts": LEGACY_CONFLICTS})
        assert blocked == [False, ["rejected"] * 3]
        assert cloud.legacy_writes == [], cloud.legacy_writes

        # Ambiguous pending work from another generation must survive retries.
        pending = [{"operation_id": "local-unsent", "dataset_key": INVENTORY}]
        pending_context, pending_device = open_device(browser, cloud, seed={
            GENERATION: "old-pending", INVENTORY: json.dumps([stale_row]), OUTBOX: json.dumps(pending)
        })
        for _ in range(2):
            assert not pending_device.evaluate("() => runluCloudMasterSync({silent:true})")
            assert read(pending_device, INVENTORY) == [stale_row]
            assert read(pending_device, OUTBOX) == pending
            assert pending_device.evaluate("key => localStorage.getItem(key)", GENERATION) == "old-pending"
        archived = read(pending_device, "runlu_record_sync_recovery_v1:old-pending")
        assert json.loads(archived["offlineOperations"]) == pending
        assert len(cloud.writes) == 1 and not cloud.legacy_writes
        for context in (desktop_context, mobile_context, pending_context):
            context.close()
        browser.close()
    print("PASS: loaded save guards, generation recovery, desktop/mobile/cloud reload, legacy POST denial")


if __name__ == "__main__":
    main()
