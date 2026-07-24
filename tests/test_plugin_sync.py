"""Guard against drift between canonical billing logic and the plugin's vendored copy.

scripts/cocm_time_tracker.py is the single source of billing truth.
plugins/medsync8-billing/server/cocm_time_tracker.py is a byte-for-byte
vendored copy (required so the plugin is self-contained when installed
outside this repo). If this test fails: edit the canonical script, then
    cp scripts/cocm_time_tracker.py plugins/medsync8-billing/server/
"""
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
CANONICAL = REPO / "scripts" / "cocm_time_tracker.py"
VENDORED = REPO / "plugins" / "medsync8-billing" / "server" / "cocm_time_tracker.py"


def test_vendored_tracker_matches_canonical():
    assert VENDORED.read_bytes() == CANONICAL.read_bytes(), (
        "Plugin's vendored tracker has drifted from scripts/cocm_time_tracker.py. "
        "Re-copy the canonical script into plugins/medsync8-billing/server/."
    )
