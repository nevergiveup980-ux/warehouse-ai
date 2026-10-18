#!/usr/bin/env python3
"""Read-only analysis of a RUNLU record-sync outbox JSON export.

Accepts either an array or a backup object containing a known outbox array.
Never writes to the source, replays operations, or accesses the network.
"""
import argparse
import collections
import json
from pathlib import Path

def extract_outbox(document):
    if isinstance(document,list): return document
    if not isinstance(document,dict): raise ValueError("Expected JSON array or backup object")
    if "rawOutbox" in document:\n        raw=document["rawOutbox"]\n        if not isinstance(raw,str): raise ValueError("rawOutbox must be a JSON string")\n        decoded=json.loads(raw)\n        if not isinstance(decoded,list): raise ValueError("rawOutbox must decode to an array")\n        return decoded\n    for key in ("recordSyncOutbox","record_sync_outbox","offlineQueue","offline_queue","outbox","operations"):
        value=document.get(key)
        if isinstance(value,list): return value
    raise ValueError("No recognized outbox array in backup; refusing to guess")

def analyze(rows):
    if not all(isinstance(x,dict) for x in rows): raise ValueError("Outbox entries must be objects")
    groups=collections.defaultdict(list)
    missing_version=0
    for index,op in enumerate(rows):
        groups[(str(op.get("dataset_key","")),str(op.get("record_id","")))].append((index,op))
        if op.get("base_version") is None: missing_version+=1
    repeated={key:items for key,items in groups.items() if len(items)>1}
    mixed={key:items for key,items in groups.items() if len({bool(x.get("delete")) for _,x in items})>1}
    missing_identity=sum(not op.get("dataset_key") or not op.get("record_id") or not op.get("operation_id") for op in rows)
    duplicate_operation_ids=sum(n-1 for n in collections.Counter(str(x.get("operation_id")) for x in rows).values() if n>1)
    return {"operations":len(rows),"upserts":sum(not x.get("delete") for x in rows),"deletes":sum(bool(x.get("delete")) for x in rows),"missing_base_version":missing_version,"record_groups":len(groups),"repeated_record_groups":len(repeated),"mixed_delete_upsert_groups":len(mixed),"missing_identity_fields":missing_identity,"duplicate_operation_ids":duplicate_operation_ids,"review_required":bool(rows),"automatic_replay_allowed":False}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source",type=Path,help="Local JSON export of offline record operations")
    args=parser.parse_args()
    result=analyze(extract_outbox(json.loads(args.source.read_text(encoding="utf-8"))))
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
