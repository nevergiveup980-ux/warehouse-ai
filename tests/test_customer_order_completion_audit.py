"""Safety inventory/order completion audit; no production data touched."""
import pathlib
import re
import unittest

SOURCE = (pathlib.Path(__file__).resolve().parents[1] / "index.html").read_text(encoding="utf-8")

class CustomerOrderCompletionAudit(unittest.TestCase):
    def test_completion_entrypoints_are_explicitly_tracked(self):
        expected = {
            "completeCurrentCustomerOrder",
            "finalizeCustomerOrderInventory",
            "updateLinkedOrder",
        }
        for name in expected:
            with self.subTest(entrypoint=name):
                self.assertRegex(SOURCE, r"function\s+" + name + r"\s*\(")

    @unittest.expectedFailure
    def test_inventory_finalize_checks_save_success(self):
        match = re.search(r"function finalizeCustomerOrderInventory\(.*?\n\}", SOURCE, re.S)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(), r"if\s*\(\s*!save\s*\(\s*INVDB")

    @unittest.expectedFailure
    def test_manual_completion_checks_order_save_success(self):
        match = re.search(r"function completeCurrentCustomerOrder\(\).*?(?=\nfunction )", SOURCE, re.S)
        self.assertIsNotNone(match)
        self.assertRegex(match.group(), r"if\s*\(\s*!save\s*\(\s*ODB")

if __name__ == "__main__":
    unittest.main()
