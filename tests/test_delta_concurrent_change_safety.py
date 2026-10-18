"""Prevent stale delta pages from overwriting edits made during hydration."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class DeltaConcurrentChangeSafety(unittest.TestCase):
 def test_local_mutation_and_cursor_checked_before_commit(self):
  a=S.index("async function recordSyncPull(){")
  b=S.index("async function recordSyncNow(",a)
  code=S[a:b]
  self.assertIn("for(const [key,oldValue] of originals)if(localStorage.getItem(key)!==oldValue)",code)
  self.assertIn("Local warehouse data changed during cloud pull: overwrite blocked",code)
  self.assertIn("Number(localStorage.getItem(RECORD_SYNC_CURSOR_KEY)||0)!==cursor",code)
  self.assertIn("Cloud cursor changed during pull: stale delta page blocked",code)
  self.assertLess(code.index("Local warehouse data changed during cloud pull"),code.index("for(const [key,list] of staged)localStorage.setItem"))
if __name__=="__main__":unittest.main()
