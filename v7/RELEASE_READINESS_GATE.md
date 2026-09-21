# V7 Engineering Release Readiness Gate

This gate is evidence-only. It does not deploy, merge, write Supabase production,
or authorize a cutover.

It combines the disposable V7 migration reconciliation, operation shadow replays,
Carpet Identity V2, operational readiness rehearsal, Carpet Review Workbench,
Promotion Gate, and localhost HTTP E2E evidence.

The output deliberately separates two concepts:

- `technical_gate_pass`: the engineering evidence is internally consistent and safe.
- `release_allowed`: all explicit human/cutover blockers are also cleared.

A release may therefore be technically healthy while still returning
`RELEASE_BLOCKED`. The current carpet migration is expected to remain blocked
while review cases are open or review promotions are pending.

Production writes are never authorized by this report.


## Human review action plan

The Carpet Review evidence pack must cover every open review case with an explicit
verification question and the exact field that a warehouse human must confirm.
Current categories are location, measure status, product name, and company roll
number. Historical data remains reference-only; the gate never converts a
historical candidate into a resolution automatically.


The release report also includes `human_action_items`: one compact, deterministic
question per review case, including the roll label(s), reason, and exact field that
must be confirmed. This makes a blocked release actionable without weakening the
rule that historical evidence never decides the answer automatically.


## Controlled cutover preflight dependency

The controlled cutover preflight now consumes this release-readiness report as a
hard prerequisite. A stable V6 source snapshot and successful disposable replay
are not enough: preflight stops unless `release_allowed=true`,
`verdict=RELEASE_READY`, and `release_blockers=[]`. This prevents a technically
clean migration rehearsal from being mistaken for permission to cut over while
human carpet-review work remains.
