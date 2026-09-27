# Invoice Exception Review

**Clean invoices pay themselves. Exceptions go to a person, with the reason.**

Upload an invoice (or paste it) and pick its purchase order. The invoice is
read, matched line by line against the PO and what was actually received,
and checked by Jev. A clean invoice is approved on the spot. Anything else -
a price over tolerance, more billed than received, a different vendor, a
duplicate - goes to the budget owner to approve or reject, with each
exception spelled out.

## How it works

1. **Read.** An extractor agent copies the invoice's vendor, number, dates,
   terms and lines exactly as printed.
2. **Three-way match.** Code applies the AP policy (FIN-POL-004): price within
   2% or $50 per line (whichever is smaller), quantity billed no more than
   received, total within $250 of the PO, same terms and currency, and no
   duplicate of an invoice already paid.
3. **Jev.** The invoice-po-match rubric judges what code cannot: whether
   "ACME Corp" and "Acme Industrial Supply, Inc." are the same vendor, and
   whether each line bills what was ordered.
4. **Decide.** No exceptions: approved automatically. Otherwise the budget
   owner approves or rejects; either way the decision and every exception
   are recorded.

## What you get

- Invoice, PO and receipts side by side, with every mismatch explained.
- Exceptions on the Issues tab, settled by the review.
- A PDF, Word or Markdown record of the decision.
