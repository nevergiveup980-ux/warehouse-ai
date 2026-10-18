"""Keep legacy cloud upload/download paths behind the pending-outbox guard."""
from pathlib import Path
import unittest
S=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class LegacyCloudOutboxGuard(unittest.TestCase):
 def test_guard_reads_record_outbox(self):
  self.assertIn("function assertLegacyCloudSyncOutboxClear(){if(recordSyncOutbox().length)throw",S)
 def test_legacy_entrypoints_check_outbox(self):
  for name,args in [
   ("cloudSmartSync","silent=false"),
   ("cloudUploadAll",""),
   ("cloudResolveConflictsFromDevice",""),
   ("cloudResolveConflictsFromCloud",""),
   ("flushCloudDirty","keys=null"),
   ("applyCloudRows","rows,silent=false,keys=null,clearSelectedDirty=false"),
   ("cloudPutDatasetInitial","key,value,s"),
  ]:
   self.assertIn(f"async function {name}({args}){{assertLegacyCloudSyncOutboxClear();",S,name)
if __name__=="__main__":unittest.main()
