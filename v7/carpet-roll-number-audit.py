#!/usr/bin/env python3
"""Read-only audit of company-owned carpet roll numbers in a V6 snapshot."""
import argparse,json,re
from collections import Counter,defaultdict

def key(v):
    return str(v or "").strip().upper()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("snapshot")
    ap.add_argument("--report",required=True)
    args=ap.parse_args()
    rows=json.load(open(args.snapshot,encoding="utf-8"))
    carpets=[r for r in rows if r.get("dataset_key")=="runlu_carpet_inventory_v52" and not r.get("deleted_at")]
    by_roll=defaultdict(list)
    status_counts=Counter()
    missing=[]
    for r in carpets:
        p=r.get("payload") or {}
        roll=key(p.get("roll"))
        status=key(p.get("status")) or "BLANK"
        status_counts[status]+=1
        if not roll:
            missing.append(r.get("record_id"))
            continue
        by_roll[roll].append(r)

    active_rolls={}
    for roll,members in by_roll.items():
        active=[r for r in members if key((r.get("payload") or {}).get("status"))=="ACTIVE"]
        if active: active_rolls[roll]=active

    occurrences=Counter(len(v) for v in by_roll.values())
    active_occurrences=Counter(len(v) for v in active_rolls.values())
    duplicate_rolls={k:v for k,v in by_roll.items() if len(v)>1}
    active_duplicate_rolls={k:v for k,v in active_rolls.items() if len(v)>1}

    label_collisions=[]
    state_variants=[]
    for roll,members in active_rolls.items():
        labels={(key((r.get("payload") or {}).get("collection")),key((r.get("payload") or {}).get("colour"))) for r in members}
        states={(key((r.get("payload") or {}).get("location")),str((r.get("payload") or {}).get("length") or "").strip(),key((r.get("payload") or {}).get("measure"))) for r in members}
        if len(labels)>1:
            label_collisions.append({"roll":roll,"records":len(members),"labels":sorted([list(x) for x in labels])})
        if len(states)>1:
            state_variants.append({"roll":roll,"records":len(members),"states":len(states)})

    prefixes=Counter()
    for roll in active_rolls:
        m=re.match(r"([A-Z]+)",roll)
        prefixes[m.group(1) if m else "OTHER"]+=1

    report={
      "mode":"V6_COMPANY_CARPET_ROLL_NUMBER_AUDIT",
      "production_writes":0,
      "identity_rule":"trimmed_uppercase_payload.roll",
      "manufacturer_roll_used_for_identity":False,
      "source_roll_used_for_identity":False,
      "source_rows":{
        "live_carpet_rows":len(carpets),
        "rows_with_company_roll":sum(len(v) for v in by_roll.values()),
        "rows_missing_company_roll":len(missing),
        "status_counts":dict(sorted(status_counts.items()))
      },
      "distinct_company_rolls":{
        "all_live_statuses":len(by_roll),
        "active":len(active_rolls)
      },
      "duplicates":{
        "rolls_repeated_all_live_statuses":len(duplicate_rolls),
        "extra_rows_beyond_one_per_roll_all_live_statuses":sum(len(v)-1 for v in duplicate_rolls.values()),
        "active_rolls_repeated":len(active_duplicate_rolls),
        "extra_active_rows_beyond_one_per_roll":sum(len(v)-1 for v in active_duplicate_rolls.values()),
        "occurrence_histogram_all":{str(k):v for k,v in sorted(occurrences.items())},
        "occurrence_histogram_active":{str(k):v for k,v in sorted(active_occurrences.items())}
      },
      "active_quality":{
        "same_roll_multiple_name_colour_pairs":len(label_collisions),
        "same_roll_multiple_location_length_measure_states":len(state_variants),
        "prefix_counts":dict(sorted(prefixes.items()))
      },
      "samples":{
        "most_repeated_active":[
          {"roll":roll,"active_records":len(members)}
          for roll,members in sorted(active_duplicate_rolls.items(),key=lambda kv:(-len(kv[1]),kv[0]))[:20]
        ],
        "name_colour_collision_rolls":[x["roll"] for x in label_collisions[:20]],
        "state_variant_rolls":[x["roll"] for x in sorted(state_variants,key=lambda x:(-x["records"],x["roll"]))[:20]]
      }
    }
    with open(args.report,"w",encoding="utf-8") as f:
        json.dump(report,f,indent=2,ensure_ascii=False);f.write("\n")
    print("COMPANY ROLL AUDIT:",json.dumps(report,sort_keys=True))
    print("COMPANY_ROLL_ACTIVE_DISTINCT:",len(active_rolls))
    print("COMPANY_ROLL_ALL_DISTINCT:",len(by_roll))
    print("COMPANY_ROLL_DUPLICATE_EXTRA_ACTIVE_ROWS:",report["duplicates"]["extra_active_rows_beyond_one_per_roll"])
    print("V6 COMPANY CARPET ROLL NUMBER AUDIT: PASS")

if __name__=="__main__":
    main()
