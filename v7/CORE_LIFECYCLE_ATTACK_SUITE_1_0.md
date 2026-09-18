# V7 Core Lifecycle Attack Suite 1.0

Scope: RECEIVE -> INVENTORY -> TRANSFER -> CUT -> SHIP -> RETURN.

## Cross-module attacks
A01 duplicate RECEIVE same UUID x10 => one movement/event, one quantity increase.
A02 committed command response lost then retried => stored result, no second mutation.
A03 same UUID different payload => COMMAND_FINGERPRINT_MISMATCH.
A04 concurrent different commands same stock/version => one commit, one STALE_VERSION.
A05 invalid Product on RECEIVE => only command rejected.
A06 invalid Location on RECEIVE/TRANSFER/RETURN => only command rejected.
A07 TRANSFER A->A => reject, zero movement.
A08 TRANSFER => quantity invariant before == after.
A09 SHIP > available => reject, stock/event/movement unchanged.
A10 full SHIP => quantity 0 + consumed; history retained.
A11 RETURN without original SHIP => reject.
A12 cumulative RETURN > original SHIP => reject.
A13 RETURN never updates/deletes SHIP movement/event.
A14 CUT > roll remainder => reject, roll unchanged.
A15 concurrent CUT same roll/version => one commit, one stale rejection.
A16 repeated CUT same UUID => one deduction.
A17 CUT one roll cannot block another roll.
A18 migration orphan/duplicate cannot block any lifecycle command.
A19 dashboard/map/projection failure cannot block lifecycle commands.
A20 client cache failure after server commit cannot erase server truth.
A21 tenant A IDs cannot be referenced by tenant B.
A22 unknown unit conversion rejects only affected command.
A23 every committed quantity-changing command has causal movement + event.
A24 no lifecycle handler may invoke global pause/cloud-master/localStorage architecture.

## Required real database tests before production
A01-A04, A08-A17, A21-A23 require transactional Postgres integration tests.
Static CI is necessary but not sufficient.
