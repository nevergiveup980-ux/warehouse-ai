"""Safety regression contract for warehouse seed initialization (no production data)."""
import pathlib
import re
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "index.html"
START = "function initializeSeedDatabase(showMessage=false){"
END = "\nfunction backupBeforeV516()"
AUTO = "function autoInitializeSeed(){"

class SeedSafetyContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = SOURCE.read_text(encoding="utf-8")
        cls.seed = cls.source.split(START, 1)[1].split(END, 1)[0]
        cls.auto = cls.source.split(AUTO, 1)[1].split("\n}", 1)[0]

    def test_auto_startup_never_invokes_seed_import(self):
        self.assertNotIn("initializeSeedDatabase(", self.auto)
        self.assertIn("return false;", self.auto)

    def test_manual_first_import_requires_confirmation(self):
        self.assertIn("if(!showMessage)return false;", self.seed)
        self.assertRegex(self.seed, r"if\(!confirm\(")

    def test_marker_blocks_reimport(self):
        self.assertIn("localStorage.getItem('runlu_v30_seed_initialized')", self.seed)
        self.assertLess(self.seed.index("localStorage.getItem('runlu_v30_seed_initialized')"), self.seed.index("const masters=loadMasters()"))

    def test_legacy_seed_ids_block_reimport(self):
        self.assertIn("seedInv.some(x=>inv.some(r=>String(r.id)===String(x.id)))", self.seed)
        self.assertIn("if(inv.length)", self.seed)
        self.assertNotIn("save(PMDB,masters)", self.seed)
        self.assertNotIn("save(INVDB,inv)", self.seed)

    def test_original_nine_seed_ids_unchanged(self):
        ids = re.findall(r"\{id:(3000[1-9]),masterId:", self.seed)
        self.assertEqual(ids, [str(x) for x in range(30001, 30010)])

    def test_sync_outbox_not_manipulated_by_patch(self):
        self.assertNotIn("setRecordSyncOutbox", self.seed)
        self.assertNotIn("recordSyncPush(", self.seed)
        self.assertNotIn("recordSyncPull(", self.seed)

if __name__ == "__main__":
    unittest.main()
