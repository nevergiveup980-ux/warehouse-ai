"""Guard against implicit inventory mutation while browsing or searching."""
import pathlib
import re
import unittest

INDEX = pathlib.Path(__file__).resolve().parents[1] / "index.html"
RECONCILE = "reconcileCompletedCustomerOrderInventory"

def function_body(source, name):
    match = re.search(r"function\s+" + re.escape(name) + r"\s*\(\)\s*\{", source)
    if match is None:
        raise AssertionError(f"Missing function: {name}")
    # Check the complete body, not just the first few lines.
    start = match.end()
    depth = 1
    quote = None
    escaped = False
    for pos in range(start, len(source)):
        char = source[pos]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in ("'", '"', "`"):
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return source[start:pos]
    raise AssertionError(f"Unterminated function: {name}")

class InventoryReadOnlySafety(unittest.TestCase):
    def test_inventory_render_and_search_do_not_reconcile(self):
        source = INDEX.read_text(encoding="utf-8")
        for name in ("renderInventory", "renderSearch"):
            with self.subTest(function=name):
                self.assertNotIn(RECONCILE + "(", function_body(source, name))

    def test_reconciliation_is_not_invoked_implicitly_anywhere(self):
        source = INDEX.read_text(encoding="utf-8")
        # The function is preserved for later reviewed business migrations,
        # but must not run during browsing or startup.
        matches = list(re.finditer(r"\b" + RECONCILE + r"\s*\(", source))
        self.assertEqual(1, len(matches), "Unexpected reconciliation caller")

if __name__ == "__main__":
    unittest.main()
