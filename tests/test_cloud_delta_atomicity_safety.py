"""Verify cloud delta pages stage writes and roll back local data and cursor."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class DeltaAtomicitySafety(unittest.TestCase):
 def test_delta_page_staging_and_rollback(self):
  a=S.index("async function recordSyncPull(){")
  b=S.index("async function recordSyncNow(",a)
  code=S[a:b]
  self.assertIn("const staged=new Map(),originals=new Map()",code)
  self.assertIn("originals.set(RECORD_SYNC_CURSOR_KEY",code)
  self.assertIn("for(const [key,list] of staged)localStorage.setItem",code)
  self.assertIn("for(const [key,oldValue] of originals)",code)
  self.assertIn("Cloud delta failed and rollback was incomplete",code)
  self.assertIn("cursor=nextCursor;count+=pageCount",code)
if __name__=="__main__":unittest.main()
