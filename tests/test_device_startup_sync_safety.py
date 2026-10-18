"""Contract tests for first-login, established-device, and pending-outbox sync paths.

These are static safety contracts, not device or network integration tests.
"""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
def body(name,next_name):
 a=S.index("async function "+name+"(")
 b=S.index(next_name,a)
 return S[a:b]
class DeviceStartupSyncSafety(unittest.TestCase):
 def test_first_login_bootstrap_retained(self):
  code=body("recordSyncNow","async function cloudUploadAll(")
  self.assertIn("recordSyncPrepareGeneration()",code)
  self.assertIn("await recordSyncBootstrap()",code)
  self.assertIn("await recordSyncPull()",code)
 def test_existing_device_data_blocks_generation_reset(self):
  a=S.index("function recordSyncPrepareGeneration(")
  b=S.index("function recordSyncId(",a)
  code=S[a:b]
  self.assertIn("Pending offline operations: generation reset blocked",code)
  self.assertIn("Existing warehouse records: generation reset blocked",code)
 def test_pending_outbox_blocks_bootstrap_and_pull(self):
  for name,end in [("recordSyncBootstrap","async function recordSyncPull("),("recordSyncPull","async function recordSyncNow(")]:
   code=body(name,end)
   self.assertIn("if(recordSyncOutbox().length)throw",code)
 def test_automatic_sync_does_not_push(self):
  code=body("recordSyncNow","async function cloudUploadAll(")
  self.assertNotIn("await recordSyncPush()",code)
  self.assertIn("automatic replay is on safety hold",code)
if __name__=="__main__":unittest.main()
