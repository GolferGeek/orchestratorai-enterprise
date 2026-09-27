# Accounts Payable: Invoice Processing and Three-Way Match (FIN-POL-004)

## Three-way match
Every PO-backed invoice is matched against the purchase order and the receiving record before payment:
1. **Vendor**: the invoice must come from the vendor on the PO. A different legal entity (even an affiliate) is an exception.
2. **Price**: each line's unit price may differ from the PO by at most **2% or USD 50 per line, whichever is smaller**.
3. **Quantity**: the quantity billed may not exceed the quantity received. Partial billing of a partial receipt is fine.
4. **Total**: the invoice total may exceed the matched PO value by at most **USD 250** (freight and rounding), unless freight is itemized and approved on the PO.
5. **Terms**: payment terms follow the PO (Net 30 unless the PO says otherwise). An invoice demanding earlier payment is an exception.

## Exceptions
An invoice that fails any rule is an **exception**. AP does not pay it. The exception goes to the budget owner with the reason; the budget owner approves (with a note), rejects (AP returns it to the vendor), or asks AP to request a corrected invoice.

## Duplicates
An invoice number already paid for the same vendor is a duplicate and is always rejected. Near-duplicates (same amount and date, different number) are exceptions.

## Payment runs
Payment runs are every Tuesday and Friday. Invoices approved by 12:00 noon Monday or Thursday go in the next run.
