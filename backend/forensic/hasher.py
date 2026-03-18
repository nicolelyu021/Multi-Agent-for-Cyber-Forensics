import hashlib
import json


def hash_record(record: dict) -> str:
    """SHA-256 hash of a forensic record's content fields (excluding hash fields themselves)."""
    fields_to_hash = {k: v for k, v in record.items() if k not in ("record_hash", "previous_record_hash", "id", "created_at")}
    canonical = json.dumps(fields_to_hash, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def hash_tool_call(tool_name: str, tool_input: str, tool_output: str) -> str:
    """SHA-256 hash of a specific tool invocation."""
    payload = json.dumps({"tool_name": tool_name, "input": tool_input, "output": tool_output}, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def verify_chain(records: list[dict]) -> dict:
    """Verify the integrity of a forensic record chain.

    Returns verification status for each record and overall chain integrity.
    """
    results = []
    chain_valid = True

    for i, record in enumerate(records):
        computed_hash = hash_record(record)
        hash_match = computed_hash == record.get("record_hash")

        link_valid = True
        if i == 0:
            link_valid = record.get("previous_record_hash") is None
        else:
            link_valid = record.get("previous_record_hash") == records[i - 1].get("record_hash")

        record_valid = hash_match and link_valid
        if not record_valid:
            chain_valid = False

        results.append({
            "span_id": record.get("span_id"),
            "index": i,
            "hash_match": hash_match,
            "link_valid": link_valid,
            "valid": record_valid,
            "computed_hash": computed_hash,
            "stored_hash": record.get("record_hash"),
        })

    return {"chain_valid": chain_valid, "records": results}
