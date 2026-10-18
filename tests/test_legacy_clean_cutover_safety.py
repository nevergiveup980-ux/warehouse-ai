"""Legacy clean-cloud cutover must not delete existing records at startup."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class LegacyCutoverSafety(unittest.TestCase):
 def test_legacy_cutover_function_preserved_but_not_invoked_at_startup(self):
  start=S.index("function enforceCleanCloudCutover(){")
  end=S.index("const ACCESS_ROLE_KEY=",start)
  block=S[start:end]
  self.assertIn("function enforceCleanCloudCutover(){",block)
  self.assertIn("remove.forEach(k=>localStorage.removeItem(k))",block)
  self.assertNotIn("\nenforceCleanCloudCutover();",block)
  self.assertIn("// enforceCleanCloudCutover();",block)
 def test_no_other_direct_cutover_calls(self):
  import re
  self.assertEqual(len(re.findall(r"(?m)^\s*(?!//)enforceCleanCloudCutover\(\);",S)),0)
if __name__=="__main__":unittest.main()
