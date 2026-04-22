"""De-identification policy variants for the ablation study.

The persisted ``evaluation_dataset.json`` already contains two views per
email (``text_raw`` and ``text_deidentified``). We add one more:
``text_pseudonym`` — a topology-preserving pseudonymization that maps
real names to role-tagged tokens (e.g., ``VP_Finance_1``) derived from the
existing ``identity_mapping_table.csv`` when available, or from a regex
approximation otherwise.

Three variants total:

- ``none``          -> use ``text_raw``
- ``pseudonym``     -> names replaced with role-tagged pseudo-IDs
- ``full_scrub``    -> use ``text_deidentified`` (existing aggressive regex)

The goal is to expose how much of the "privacy cost" is attributable to
the SHAPE of privacy control applied, not to privacy per se.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Optional


# A few well-known Enron role mappings used to produce richer pseudonyms
# for the subset of individuals that appear in the dataset. For individuals
# not in this map, we fall back to generic ``EMPLOYEE_N`` tokens.
_KNOWN_ROLES = {
    "ken lay": "CEO_1",
    "kenneth lay": "CEO_1",
    "jeffrey skilling": "COO_1",
    "jeff skilling": "COO_1",
    "andrew fastow": "CFO_1",
    "andy fastow": "CFO_1",
    "michael kopper": "VP_Finance_1",
    "rebecca mark": "VP_International_1",
    "richard causey": "ChiefAccounting_1",
    "david delainey": "VP_EnergyServices_1",
    "vince kaminski": "HeadOfResearch_1",
    "sherron watkins": "VP_CorpDevelopment_1",
    "louise kitchen": "President_Online_1",
    "greg whalley": "President_1",
    "cliff baxter": "VP_Strategy_1",
    "kevin hannon": "COO_Broadband_1",
    "lou pai": "VP_EnergyServices_2",
}


def _load_identity_map(csv_path: Optional[Path]) -> dict[str, str]:
    """Load the identity_mapping_table.csv if available, returning
    lowercase original-email/name -> pseudonym ID."""
    if csv_path is None or not csv_path.exists():
        return {}
    mapping: dict[str, str] = {}
    with csv_path.open("r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pseudo = row.get("pseudo_id") or row.get("pseudonym") or row.get("id") or ""
            if not pseudo:
                continue
            for key in ("email", "name", "original", "original_email"):
                val = row.get(key)
                if val:
                    mapping[val.strip().lower()] = pseudo.strip()
    return mapping


_NAME_RX = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b")


def _pseudonymize(text: str, name_map: dict[str, str]) -> str:
    """Replace names with role-tagged pseudonyms.

    Strategy:
    1. First, replace known Enron executives with role tags (CEO_1, CFO_1, ...).
    2. Then, for other capitalized bigrams that look like personal names,
       replace with generic ``EMPLOYEE_<hash>`` tokens, keeping the same
       mapping consistent within the email.
    """
    if not text:
        return text
    out = text

    # 1. Known roles
    for name, tag in _KNOWN_ROLES.items():
        pattern = re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
        out = pattern.sub(tag, out)

    # 2. Identity-map names (from CSV if available)
    for orig, pseudo in name_map.items():
        if len(orig) < 4:
            continue
        pattern = re.compile(r"\b" + re.escape(orig) + r"\b", re.IGNORECASE)
        out = pattern.sub(pseudo, out)

    # 3. Generic capitalized-bigram scrub — consistent within this email
    local_map: dict[str, str] = {}

    def _swap(m: re.Match) -> str:
        token = m.group(0)
        low = token.lower()
        if low in local_map:
            return local_map[low]
        # Skip common non-names beginning with capitals
        skip = {"Enron", "Houston", "California", "San Diego", "San Francisco",
                "United States", "New York", "Los Angeles", "Washington",
                "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
                "Saturday", "Sunday", "January", "February", "March", "April",
                "May", "June", "July", "August", "September", "October",
                "November", "December", "Raptor", "LJM", "Chewco"}
        if token in skip:
            return token
        pseudo = f"EMPLOYEE_{len(local_map) + 1}"
        local_map[low] = pseudo
        return pseudo

    out = _NAME_RX.sub(_swap, out)
    return out


def get_text(
    record: dict,
    variant: str,
    name_map: Optional[dict[str, str]] = None,
) -> str:
    """Return the email text for one record according to the chosen variant.

    ``record`` is a row from ``data/evaluation_dataset.json`` expected to
    expose ``text_raw`` and ``text_deidentified``. If a variant cannot be
    produced (e.g., ``none`` requested but ``text_raw`` missing) we raise.
    """
    if variant == "none":
        if "text_raw" not in record:
            raise ValueError("variant=none requires text_raw in the record")
        return record["text_raw"]
    if variant == "full_scrub":
        if "text_deidentified" not in record:
            raise ValueError(
                "variant=full_scrub requires text_deidentified in the record"
            )
        return record["text_deidentified"]
    if variant == "pseudonym":
        raw = record.get("text_raw", "")
        if not raw:
            raise ValueError("variant=pseudonym requires text_raw in the record")
        return _pseudonymize(raw, name_map or {})
    raise ValueError(f"Unknown de-id variant {variant!r}")


def list_deid_variants() -> list[str]:
    return ["none", "pseudonym", "full_scrub"]


def load_default_name_map(repo_root: Path) -> dict[str, str]:
    csv_path = repo_root / "data" / "identity_mapping_table.csv"
    return _load_identity_map(csv_path)
