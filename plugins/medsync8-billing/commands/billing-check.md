---
description: Check CoCM/BHI billing eligibility for a patient-month or price a claim
argument-hint: e.g. "72 min initial month" or "price 99493 + 2x99494 at medicare-wi"
---

Evaluate the billing question in $ARGUMENTS using the medsync8-billing MCP tools.

Rules:
- For a patient-month described by minutes: use `billing_evaluate_cocm` (or
  `billing_evaluate_bhi` if the General BHI / 99484 track is named). Assume an
  initiating visit is on file unless the request says otherwise, and state
  that assumption in your answer.
- For a list of codes: use `billing_price_claim`.
- For a code or rate question: use `billing_get_rate` or `billing_list_codes`.
- For multiple patients: use `billing_evaluate_panel` with synthetic IDs.
- Default payer is medicare-natl; use the payer named in the request if any.

Report: the eligible code(s) or total, the payment estimate with its
rate-confidence label, the next-unit threshold when relevant, and the
standing disclaimer (decision-support only; verify against the current CMS
Physician Fee Schedule). If minutes are near a threshold (within 5 min of
36/31/30/20 or an add-on boundary), say how many more minutes would change
the result.
