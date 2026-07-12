#!/usr/bin/env python3
"""cocm_time_tracker.py — CoCM midpoint-rule billing-eligibility helper.

Given accrued behavioral-health-care-manager clinical minutes, the calendar-month
position (initial vs subsequent), and whether an initiating visit is on file, returns
the highest CoCM code the time supports under the CPT midpoint rule. Decision-support
only; verify payment against the current CMS Physician Fee Schedule.

Usage:
    python3 cocm_time_tracker.py --minutes 72 --month initial --initiating-visit yes
    python3 cocm_time_tracker.py --minutes 40 --month subsequent --initiating-visit yes
"""
import argparse

# code: (target_min, min_to_bill). Source: references/06-cocm-billing.md.
BASE_CODES = {
    "initial":    ("99492", 70, 36),
    "subsequent": ("99493", 60, 31),
}
ADDON_CODE = ("99494", 30, 16)   # each additional 30 min beyond the base target
SHORT_CODE = ("G2214", 30, None) # shorter first-or-subsequent month


def evaluate(minutes: int, month: str, initiating_visit: bool):
    month = month.strip().lower()
    if month not in BASE_CODES:
        raise ValueError("month must be 'initial' or 'subsequent'")
    if not initiating_visit:
        return {
            "eligible_code": None,
            "note": "No initiating visit on file. CoCM enrollment requires an E/M, "
                    "Medicare Annual Wellness Visit, or Transitional Care Management "
                    "visit before billing.",
        }
    base_code, target, base_min = BASE_CODES[month]
    result = {"accrued_minutes": minutes, "month": month}
    if minutes < base_min:
        # Base target unmet — check the shorter-intervention code.
        if minutes >= 30:
            result.update(eligible_code=SHORT_CODE[0],
                          note=f"Base {base_code} minimum ({base_min} min) unmet; "
                               f"{minutes} min supports {SHORT_CODE[0]} (30-min service).")
        else:
            result.update(eligible_code=None,
                          note=f"{minutes} min supports no CoCM code this month "
                               f"(need >= {base_min} min for {base_code}).")
        return result
    # Base code supported. Count add-on units at the midpoint of each extra 30 min.
    addon_units = 0
    extra = minutes - target
    if extra >= ADDON_CODE[2]:
        addon_units = 1 + max(0, (extra - ADDON_CODE[2]) // ADDON_CODE[1])
    codes = [base_code] + [ADDON_CODE[0]] * addon_units
    result.update(eligible_code=" + ".join(codes),
                  base_min_met=True,
                  addon_30min_units=addon_units,
                  note="Midpoint rule satisfied for the base code.")
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description="CoCM midpoint-rule eligibility")
    ap.add_argument("--minutes", required=True, type=int)
    ap.add_argument("--month", required=True, help="initial | subsequent")
    ap.add_argument("--initiating-visit", required=True, help="yes | no")
    args = ap.parse_args()
    iv = args.initiating_visit.strip().lower() in ("yes", "y", "true", "1")
    result = evaluate(args.minutes, args.month, iv)
    for k, v in result.items():
        print(f"{k:20}: {v}")
    print(f"{'source_confidence':20}: verified_primary (CMS MLN909432; AIMS Center)")
    print(f"{'disclaimer':20}: Decision-support only; verify current fee schedule.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
