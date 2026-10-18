"""Execute bootstrap safety preflight with isolated Node VM and fake localStorage."""
from pathlib import Path
import subprocess
import unittest
ROOT=Path(__file__).resolve().parents[1]
class BootstrapPreflightSafety(unittest.TestCase):
 def test_behavior(self):
  result=subprocess.run(["node",str(ROOT/"tests/bootstrap_preflight_safety.cjs")],cwd=ROOT,capture_output=True,text=True,timeout=15)
  self.assertEqual(result.returncode,0,result.stdout+"\n"+result.stderr)
if __name__=="__main__":unittest.main()
