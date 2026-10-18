"""Regression checks for local save rollback and truthful storage error guidance."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class SaveRollbackSafety(unittest.TestCase):
 def test_rollback_restores_outbox_and_business_record(self):
  a=S.index("function save(k,v){")
  b=S.index("const CLOUD_URL=",a)
  code=S[a:b]
  self.assertIn("previousRaw=localStorage.getItem(k)",code)
  self.assertIn("previousOutboxRaw=localStorage.getItem(outboxKey)",code)
  self.assertIn("localStorage.setItem(outboxKey,previousOutboxRaw)",code)
  self.assertIn("localStorage.setItem(k,previousRaw)",code)
  self.assertIn("if(!rollback())return false",code)
 def test_save_does_not_claim_cloud_synced_on_quota_failure(self):
  a=S.index("function save(k,v){")
  b=S.index("const CLOUD_URL=",a)
  code=S[a:b]
  self.assertIn("Local-only operations may NOT be in the cloud",code)
  self.assertIn("do not clear this site’s browser data",code)
  self.assertNotIn("confirm Cloud ✓",code)
if __name__=="__main__":unittest.main()
