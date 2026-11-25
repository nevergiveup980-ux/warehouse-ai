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


STOCK_ID = "1792170022853"
STOCK_ALIAS = "INV-20261016170022-022853"
PRODUCT = "runlu_product_master_v21"
RECEIVING = "runlu_receiving_v50"
EVENTS = "runlu_event_history_v52"
STOCK_FIXTURE = [
    {"dataset_key": INVENTORY, "record_id": STOCK_ID, "version": 1,
     "payload": {"id": int(STOCK_ID), "quantity": 88, "unit": "Box", "location": "CR4",
                 "poNumber": "181762", "sourceId": "181762", "masterId": "m1"}},
    {"dataset_key": INVENTORY, "record_id": "different-cloud-id", "version": 1,
     "payload": {"id": 73, "quantity": 23, "unit": "Box", "location": "CR4",
                 "poNumber": "other", "masterId": "m1"}},
    {"dataset_key": PRODUCT, "record_id": "product-one", "version": 1, "payload": {"id": "m1", "name": "Site stock"}},
    {"dataset_key": PRODUCT, "record_id": "product-two", "version": 1, "payload": {"id": "m2", "name": "Alternate"}},
    {"dataset_key": RECEIVING, "record_id": "receipt-181762", "version": 1,
     "payload": {"id": 181762, "quantity": 88, "unit": "Box", "location": "CR4",
                 "poNumber": "181762", "masterId": "m1", "status": "Received", "inventoryPosted": True,
                 "inventoryBefore": 0, "inventoryAfter": 88}},
]


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get("WAREHOUSE_TEST_CHROMIUM") or None)
        for options in ({}, pw.devices["iPhone 13"]):
            context = browser.new_context(service_workers="block", **options)
            rejected = []
            fail = False
            drop_confirmation = False
            reject_write = False
            fail_read_after_write = False
            receipts = {}
            posts = []
            records = {(row["dataset_key"], row["record_id"]): dict(row) for row in ROWS}

            def intercept(route):
                nonlocal fail
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
                        if reject_write:
                            return route.fulfill(status=409, json={"message": "Fixture rejected stale write"})
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
                        if fail_read_after_write:
                            fail = True
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
            prompt_answers = []

            def handle_dialog(dialog):
                messages.append(dialog.message)
                if dialog.type == "prompt" and prompt_answers:
                    dialog.accept(prompt_answers.pop(0))
                else:
                    dialog.accept()

            page.on("dialog", handle_dialog)
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
            records.update({(row["dataset_key"], row["record_id"]): row for row in STOCK_FIXTURE})
            assert page.evaluate("refreshWarehouseCloud()")

            def stock_qty():
                return records[(INVENTORY, STOCK_ID)]["payload"]["quantity"]

            page.evaluate("alias=>openInventoryDetail(alias)", STOCK_ALIAS)
            assert "PO 181762" in page.locator("#inventoryRelatedOrders").inner_text()
            manager = page.locator("#inventoryManagerList")
            row = manager.locator(".item").filter(has_text="PO 181762").first
            row.get_by_role("button", name="Edit Record", exact=True).click()
            assert page.evaluate("editingInventoryRecordId") == STOCK_ID
            page.evaluate("closeInventoryEdit()")

            prompt_answers.extend(["90"])
            row.get_by_role("button", name="Edit Quantity", exact=True).click()
            page.wait_for_function("!warehouseWriteBusy")
            assert stock_qty() == 90, messages[-3:]
            event_rows = [r["payload"] for (k, _), r in records.items() if k == EVENTS]
            assert any(e.get("delta") == 2 and e.get("inventoryRecordId") == STOCK_ID for e in event_rows)

            related = page.locator("#inventoryRelatedOrders details").filter(has_text="Receiving · PO 181762")
            related.locator("summary").click()
            related.locator('[name="quantity"]').fill("86")
            related.locator('[name="notes"]').fill("Verified count")
            related.get_by_role("button", name="Save Correction").click()
            page.wait_for_function("!warehouseWriteBusy")
            assert stock_qty() == 88, messages[-5:]  # +2 count then -2 receipt adjustment
            prompt_answers.extend(["181762", "Verified count again", "86"])
            page.evaluate(f"correctRelatedInventoryOrder('{RECEIVING}','receipt-181762')")
            assert stock_qty() == 88  # Re-saving unchanged quantity must not repost stock.

            page.evaluate("id=>openInventoryDetail(id)", STOCK_ID)
            row.get_by_role("button", name="Receive Here", exact=True).click()
            assert page.evaluate("document.getElementById('rcvProduct').dataset.inventoryRecordId") == STOCK_ID
            page.locator("#rcvQty").fill("5")
            page.evaluate("saveReceiving()")
            assert stock_qty() == 93, messages[-4:]
            assert records[(INVENTORY, "different-cloud-id")]["payload"]["quantity"] == 23

            for button, expected in (("Ship From Here", 90), ("Customer Return", 93)):
                page.evaluate("id=>openInventoryDetail(id)", STOCK_ID)
                row.get_by_role("button", name=button).click()
                assert page.locator("#operationInventoryRecord").input_value() == STOCK_ID
                page.locator("#operationQty").fill("3")
                page.evaluate("saveOperation()")
                assert stock_qty() == expected, messages[-5:]
            operation("Inventory Transfer", "", 93, inventoryRecordId=STOCK_ID,
                      productId="m1", location="CR4", unit="Box", toLocation="Store",
                      transferRoute="Warehouse → Store")
            assert stock_qty() == 0, messages[-5:]
            assert records[(INVENTORY, STOCK_ID)]["payload"]["lifecycleStatus"] == "ARCHIVED"
            operations = "runlu_operations_log_v52"
            transfer_id = next(k for (dataset,k), r in records.items()
                               if dataset == operations and r["payload"].get("inventoryRecordId") == STOCK_ID
                               and r["payload"].get("type") == "Inventory Transfer")
            prompt_answers.extend(["181762", "Transfer recount", "90"])
            page.evaluate("([dataset,id])=>correctRelatedInventoryOrder(dataset,id)", [operations, transfer_id])
            assert stock_qty() == 3, messages[-5:]
            assert records[(INVENTORY, STOCK_ID)]["payload"]["lifecycleStatus"] == "ACTIVE"
            page.evaluate("id=>moveInventoryRecord(id)", STOCK_ID)
            page.evaluate("confirmMoveInventory('m2')")
            assert records[(INVENTORY, STOCK_ID)]["payload"]["masterId"] == "m2"
            page.evaluate("id=>archiveInventoryRecord(id)", STOCK_ID)
            assert records[(INVENTORY, STOCK_ID)]["payload"]["lifecycleStatus"] == "ARCHIVED"
            page.evaluate("id=>openInventoryDetail(id)", STOCK_ID)
            assert page.locator("#inventoryManagerList details").first.count()
            page.evaluate("id=>deleteInventoryRecordSafely(id)", STOCK_ID)
            assert records[(INVENTORY, STOCK_ID)]["deleted"]
            assert "Build 128" in page.locator("#headerVersion").inner_text()
            other_stock = "different-cloud-id"
            multi_order = {"id": 347, "type": "Shipping", "po": "other", "status": "Completed",
                           "quantity": 10, "unit": "Box", "impactApplied": True, "items": [
                               {"quantity": 10, "unit": "Box", "inventoryEffects": [
                                   {"recordId": other_stock, "delta": -10, "unit": "Box"}]},
                               {"quantity": 20, "unit": "SY", "stockQuantity": 2, "inventoryEffects": [
                                   {"recordId": other_stock, "delta": -2, "unit": "Box"}]},
                           ]}
            records[(operations, "multi-order")] = {"dataset_key": operations, "record_id": "multi-order",
                                                   "version": 1, "payload": multi_order}
            assert page.evaluate("refreshWarehouseCloud()")
            page.evaluate("id=>openInventoryDetail(id)", other_stock)
            correction = page.locator("#inventoryRelatedOrders details").filter(has_text="Shipping · PO other")
            correction.locator("summary").click()
            correction.locator('[name="quantity0"]').fill("8")
            correction.locator('[name="quantity1"]').fill("30")
            correction.locator('[name="stock1"]').fill("3")
            correction.get_by_role("button",name="Save Correction").click()
            page.wait_for_function("!warehouseWriteBusy")
            assert records[(INVENTORY, other_stock)]["payload"]["quantity"] == 24, messages[-4:]
            posted = records[(operations, "multi-order")]["payload"]["items"]
            assert [x["inventoryEffects"][0]["delta"] for x in posted] == [-8,-3]
            correction.locator("summary").click()
            correction.get_by_role("button",name="Save Correction").click()
            page.wait_for_function("!warehouseWriteBusy")
            assert records[(INVENTORY, other_stock)]["payload"]["quantity"] == 24
            operation("REM / Remnant Transfer", "RC2600", 2)
            assert any(r["payload"].get("sourceRoll") == "RC2600" for (dataset,_),r in records.items()
                       if dataset == "runlu_remnants_v55")
            # Field case: legacy payload IDs repeat on unrelated rows, canonical keys are distinct.
            extra = [carpet("roll-target", "RC2280", "Active", length=22 + 7 / 12,
                            originalLength=22 + 7 / 12, measure="TM", id=1872098562),
                     carpet("roll-unrelated-a", "RC2701", "Active", id=202611162359),
                     carpet("roll-unrelated-b", "RC2702", "Active", id=202611162359)]
            records.update({(row["dataset_key"], row["record_id"]): row for row in extra})
            assert page.evaluate("refreshWarehouseCloud()")
            page.evaluate("openCarpetTM(carpetRecords().find(r=>r.roll==='RC2280').id)")
            page.locator("#ceLengthFeet").fill("5")
            page.locator("#ceLengthInches").fill("9")
            reject_write = True
            before = len(messages)
            page.evaluate("saveCarpetEdit()")
            assert live_roll("RC2280")[0]["length"] == 22 + 7 / 12
            assert page.locator("#carpetEditor").is_visible()
            assert all("saved and verified" not in m for m in messages[before:])
            reject_write = False
            fail_read_after_write = True
            before = len(messages)
            page.evaluate("saveCarpetEdit()")
            assert live_roll("RC2280")[0]["length"] == 5.75
            assert page.locator("#carpetEditor").is_visible()
            assert all("saved and verified" not in m for m in messages[before:])
            assert page.evaluate("warehousePendingCommand.confirmed")
            writes = len(posts)
            fail = False
            fail_read_after_write = False
            assert page.evaluate("sendWarehouseCommand()")
            assert len(posts) == writes
            cmd = receipts[posts[-1]]
            assert [x["recordId"] for x in cmd["p_changes"]] == ["roll-target"]
            assert cmd["p_changes"][0]["measurement"] is True
            assert live_roll("RC2701")[0]["length"] == 50
            assert live_roll("RC2702")[0]["length"] == 50
            page.reload(wait_until="load")
            page.wait_for_function("cloudOnlySnapshot.status==='ready'")
            assert page.evaluate("carpetRecords().find(r=>r.roll==='RC2280').length") == 5.75
            peer_options = pw.devices["iPhone 13"] if not options else {}
            peer = browser.new_context(service_workers="block", storage_state=context.storage_state(), **peer_options)
            peer.route("**/*", intercept)
            peer_page = peer.new_page()
            peer_page.goto(ORIGIN, wait_until="load")
            peer_page.wait_for_function("cloudOnlySnapshot.status==='ready'")
            assert peer_page.evaluate("carpetRecords().find(r=>r.roll==='RC2280').length") == 5.75
            peer.close()


            assert page.evaluate("keys=>Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]))", list(seed)) == seed
            assert not rejected, rejected
            context.close()
        browser.close()
    print("PASS: desktop/iPhone inventory and carpet workflows, cloud acknowledgement, retry, read filters and untouched legacy storage")


if __name__ == "__main__":
    main()
