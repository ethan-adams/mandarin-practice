"""Server-side port of the app's field-aware snapshot merge
(`src/lib/sync/snapshot.ts`). Keep the two in step: the never-clobber rule
(more-progressed card wins; days union; history grows; count max) must hold
identically on the server now that it owns the canonical snapshot.
"""

from __future__ import annotations

SNAPSHOT_VERSION = 1


def _pick_card(a: dict | None, b: dict | None) -> dict | None:
    if not a:
        return b
    if not b:
        return a
    aa, ba = a.get("attempts", 0) or 0, b.get("attempts", 0) or 0
    if aa != ba:
        return a if aa > ba else b
    return a if (a.get("due", "") or "") >= (b.get("due", "") or "") else b


def _longer(x: list, y: list) -> list:
    return x if len(x) >= len(y) else y


def merge_snapshots(a: dict | None, b: dict | None) -> dict | None:
    """Reconcile two snapshots into one. Commutative in effect, so it converges."""
    if a is None:
        return b
    if b is None:
        return a
    a_review = a.get("reviewState") or {}
    b_review = b.get("reviewState") or {}
    review: dict[str, dict] = {}
    for cid in set(a_review) | set(b_review):
        winner = _pick_card(a_review.get(cid), b_review.get(cid))
        if winner:
            review[cid] = winner
    return {
        "v": SNAPSHOT_VERSION,
        "updatedAt": max(a.get("updatedAt", ""), b.get("updatedAt", "")),
        "reviewState": review,
        "practiceDays": sorted(set(a.get("practiceDays") or []) | set(b.get("practiceDays") or [])),
        "listeningResults": _longer(a.get("listeningResults") or [], b.get("listeningResults") or []),
        "listeningCount": max(a.get("listeningCount", 0) or 0, b.get("listeningCount", 0) or 0),
        "pronunciationEvidence": _longer(
            a.get("pronunciationEvidence") or [], b.get("pronunciationEvidence") or []
        ),
    }


def is_snapshot(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return (
        value.get("v") == SNAPSHOT_VERSION
        and isinstance(value.get("updatedAt"), str)
        and isinstance(value.get("reviewState"), dict)
        and isinstance(value.get("practiceDays"), list)
        and isinstance(value.get("listeningCount"), (int, float))
        and isinstance(value.get("listeningResults"), list)
        and isinstance(value.get("pronunciationEvidence"), list)
    )
