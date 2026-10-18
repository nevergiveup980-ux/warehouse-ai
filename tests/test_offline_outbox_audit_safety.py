"""Offline queue review tool must stay read-only and preserve operation order."""
import sys
import json
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
from audit_offline_outbox import analyze,extract_outbox
class OfflineOutboxAuditSafety(unittest.TestCase):
 def test_mixed_repeated_operations_are_flagged_without_modification(self):
  rows=[{"operation_id":"a","dataset_key":"inventory","record_id":"30001","base_version":None,"delete":True},{"operation_id":"b","dataset_key":"inventory","record_id":"30001","base_version":None,"delete":False}]
  original=[dict(x) for x in rows]
  report=analyze(rows)
  self.assertEqual(report["operations"],2)
  self.assertEqual(report["mixed_delete_upsert_groups"],1)
  self.assertEqual(report["repeated_record_groups"],1)
  self.assertFalse(report["automatic_replay_allowed"])
  self.assertEqual(rows,original)
 def test_emergency_backup_raw_outbox(self):
  rows=[{'operation_id':'a','dataset_key':'inventory','record_id':'1','delete':False}]
  self.assertEqual(extract_outbox({'rawOutbox':json.dumps(rows)}),rows)
 def test_empty_outbox(self):
  self.assertEqual(analyze([])["operations"],0)
 def test_unrecognized_backup_fails_closed(self):
  with self.assertRaises(ValueError):extract_outbox({"warehouse": [{"id":1}]})
if __name__=="__main__":unittest.main()
