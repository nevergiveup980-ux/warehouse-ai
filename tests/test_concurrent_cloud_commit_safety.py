"""Guard against local edits arriving while cloud snapshot/delta is awaiting network."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class ConcurrentCloudCommitSafety(unittest.TestCase):
 def test_bootstrap_rechecks_before_commit(self):
  a=S.index("async function recordSyncBootstrap(){")
  b=S.index("async function recordSyncPull(){",a)
  code=S[a:b]
  self.assertLess(code.index("const writes="),code.rindex("recordSyncAssertBootstrapSafe();"))
  self.assertLess(code.rindex("recordSyncAssertBootstrapSafe();"),code.index("for(const [k,v] of writes)localStorage.setItem(k,v)"))
 def test_delta_rechecks_queue_before_commit(self):
  a=S.index("async function recordSyncPull(){")
  b=S.index("async function recordSyncNow(",a)
  code=S[a:b]
  self.assertIn("Pending offline operations appeared during cloud pull",code)
  self.assertLess(code.index("Pending offline operations appeared during cloud pull"),code.index("for(const [key,list] of staged)localStorage.setItem(key,JSON.stringify(list))"))
if __name__=="__main__":unittest.main()
