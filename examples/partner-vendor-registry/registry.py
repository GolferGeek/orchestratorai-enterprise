"""The vendor registry's records: who the partner knows, and their standing."""

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Vendor:
    name: str
    status: str  # 'approved' | 'on_hold'
    bank_details_changed_on: str | None
    note: str


VENDORS = [
    Vendor('ACME Industrial Supply', 'approved', None, 'Approved supplier since 2019.'),
    Vendor('Summit Office Interiors LLC', 'approved', None, 'Approved supplier since 2021.'),
    Vendor(
        'Cascade Cloud Services, Inc.',
        'approved',
        '2026-09-24',
        'Remit-to bank account changed on 2026-09-24; confirm by phone before paying.',
    ),
    Vendor('Northwind Freight Co.', 'on_hold', None, 'On hold: insurance certificate expired.'),
]


def _key(name: str) -> str:
    """A vendor name without case, punctuation or a company suffix."""
    words = re.sub(r'[^a-z0-9 ]+', ' ', name.lower()).split()
    return ' '.join(w for w in words if w not in {'inc', 'llc', 'ltd', 'co', 'corp', 'company'})


def look_up(name: str) -> dict:
    """The registry's answer for one vendor name."""
    for vendor in VENDORS:
        if _key(vendor.name) == _key(name):
            return {
                'vendor': vendor.name,
                'status': vendor.status,
                'bankDetailsChangedOn': vendor.bank_details_changed_on,
                'note': vendor.note,
            }
    return {'vendor': name, 'status': 'unknown', 'bankDetailsChangedOn': None, 'note': 'Not in the vendor registry.'}
