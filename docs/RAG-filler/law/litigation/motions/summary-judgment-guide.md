# Guide to Summary Judgment Motions in Technology Litigation

## Purpose and Scope

This guide provides a comprehensive framework for preparing, filing, and opposing summary judgment motions under Federal Rule of Civil Procedure 56 and Minnesota Rule of Civil Procedure 56, with particular emphasis on technology litigation involving software disputes, AI liability, intellectual property claims, data breach cases, and contractor misclassification. Summary judgment is the most powerful pre-trial dispositive tool available, and in technology cases it frequently determines the outcome of the litigation.

The standard is deceptively simple: summary judgment is appropriate when "there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a). The application of that standard to complex technology disputes requires meticulous preparation and a deep understanding of both the substantive law and the evidentiary record.

---

## 1. Strategic Considerations: When to Move for Summary Judgment

### 1.1 Timing

Summary judgment may be filed "at any time until 30 days after the close of all discovery" unless the court orders otherwise. Fed. R. Civ. P. 56(b). Local rules frequently impose earlier deadlines.

**Optimal timing considerations:**

- **After key depositions are complete.** You need testimony from the critical witnesses locked in before filing. Moving too early risks a Rule 56(d) continuance motion (formerly Rule 56(f)).
- **After expert reports are exchanged.** In technology cases, expert testimony is often the decisive evidence on both liability and damages. Moving before expert reports are available invites opposition based on "anticipated expert testimony."
- **Before the court's dispositive motion deadline.** This is often set in the scheduling order and is a hard cutoff.
- **Consider partial summary judgment.** Even if the entire case cannot be resolved, eliminating specific claims, defenses, or damages theories can dramatically streamline trial and improve settlement posture.

### 1.2 Full vs. Partial Summary Judgment

**Full summary judgment** is appropriate when the undisputed facts establish every element of the movant's claim or negate at least one essential element of the opponent's claim as to every cause of action.

**Partial summary judgment** under Rule 56(a) (determining liability but not damages, or resolving some claims while others proceed to trial) is often the more realistic and strategically valuable option in complex technology cases.

| Approach | When Appropriate |
|----------|-----------------|
| Full MSJ on all claims | One-sided facts, clear legal standards, documentary evidence controls |
| Partial MSJ eliminating specific claims | Weak claims that do not survive Twombly/Iqbal but were not dismissed at the pleading stage because discovery was needed |
| Partial MSJ on liability | Liability is clear but damages are disputed |
| Partial MSJ on damages theories | Plaintiff's damage methodology is legally defective |
| Partial MSJ on affirmative defenses | Defense is established as a matter of law (e.g., statute of limitations, license, release) |

### 1.3 Cost-Benefit Analysis

A summary judgment motion in a technology case typically costs $50,000-$200,000+ in attorney time to prepare properly. Before committing those resources, assess:

- What is the probability of success (full or partial)?
- What is the value of the claims or defenses at issue?
- Will the motion improve the settlement posture even if denied?
- Is the opponent likely to file a cross-motion?
- Does the motion deadline interact with mediation or settlement deadlines in a way that affects timing?

---

## 2. Preparing the Motion

### 2.1 Statement of Undisputed Material Facts

The statement of undisputed material facts (SUMF) is the foundation of the motion. Every federal district and most state courts require a separately filed statement of facts, with each fact numbered and supported by specific citations to admissible evidence.

**Principles for drafting the SUMF:**

1. **Each fact should be a single, simple, indisputable proposition.** Compound statements invite partial denials. "On March 15, 2025, Defendant's employee John Smith accessed Plaintiff's repository" is preferable to "On March 15, 2025, Defendant's employee John Smith wrongfully accessed Plaintiff's proprietary repository and downloaded trade secret materials."

2. **Cite to admissible evidence.** Deposition transcripts (with page and line numbers), declarations, interrogatory responses, document production (with Bates numbers), and requests for admission. Avoid citing to evidence that would be inadmissible at trial.

3. **Include only material facts.** A fact is "material" if it affects the outcome under the governing law. Extensive background facts that are not legally relevant dilute the impact of the SUMF and invite objections.

4. **Build to the legal conclusion.** Organize the SUMF so that the facts, taken in sequence, lead inescapably to the conclusion that the movant is entitled to judgment.

5. **Anticipate the opposition.** For each fact, ask: "Will the opponent genuinely dispute this?" If so, consider whether the fact is truly undisputed or whether additional evidence is needed to establish it beyond dispute.

**Technology litigation SUMF considerations:**

- When establishing facts about software behavior, AI model outputs, or system architectures, rely on documentary evidence (logs, code commits, configuration files) and expert analysis rather than lay witness testimony. Technical facts established through expert declarations are harder to create genuine disputes about than facts based on lay witness recollection.
- For trade secret cases, organize the SUMF to establish each element systematically: (1) identification of the trade secrets, (2) measures taken to maintain secrecy, (3) defendant's access, (4) misappropriation (acquisition, disclosure, or use), (5) resulting harm.
- For data breach cases, establish the timeline of the breach, the specific security failures, and the causal chain between the failures and the harm with forensic evidence.

### 2.2 Memorandum of Law

The memorandum should follow this structure:

**I. Introduction** (1-2 pages maximum)
- Concise statement of what the motion seeks
- One-paragraph summary of why judgment is warranted
- Roadmap of the argument

**II. Statement of Facts**
- Narrative version of the SUMF that tells the story coherently
- Cross-references to SUMF paragraph numbers
- This is the persuasive version; the SUMF is the evidentiary version

**III. Legal Standard**
- Standard summary judgment language from controlling authority
- Note: this section should be brief (1 page). Judges know the standard.

**IV. Argument**
- Organized by claim or defense
- For each: identify the legal elements, map the undisputed facts to each element, explain why no genuine dispute exists
- Address anticipated counterarguments
- Distinguish adverse authority

**V. Conclusion**
- Specific relief requested
- Reference to proposed order (if required by local rule)

### 2.3 Supporting Evidence

**Declarations and Affidavits:**
- Must be based on personal knowledge (Fed. R. Civ. P. 56(c)(4))
- Must set forth facts that would be admissible in evidence
- The declarant must be competent to testify to the matters stated
- For technology cases, use declarations from engineers, developers, and IT professionals to establish technical facts
- Expert declarations should address the technical standards, industry practices, and causal opinions that support the motion

**Documentary Evidence:**
- Authenticate all documents through declarations or deposition testimony
- Organize exhibits logically and cross-reference to the SUMF
- For source code comparisons, use side-by-side exhibits with expert analysis
- For data breach cases, include forensic reports, log files, and timeline reconstructions
- For AI output claims, include the specific inputs, outputs, and system configurations at issue

**Deposition Testimony:**
- Cite specific pages and lines
- Include enough context to prevent misleading excerpts
- Attach the relevant deposition pages as exhibits
- Use video deposition clips (if the court permits) for particularly compelling testimony

### 2.4 Common Grounds for Summary Judgment in Technology Cases

**Trade Secret Misappropriation:**
- No genuine dispute that the information is publicly available or generally known in the industry
- No genuine dispute that the plaintiff failed to take reasonable measures to maintain secrecy (e.g., no access controls, no NDAs, shared openly with third parties)
- Undisputed evidence of independent development by the defendant
- Undisputed evidence that the information was obtained through lawful reverse engineering

**Software/AI Liability:**
- No genuine dispute about the contractual limitations on liability (limitation of liability clause, exclusion of consequential damages)
- No genuine dispute that the plaintiff assumed the risk of the specific failure (e.g., continued use after known defect was reported)
- No genuine dispute about the plaintiff's failure to follow documented procedures or system requirements
- Statute of limitations expired as a matter of law (date of breach or delivery is undisputed)

**Copyright Infringement:**
- No genuine dispute of independent creation (defendant's development timeline and documentation establish independent creation)
- No genuine dispute that the copied elements are not protectable (ideas, facts, merger doctrine, scenes a faire)
- Fair use is established as a matter of law (all four factors favor the defendant)

**Data Breach:**
- No genuine dispute that the plaintiff suffered no cognizable injury (standing)
- No genuine dispute that the defendant's security measures met or exceeded the applicable contractual and regulatory standards at the time of the breach
- No genuine dispute about the intervening cause of the breach (third-party criminal conduct)

**Contractor Misclassification:**
- Undisputed facts about the working arrangement satisfy the applicable legal test for independent contractor status
- Written agreement unambiguously establishes independent contractor relationship and the worker's actual conduct conformed to the agreement

---

## 3. Opposing Summary Judgment

### 3.1 Response Requirements

**Federal Court:**
- Response due within the time set by local rule (commonly 21-28 days after the motion is filed, but varies significantly by district)
- Must include a response to each numbered fact in the SUMF: admitted, denied (with citation to evidence creating a genuine dispute), or immaterial
- Must include a memorandum of law in opposition
- May include a statement of additional material facts that preclude summary judgment

**Minnesota State Court:**
- Response procedures governed by Minn. R. Civ. P. 56.03 and local rules
- Similar requirement to respond to each statement of fact

### 3.2 Strategies for Creating Genuine Disputes of Material Fact

A genuine dispute exists when "the evidence is such that a reasonable jury could return a verdict for the nonmoving party." Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986). The nonmoving party need not prove its case at the summary judgment stage — it must only show that triable issues exist.

**Effective opposition strategies:**

1. **Deposition testimony contradicting documentary evidence.** In technology cases, the movant often relies heavily on documents (contracts, logs, code). Deposition testimony providing context, explaining ambiguities, or contradicting the movant's interpretation of those documents creates genuine disputes.

2. **Expert opinions creating factual disputes.** A qualified expert's opinion that the technology functioned differently than the movant claims, that the damages methodology is valid, or that the security measures were inadequate creates a genuine dispute that cannot be resolved on summary judgment.

3. **Circumstantial evidence and reasonable inferences.** The court must draw all reasonable inferences in favor of the nonmoving party. In trade secret cases, circumstantial evidence of access plus suspicious timing of competitive product launch can create a triable issue of misappropriation even without direct evidence of copying.

4. **Credibility determinations.** Summary judgment is inappropriate when the case turns on credibility. If the key facts depend on conflicting witness accounts of meetings, conversations, or intent, the court cannot weigh credibility.

5. **Rule 56(d) continuance.** If discovery is incomplete and additional discovery could produce evidence creating a genuine dispute, file a declaration specifying what facts are unavailable, why they are needed, and what steps have been taken to obtain them.

### 3.3 Common Pitfalls in Opposing Summary Judgment

1. **Relying on the pleadings.** After the close of discovery, the nonmoving party cannot rely on allegations in the complaint to create genuine disputes. The opposition must point to specific evidence in the record.

2. **Citing inadmissible evidence.** Hearsay, unauthenticated documents, and expert opinions that fail Daubert do not create genuine disputes. Ensure every piece of evidence cited in the opposition would be admissible at trial (or can be presented in admissible form at trial, per Rule 56(c)(2)).

3. **Creating only immaterial disputes.** Disputing background facts that do not affect the legal analysis is futile. Focus on the facts that are outcome-determinative.

4. **Conceding legal arguments.** If the movant argues that a specific legal standard governs and the opponent does not contest that argument, the court may accept it. Address every legal argument, even if briefly.

5. **Filing a cross-motion without adequate preparation.** A cross-motion for summary judgment requires the same level of preparation as the original motion. Do not file one reflexively.

---

## 4. The Statement of Undisputed Facts: Detailed Requirements

### 4.1 Format Requirements

Most federal districts have specific local rules governing the SUMF. Common requirements include:

- Separately numbered paragraphs
- Each paragraph containing a single factual proposition
- Citation to specific evidence after each paragraph (deposition page/line, exhibit number, declaration paragraph)
- A requirement that the opposing party respond to each numbered paragraph and cite contrary evidence for any denial

**Check the local rules of your specific court before filing.** Non-compliance with SUMF formatting requirements can result in the motion being stricken or the facts being deemed admitted.

### 4.2 Responding to the SUMF

The response to each fact should be one of:

- **Admitted.** The fact is undisputed.
- **Denied.** The fact is disputed, with citation to specific evidence creating the genuine dispute.
- **Admitted in part, denied in part.** Specify which portions are admitted and which are denied.
- **Immaterial.** The fact is not relevant to the legal issues before the court. (Use sparingly; courts prefer that you simply admit immaterial facts.)
- **Objection.** The cited evidence is inadmissible (hearsay, lack of foundation, speculation). Note the objection and also respond substantively in the alternative.

---

## 5. Expert Evidence at Summary Judgment

### 5.1 Role of Expert Testimony

In technology cases, expert testimony frequently determines the outcome of summary judgment. Common expert subjects include:

- **Technical experts:** Software architecture and functionality, AI model behavior, cybersecurity standards, data forensics, source code comparison
- **Damages experts:** Lost profits calculations, reasonable royalty analysis, cost of remediation, diminished business value
- **Industry experts:** Standard of care, industry practices, reasonable security measures

### 5.2 Daubert Challenges at Summary Judgment

A Daubert motion to exclude expert testimony can be filed concurrently with or in opposition to summary judgment. If the expert is excluded, the party relying on that expert may be left without evidence sufficient to create a genuine dispute on the relevant issue.

**Timing strategy:** If you intend to challenge the opponent's expert and file for summary judgment, consider filing the Daubert motion first or simultaneously. If the court excludes the expert, the summary judgment motion becomes significantly stronger.

**For technology experts specifically:**
- Challenge experts who lack specific expertise in the relevant technology (an expert in "computer science generally" may not be qualified to opine on AI model training, blockchain security, or distributed systems architecture)
- Challenge methodologies that do not follow accepted practices in the relevant technical field
- Challenge "litigation-driven" analyses that were not performed using the same methodology the expert would use outside of litigation

### 5.3 Presenting Technical Evidence Effectively

- Use demonstrative exhibits (diagrams, timelines, flowcharts) to make complex technical facts accessible
- Submit source code comparisons in a format the court can review (side-by-side annotated excerpts, not raw code dumps)
- For AI-related disputes, explain model behavior through concrete input/output examples rather than abstract descriptions of algorithms
- Include a glossary of technical terms if the motion involves specialized terminology

---

## 6. Oral Argument

### 6.1 Preparation

Not all courts hear oral argument on summary judgment. If argument is granted:

- **Know the record cold.** The court will ask specific questions about the evidence. Be prepared to point to exact deposition pages, exhibit numbers, and declaration paragraphs.
- **Lead with your strongest point.** You have limited time and the court may interrupt with questions.
- **Prepare for questions about genuineness of disputes.** The court will focus on whether the claimed disputes are genuine and material.
- **Bring demonstrative aids.** For technology cases, visual aids explaining the technology, the timeline, or the evidence can be highly effective at argument.

### 6.2 Common Questions from the Bench

Prepare answers for:
- "What is the single most important undisputed fact that entitles you to judgment?"
- "What evidence in the record creates a genuine dispute on [element]?"
- "If I deny this motion, what specific factual issues will the jury need to resolve?"
- "How does the [expert report/deposition testimony/document] affect the analysis?"
- "What is the practical effect of a partial grant?"

---

## 7. Post-Decision Considerations

### 7.1 If the Motion is Granted

- Review the order carefully for any conditions or limitations
- Prepare a proposed final judgment (if full summary judgment) or determine the effect on remaining claims (if partial)
- Consider the opponent's likely post-judgment motions (Rule 59 motion to alter or amend, Rule 60 motion for relief from judgment)
- If partial summary judgment is granted, assess the impact on trial preparation and settlement posture

### 7.2 If the Motion is Denied

- Analyze the court's reasoning to understand what factual issues the court identified
- Assess whether the denial narrows or clarifies the issues for trial
- Consider whether the denied motion provides a basis for an interlocutory appeal (generally only under 28 U.S.C. Section 1292(b) if the court certifies the order for appeal)
- Use the court's analysis to refine trial strategy — the court's identification of genuine disputes tells you exactly what the jury will need to decide

### 7.3 If the Motion is Granted in Part

- File a motion for reconsideration only if the court clearly misapprehended a material fact or applicable law
- Use the partial grant to recalibrate settlement value and trial preparation
- Consider whether the remaining claims justify the cost of proceeding to trial

---

## 8. Summary Judgment Preparation Checklist

**Pre-Filing:**
- [ ] Discovery is sufficiently complete to support the motion
- [ ] Key deposition testimony has been obtained and reviewed
- [ ] Expert reports have been exchanged (if applicable)
- [ ] Local rules on SUMF format and page limits have been reviewed
- [ ] Filing deadline has been confirmed
- [ ] Cost-benefit analysis has been performed

**Drafting:**
- [ ] Each SUMF paragraph contains a single, material, undisputed fact
- [ ] Each SUMF paragraph is supported by citation to admissible evidence
- [ ] The memorandum addresses every element of each claim or defense at issue
- [ ] Anticipated counterarguments are addressed
- [ ] Adverse authority is distinguished
- [ ] All evidence is properly authenticated
- [ ] A proposed order has been prepared (if required by local rule)

**Filing:**
- [ ] Compliant with page limits, font requirements, and formatting rules
- [ ] All exhibits are properly labeled and filed
- [ ] Certificate of service is prepared
- [ ] Copy for the judge's chambers is prepared (if required by local rule)

**Post-Filing:**
- [ ] Monitor for the opposition filing
- [ ] Prepare the reply brief (if permitted; check local rules for page limits and deadlines)
- [ ] Prepare for oral argument (if requested or expected)

---

*This guide is intended as a practice aid for licensed attorneys and does not constitute legal advice. Summary judgment standards and procedures vary by jurisdiction and evolve through case law. Verify current requirements and controlling authority in the applicable jurisdiction before filing.*
