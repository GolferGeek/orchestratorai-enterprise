# Invoice Exception Review smoke test

1. In Finance, use the example **Clean glove order** (PO-4471). It completes
   as **Approved automatically**, with no exceptions and Jev passing.
2. Use the example **Office furniture with exceptions** (PO-4502). It stops on
   **Review** with a price variance on the chairs, more desks billed than
   received, a terms mismatch and a total over the PO.
3. Reject with a reason. The run completes as **Rejected**; the Issues tab
   shows every exception addressed, with your reason.
4. Run the clean example again with the same invoice number: it now stops on
   review with a **duplicate** exception.
