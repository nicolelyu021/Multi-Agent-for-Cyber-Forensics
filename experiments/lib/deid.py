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


# A personal name is conservatively detected as either:
# - Two or three consecutive capitalized words ("First Last", "First Middle Last"),
#   OR
# - An email address like "first.last@enron.com"
_BIGRAM_NAME_RX = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b"
)
_EMAIL_RX = re.compile(
    r"\b([a-zA-Z][a-zA-Z0-9._%+-]*@enron\.com)\b",
    re.IGNORECASE,
)


def _pseudonymize(text: str, name_map: dict[str, str]) -> str:
    """Replace personal names with role-tagged pseudonyms.

    Strategy (conservative, aimed at NOT mangling common English):
    1. Replace known Enron executives (from `_KNOWN_ROLES`) with role tags.
    2. Replace identity-map names from the CSV when available.
    3. Replace capitalized bigrams/trigrams ("First Last[ Middle]") with
       generic ``EMPLOYEE_N`` tokens, consistent within the email.
    4. Replace @enron.com email addresses with ``EMPLOYEE_EMAIL_N`` tokens.
    5. Single capitalized words are NOT replaced by default -- they are
       usually common English (Please, Subject, Monday, etc.) rather than
       personal names.
    """
    if not text:
        return text
    out = text

    for name, tag in _KNOWN_ROLES.items():
        pattern = re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
        out = pattern.sub(tag, out)

    for orig, pseudo in name_map.items():
        if len(orig) < 4:
            continue
        pattern = re.compile(r"\b" + re.escape(orig) + r"\b", re.IGNORECASE)
        out = pattern.sub(pseudo, out)

    _SKIP_BIGRAMS = {
        "Managing Director", "Executive Vice", "Vice President", "Chief Executive",
        "Chief Financial", "Chief Operating", "San Diego", "San Francisco",
        "New York", "Los Angeles", "United States", "Re Re", "Subject Re",
        "Monday October", "Tuesday October", "Wednesday October", "Thursday October",
        "Friday October", "Saturday October", "Sunday October",
        "Please Let", "Dear Sir", "Best Regards", "Kind Regards",
    }

    local_name_map: dict[str, str] = {}

    def _swap_bigram(m: re.Match) -> str:
        token = m.group(0)
        if token in _SKIP_BIGRAMS:
            return token
        key = token.lower()
        if key in local_name_map:
            return local_name_map[key]
        pseudo = f"EMPLOYEE_{len(local_name_map) + 1}"
        local_name_map[key] = pseudo
        return pseudo

    out = _BIGRAM_NAME_RX.sub(_swap_bigram, out)

    local_email_map: dict[str, str] = {}

    def _swap_email(m: re.Match) -> str:
        token = m.group(0)
        key = token.lower()
        if key in local_email_map:
            return local_email_map[key]
        pseudo = f"EMPLOYEE_EMAIL_{len(local_email_map) + 1}"
        local_email_map[key] = pseudo
        return pseudo

    out = _EMAIL_RX.sub(_swap_email, out)
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
