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
    active_rows=[]
    for roll,members in by_roll.items():
        active=[r for r in members if key((r.get("payload") or {}).get("status"))=="ACTIVE"]
        if active:
            active_rolls[roll]=active
            active_rows.extend(active)

    # Legacy payload.id is not the warehouse-facing roll number. Audit it only as
    # migration evidence for repeated source rows and shared legacy roll numbers.
    active_by_payload_id=defaultdict(list)
    active_missing_payload_id=[]
    for r in active_rows:
        p=r.get("payload") or {}
        pid=str(p.get("id") if p.get("id") is not None else "").strip()
        if pid:
            active_by_payload_id[pid].append(r)
        else:
            active_missing_payload_id.append(r)

    payload_id_roll_collisions=[]
    payload_id_state_variants=[]
    for pid,members in active_by_payload_id.items():
        rolls={key((x.get("payload") or {}).get("roll")) for x in members}
        states={
          (key((x.get("payload") or {}).get("collection")),
           key((x.get("payload") or {}).get("colour")),
           key((x.get("payload") or {}).get("location")),
           str((x.get("payload") or {}).get("length") or "").strip(),
           str((x.get("payload") or {}).get("originalLength") or "").strip(),
           key((x.get("payload") or {}).get("measure")))
          for x in members
        }
        if len(rolls)>1:
            payload_id_roll_collisions.append({"payload_id":pid,"rolls":sorted(rolls),"records":len(members)})
        if len(states)>1:
            payload_id_state_variants.append({"payload_id":pid,"rolls":sorted(rolls),"records":len(members),"states":len(states)})

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

    def selected_record(r):
        p=r.get("payload") or {}
        return {
          "record_id":str(r.get("record_id") or ""),
          "row_updated_at":r.get("updated_at"),
          "payload_id":p.get("id"),
          "roll":p.get("roll"),
          "physicalRollId":p.get("physicalRollId"),
          "sourceRoll":p.get("sourceRoll"),
          "manufacturerRoll":p.get("manufacturerRoll"),
          "collection":p.get("collection"),
          "colour":p.get("colour"),
          "location":p.get("location"),
          "length":p.get("length"),
          "originalLength":p.get("originalLength"),
          "measure":p.get("measure"),
          "status":p.get("status"),
          "createdAt":p.get("createdAt"),
          "updatedAt":p.get("updatedAt"),
          "legacyKey":p.get("legacyKey"),
          "migrationSource":p.get("migrationSource")
        }

    focus_names={"CHC022","CHC023","RC2244","RC2323","FROSTED SLATE(GRTEY)"}
    focus_rolls=sorted({
      roll for roll in by_roll
      if roll in focus_names or roll.startswith("CHC022-") or roll.startswith("CHC023-")
    })
    focus_groups={}
    for roll in focus_rolls:
        members=by_roll[roll]
        active=[x for x in members if key((x.get("payload") or {}).get("status"))=="ACTIVE"]
        state_sig=Counter()
        label_sig=Counter()
        for x in active:
            p=x.get("payload") or {}
            state=(key(p.get("collection")),key(p.get("colour")),key(p.get("location")),
                   str(p.get("length") or "").strip(),str(p.get("originalLength") or "").strip(),key(p.get("measure")))
            label=(key(p.get("collection")),key(p.get("colour")))
            state_sig["|".join(state)]+=1
            label_sig["|".join(label)]+=1
        focus_groups[roll]={
          "all_records":len(members),
          "active_records":len(active),
          "distinct_active_state_signatures":len(state_sig),
          "active_state_signature_counts":dict(sorted(state_sig.items())),
          "distinct_active_name_colour_pairs":len(label_sig),
          "active_name_colour_counts":dict(sorted(label_sig.items())),
          "records":[selected_record(x) for x in sorted(members,key=lambda x:(str(x.get("updated_at") or ""),str(x.get("record_id") or "")))]
        }

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
      "legacy_instance_evidence":{
        "active_rows":len(active_rows),
        "active_rows_with_payload_id":sum(len(v) for v in active_by_payload_id.values()),
        "active_rows_missing_payload_id":len(active_missing_payload_id),
        "distinct_active_payload_ids":len(active_by_payload_id),
        "payload_ids_repeated_across_source_rows":sum(1 for v in active_by_payload_id.values() if len(v)>1),
        "extra_active_rows_beyond_one_per_payload_id":sum(len(v)-1 for v in active_by_payload_id.values() if len(v)>1),
        "payload_ids_spanning_multiple_company_roll_strings":len(payload_id_roll_collisions),
        "payload_ids_with_multiple_current_state_snapshots":len(payload_id_state_variants),
        "proposed_physical_instance_count_if_payload_id_is_migration_alias":len(active_by_payload_id)+len(active_missing_payload_id)
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
      "focus_groups":focus_groups,
      "samples":{
        "most_repeated_active":[
          {"roll":roll,"active_records":len(members)}
          for roll,members in sorted(active_duplicate_rolls.items(),key=lambda kv:(-len(kv[1]),kv[0]))[:20]
        ],
        "name_colour_collision_rolls":[x["roll"] for x in label_collisions[:20]],
        "state_variant_rolls":[x["roll"] for x in sorted(state_variants,key=lambda x:(-x["records"],x["roll"]))[:20]],
        "payload_id_roll_collisions":payload_id_roll_collisions[:20],
        "payload_id_state_variants":sorted(payload_id_state_variants,key=lambda x:(-x["records"],x["payload_id"]))[:20]
      }
    }
    with open(args.report,"w",encoding="utf-8") as f:
        json.dump(report,f,indent=2,ensure_ascii=False);f.write("\n")
    print("COMPANY ROLL AUDIT:",json.dumps(report,sort_keys=True))
    print("COMPANY_ROLL_ACTIVE_DISTINCT:",len(active_rolls))
    print("COMPANY_ROLL_ALL_DISTINCT:",len(by_roll))
    print("COMPANY_ROLL_DUPLICATE_EXTRA_ACTIVE_ROWS:",report["duplicates"]["extra_active_rows_beyond_one_per_roll"])
    print("LEGACY_ACTIVE_DISTINCT_PAYLOAD_IDS:",report["legacy_instance_evidence"]["distinct_active_payload_ids"])
    print("LEGACY_PROPOSED_PHYSICAL_INSTANCE_COUNT:",report["legacy_instance_evidence"]["proposed_physical_instance_count_if_payload_id_is_migration_alias"])
    print("LEGACY_PAYLOAD_ID_ROLL_COLLISIONS:",report["legacy_instance_evidence"]["payload_ids_spanning_multiple_company_roll_strings"])
    print("V6 COMPANY CARPET ROLL NUMBER AUDIT: PASS")

if __name__=="__main__":
    main()
