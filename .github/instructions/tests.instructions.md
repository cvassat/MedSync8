---
applyTo: "tests/**,backend/tests/**,**/test_*.py,**/*_test.py,**/fixtures/**"
---

# Test and Fixture Rules

- Synthetic data only. No PHI, no real patient or provider identifiers, no real dates of service, no payer/member identifiers, no production data — ever, including "anonymized" excerpts of real records.
- Fixture names and contents must be obviously synthetic (e.g., `Patient Test-Alpha`, `PT-001` style panel IDs, NPI `1000000004` style checksummed test values, dates in a declared fake range).
- No secrets or tokens in fixtures, even expired ones. Use placeholder patterns like `SECRET_REDACTED_FOR_TESTS`.
- No network calls: backend tests use `StubEmbedder` and `StubAnthropic` from `backend/tests/conftest.py`. New external dependencies get a stub in `conftest.py`, not a live call behind a marker.
- Deterministic tests: seed randomness, freeze time where behavior is time-dependent (pass `today: date` parameters rather than calling `date.today()` inside logic — the pattern `scripts/credentialing_alert.py` uses).
- Billing-logic changes ship with boundary-value tests at the CMS thresholds (35/36, 30/31, target+15/+16, 19/20 minutes).
- Every bug fix ships with a regression test that fails on the old code.
- Do not weaken or delete an existing assertion to make a test pass; fix the code or escalate the conflict.
