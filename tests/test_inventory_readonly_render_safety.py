"""Static guard: inventory browsing must never invoke stock reconciliation."""
import pathlib
import re
import unittest

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"

class InventoryReadOnlySafety(unittest.TestCase):
    def test_inventory_render_and_search_do_not_reconcile(self):
        source = INDEX.read_text(encoding="utf-8")
        for name in ("renderInventory", "renderSearch"):
            with self.subTest(function=name):
                match = re.search(r"function\s+" + name + r"\s*\(\)\s*\{", source)
                self.assertIsNotNone(match)
                opening = source[match.end():match.end()+250]
                self.assertNotIn("reconcileCompletedCustomerOrderInventory(", opening)

if __name__ == "__main__":
    unittest.main()
