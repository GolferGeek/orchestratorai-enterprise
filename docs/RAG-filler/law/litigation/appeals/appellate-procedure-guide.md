# Appellate Procedure Guide for Technology Litigation

## Purpose and Scope

This guide provides a comprehensive framework for appellate practice in federal and Minnesota state courts, with emphasis on the unique challenges presented by technology litigation appeals. It covers the notice of appeal, standards of review, record preparation, brief writing, oral argument, and post-judgment procedures. Effective appellate practice requires fundamentally different skills from trial practice: the focus shifts from persuading fact-finders to persuading legal scholars, from building a record to working within a closed record, and from narrative storytelling to precise legal analysis.

Technology cases present distinctive appellate issues: Daubert rulings excluding or admitting expert testimony on AI and software topics, claim construction in patent disputes, application of trade secret law to novel technologies, interpretation of software licensing agreements, and the rapidly evolving legal landscape around AI liability. A strong appellate strategy begins at trial — or even earlier.

---

## 1. Preserving Issues for Appeal

### 1.1 The Preservation Requirement

The most important appellate work happens at the trial court level. An issue not properly preserved in the trial court is generally not available on appeal, subject to limited exceptions.

**Requirements for preservation:**
1. **Timely objection or motion.** The issue must be raised in the trial court at the time the alleged error occurs or as soon as the basis for the objection becomes apparent.
2. **Specific grounds.** The objection must state the specific legal basis. A general objection ("I object") typically does not preserve the specific ground for appeal.
3. **Ruling.** The trial court must have ruled on the objection or motion, or the objection must be deemed overruled by operation of law.
4. **Offer of proof.** If evidence is excluded, the proponent must make an offer of proof (Fed. R. Evid. 103(a)(2)) to preserve the issue. This is critical when a court excludes expert testimony on technical subjects.

**Technology litigation preservation issues:**
- **Daubert rulings:** Challenge expert exclusion or admission at the earliest opportunity. If the court excludes your technical expert on a pretrial motion, file a motion for reconsideration and ensure the record includes the excluded expert's full report and qualifications.
- **Jury instructions:** Submit proposed instructions on technology-specific issues (e.g., the definition of "trade secret" in the context of AI training data, the standard for "independent development" of software). Object on the record to any instruction that misstates the law.
- **Claim construction (patent cases):** Markman rulings are reviewed de novo on appeal. Ensure the claim construction record is complete, including all intrinsic evidence (patent claims, specification, prosecution history) and any extrinsic evidence the court considered.
- **Evidentiary rulings on technical evidence:** Object specifically when technical evidence is admitted or excluded. If the court admits evidence of questionable relevance (e.g., the defendant's general business practices rather than the specific alleged misconduct), state the specific basis for the objection.

### 1.2 The Plain Error Exception

Under Fed. R. Civ. P. 51(d)(2) and the analogous criminal plain error doctrine, a court of appeals may consider a forfeited error if it is "plain" (clear or obvious), affects "substantial rights" (affected the outcome), and "seriously affects the fairness, integrity, or public reputation of judicial proceedings." This is an extremely narrow exception. Do not rely on it. Preserve your issues.

### 1.3 Interlocutory Appeals

Most appeals are from final judgments. However, interlocutory appeal is available in limited circumstances:

**As of right (28 U.S.C. Section 1292(a)):**
1. Orders granting, continuing, modifying, refusing, or dissolving injunctions, or refusing to dissolve or modify injunctions — critical in technology cases where preliminary injunctions are frequently sought
2. Orders appointing receivers or refusing to wind up receiverships
3. Admiralty decrees determining rights and liabilities of parties

**By certification (28 U.S.C. Section 1292(b)):**
The district court certifies that the order involves "a controlling question of law as to which there is substantial ground for difference of opinion and that an immediate appeal from the order may materially advance the ultimate termination of the litigation." The court of appeals then has discretion to accept or reject the appeal.

**Collateral order doctrine:**
An order is immediately appealable if it (1) conclusively determines the disputed question, (2) resolves an important issue completely separate from the merits, and (3) is effectively unreviewable on appeal from a final judgment. Examples: denial of qualified immunity, denial of motion to compel arbitration.

**Mandamus (28 U.S.C. Section 1651):**
Extraordinary remedy to correct a clear abuse of discretion by the trial court. Rarely granted but occasionally used in discovery disputes involving extraordinary privilege claims or orders requiring disclosure of trade secrets or proprietary source code.

---

## 2. Notice of Appeal

### 2.1 Federal Courts

**Timing (Fed. R. App. P. 4(a)):**
- **30 days** after entry of the judgment or order being appealed
- **60 days** if the United States or its officer or agency is a party
- A timely post-judgment motion (Rule 50(b), 52(b), 54(d)(2)(B), 59, or 60) tolls the appeal deadline until the motion is resolved
- The deadline is jurisdictional — missing it results in dismissal with no exception for excusable neglect (except in very limited circumstances under Rule 4(a)(5) and (6))

**Content of the notice:**
- Names of all parties taking the appeal
- Designation of the judgment, order, or part thereof being appealed
- Name of the court to which the appeal is taken
- Filing fee ($505 as of 2024; verify current amount)

**Where to file:** The notice of appeal is filed with the district court clerk, not the court of appeals.

### 2.2 Minnesota State Courts

**Timing:**
- **60 days** after service of notice of entry of judgment (Minn. R. Civ. App. P. 104.01)
- Post-trial motions toll the appeal deadline
- The deadline is jurisdictional

**Content and filing:**
- Statement of the case filed with the Clerk of the Appellate Courts
- Filing fee (verify current amount with the Minnesota Judicial Branch)
- Service on all parties

### 2.3 Cross-Appeals

If both parties are dissatisfied with aspects of the judgment, the appellee may file a cross-appeal. In federal court, the cross-appeal must be filed within 14 days after the first notice of appeal is filed (or within the original appeal period, whichever is later). Fed. R. App. P. 4(a)(3).

---

## 3. Standards of Review

Understanding the standard of review for each issue is essential. It determines the level of deference the appellate court gives to the trial court and, practically, the likelihood of reversal.

### 3.1 De Novo Review

The appellate court reviews the issue independently, giving no deference to the trial court's conclusion. Applies to:

- **Questions of law:** Statutory interpretation, constitutional questions, contract interpretation (when the contract is unambiguous), claim construction in patent cases
- **Summary judgment rulings:** The appellate court reviews the record de novo, applying the same standard as the trial court
- **Questions of constitutional fact:** Mixed questions of law and fact where the legal standard predominates

**Significance for technology cases:** De novo review is the appellant's best friend. If the key issues are legal — interpretation of a software license agreement, application of the DTSA to a novel technology, scope of fair use for AI-generated outputs — the appellate court starts fresh. Frame your issues as legal questions whenever possible.

### 3.2 Clear Error Review

The appellate court will reverse a factual finding only if, after reviewing the entire record, it is "left with the definite and firm conviction that a mistake has been made." Applies to:

- **Findings of fact by the trial court in a bench trial**
- **Factual findings underlying mixed questions of law and fact**

**Significance for technology cases:** If the trial was a bench trial and the judge made factual findings about how the technology works, those findings are extremely difficult to overturn. This underscores the importance of building a strong factual record at trial, particularly through effective expert testimony.

### 3.3 Abuse of Discretion Review

The appellate court will reverse only if the trial court's decision was "arbitrary, fanciful, or unreasonable" or if "no reasonable person would take the view adopted by the trial court." Applies to:

- **Evidentiary rulings** (admission or exclusion of evidence)
- **Discovery rulings** (scope of discovery, protective orders, sanctions)
- **Daubert rulings** (exclusion or admission of expert testimony)
- **Injunctive relief decisions** (preliminary injunctions, TROs)
- **Case management decisions** (scheduling, continuances, severance, consolidation)
- **Attorney's fees awards**
- **Sanctions**

**Significance for technology cases:** Daubert rulings are reviewed for abuse of discretion, making them very difficult to overturn on appeal. If the trial court excluded your AI expert or admitted the opponent's unqualified "technology expert," you face an uphill battle. This makes the Daubert fight at the trial level critically important.

### 3.4 Substantial Evidence Review

Used primarily for review of administrative agency determinations and jury verdicts. The court asks whether there is enough evidence that a reasonable fact-finder could have reached the same conclusion.

---

## 4. Record Preparation

### 4.1 The Record on Appeal

The appellate court's review is limited to the record below. The record consists of:

1. **The district court docket entries**
2. **All papers filed with the clerk** (pleadings, motions, memoranda, exhibits)
3. **The transcript of proceedings** (trial testimony, motion hearings, conferences)
4. **Exhibits admitted into evidence**

### 4.2 Ordering the Transcript

**Federal courts (Fed. R. App. P. 10(b)):**
- Within 14 days of filing the notice of appeal, the appellant must order the transcript from the court reporter (or certify that no transcript is needed)
- Designate the portions of the proceedings to be transcribed
- The appellee may designate additional portions within 14 days

**Strategic considerations:**
- Order the complete trial transcript if the appeal raises evidentiary issues, challenges factual findings, or involves jury instructions
- For targeted legal issues, ordering only the relevant proceedings (e.g., the Daubert hearing, the summary judgment argument, the claim construction hearing) reduces cost
- In technology cases, ensure that any technical demonstrations, sidebar discussions about technical evidence, and expert testimony are fully transcribed

### 4.3 Supplementing the Record

If a material item was omitted from the record, the court of appeals may supplement the record under Rule 10(e). However, new evidence not presented to the trial court generally may not be added to the appellate record. An exception exists for matters relevant to mootness, standing, or other jurisdictional issues that arose after the trial court's decision.

**Technology cases:** If the technology at issue has changed since the trial (e.g., a software update fixed the alleged defect, or a new version of the AI model was deployed), this does not change the appellate analysis. The appeal is based on the record as it existed at the time of the trial court's decision.

---

## 5. Brief Writing

### 5.1 Structure of the Appellant's Brief

**Federal courts (Fed. R. App. P. 28(a)):**

1. **Corporate Disclosure Statement** (if applicable)
2. **Table of Contents**
3. **Table of Authorities** (cases, statutes, other authorities cited, with page references)
4. **Jurisdictional Statement** (basis for district court jurisdiction and appellate jurisdiction, including finality of judgment, timeliness of appeal)
5. **Statement of the Issues** (concise statement of each issue presented for review)
6. **Statement of the Case** (procedural history and statement of facts with record citations)
7. **Summary of the Argument** (1-2 pages condensing the argument)
8. **Argument** (with appropriate headings and standard of review identified for each issue)
9. **Conclusion** (specific relief requested)
10. **Certificate of Compliance** (word count)
11. **Certificate of Service**

**Page/word limits:**
- Principal briefs: 13,000 words or 30 pages (Fed. R. App. P. 32(a)(7))
- Reply briefs: 6,500 words or 15 pages
- Minnesota Court of Appeals: similar limits; verify current rules

### 5.2 The Statement of Issues

The statement of issues frames the entire appeal. Each issue should be phrased as a question answerable in the appellant's favor, incorporating the key facts and the legal standard.

**Weak:** "Did the district court err in granting summary judgment?"

**Strong:** "Where undisputed evidence showed that the defendant's software engineer independently designed the disputed algorithm using publicly available academic literature, without access to the plaintiff's proprietary code, did the district court err in denying summary judgment on the plaintiff's trade secret misappropriation claim?"

**Technology litigation issue framing:**
- Incorporate the specific technology facts that make the legal issue concrete
- Reference the standard of review implicitly (e.g., "where undisputed evidence showed" signals de novo review of a summary judgment ruling)
- Avoid legal jargon that obscures the practical question

### 5.3 The Statement of Facts

The statement of facts must be scrupulously accurate and thoroughly cited to the record. Every factual assertion must include a citation to the specific record page.

**Principles:**
- Present the facts favorably but honestly — appellate judges will check your citations and will discount your entire brief if they find misrepresentations
- Lead with the facts that make your legal argument compelling
- Include all material facts, even those unfavorable to your position — address them candidly rather than omitting them
- For technology facts, explain the technology in accessible terms while maintaining accuracy

### 5.4 The Argument

**Organization:**
- Lead with your strongest argument
- Identify the standard of review for each issue at the beginning of the section
- State your legal proposition clearly, then support it with authority, then apply it to the facts
- Address counterarguments and adverse authority directly — the opposing brief will raise them, and the court will expect you to have confronted them
- Use headings and subheadings that make independent arguments (e.g., "The District Court Erred in Excluding Dr. Smith's Expert Testimony Because His AI Model Analysis Methodology Is Widely Accepted in the Computer Science Community")

**Technology litigation argument strategies:**
- **Explain the technology clearly.** Appellate judges are not technology specialists. A brief that fails to make the technology understandable will fail regardless of the strength of the legal arguments.
- **Use analogies.** Relate novel technology concepts to familiar ones. An AI model's training process can be compared to an employee learning from experience. Source code comparison can be explained through textual plagiarism analogies.
- **Visual aids.** Appendices with diagrams, flowcharts, and annotated code comparisons (where relevant to the legal issues) can be highly effective. Verify that the court's rules permit appendices.
- **Address the policy implications.** Technology appeals frequently involve questions of first impression. Frame the policy considerations: how should the law treat AI-generated outputs? Should trade secret protection extend to training data? What standard should govern software product liability? Appellate courts are more receptive to policy arguments than trial courts.

### 5.5 Common Brief-Writing Mistakes

1. **Failing to identify the standard of review.** This signals unfamiliarity with appellate practice and causes the court to question the advocate's competence.
2. **Arguing the facts rather than the law.** The appellate court is not retrying the case. Focus on legal error, not factual disagreements (unless challenging factual findings under the clear error standard).
3. **Citing non-controlling authority without explanation.** If you cite authority from another circuit or a state court in a federal appeal, explain why it is persuasive.
4. **Burying the lead.** The strongest argument should come first. Weak arguments at the beginning cause the court to lose interest.
5. **Excessive quotation.** Quote key language from statutes and controlling cases, but paraphrase and synthesize rather than stringing together block quotes.
6. **Ignoring the record.** Every factual statement must be supported by a record citation. Unsupported factual assertions are ignored.

---

## 6. Oral Argument

### 6.1 Whether to Request Oral Argument

Not all appeals receive oral argument. Some circuits decide a significant percentage of cases on the briefs alone. If argument is available:

- **Request it** when the case involves novel legal issues, complex facts, or issues where the briefs may not fully convey the arguments
- **Consider waiving it** when the briefs are strong and the additional advocacy is unlikely to change the outcome (rare — most appellate attorneys prefer to argue)

### 6.2 Preparation

**Know the record and the briefs cold.** Appellate judges frequently ask specific questions about facts in the record, statements in the briefs, and authority cited by both sides.

**Prepare for questions, not a speech.** Appellate argument is a conversation with the bench, not an uninterrupted presentation. In most circuits, you will have 10-20 minutes and will be interrupted with questions within the first 30 seconds.

**Identify the 2-3 points that matter most.** You will not have time to cover everything in the brief. Focus on the issues where your argument is strongest and where the court seems most engaged.

**Prepare a "hot bench" and "cold bench" version.** A "hot bench" (judges who have read the briefs and are ready with questions) requires flexibility and responsiveness. A "cold bench" (judges who have not fully prepared) requires a clear, structured presentation of the key issues.

**For technology cases:**
- Be prepared to explain the technology in plain language — the judges may ask "How does this AI system actually work?" or "What exactly is a trade secret in the context of source code?"
- Prepare simple visual aids (if permitted) — a one-page diagram of the system architecture or a timeline of events can be powerful
- Anticipate questions about the broader implications of the ruling for the technology industry

### 6.3 Argument Structure

1. **Opening:** "May it please the court. [Your name], for the [appellant/appellee]. If the court has no questions, I would like to address [X]." (This gives the court the option to begin with its questions or let you present.)
2. **Roadmap:** If the court lets you begin, state the 2-3 key points concisely
3. **Argument:** Present each point clearly, with reference to the record and controlling authority
4. **Rebuttal (appellant only):** Reserve 2-3 minutes for rebuttal. Use it to address new points raised by the appellee, not to repeat your opening argument

### 6.4 Common Oral Argument Mistakes

1. **Reading from a script.** Speak from notes or an outline, not a prepared text.
2. **Refusing to answer questions.** Always answer the court's question directly, then pivot back to your argument. "I'd like to finish my point" is never appropriate.
3. **Arguing facts to an appellate court.** Focus on legal error, standard of review, and the implications of the ruling.
4. **Conceding a point unnecessarily.** If a judge asks a hard question, answer it honestly but do not concede more than the question requires.
5. **Ignoring the clock.** Respect time limits absolutely.

---

## 7. Post-Argument Procedures

### 7.1 The Decision

The appellate court may:
- **Affirm** the trial court's decision
- **Reverse** the trial court's decision (in whole or in part)
- **Vacate** the trial court's decision and **remand** for further proceedings
- **Modify** the trial court's decision

The opinion may be:
- **Published** (precedential, cited as authority)
- **Unpublished/non-precedential** (some circuits allow citation of unpublished opinions; others do not)
- **Per curiam** (issued by the court without attribution to a specific judge)
- **Accompanied by concurrences or dissents**

### 7.2 Petitions for Rehearing

**Petition for rehearing by the panel (Fed. R. App. P. 40):**
- Filed within 14 days of entry of judgment
- Granted only if the court overlooked a point of law or fact, or if a change in law occurred
- Rarely granted — use sparingly

**Petition for rehearing en banc (Fed. R. App. P. 35):**
- Filed within 14 days of entry of judgment (may be combined with panel rehearing petition)
- Granted only if the case involves a question of exceptional importance or the panel decision conflicts with a decision of the full court or the Supreme Court
- Very rarely granted (approximately 1-3% of petitions)

### 7.3 Certiorari to the Supreme Court

A petition for a writ of certiorari to the United States Supreme Court must be filed within 90 days of entry of the court of appeals' judgment (Supreme Court Rule 13). The Supreme Court grants certiorari at its discretion, typically to resolve circuit splits, address questions of national importance, or correct clear errors in the application of federal law.

**Technology cases reaching the Supreme Court:** Cases involving fundamental questions about technology law (e.g., the scope of Section 230 immunity, the copyrightability of software APIs, patent eligibility of software inventions under Section 101) may warrant certiorari petitions. Cases involving routine application of established law to technology facts generally do not.

### 7.4 Mandate

The appellate court's mandate issues 7 days after the time to file a petition for rehearing expires, or 7 days after the court denies rehearing. Fed. R. App. P. 41. The mandate returns jurisdiction to the trial court for any further proceedings required by the appellate decision.

---

## 8. Post-Judgment Motions at the Trial Court Level

Before pursuing an appeal, consider whether post-judgment motions at the trial court level may provide relief or preserve issues.

### 8.1 Rule 50(b) — Renewed Motion for Judgment as a Matter of Law

Available after a jury verdict. Must have been preceded by a Rule 50(a) motion at the close of evidence. Deadline: 28 days after entry of judgment.

### 8.2 Rule 52(b) — Motion to Amend Findings

Available after a bench trial. Allows the court to amend its findings of fact or make additional findings. Deadline: 28 days after entry of judgment.

### 8.3 Rule 59 — Motion for a New Trial

Available on various grounds including: verdict against the weight of the evidence, excessive or inadequate damages, newly discovered evidence, errors of law during trial. Deadline: 28 days after entry of judgment.

### 8.4 Rule 60(b) — Relief from Judgment

Available for: mistake, inadvertence, excusable neglect; newly discovered evidence; fraud; void judgment; satisfied or discharged judgment; any other reason justifying relief. Deadline: "reasonable time" (and within one year for grounds (1)-(3)).

**Important:** A timely Rule 50(b), 52(b), or 59 motion tolls the appeal deadline. A Rule 60(b) motion does not toll the appeal deadline. File the notice of appeal and the Rule 60(b) motion concurrently if both are being pursued.

---

## 9. Appellate Practice Checklist

**Pre-Appeal:**
- [ ] All issues preserved through timely objections, motions, and offers of proof at the trial level
- [ ] Post-judgment motions filed if appropriate (Rules 50(b), 52(b), 59, 60(b))
- [ ] Appeal deadline calculated and calendared in multiple systems
- [ ] Cost-benefit analysis of appeal completed (probability of reversal, cost, delay, impact on client)

**Filing:**
- [ ] Notice of appeal filed with the district court clerk before the deadline
- [ ] Filing fee paid
- [ ] All parties served
- [ ] Transcript ordered within 14 days of filing (or statement filed that no transcript is needed)
- [ ] Designation of record filed

**Briefing:**
- [ ] Briefing schedule obtained from the court of appeals
- [ ] Statement of issues drafted and refined
- [ ] Record thoroughly reviewed
- [ ] Applicable standards of review identified for each issue
- [ ] Brief drafted, reviewed, and finalized within word limits
- [ ] All record citations verified
- [ ] All case citations verified and Shepardized/KeyCited
- [ ] Certificate of compliance completed
- [ ] Brief filed and served by the deadline

**Oral Argument:**
- [ ] Argument requested (if desired)
- [ ] Moot court practice sessions conducted
- [ ] Key record references flagged for quick access
- [ ] Visual aids prepared (if permitted)
- [ ] Rebuttal points identified (for appellant)

---

*This guide is intended as a practice aid for licensed attorneys and does not constitute legal advice. Appellate rules and procedures vary by jurisdiction and are subject to change. Always verify current deadlines, formatting requirements, and procedural rules in the applicable court before filing.*
