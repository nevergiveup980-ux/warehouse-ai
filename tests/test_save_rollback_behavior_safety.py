"""Behavioral tests: execute the real save() body in isolated Node VM, never production."""
from pathlib import Path
import subprocess
import unittest
ROOT=Path(__file__).resolve().parents[1]
class SaveRollbackBehavior(unittest.TestCase):
 def test_node_fault_injection(self):
  p=subprocess.run(["node",str(ROOT/"tests"/"save_rollback_fault_injection.cjs")],cwd=ROOT,text=True,capture_output=True,timeout=15)
  self.assertEqual(p.returncode,0,p.stdout+"\n"+p.stderr)
if __name__=="__main__":unittest.main()
