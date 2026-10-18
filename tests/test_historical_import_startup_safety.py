"""Ensure startup never invokes historical stock import routines."""
from pathlib import Path
import re
import unittest
SRC=(Path(__file__).resolve().parents[1]/"index.html").read_text(encoding="utf-8")
class HistoricalImportStartupContract(unittest.TestCase):
 def test_legacy_imports_absent_from_startup_steps(self):
  start=SRC.index("// Emergency-safe startup:")
  end=SRC.index("].forEach(([name,fn])=>safeStartupStep(name,fn));",start)
  startup=SRC[start:end]
  for name in ("applyV516WarehouseDataset", "applyV5515FieldProducts", "applyV5522UnderlaymentSpecs"):
   self.assertNotIn("()=>"+name+"(",startup)
  self.assertIn("historicalInventoryImportSafetyHold",startup)
  for name in ("repairMissingCarpetRollsFromReceiving", "reconcileCompletedCustomerOrderInventory", "repairCompletedStockTransfers", "reconcileTransferredCarpetStatuses", "recoverOrderLibraries", "restoreConversationOrders"):
   self.assertNotIn("()=>"+name+"(",startup)
  self.assertIn("missingCarpetRollRecoverySafetyHold",startup)
  self.assertIn("completedOrderInventorySafetyHold",startup)
  for name in ("repairCompletedStockTransfers", "reconcileTransferredCarpetStatuses", "recoverOrderLibraries", "restoreConversationOrders"):
   self.assertIn(name+"SafetyHold",startup)
 def test_functions_preserved_for_manual_review(self):
  for name in ("applyV516WarehouseDataset", "applyV5515FieldProducts", "applyV5522UnderlaymentSpecs"):
   self.assertIn("function "+name+"(",SRC)
if __name__=="__main__":
 unittest.main()
