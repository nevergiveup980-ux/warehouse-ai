"""Static release gates: never confuse passing CI with ready-to-deploy behavior."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[1]
S=(ROOT/"index.html").read_text(encoding="utf-8")
DOC=(ROOT/"docs/release-readiness-gates-2026-10-18.md").read_text(encoding="utf-8")
class ReleaseReadinessSafety(unittest.TestCase):
 def test_release_stays_no_go_without_reconciliation(self):
  self.assertIn("NO-GO",DOC)
  self.assertIn("Normal editing with pending queue",DOC)
  self.assertIn("Backup and rollback",DOC)
 def test_pending_outbox_remains_preserved_on_save(self):
  a=S.index("function queueRecordDeltaSave(")
  b=S.index("async function recordSyncPush()",a)
  code=S[a:b]
  self.assertIn("q=recordSyncOutbox()",code)
  self.assertIn("q.push(",code)
  self.assertIn("setRecordSyncOutbox(q)",code)
  self.assertNotIn("q.shift()",code)
 def test_pending_outbox_cannot_auto_replay(self):
  a=S.index("async function recordSyncNow(")
  b=S.index("async function cloudUploadAll(",a)
  self.assertNotIn("await recordSyncPush()",S[a:b])
if __name__=="__main__":unittest.main()
