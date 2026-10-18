"""Guard the direct replay entry point as well as background sync."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class DirectReplayHold(unittest.TestCase):
 def test_direct_replay_fails_closed_before_rpc(self):
  a=S.index("async function recordSyncPush(){")
  b=S.index("async function recordSyncBootstrap()",a)
  code=S[a:b]
  hold=code.index("throw new Error('Offline queue replay is disabled")
  rpc=code.index("warehouse_apply_operation")
  self.assertLess(hold,rpc)
 def test_record_sync_now_does_not_call_push(self):
  a=S.index("async function recordSyncNow(")
  b=S.index("async function cloudUploadAll(",a)
  self.assertNotIn("recordSyncPush()",S[a:b])
if __name__=="__main__":unittest.main()
