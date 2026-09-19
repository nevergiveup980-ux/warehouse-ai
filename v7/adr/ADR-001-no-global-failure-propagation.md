# ADR-001 — No Global Failure Propagation

Status: Accepted

V7 forbids global operational pause caused by record-, entity-, module-, cache-, projection-, or device-level faults.

## Fault containment hierarchy
command -> entity -> module -> optional projection.

A fault may move upward only when a proven shared invariant is unsafe (for example authentication/tenant isolation or database unavailability). Historical conflicts, orphan migration rows, dashboard failures, cache pressure, and one entity's version conflict are never global-stop conditions.

## Required behavior
- rejected command: reject that command only.
- stale entity version: conflict that entity only.
- malformed migration row: quarantine that source row only.
- projection/dashboard failure: mark projection degraded; writes continue.
- client storage failure: server-confirmed writes remain authoritative; device outbox reports degraded.
- network loss: that device queues bounded commands; other devices continue.
- database unavailable: writes fail closed; read-only cached views may be shown as stale.
- auth/tenant uncertainty: fail closed for the affected session.

No module may implement a global PAUSED flag for business-record review.
