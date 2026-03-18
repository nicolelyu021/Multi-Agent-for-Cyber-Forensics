"""Tamper simulation engine.

Creates an in-memory copy of a forensic trace chain, mutates a random record,
re-verifies the chain, and returns the diff + broken link positions.
"""
import copy
import random

from forensic.hasher import verify_chain


def simulate_tampering(records: list[dict]) -> dict:
    """Simulate tampering on a forensic record chain.

    Picks a random record, modifies its reasoning_summary or confidence_score,
    then runs chain verification to show which links break.
    """
    if len(records) < 2:
        return {"error": "Need at least 2 records to demonstrate tampering"}

    tampered = copy.deepcopy(records)

    # Pick a random record to tamper (not the first one for more dramatic effect)
    tamper_idx = random.randint(1, len(tampered) - 1)
    original_record = copy.deepcopy(tampered[tamper_idx])

    # Tamper with the record
    if tampered[tamper_idx].get("confidence_score") is not None:
        original_value = tampered[tamper_idx]["confidence_score"]
        tampered[tamper_idx]["confidence_score"] = round(
            max(0, min(1, original_value + random.uniform(-0.3, 0.3))), 4
        )
        tamper_field = "confidence_score"
        tamper_original = original_value
        tamper_new = tampered[tamper_idx]["confidence_score"]
    else:
        original_value = tampered[tamper_idx].get("reasoning_summary", "")
        tampered[tamper_idx]["reasoning_summary"] = "[TAMPERED] " + original_value
        tamper_field = "reasoning_summary"
        tamper_original = original_value
        tamper_new = tampered[tamper_idx]["reasoning_summary"]

    # Verify original chain (should pass)
    original_verification = verify_chain(records)

    # Verify tampered chain (should fail from tamper_idx onward)
    tampered_verification = verify_chain(tampered)

    return {
        "tampered_index": tamper_idx,
        "tampered_span_id": tampered[tamper_idx].get("span_id"),
        "tamper_detail": {
            "field": tamper_field,
            "original_value": tamper_original,
            "tampered_value": tamper_new,
        },
        "original_chain": original_verification,
        "tampered_chain": tampered_verification,
    }
