#!/usr/bin/env python3
"""cocm_time_tracker.py — CoCM / BHI midpoint-rule billing-eligibility helper.

Supported code families
-----------------------
CoCM (Collaborative Care Model):
  99492  Initial calendar month  (≥36 min, target 70)
  99493  Subsequent months       (≥31 min, target 60)
  99494  Add-on per 30-min block (≥16 min each, unlimited units)
  G2214  Shorter service         (≥30 min, base code minimum unmet)

General BHI (non-CoCM Behavioral Health Integration):
  99484  Per calendar month      (≥20 min)
  NOTE: 99484 cannot be billed in the same month as 99492 / 99493.

Valid initiating visits (required before any CoCM/BHI month):
  99202-99215  Office / outpatient E/M
  G0402        Welcome to Medicare preventive visit
  G0438        Annual Wellness Visit — initial
  G0439        Annual Wellness Visit — subsequent
  99495        Transitional Care Management — 14-day + moderate complexity
  99496        Transitional Care Management — 7-day + high complexity
  90791        Psychiatric diagnostic evaluation
  90792        Psychiatric diagnostic evaluation with medical services

Decision-support only; verify against the current CMS Physician Fee Schedule.
Source: CMS MLN909432 · AIMS Center CoCM Implementation Guide · CPT 2025.

Usage examples
--------------
    # CoCM — initial month, 72 min accrued
    python3 cocm_time_tracker.py --minutes 72 --month initial --initiating-visit yes

    # CoCM — subsequent month with an add-on unit
    python3 cocm_time_tracker.py --minutes 116 --month subsequent --initiating-visit yes

    # General BHI (no CoCM registry required)
    python3 cocm_time_tracker.py --mode bhi --minutes 25 --initiating-visit yes

    # Print the full code catalogue and exit
    python3 cocm_time_tracker.py --list-codes
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from typing import Any


# ---------------------------------------------------------------------------
# Code catalogue
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class BillingCode:
    code: str
    description: str
    category: str
    target_min: int | None   # typical service-time target
    min_to_bill: int | None  # midpoint-rule minimum required to bill
    notes: str = ""


COCM_CODES: list[BillingCode] = [
    BillingCode(
        "99492", "CoCM — initial calendar month", "CoCM",
        target_min=70, min_to_bill=36,
        notes="First month of CoCM enrollment only. Requires patient registry, "
              "care plan, and systematic caseload review by the supervising provider.",
    ),
    BillingCode(
        "99493", "CoCM — subsequent calendar month", "CoCM",
        target_min=60, min_to_bill=31,
        notes="Every month after the initial month.",
    ),
    BillingCode(
        "99494", "CoCM — each additional 30-min block (add-on ×N)", "CoCM",
        target_min=30, min_to_bill=16,
        notes="Add-on to 99492 or 99493. One unit per 30-min increment past the "
              "base target. No cap on number of units per month.",
    ),
    BillingCode(
        "G2214", "CoCM / BHI — shorter first- or subsequent-month service", "CoCM",
        target_min=30, min_to_bill=30,
        notes="For patients with ≥30 min who don't meet the base code minimum. "
              "Cannot combine with 99492 / 99493 in the same month.",
    ),
]

BHI_CODES: list[BillingCode] = [
    BillingCode(
        "99484", "General BHI — per calendar month", "General BHI",
        target_min=20, min_to_bill=20,
        notes="Non-CoCM path. BHI clinical staff ≥20 min/month. No registry or "
              "systematic caseload review required. Cannot bill 99484 and "
              "99492 / 99493 in the same month.",
    ),
]

INITIATING_VISIT_CODES: list[BillingCode] = [
    BillingCode(
        "99202-99215", "Office / outpatient E/M visit", "Initiating",
        target_min=None, min_to_bill=None,
        notes="Most common. Must address the behavioral health condition.",
    ),
    BillingCode(
        "G0402", "Welcome to Medicare preventive visit", "Initiating",
        target_min=None, min_to_bill=None,
    ),
    BillingCode(
        "G0438", "Annual Wellness Visit — initial", "Initiating",
        target_min=None, min_to_bill=None,
    ),
    BillingCode(
        "G0439", "Annual Wellness Visit — subsequent", "Initiating",
        target_min=None, min_to_bill=None,
    ),
    BillingCode(
        "99495", "Transitional Care Management — 14-day contact, moderate complexity",
        "Initiating", target_min=None, min_to_bill=None,
    ),
    BillingCode(
        "99496", "Transitional Care Management — 7-day contact, high complexity",
        "Initiating", target_min=None, min_to_bill=None,
    ),
    BillingCode(
        "90791", "Psychiatric diagnostic evaluation", "Initiating",
        target_min=None, min_to_bill=None,
        notes="Common initiating visit at NEH. No medical services component.",
    ),
    BillingCode(
        "90792", "Psychiatric diagnostic evaluation with medical services", "Initiating",
        target_min=None, min_to_bill=None,
        notes="Includes medication management; typical for prescribing providers at NEH.",
    ),
]

ALL_CODES = COCM_CODES + BHI_CODES + INITIATING_VISIT_CODES


# ---------------------------------------------------------------------------
# Eligibility logic
# ---------------------------------------------------------------------------

def evaluate_cocm(minutes: int, month: str, initiating_visit: bool) -> dict[str, Any]:
    """Return the highest supported CoCM code set for the given month's minutes."""
    month = month.strip().lower()
    if month not in ("initial", "subsequent"):
        raise ValueError("--month must be 'initial' or 'subsequent'")

    if not initiating_visit:
        return {
            "mode": "CoCM",
            "eligible_code": None,
            "note": (
                "No initiating visit on file. CoCM enrollment requires one of: "
                "office E/M (99202–99215), Annual Wellness Visit (G0438/G0439), "
                "Welcome to Medicare (G0402), TCM (99495/99496), or psychiatric "
                "evaluation (90791/90792)."
            ),
        }

    base_code, target, base_min = (
        ("99492", 70, 36) if month == "initial" else ("99493", 60, 31)
    )
    result: dict[str, Any] = {"mode": "CoCM", "accrued_minutes": minutes, "month": month}

    if minutes < base_min:
        if minutes >= 30:
            result.update(
                eligible_code="G2214",
                note=(
                    f"Base {base_code} minimum ({base_min} min) unmet. "
                    f"{minutes} min qualifies for G2214 (≥30-min shorter service)."
                ),
            )
        else:
            result.update(
                eligible_code=None,
                note=(
                    f"{minutes} min supports no CoCM code this month "
                    f"(need ≥{base_min} min for {base_code}, ≥30 min for G2214)."
                ),
            )
        return result

    # Base code met — tally add-on 99494 units.
    extra = minutes - target
    addon_units = 0
    if extra >= 16:
        addon_units = 1 + max(0, (extra - 16) // 30)

    codes = [base_code] + ["99494"] * addon_units
    next_threshold = target + 16 + addon_units * 30

    result.update(
        eligible_code=" + ".join(codes),
        base_min_met=True,
        addon_30min_units=addon_units,
        next_99494_at_min=(next_threshold if minutes < next_threshold else None),
        note="Midpoint rule satisfied for base code.",
    )
    return result


def evaluate_bhi(minutes: int, initiating_visit: bool) -> dict[str, Any]:
    """Return eligibility for General BHI (99484)."""
    result: dict[str, Any] = {"mode": "General BHI (non-CoCM)", "accrued_minutes": minutes}

    if not initiating_visit:
        return {
            **result,
            "eligible_code": None,
            "note": (
                "No initiating visit on file. General BHI requires an E/M or "
                "preventive visit. See --list-codes for valid initiating visit codes."
            ),
        }

    if minutes >= 20:
        result.update(
            eligible_code="99484",
            note=(
                f"{minutes} min meets the ≥20-min minimum for 99484 (General BHI). "
                "Cannot bill 99484 in the same month as 99492 or 99493."
            ),
        )
    else:
        result.update(
            eligible_code=None,
            note=f"{minutes} min does not meet the ≥20-min minimum for 99484.",
        )
    return result


# ---------------------------------------------------------------------------
# Code catalogue display
# ---------------------------------------------------------------------------

_CATEGORY_ORDER = ["CoCM", "General BHI", "Initiating"]
_CATEGORY_LABELS = {
    "CoCM":       "CoCM — Collaborative Care Model",
    "General BHI": "General BHI — Non-CoCM Behavioral Health Integration",
    "Initiating": "Valid Initiating Visit Codes (required before first CoCM/BHI month)",
}


def print_code_catalogue() -> None:
    from itertools import groupby

    by_cat: dict[str, list[BillingCode]] = {c: [] for c in _CATEGORY_ORDER}
    for code in ALL_CODES:
        by_cat[code.category].append(code)

    for cat in _CATEGORY_ORDER:
        codes = by_cat[cat]
        label = _CATEGORY_LABELS[cat]
        print(f"\n{'─' * 64}")
        print(f"  {label}")
        print(f"{'─' * 64}")
        for c in codes:
            time_info = ""
            if c.min_to_bill is not None and c.target_min is not None:
                time_info = f"  [≥{c.min_to_bill}–{c.target_min} min]"
            elif c.min_to_bill is not None:
                time_info = f"  [≥{c.min_to_bill} min]"
            print(f"  {c.code:<14}  {c.description}{time_info}")
            if c.notes:
                # Wrap note at 60 chars, indented
                words = c.notes.split()
                line, col = [], 0
                for w in words:
                    if col + len(w) + 1 > 60 and line:
                        print(f"  {'':14}  ↳ {' '.join(line)}")
                        line, col = [w], len(w)
                    else:
                        line.append(w)
                        col += len(w) + 1
                if line:
                    print(f"  {'':14}  ↳ {' '.join(line)}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(
        description="CoCM / BHI midpoint-rule billing eligibility (decision-support only)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Source: CMS MLN909432 · AIMS Center CoCM Implementation Guide · CPT 2025\n"
            "Disclaimer: Decision-support only. Verify against current CMS fee schedule."
        ),
    )
    ap.add_argument(
        "--mode", choices=["cocm", "bhi"], default="cocm",
        help="cocm (default): Collaborative Care Model  |  bhi: General BHI (99484)",
    )
    ap.add_argument("--minutes", type=int,
                    help="Accrued BH care-manager clinical minutes this calendar month")
    ap.add_argument("--month", help="cocm mode only: initial | subsequent")
    ap.add_argument("--initiating-visit", help="yes | no")
    ap.add_argument("--list-codes", action="store_true",
                    help="Print the full supported code catalogue and exit")
    args = ap.parse_args()

    if args.list_codes:
        print_code_catalogue()
        print(
            "\nSource: CMS MLN909432 · AIMS Center CoCM Implementation Guide · CPT 2025"
        )
        print("Disclaimer: Decision-support only. Verify against current CMS fee schedule.")
        return 0

    if args.minutes is None:
        ap.error("--minutes is required")
    if args.initiating_visit is None:
        ap.error("--initiating-visit is required")

    iv = args.initiating_visit.strip().lower() in ("yes", "y", "true", "1")

    if args.mode == "bhi":
        result = evaluate_bhi(args.minutes, iv)
    else:
        if not args.month:
            ap.error("--month (initial | subsequent) is required in cocm mode")
        result = evaluate_cocm(args.minutes, args.month, iv)

    col = 26
    for k, v in result.items():
        if v is not None:
            print(f"{k:{col}}: {v}")
    print(f"{'source_confidence':{col}}: verified_primary (CMS MLN909432; AIMS Center)")
    print(f"{'disclaimer':{col}}: Decision-support only; verify current fee schedule.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
