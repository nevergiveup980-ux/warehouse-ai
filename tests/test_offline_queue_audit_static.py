"""Fail closed if the standalone audit acquires network/storage/write capabilities."""
import pathlib
import re
import unittest

PAGE = pathlib.Path(__file__).resolve().parents[1] / 'tools' / 'offline-queue-audit.html'

class ReadOnlyAuditSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = PAGE.read_text(encoding='utf-8')
        cls.script = cls.html.split('<script>', 1)[1].split('</script>', 1)[0]

    def test_no_network_or_storage(self):
        for pattern in (
            r'\bfetch\s*\(', r'\bXMLHttpRequest\b', r'\bWebSocket\b',
            r'\blocalStorage\b', r'\bsessionStorage\b',
            r'\bindexedDB\b', r'\bnavigator\.sendBeacon\b',
            r'\bserviceWorker\b', r'\bimport\s*\(',
        ):
            with self.subTest(pattern=pattern):
                self.assertIsNone(re.search(pattern, self.script), pattern)

    def test_no_external_script_or_forms(self):
        self.assertNotRegex(self.html, r'<script\s+src=')
        self.assertNotRegex(self.html, r'<form\b')
        self.assertNotRegex(self.html, r'<iframe\b')

    def test_local_file_and_export_only(self):
        self.assertIn('await f.text()', self.script)
        self.assertIn('URL.createObjectURL(blob)', self.script)
        self.assertIn('textContent', self.script)
        self.assertNotIn('innerHTML', self.script)

    def test_no_warehouse_sync_functions(self):
        for forbidden in ('recordSyncPush(', 'recordSyncNow(', 'cloudUploadAll(', 'warehouse_apply_operation'):
            self.assertNotIn(forbidden, self.script)

if __name__ == '__main__':
    unittest.main()
