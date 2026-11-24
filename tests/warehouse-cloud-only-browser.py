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
                        return route.fulfill(json=ROWS[offset:offset + 2])
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
            page.on("dialog", lambda dialog: dialog.dismiss())
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
            assert not rejected, rejected
            context.close()
        browser.close()
    print("PASS: desktop and iPhone viewport filters, current roll mapping, duplicate label guard, reload, offline and unchanged legacy storage")


if __name__ == "__main__":
    main()
