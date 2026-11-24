"""Exercise the production entrypoint against a fake cloud with all network intercepted."""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://warehouse-isolated.test"
CARPET = "runlu_carpet_inventory_v52"
INVENTORY = "runlu_inventory_records_v21"
OUTBOXES = ("runlu_record_sync_outbox_v1", "runlu_cloud_master_offline_queue_v680")


def carpet(key, roll, status, **fields):
    return {"dataset_key": CARPET, "record_id": key, "version": 1,
            "payload": {"id": 7, "roll": roll, "status": status,
                        "collection": "Synthetic", "length": 50, **fields}}


ROWS = [
    carpet("a", "RC2358", "Pending"),
    carpet("b", "RC2358", "Pending", collection="Conflict"),
    carpet("c", "RC2388", "Active", sourceRoll="RC2358", rollNumber="RC2358"),
    carpet("d", "RC2400", "Used Up"),
    carpet("e", "RC2500", "Transferred Out", location="Store"),
    {"dataset_key": INVENTORY, "record_id": "stock", "version": 1,
     "payload": {"id": 40, "quantity": 12, "location": "4B", "status": "Active"}},
]


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("WAREHOUSE_TEST_CHROMIUM") or None)
        for options in ({}, pw.devices["iPhone 13"]):
            context = browser.new_context(service_workers="block", **options)
            rejected = []
            fail = False
            drop_confirmation = False
            receipts = {}
            posts = []
            records = {(row["dataset_key"], row["record_id"]): dict(row) for row in ROWS}

            def intercept(route):
                request = route.request
                url = urlparse(request.url)
                if url.hostname == "warehouse-isolated.test":
                    file = (ROOT / (url.path.lstrip("/") or "index.html")).resolve()
                    if file.is_relative_to(ROOT) and file.is_file():
                        return route.fulfill(path=file)
                if url.hostname == "ekrnknlawekeoszzkamd.supabase.co":
                    if request.method == "GET" and url.path == "/rest/v1/warehouse_records":
                        if fail:
                            return route.fulfill(status=503, json={"message": "synthetic outage"})
                        offset = int(parse_qs(url.query)["offset"][0])
                        live = [row for _, row in sorted(records.items()) if not row.get("deleted")]
                        return route.fulfill(json=live[offset:offset + 2])
                    if request.method == "POST" and url.path == "/rest/v1/rpc/warehouse_cloud_commit":
                        body = request.post_data_json
                        request_id = body["p_request_id"]
                        posts.append(request_id)
                        if request_id in receipts:
                            assert body == receipts[request_id]
                            return route.fulfill(json={"status": "confirmed", "replayed": True})
                        staged = dict(records)
                        for change in body["p_changes"]:
                            key = (change["dataset"], change["recordId"])
                            previous = staged.get(key)
                            if change["version"] != (previous["version"] if previous else 0):
                                return route.fulfill(status=409, json={"message": "stale version"})
                            staged[key] = {"dataset_key": key[0], "record_id": key[1],
                                           "version": change["version"] + 1,
                                           "payload": change["payload"], "deleted": change.get("delete", False)}
                        records.update(staged)
                        receipts[request_id] = body
                        if drop_confirmation:
                            return route.abort()
                        return route.fulfill(json={"status": "confirmed"})
                    rejected.append((request.method, url.path))
                return route.abort()

            context.route("**/*", intercept)
            seed = {
                CARPET: json.dumps([{"id": 999, "roll": "RC9999"}]),
                INVENTORY: json.dumps([{"id": 99, "quantity": 99}]),
                OUTBOXES[0]: '[{"operation_id":"legacy"}]',
                OUTBOXES[1]: '[{"id":"pending"}]',
            }
            session = json.dumps({"access_token": "test", "expires_at": 4102444800,
                                  "user": {"id": "fake", "email": "nevergiveup980@gmail.com"}})
            context.add_init_script(f"""if(location.origin==={json.dumps(ORIGIN)}&&!sessionStorage.getItem('fixture')){{
                for(const [k,v] of Object.entries({json.dumps({**seed, 'runlu_cloud_session_v54': session})}))localStorage.setItem(k,v);
                sessionStorage.setItem('fixture','1');
            }}""")
            page = context.new_page()
            page.set_default_timeout(10000)
            messages = []
            page.on("dialog", lambda dialog: (messages.append(dialog.message), dialog.accept()))
            page.goto(ORIGIN, wait_until="load")

            def open_inventory():
                page.wait_for_function("cloudOnlySnapshot.status==='ready'")
                page.evaluate("accessHideGate(); showPage('carpetInventory')")
                page.locator("#carpetTotalBanner").get_by_text("5", exact=True).first.wait_for()

            def shown(n):
                assert f"{n} roll(s) shown" in page.locator("#carpetCount").inner_text()

            def click_filter(key):
                page.locator(f'#carpetStatusFilters button[data-filter="{key}"]').click()

            open_inventory()
            assert page.evaluate("loadInventoryRecords().map(r=>r.quantity)") == [12]
            for button, count in (("ACTIVE", 1), ("USEDUP", 1), ("TRANSFERRED", 1), ("ALL", 5)):
                click_filter(button)
                shown(count)
                assert "active" in page.locator(f'#carpetStatusFilters [data-filter="{button}"]').get_attribute("class")
            click_filter("TRANSFERRED")
            page.locator("#carpetFilter").fill("2358")
            shown(0)
            click_filter("ALL")
            shown(2)
            assert page.locator("#carpetFilter").input_value() == "2358"
            assert "RC2388" not in page.locator("#carpetInventoryList").inner_text()
            assert "RC9999" not in page.locator("#carpetInventoryList").inner_text()
            page.evaluate("showPage('search')")
            page.locator("#query").fill("2358")
            assert page.locator("#searchList").inner_text().count("RC2358") == 2
            assert "RC2388" not in page.locator("#searchList").inner_text()
            page.evaluate("openCarpetLabelMaker()")
            page.wait_for_function("document.querySelectorAll('#labelLeft option:disabled').length===2")
            assert "1 printable rolls" in page.locator("#carpetCloudLabelStatus").inner_text()
            assert [x.get_attribute("value") for x in page.locator("#labelLeft option:disabled").all()] == ["a", "b"]
            assert page.locator("#labelLeft").input_value() == "c"
            assert not page.evaluate("!!carpetLabelById('a')")
            assert not page.evaluate("save(CARPETDB,[{roll:'RC9999'}])")
            page.reload(wait_until="load")
            open_inventory()
            click_filter("ALL")
            shown(5)
            fail = True
            assert not page.evaluate("refreshWarehouseCloud()")
            assert "Cloud unavailable" in page.locator("#carpetTotalBanner").inner_text()
            assert "RC9999" not in page.locator("#carpetInventoryList").inner_text()
            assert page.evaluate("keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", list(seed)) == seed
            fail = False
            assert page.evaluate("refreshWarehouseCloud()")

            def live_roll(roll):
                return [row["payload"] for (dataset, _), row in records.items()
                        if dataset == CARPET and not row.get("deleted") and row["payload"].get("roll") == roll]

            def operation(kind, roll, qty, **fields):
                page.evaluate("""args => {
                    newOperation('',true);
                    document.getElementById('operationType').value=args.kind;
                    document.getElementById('operationLineType').value=args.kind;
                    document.getElementById('operationStatus').value='Completed';
                    document.getElementById('operationInventoryMode').value='Stock';
                    operationItemsDraft=[{type:args.kind, roll:args.roll, quantity:args.qty,
                       itemStatus:'Received', inventoryMode:'Stock', unit:'Foot',
                       collection:'Test carpet', location:'4B', ...args.fields}];
                }""", {"kind": kind, "roll": roll, "qty": qty, "fields": fields})
                page.evaluate("saveOperation()")

            page.evaluate("""() => {
                clearForm();
                showPage('editor');
                document.getElementById('name').value='New cloud product';
                document.getElementById('location').value='4B';
                document.getElementById('quantity').value='21';
            }""")
            page.evaluate("saveProduct()")
            assert page.evaluate("loadInventoryRecords().some(r=>r.quantity===21)")
            page.evaluate("""() => {
                openInventoryRecordEditor(inventoryRecordIdentity(loadInventoryRecords().find(r=>r.quantity===21)));
                document.getElementById('editInvQuantity').value='22';
            }""")
            page.evaluate("saveInventoryRecordEdits()")
            assert page.evaluate("loadInventoryRecords().some(r=>r.quantity===22)")
            page.evaluate("deleteInventoryRecordSafely(inventoryRecordIdentity(loadInventoryRecords().find(r=>r.quantity===22)))")
            assert not page.evaluate("loadInventoryRecords().some(r=>r.quantity===22)")

            operation("Carpet Receiving", "RC2600", 50)
            assert live_roll("RC2600") and live_roll("RC2600")[0]["length"] == 50, messages[-5:]
            page.evaluate("""() => {
              const id=carpetRecords().find(r=>r.roll==='RC2600').id;
              editCarpetRecord(id);
              document.getElementById('ceLocation').value='5A';
              document.getElementById('ceMeasure').value='TM';
            }""")
            page.evaluate("saveCarpetEdit()")
            assert live_roll("RC2600")[0]["location"] == "5A"
            assert live_roll("RC2600")[0]["measure"] == "TM"

            drop_confirmation = True
            operation("Carpet Cutting", "RC2600", 10, numberOfCuts=1)
            assert live_roll("RC2600")[0]["length"] == 39.75, (live_roll("RC2600"), messages[-5:])
            assert page.evaluate("!!warehousePendingCommand")
            assert page.evaluate("carpetRecords().find(r=>r.roll==='RC2600').length") == 50
            drop_confirmation = False
            assert page.evaluate("sendWarehouseCommand()")
            assert posts[-1] == posts[-2]
            assert page.evaluate("carpetRecords().find(r=>r.roll==='RC2600').length") == 39.75

            operation("Inventory Transfer", "RC2600", 39.75, toLocation="Store",
                      transferRoute="Warehouse → Store", transferWholeRoll=True, transferMode="Whole Roll")
            assert live_roll("RC2600")[0]["status"] == "At Store", (live_roll("RC2600"), messages[-4:])
            operation("Installer Return", "RC2600", 10)
            assert live_roll("RC2600A")[0]["length"] == 10

            page.evaluate("""() => {
              editCarpetRecord(carpetRecords().find(r=>r.roll==='RC2600A').id);
              document.getElementById('ceStatus').value='Used Up';
              document.getElementById('ceMeasure').value='CAL';
              setCarpetEditLength('current',0);
            }""")
            page.evaluate("saveCarpetEdit()")
            assert live_roll("RC2600A")[0]["status"] == "Used Up"
            assert live_roll("RC2600A")[0]["measure"] == "CAL"
            page.evaluate("deleteCarpetRecord()")
            assert not live_roll("RC2600A")
            assert page.evaluate("keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", list(seed)) == seed
            assert not rejected, rejected
            context.close()
        browser.close()
    print("PASS: desktop/iPhone inventory and carpet workflows, cloud acknowledgement, retry, read filters and untouched legacy storage")


if __name__ == "__main__":
    main()
