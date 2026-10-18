"""Chromium smoke test for the standalone audit. Synthetic data only."""
import json
import pathlib
import tempfile
import unittest
from playwright.sync_api import sync_playwright

PAGE = pathlib.Path(__file__).resolve().parents[1] / 'tools' / 'offline-queue-audit.html'

class BrowserSmoke(unittest.TestCase):
    def test_local_file_audit_and_csv(self):
        ops = [
            {'operation_id':'a','dataset_key':'inventory','record_id':'R1','delete':False,'payload':{},'base_version':None},
            {'operation_id':'b','dataset_key':'inventory','record_id':'R1','delete':True,'payload':{},'base_version':None},
            {'operation_id':'c','dataset_key':'inventory','record_id':'R2','delete':False,'payload':{},'base_version':None},
        ]
        export={'format':'RUNLU Offline Queue Emergency Export','storageKey':'runlu_record_sync_outbox_v1','operationCount':len(ops),'rawOutbox':json.dumps(ops)}
        with tempfile.TemporaryDirectory() as folder:
            p=pathlib.Path(folder)/'synthetic.json';p.write_text(json.dumps(export),encoding='utf-8')
            with sync_playwright() as pw:
                browser=pw.chromium.launch(headless=True)
                context=browser.new_context(accept_downloads=True)
                page=context.new_page()
                requests=[]
                page.on('request',lambda req: requests.append(req.url) if req.url.startswith(('http://','https://')) else None)
                page.goto(PAGE.resolve().as_uri())
                page.locator('#file').set_input_files(str(p))
                page.locator('#results').wait_for(state='visible')
                self.assertIn('3 operations / 2 record groups / 1 groups containing deletes / 1 groups with delete-write transitions',page.locator('#summary').inner_text())
                with page.expect_download() as download:
                    page.locator('#csv').click()
                path=download.value.path()
                csv=pathlib.Path(path).read_text(encoding='utf-8')
                self.assertIn('DELETE',csv)
                self.assertIn('R1',csv)
                self.assertFalse(requests,requests)
                browser.close()

    def test_invalid_export_is_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p=pathlib.Path(folder)/'invalid.json';p.write_text('{"not":"an export"}',encoding='utf-8')
            with sync_playwright() as pw:
                browser=pw.chromium.launch(headless=True)
                page=browser.new_page()
                page.goto(PAGE.resolve().as_uri())
                page.locator('#file').set_input_files(str(p))
                self.assertIn('Audit stopped',page.locator('#status').inner_text())
                self.assertFalse(page.locator('#results').is_visible())
                browser.close()

if __name__=='__main__':
    unittest.main()
