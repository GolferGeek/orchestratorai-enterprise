# Answer and Response to Complaint Checklist

## Purpose and Scope

This checklist provides a comprehensive framework for drafting answers to civil complaints in state and federal court. It covers timing requirements, responsive pleading strategies, affirmative defenses, counterclaim analysis, and preservation obligations that attach upon receipt of a complaint. Special emphasis is placed on technology litigation scenarios including software disputes, AI liability claims, data breach allegations, and intellectual property conflicts.

An answer is not merely a procedural exercise. It is the defendant's first opportunity to frame the dispute, narrow the issues, assert affirmative positions, and establish the factual and legal terrain for the remainder of the litigation.

---

## 1. Immediate Actions Upon Receipt of Complaint

### 1.1 Calculate Response Deadline

**Federal Court:**
- **21 days** after service of summons and complaint (Fed. R. Civ. P. 12(a)(1)(A)(i))
- **60 days** if the defendant waived formal service under Rule 4(d)
- **Extension by stipulation:** Parties may agree to extensions, typically 14-30 additional days. Memorialize in writing and file with the court.
- **Extension by motion:** If more time is needed and opposing counsel will not stipulate, move for an extension before the deadline expires. Courts routinely grant first extensions for good cause.

**Minnesota State Court:**
- **20 days** after service (Minn. R. Civ. P. 12.01)
- Service by publication may trigger different deadlines — verify the specific method of service

**Critical:** Calendar the deadline immediately in at least two independent systems. A missed answer deadline can result in default, and setting aside a default in technology cases — where damages may be substantial and difficult to calculate — is never guaranteed.

### 1.2 Confirm Proper Service

Before any substantive analysis, verify that service was properly effected:

- [ ] Correct entity served (not a parent, subsidiary, or affiliate)
- [ ] Service on authorized agent (registered agent, officer, managing member)
- [ ] Method of service complied with applicable rules
- [ ] Service was timely (within 90 days of filing in federal court under Rule 4(m))
- [ ] Proof of service properly filed

If service is defective, the deadline may not have started running. However, do not rely on defective service as a strategy — it merely delays the inevitable and antagonizes the court. Raise it in the answer or pre-answer motion as appropriate while also preparing the substantive response.

### 1.3 Issue Litigation Hold

Immediately upon receipt of a complaint:

- [ ] Issue a litigation hold notice to the client, identifying all potentially relevant custodians
- [ ] Preserve all potentially relevant documents, communications, and electronically stored information (ESI)
- [ ] Suspend all routine document destruction and data retention policies as they relate to the subject matter
- [ ] For technology companies: preserve server logs, access logs, code repositories (including branch and commit history), database backups, AI model versions, training data, chat/conversation logs, deployment records, and configuration files
- [ ] Identify and preserve any ephemeral communications (Slack, Teams, Signal) that may be relevant
- [ ] Document the preservation steps taken

**Special considerations for AI/SaaS platforms:**
- Preserve specific model versions, weights, and training data referenced in the complaint
- Preserve API call logs and audit trails
- Preserve user interaction data and conversation histories (subject to privacy obligations)
- If the platform deploys on client hardware, coordinate preservation with the client deployment

See the companion Litigation Hold Template for detailed procedures and sample notices.

### 1.4 Engage Counsel and Notify Insurers

- [ ] Confirm retention of litigation counsel (engagement letter, conflict check)
- [ ] Notify all potentially applicable insurance carriers (CGL, E&O/professional liability, cyber liability, D&O)
- [ ] Review insurance policies for cooperation obligations, consent-to-settle provisions, and coverage exclusions
- [ ] Preserve the right to challenge coverage positions while cooperating with the investigation
- [ ] If the complaint names individual officers or employees, assess indemnification obligations and ensure those individuals have separate representation if necessary

---

## 2. Pre-Answer Analysis

### 2.1 Evaluate Pre-Answer Motions

Before drafting the answer, assess whether a pre-answer motion is strategically appropriate. Filing a Rule 12 motion extends the time to answer until 14 days after the court rules on the motion (Fed. R. Civ. P. 12(a)(4)).

**Motion to Dismiss (Rule 12(b)):**

| Ground | When to Consider | Waiver Risk |
|--------|-----------------|-------------|
| 12(b)(1) — Lack of subject matter jurisdiction | Diversity or federal question genuinely in doubt | Never waived; can be raised at any time |
| 12(b)(2) — Lack of personal jurisdiction | Defendant has minimal contacts with forum state | Waived if not raised in first responsive pleading or pre-answer motion |
| 12(b)(3) — Improper venue | Forum selection clause points elsewhere; no substantial events in district | Waived if not raised in first responsive pleading or pre-answer motion |
| 12(b)(4) — Insufficient process | Defect in the summons itself | Waived if not raised in first responsive pleading or pre-answer motion |
| 12(b)(5) — Insufficient service of process | Service not properly effected | Waived if not raised in first responsive pleading or pre-answer motion |
| 12(b)(6) — Failure to state a claim | One or more counts fails to plead sufficient facts | Not waived; can be raised in answer, at trial, or by motion at any time |
| 12(b)(7) — Failure to join a required party | Indispensable party not included | Not waived under certain circumstances |

**Rule 12(e) — Motion for More Definite Statement:**
If the complaint is so vague or ambiguous that a responsive pleading cannot reasonably be framed. In technology cases, this may be appropriate where the plaintiff has failed to identify with any specificity the trade secrets allegedly misappropriated or the software defects allegedly present.

**Rule 12(f) — Motion to Strike:**
To strike immaterial, impertinent, or scandalous matter. Consider for inflammatory allegations included solely for publicity value, references to inadmissible settlement communications, or allegations about matters protected by privilege.

**Strategic Considerations:**
- A 12(b)(6) motion that eliminates one or two weak claims but leaves the core claims intact may not be worth the cost and delay
- A successful jurisdictional challenge (12(b)(2)) is often dispositive and should be pursued vigorously when the facts support it
- Consider whether a partial motion to dismiss can be combined with an answer on the remaining counts to avoid delay

### 2.2 Analyze Each Allegation

Categorize every numbered paragraph of the complaint as:

1. **Admit** — The allegation is true and admission does not waive any defense
2. **Deny** — The allegation is false or inaccurate in whole or in material part
3. **Lack sufficient knowledge or information to admit or deny** — Use this only when genuinely appropriate; courts disfavor blanket denials of matters within the defendant's knowledge
4. **Admit in part, deny in part** — When an allegation contains both true and false statements, specify precisely which portions are admitted and which are denied

**Rules for paragraph-by-paragraph analysis:**

- **Do not deny facts that are true.** A denial of a clearly established fact (e.g., the existence of a written contract, the defendant's state of incorporation) damages credibility with the court.
- **Do not admit facts that are disputable.** Even if a fact is mostly true, deny it if it contains characterizations, legal conclusions, or inaccuracies.
- **Address legal conclusions separately.** Allegations that state legal conclusions (e.g., "Defendant acted willfully and maliciously") should be addressed as "legal conclusions to which no response is required; to the extent a response is required, denied."
- **Review documents before admitting allegations about their contents.** If the complaint alleges that "the Contract provides X," verify the actual contract language. Paraphrases often distort the actual terms.
- **Be especially careful with dates, amounts, and technical descriptions.** Verify every factual detail before admitting.

### 2.3 Identify Affirmative Defenses

Affirmative defenses must be raised in the answer or they are waived (Fed. R. Civ. P. 8(c); Minn. R. Civ. P. 8.03). Conduct a comprehensive review of all potentially applicable defenses.

**Commonly Applicable Affirmative Defenses in Technology Litigation:**

| Defense | Application |
|---------|-------------|
| Statute of limitations | Claim accrued outside the limitations period; challenge discovery rule applicability |
| Statute of frauds | Oral agreement not enforceable; applies to contracts not performable within one year |
| Waiver | Plaintiff waived the right to assert the claim through conduct, delay, or express statement |
| Estoppel (equitable, judicial, promissory) | Plaintiff's prior representations or conduct preclude current position |
| Laches | Plaintiff unreasonably delayed in asserting rights, causing prejudice |
| Unclean hands | Plaintiff engaged in inequitable conduct related to the subject matter |
| Failure to mitigate damages | Plaintiff failed to take reasonable steps to reduce harm after the alleged wrong |
| Comparative/contributory fault | Plaintiff's own actions contributed to the harm (e.g., failure to implement security measures, failure to restrict access to proprietary systems) |
| Assumption of risk | Plaintiff knowingly accepted the risks that materialized |
| Accord and satisfaction | Prior settlement or payment resolved the claim |
| Release | Plaintiff released the claims through prior agreement |
| License/authorization | Defendant had permission to use the technology, data, or IP at issue |
| Independent development | For trade secret claims: the defendant independently developed the technology without reference to plaintiff's secrets |
| Reverse engineering | For trade secret claims: the information was obtained through lawful reverse engineering |
| Public availability | For trade secret claims: the alleged secret was publicly available or generally known in the industry |
| Fair use | For copyright claims: the use was transformative, for research, criticism, or other fair use purposes |
| First sale doctrine | For IP claims: plaintiff's rights were exhausted by the first authorized sale |
| Preemption | Federal law preempts the state law claim |
| Contractual limitation of liability | Contract limits defendant's exposure to a specific amount or type of damages |
| Force majeure | Performance was prevented by circumstances beyond defendant's control |
| Consent | Plaintiff consented to the conduct alleged |

**Practical tip:** Plead affirmative defenses broadly in the initial answer. You can always narrow or abandon defenses later, but you cannot add new ones without leave of court. The cost of including a defense that proves inapplicable is minimal compared to the cost of waiving one.

### 2.4 Evaluate Counterclaims

**Compulsory Counterclaims (Fed. R. Civ. P. 13(a); Minn. R. Civ. P. 13.01):**
Any claim against the opposing party that arises out of the same transaction or occurrence as the opposing party's claim. These must be raised or they are waived.

**Permissive Counterclaims (Fed. R. Civ. P. 13(b); Minn. R. Civ. P. 13.02):**
Claims against the opposing party that do not arise out of the same transaction or occurrence. These may be raised but are not required.

**Common counterclaims in technology disputes:**
- Breach of contract (e.g., failure to pay for services, violation of non-compete)
- Declaratory judgment of non-infringement or non-misappropriation
- Tortious interference with business relationships
- Defamation or trade libel (if plaintiff made false public statements about defendant's products)
- Abuse of process or malicious prosecution (in exceptional cases)
- Antitrust claims (if the lawsuit is part of an anticompetitive strategy)
- Breach of warranty (if plaintiff's technology failed)

**Strategic counterclaim considerations:**
- Does the counterclaim strengthen the defensive position by demonstrating that the plaintiff is not a blameless victim?
- Does it create settlement leverage?
- Does it expand the scope of discovery in a way that benefits the defense?
- Does it risk expanding the case in ways that increase cost and complexity without proportionate benefit?

---

## 3. Drafting the Answer

### 3.1 Structure

The answer should follow this structure:

1. **Caption** — identical format to the complaint
2. **Introduction** (optional but recommended) — brief statement of the defense's position, analogous to the plaintiff's "Nature of the Action"
3. **Response to Allegations** — paragraph-by-paragraph responses corresponding to the complaint's numbered paragraphs
4. **Affirmative Defenses** — separately numbered defenses
5. **Counterclaims** (if any) — styled as a separate section with its own factual allegations, causes of action, and prayer for relief
6. **Prayer for Relief** — request for dismissal, attorney's fees, costs, and any affirmative relief sought
7. **Jury Demand** (if applicable) — the defendant has an independent right to demand a jury trial

### 3.2 Tone and Approach

- **Be professional and measured.** An answer is not a brief. Save the argument for motion practice.
- **Do not volunteer information.** The answer should respond to what was alleged, not preview the defense's evidence or strategy.
- **Deny clearly.** "Denied" or "Defendant denies the allegations in Paragraph X" is sufficient. Do not explain why you are denying unless the explanation constitutes an affirmative defense.
- **Avoid "upon information and belief" for matters within your knowledge.** Courts will not credit a lack-of-knowledge response about the defendant's own conduct, the terms of contracts it signed, or facts about its own products and operations.

### 3.3 General Denial vs. Specific Responses

Under Fed. R. Civ. P. 8(b)(3), a party may make a general denial only if the party "in good faith intends to deny all the allegations of a pleading." General denials are almost never appropriate because the complaint will contain at least some undeniable facts (party names, existence of contracts, etc.). Always use specific, paragraph-by-paragraph responses.

---

## 4. Post-Answer Obligations

### 4.1 Immediate Post-Answer Steps

- [ ] Serve the answer on all parties
- [ ] File proof of service
- [ ] Calendar all upcoming deadlines (Rule 26(f) conference, initial disclosures, scheduling conference)
- [ ] Begin preparing initial disclosures (due within 14 days of the Rule 26(f) conference in federal court)
- [ ] Identify and begin collecting documents responsive to anticipated discovery
- [ ] Assess the need for early discovery or protective orders

### 4.2 Rule 26(f) Conference Preparation

Within the timeframe specified by the court's scheduling order (typically 21 days before the scheduling conference), the parties must confer to:

- [ ] Discuss the nature and basis of claims and defenses
- [ ] Explore settlement possibilities
- [ ] Arrange for required disclosures
- [ ] Develop a proposed discovery plan including: ESI protocols, phasing of discovery, limitations on interrogatories and depositions, and any anticipated disputes

**For technology cases, prepare to discuss:**
- ESI preservation and production protocols (format, search terms, custodians)
- Confidentiality/protective order for trade secrets and proprietary code
- Protocol for review of source code (e.g., in-camera review, attorneys' eyes only, clean room procedures)
- Expert discovery timing and Daubert challenge scheduling
- Phased discovery if liability should be resolved before damages

### 4.3 Initial Disclosures

Under Fed. R. Civ. P. 26(a)(1), the following must be disclosed without awaiting a discovery request:

- [ ] Names, addresses, and phone numbers of individuals likely to have discoverable information and the subjects of that information
- [ ] Copies or descriptions of documents, ESI, and tangible things in the party's possession, custody, or control that may be used to support claims or defenses
- [ ] Computation of damages with supporting documents
- [ ] Insurance agreements under which an insurer may be liable for all or part of any judgment

---

## 5. Special Considerations for Technology Cases

### 5.1 Preserving Technical Defenses

When responding to complaints involving software, AI, or technology:

- **Do not admit characterizations of how the technology works.** The plaintiff's description of the defendant's technology is often inaccurate or misleading. Deny and provide the correct characterization in the introduction or counterclaim.
- **Preserve independent development defenses.** For trade secret claims, the answer should explicitly raise independent development as an affirmative defense. Begin immediately collecting evidence of independent development: prior art, independent research, design documents, commit histories, and contemporaneous communications.
- **Address AI-specific allegations carefully.** If the complaint alleges that an AI system produced harmful outputs, deny characterizations of how the AI functions while admitting or denying the specific factual events. The description of the technology's internal workings is frequently a characterization, not a fact.
- **Protect proprietary information in the answer.** If responding to allegations requires discussing trade secrets or proprietary methods, request a protective order before filing the answer, or file a redacted version with an unredacted version under seal.

### 5.2 Data Breach Response Specifics

When answering a data breach complaint:

- Deny allegations about the nature and scope of the breach unless independently confirmed through forensic investigation
- Raise regulatory compliance as a defense where applicable (compliance with applicable security standards does not necessarily preclude liability but is relevant)
- Assert failure to mitigate if the plaintiff failed to take reasonable post-breach protective measures
- Consider whether indemnification claims against third-party service providers should be brought as third-party complaints

### 5.3 Contractor Misclassification Defense

When answering a complaint alleging contractor misclassification:

- Deny conclusory allegations about the level of control exercised
- Assert the independent contractor agreement and the parties' mutual intent
- Raise equitable defenses based on the plaintiff's own representations (e.g., the plaintiff held itself out as an independent business, maintained its own insurance, worked for other clients)
- Consider whether the applicable legal test (IRS 20-factor, ABC test, economic reality) favors the defense, and plead the relevant factors as affirmative defenses

---

## 6. Answer Quality Assurance Checklist

Before filing, verify:

- [ ] Every numbered paragraph of the complaint has been addressed
- [ ] No true facts have been denied
- [ ] No disputable facts have been admitted
- [ ] All applicable affirmative defenses have been raised
- [ ] Compulsory counterclaims have been included
- [ ] The answer complies with all applicable formatting rules (local rules, page limits, font requirements)
- [ ] The jury demand is included (if desired)
- [ ] The answer has been reviewed for Rule 11 compliance
- [ ] The answer has been reviewed by the client for factual accuracy
- [ ] All pre-answer motions (if any) are coordinated with the answer
- [ ] The litigation hold has been implemented and documented
- [ ] Insurance carriers have been notified
- [ ] A service list has been prepared for all parties
- [ ] The filing deadline has been confirmed and calendared

---

## 7. Common Mistakes to Avoid

1. **Filing after the deadline without obtaining an extension.** This is malpractice. Calendar the deadline and request extensions proactively.

2. **Using boilerplate affirmative defenses without analysis.** While it is prudent to plead broadly, listing 30 affirmative defenses with no factual basis invites a Rule 12(f) motion to strike and signals to the court that you have not analyzed the case.

3. **Admitting allegations about documents without reviewing the documents.** Always verify the actual language of contracts, emails, and other documents before admitting allegations about their contents.

4. **Failing to raise compulsory counterclaims.** These are waived if not included in the answer. Analyze every potential claim against the plaintiff that arises from the same transaction.

5. **Ignoring the complaint's framing.** The complaint sets the narrative. If the answer does not contest that narrative, it becomes the accepted version. Use the introduction to reframe the dispute from the defense perspective.

6. **Denying jurisdictional facts that are undeniable.** If the defendant is a Minnesota LLC and the complaint so alleges, admit it. Denying undeniable facts erodes credibility.

7. **Neglecting preservation obligations.** The duty to preserve arises when litigation is reasonably anticipated, which is certainly triggered upon receipt of a complaint. Failure to preserve can result in adverse inference instructions, sanctions, and default.

---

*This checklist is intended for use by licensed attorneys as a practice aid and does not constitute legal advice. Rules and procedures vary by jurisdiction and are subject to change. Verify all deadlines and requirements in the applicable jurisdiction before filing.*
