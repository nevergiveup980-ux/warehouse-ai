# Cloud-first Carpet Label Maker — Acceptance Checklist

Status: Draft / not deployed. Production data remains unchanged.

## Context
Office Microsoft Edge localStorage quota exceeded; 1184 queued offline operations and 815 record conflicts. User has elected to discard the office computer's local data and use Supabase as source of truth. The live label dropdown was showing stale and duplicate roll numbers.

## Acceptance tests (must be performed before merge)
1. Signed-in office browser opens Double-Sided Carpet Tags and sees **CLOUD LIVE** status after read-only Supabase query.
2. RC2376 / 1000212894, RC2377 / 1000214072, RC2378 / 1000214074 are selectable; each displays Chester 40, Light Grey 1114, 164 ft. Location 4B is in cloud record (not printed on tag).
3. Last four digits displayed on tags: 2894 / 4072 / 4074.
4. Word download and browser printing use the selected cloud records and produce correctly mirrored two-sided tags.
5. If offline, unauthenticated, RLS-denied, timed out or response truncated, show failure; disable printing and Word download; never silently use stale local rows.
6. With localStorage quota exhausted, cloud label refresh should still render if an existing session is available; auth/session refresh may still depend on localStorage and must be tested.
7. Ensure unique internal IDs and detect duplicate operational roll names. No accidental selection ambiguity.
8. Verify cloud dataset record count and account access; query currently caps at 1000 and fails closed at 1000.
9. Verify printing of old rolls and correct label cut-history behavior; cut-history currently reads local storage and needs separate validation before claiming full two-sided correctness.
10. No Supabase mutations, no production merge/deploy until manual acceptance.

## Known limitations
- This PR is a read-only label-list workaround, not a full offline queue repair.
- Live cloud records are loaded only for the label maker, not the entire carpet inventory module.
- Cloud login still uses existing localStorage-backed session management.
- Back-side cut history may be stale if local cutting logs are stale.
- Legacy duplicate roll numbers in cloud are not yet validated (only duplicate internal IDs).
