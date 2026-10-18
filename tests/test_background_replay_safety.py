"""Guard against accidental background replay of pending offline operations."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class BackgroundReplaySafety(unittest.TestCase):
 def test_record_sync_now_does_not_push(self):
  a=S.index("async function recordSyncNow(") if "async function recordSyncNow(" in S else S.index("function recordSyncNow(")
  b=S.index("\nasync function cloudUploadAll(",a)
  code=S[a:b]
  self.assertNotIn("await recordSyncPush()",code)
  self.assertIn("recordSyncOutbox().length",code)
  self.assertIn("automatic replay is on safety hold",code)
 def test_explicit_push_function_preserved(self):
  self.assertIn("async function recordSyncPush()",S)
if __name__=="__main__":unittest.main()
