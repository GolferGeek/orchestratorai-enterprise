# Using Submittal Review

## Start a review

1. In **Building**, open **Workflows → Construction Administration →
   Submittal Review** and choose **New**.
2. Pick the **specification section** (for example 23 74 13, Packaged Rooftop
   Units).
3. **Upload the submittal** (product data PDF) or paste its text.
4. Choose **Review the submittal**. It takes about a minute.

## Review the findings

The run stops on **Review** with one item per requirement: its status, the
evidence quoted from the submittal, whether Jev found that evidence in the
submittal, and a note.

- **Approve all** confirms the findings as they are.
- To correct one, choose **modify** and write the new finding as
  `status: note`, where status is `compliant`, `noted` (a deviation you
  accept), `deviation` or `missing`. For example:
  `noted: 3500K fixtures accepted in lieu of 3000K per owner`.
- **Drop** removes a requirement that does not apply.
- Then **Submit item decisions**.

The action follows from the findings: any deviation or missing item means
**Revise and resubmit**; only accepted deviations mean **Approved as
noted**; otherwise **Approved**.

## Read the result

- **Result**: the action, the response letter and the findings table.
- **Issues**: deviations and missing items, settled by your review.
- **Download** the response as PDF, Word or Markdown.

Ask the **Spec & Building Code Assistant** agent for any requirement's full text.
