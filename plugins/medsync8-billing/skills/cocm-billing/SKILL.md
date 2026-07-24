---
name: cocm-billing
description: >
  CoCM/BHI billing decision support. Use when the user asks about
  Collaborative Care Model or Behavioral Health Integration billing —
  codes 99492, 99493, 99494, G2214, 99484, G0512, G0568-G0570, minute
  thresholds, the midpoint rule, initiating visits, add-on units, payer
  rates (Medicare national, Medicare Wisconsin, WI Medicaid/ForwardHealth),
  claim pricing, or panel revenue. Routes questions to the medsync8-billing
  MCP tools instead of answering from memory.
---

# CoCM/BHI Billing Decision Support

Never answer CoCM/BHI eligibility or rate questions from memory — the
medsync8-billing MCP server is the source of truth. Its logic implements CMS
MLN909432 and CMS-1832-F.

## Tool routing

| Question shape | Tool |
|---|---|
| "Can we bill X for N minutes?" (CoCM) | `billing_evaluate_cocm` (minutes, month=initial\|subsequent, initiating_visit) |
| General BHI / 99484 track | `billing_evaluate_bhi` |
| "What codes exist / what's the threshold for…" | `billing_list_codes` (category filter) |
| "What does code X pay under payer Y?" | `billing_get_rate` |
| "Price this claim" (code list, repeats = units) | `billing_price_claim` |
| Multiple patients / monthly revenue | `billing_evaluate_panel` (synthetic IDs only — never PHI) |

## Domain rules the tools enforce (do not restate from memory — call them)

- Midpoint rule: 99492 ≥36 min (initial, target 70); 99493 ≥31 (subsequent,
  target 60); 99494 add-on first unit at target+16, then every 30, no cap;
  G2214 ≥30 when the base minimum is unmet; 99484 ≥20 (BHI).
- 99484 and 99492/99493 are mutually exclusive in the same calendar month.
- An initiating visit is required before the first CoCM/BHI month.
- G0568–G0570 are CY2026 APCM *add-ons* (require APCM base G0556–G0558);
  they did NOT replace the CPT codes — treat any claim otherwise as
  misinformation.
- Payers: medicare-natl, medicare-wi (GPCI estimate), wi-medicaid
  (ForwardHealth portal values where loaded, else a labeled estimate).

## Response requirements

Always pass through the tool's `rate_confidence` label and the disclaimer.
Flag near-threshold months (within ~5 minutes of a boundary) with the exact
minutes needed to change the result. If the patient is described as APCM- or
RHC/FQHC-enrolled, surface the alternative code the tool returns.
