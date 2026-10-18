"""Cloud snapshot bootstrap must restore all touched localStorage keys on partial failure."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class BootstrapAtomicitySafety(unittest.TestCase):
 def test_snapshot_commit_has_rollback(self):
  a=S.index("async function recordSyncBootstrap(){")
  b=S.index("async function recordSyncPull(){",a)
  code=S[a:b]
  self.assertIn("const originals=new Map(writes.map",code)
  self.assertIn("for(const [k,v] of writes)localStorage.setItem(k,v)",code)
  self.assertIn("for(const [k,oldValue] of originals)",code)
  self.assertIn("localStorage.removeItem(k)",code)
  self.assertIn("rollback was incomplete",code)
  self.assertIn("writes.push([RECORD_SYNC_BOOTSTRAP_KEY,'1'])",code)
if __name__=="__main__":unittest.main()
