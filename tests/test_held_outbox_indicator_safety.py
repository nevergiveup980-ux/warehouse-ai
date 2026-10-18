"""Held outbox must never be presented as a successful cloud sync."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class HeldOutboxIndicatorSafety(unittest.TestCase):
 def test_held_queue_precedes_syncing_and_cloud_success(self):
  a=S.index("function updateHeaderCloudPill(")
  b=S.index("function cloudRememberSummary(",a)
  code=S[a:b]
  self.assertLess(code.index("heldOutbox=recordSyncOutbox().length"),code.index("if(state==='syncing'||cloudSyncBusy)"))
  self.assertLess(code.index("if(heldOutbox)"),code.index("if(recentOk)"))
  self.assertIn("Local only ·",code)
  self.assertIn("NOT synced to cloud or other devices",code)
 def test_corrupt_queue_does_not_show_cloud_success(self):
  a=S.index("function updateHeaderCloudPill(")
  b=S.index("function cloudRememberSummary(",a)
  code=S[a:b]
  self.assertIn("Queue error · local only",code)
if __name__=="__main__":unittest.main()
