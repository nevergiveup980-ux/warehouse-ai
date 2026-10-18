"""Run isolated bootstrap partial-write fault injection in Node VM."""
from pathlib import Path
import subprocess
import unittest
ROOT=Path(__file__).resolve().parents[1]
class BootstrapFaultInjection(unittest.TestCase):
 def test_partial_write_rollback(self):
  result=subprocess.run(["node",str(ROOT/"tests/bootstrap_atomicity_fault_injection.cjs")],cwd=ROOT,capture_output=True,text=True,timeout=15)
  self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)
if __name__=="__main__":unittest.main()
