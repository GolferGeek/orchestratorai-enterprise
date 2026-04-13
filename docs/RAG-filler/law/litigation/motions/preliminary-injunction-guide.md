# Preliminary Injunction and Temporary Restraining Order Guide

## Purpose and Scope

This guide addresses the standards, procedures, and strategic considerations for obtaining and opposing preliminary injunctions and temporary restraining orders (TROs) in federal and Minnesota state courts. It places particular emphasis on technology disputes where injunctive relief is frequently sought: trade secret misappropriation, intellectual property infringement, data breach containment, non-compete enforcement, and unauthorized access to software platforms and AI systems.

Preliminary injunctive relief is extraordinary. Courts do not grant it lightly. Success requires demonstrating an urgent need for judicial intervention before the merits are fully adjudicated, supported by concrete evidence rather than speculation. In technology disputes, where the harm often involves intangible assets and the competitive landscape can shift rapidly, the analysis presents unique challenges and opportunities.

---

## 1. Foundational Standards

### 1.1 The Four-Factor Test

Both federal courts (following Winter v. Natural Resources Defense Council, Inc., 555 U.S. 7 (2008)) and Minnesota state courts apply a multi-factor test for preliminary injunctions:

**Federal Standard:**
1. Likelihood of success on the merits
2. Likelihood of irreparable harm in the absence of preliminary relief
3. Balance of equities tips in the movant's favor
4. An injunction is in the public interest

**Minnesota Standard (Dahlberg Bros., Inc. v. Ford Motor Co., 137 N.W.2d 314 (Minn. 1965)):**
1. The nature and background of the relationship between the parties
2. The harm to be suffered by the movant if the temporary restraint is denied as compared to that inflicted on the opposing party if the restraint is granted
3. The likelihood that one party or the other will prevail on the merits
4. Aspects of public policy
5. The administrative burden on the court from granting or denying the relief

The factors are not independent requirements — they exist on a sliding scale. A stronger showing on one factor may compensate for a weaker showing on another. However, after Winter, the movant must demonstrate at least some likelihood of success on the merits and at least some irreparable harm; neither factor can be zero.

### 1.2 TRO vs. Preliminary Injunction

| Feature | TRO | Preliminary Injunction |
|---------|-----|----------------------|
| Notice to adverse party | May be granted ex parte under Fed. R. Civ. P. 65(b) if immediate and irreparable injury will result before the adverse party can be heard | Requires notice and hearing (Fed. R. Civ. P. 65(a)) |
| Duration | Maximum 14 days (may be extended once for 14 additional days for good cause) | Remains in effect until trial or further order of the court |
| Standard | Same four factors, but courts may apply them with more flexibility given the emergency posture | Full four-factor analysis with developed record |
| Evidentiary showing | Declarations and verified complaint; limited or no discovery | May include declarations, documents, limited depositions, and expert evidence |
| Bond requirement | Required under Rule 65(c) | Required under Rule 65(c) |

**When to seek a TRO rather than (or in addition to) a preliminary injunction:**
- Active, ongoing misappropriation of trade secrets (e.g., defendant is currently using stolen code to build a competing product for imminent launch)
- Imminent destruction of evidence (e.g., defendant is wiping servers or deleting repositories)
- Ongoing unauthorized access to systems that must be terminated immediately
- Imminent product launch that will cause market confusion or dilute IP rights

### 1.3 Ex Parte TROs

An ex parte TRO may be issued only if:
1. Specific facts in an affidavit or verified complaint clearly show that immediate and irreparable injury, loss, or damage will result before the adverse party can be heard
2. The movant's attorney certifies in writing the efforts made to give notice and the reasons why notice should not be required

**Practice warning:** Courts are extremely reluctant to grant ex parte relief. The showing of urgency must be compelling and the movant must demonstrate that notice to the adverse party would itself cause irreparable harm (e.g., the defendant would destroy evidence or accelerate the harmful conduct if informed of the proceeding). Seeking ex parte relief that is not warranted can damage credibility with the court.

---

## 2. Factor Analysis: Detailed Treatment

### 2.1 Likelihood of Success on the Merits

The movant must demonstrate a "fair chance of prevailing" or "questions going to the merits so serious, substantial, difficult, and doubtful as to make them fair ground for litigation." The precise formulation varies by circuit.

**For trade secret claims:**
- Identify the trade secrets with reasonable particularity
- Demonstrate that the information qualifies as a trade secret (derives independent economic value from secrecy, subject to reasonable protective measures)
- Demonstrate that the defendant acquired, disclosed, or used the trade secrets by improper means
- **Technology-specific evidence:** Access logs showing the defendant (or the defendant's employees, including former employees of the plaintiff) accessed proprietary systems, repositories, or databases; file transfer records; anomalous download patterns; side-by-side comparison of plaintiff's code/models and defendant's product showing substantial similarity; testimony from forensic analysts about data exfiltration

**For patent infringement:**
- Demonstrate that the patent is valid (presumption of validity under 35 U.S.C. Section 282, but challenger may raise invalidity defenses)
- Demonstrate infringement through claim construction and application to the accused product
- Address potential defenses (invalidity, non-infringement, exhaustion, license)

**For copyright infringement:**
- Demonstrate ownership of a valid copyright
- Demonstrate copying (access plus substantial similarity, or direct evidence of copying)
- For software: address whether the copied elements are protectable expression vs. unprotectable ideas, processes, or functional elements

**For breach of non-compete or NDA:**
- Demonstrate the existence and enforceability of the restrictive covenant
- Demonstrate the breach (competitor employment, disclosure of confidential information, solicitation of clients)
- **Minnesota-specific:** Minnesota courts will enforce non-competes only if they are necessary to protect legitimate business interests, are reasonable in scope and duration, and are supported by adequate consideration. Minn. Stat. Section 181.988 (effective 2023) restricts non-competes for certain employees — verify applicability.

**For data breach injunction:**
- Demonstrate that the defendant's systems still contain plaintiff's data or that the breach is ongoing
- Demonstrate that the defendant has failed to implement adequate remedial measures
- Demonstrate continuing risk of harm from the uncontained breach

### 2.2 Irreparable Harm

This is often the decisive factor. The movant must show harm that cannot be adequately compensated by money damages.

**Types of irreparable harm recognized in technology disputes:**

**Loss of trade secret protection:**
Once a trade secret is disclosed, it loses its status as a trade secret permanently. Courts routinely find this constitutes irreparable harm. "A trade secret once lost is, of course, lost forever." Ruckelshaus v. Monsanto Co., 467 U.S. 986, 1012 (1984). This is the strongest basis for irreparable harm in technology cases.

**Loss of competitive advantage:**
Where the defendant's use of misappropriated technology or IP gives it an unfair competitive advantage that erodes the plaintiff's market position, courts may find irreparable harm because the lost competitive position is difficult to quantify and cannot be fully restored by damages.

**Destruction of evidence:**
If there is reason to believe the defendant will destroy code, delete data, wipe servers, or alter AI model training data, the loss of that evidence constitutes irreparable harm that justifies injunctive relief.

**Ongoing unauthorized access:**
Where the defendant continues to access the plaintiff's systems, data, or platforms without authorization, each additional access event causes incremental harm (additional data exposure, additional security costs, additional risk).

**Harm to goodwill and reputation:**
Where the defendant's conduct (e.g., deploying defective software under the plaintiff's name, or using plaintiff's AI system to produce harmful outputs) damages the plaintiff's reputation in ways that are difficult to quantify.

**What does NOT constitute irreparable harm:**
- Purely economic losses that can be calculated and awarded as damages
- Speculative or hypothetical future harm without evidence of imminence
- Harm that the plaintiff could prevent through its own actions (e.g., revoking the defendant's access credentials if the plaintiff has the ability to do so)
- Delay in seeking relief that undermines the claim of urgency

**The delay problem:** Courts scrutinize the timing of injunction requests. If the plaintiff knew of the allegedly harmful conduct for weeks or months before seeking emergency relief, the delay undermines the claim of irreparable harm. In technology cases, where monitoring and access controls can often detect unauthorized activity quickly, explain any delay between discovery and filing.

### 2.3 Balance of Equities

The court weighs the harm to the movant if the injunction is denied against the harm to the non-movant if the injunction is granted.

**Considerations favoring the movant:**
- The injunction merely preserves the status quo ante (prevents the defendant from continuing newly initiated harmful conduct)
- The defendant's conduct is clearly wrongful (weighing equities against a bad actor)
- The movant took prompt action upon discovering the harmful conduct
- The harm to the movant is existential (threatens business viability)

**Considerations favoring the non-movant:**
- The injunction would effectively put the defendant out of business
- The injunction would require the defendant to destroy work product that may have been independently developed
- The injunction is overbroad relative to the actual harm
- The movant delayed in seeking relief
- Third parties (employees, customers) would be harmed by the injunction

**Technology-specific considerations:**
- An injunction requiring a technology company to cease using a specific technology may be more disruptive than in other industries because of the interconnected nature of software systems
- Courts may fashion narrow injunctions (e.g., prohibiting use of specific code modules or specific training data rather than shutting down an entire product)
- Consider whether a "clean room" remedy is feasible: the defendant rebuilds the disputed component from scratch, verified by a court-appointed technical expert

### 2.4 Public Interest

This factor varies based on the nature of the dispute:

**Favors injunction:**
- Protecting trade secrets and intellectual property promotes innovation
- Enforcing data security obligations protects the public from data breaches
- Preventing the spread of defective AI outputs protects consumers who rely on those outputs

**Favors denying injunction:**
- Injunction would deprive the public of a useful product or service
- Injunction would harm competition in a market with limited participants
- Overly broad injunctions chill legitimate innovation and independent development

---

## 3. Procedural Requirements

### 3.1 Motion Papers

**The motion must include:**

1. **Memorandum of law** addressing all four factors with citations to the evidentiary record
2. **Declarations or affidavits** providing the factual foundation — these must be based on personal knowledge and set forth facts that would be admissible in evidence
3. **Exhibits** supporting the declarations (contracts, access logs, forensic reports, code comparisons, communications)
4. **Proposed order** specifying the exact conduct to be enjoined or required
5. **Notice of motion** (in state court) or certificate of compliance with local rules (in federal court)

**For TROs, additionally include:**
6. **Verified complaint** or supporting affidavit with specific facts demonstrating the emergency
7. **Attorney certification** regarding efforts to give notice (for ex parte applications)

### 3.2 The Bond Requirement

Under Fed. R. Civ. P. 65(c), the court may issue a preliminary injunction or TRO "only if the movant gives security in an amount that the court considers proper to pay the costs and damages sustained by any party found to have been wrongfully enjoined."

**Bond amount considerations:**
- The bond should cover the defendant's losses during the injunction period if the injunction is ultimately determined to have been wrongfully issued
- In technology cases, these losses can be substantial (lost revenue, development delays, reputational harm)
- Courts have discretion in setting bond amounts and may set nominal bonds in some circumstances
- The defendant should argue for a substantial bond; the plaintiff should argue for a nominal or modest bond

**Minnesota:** Minn. R. Civ. P. 65.03(b) similarly requires security "in such sum as the court deems proper."

### 3.3 Specificity of the Injunction

Under Fed. R. Civ. P. 65(d), every order granting an injunction must:
1. State the reasons why it was issued
2. State its terms specifically
3. Describe in reasonable detail the act or acts restrained or required

**Drafting the proposed order — technology-specific considerations:**

- **Prohibit specific conduct, not general categories.** "Defendant shall not access Plaintiff's GitHub repositories" is better than "Defendant shall not access Plaintiff's systems."
- **Address data and code in the defendant's possession.** Should the defendant be required to return or destroy copies? If so, how should compliance be verified?
- **Address ongoing obligations.** If the defendant is enjoined from using certain technology, must it submit to periodic audits? Must it provide access to its systems for inspection?
- **Carve out legitimate activities.** A well-drafted injunction distinguishes between the prohibited conduct and the defendant's legitimate business activities that should not be affected.
- **Appoint a special master or technical expert** if compliance requires specialized knowledge to evaluate. In cases involving source code comparison, AI model analysis, or forensic investigation, a court-appointed expert can verify compliance without requiring the parties to trust each other.

---

## 4. Evidentiary Considerations

### 4.1 Declarations as Primary Evidence

At the preliminary injunction stage, courts rely primarily on declarations and affidavits rather than live testimony (though some courts conduct evidentiary hearings with live witnesses).

**Effective technology declarations should:**
- Be submitted by witnesses with personal knowledge of the relevant facts
- Explain technical concepts in accessible language
- Attach and authenticate key documents
- For forensic evidence: detail the methodology used to discover the harmful conduct, the chain of custody for digital evidence, and the conclusions drawn from the analysis
- For expert evidence: establish the expert's qualifications and the basis for their opinions

### 4.2 Expert Evidence

Expert testimony is often critical in technology injunction cases:

- **Forensic experts** to establish unauthorized access, data exfiltration, or code copying
- **Software experts** to compare source code, analyze AI model similarities, or evaluate security measures
- **Industry experts** to establish the competitive significance of the information at issue and the irreparable nature of the harm
- **Damages experts** to demonstrate that money damages are inadequate (paradoxically, showing damages are unquantifiable supports the irreparable harm argument)

### 4.3 Preliminary Injunction Hearing

If the court schedules an evidentiary hearing:
- Prepare witnesses for direct and cross-examination on the four factors
- Prepare demonstrative exhibits that explain technical concepts visually
- Be prepared for the court to ask questions directly (judges at injunction hearings are frequently active questioners)
- The hearing is not a trial — focus on the key facts that drive the four-factor analysis, not a comprehensive presentation of the merits

---

## 5. Opposing Preliminary Injunctions

### 5.1 Response Strategy

The response should challenge each of the four factors:

**Challenge likelihood of success:**
- Raise substantive defenses (independent development, license, fair use, invalidity, public availability)
- Challenge the factual foundation of the movant's claims
- Demonstrate that the legal theories are novel, unsettled, or contrary to controlling authority

**Challenge irreparable harm:**
- Demonstrate that the harm is purely economic and fully compensable by damages
- Point to delay in seeking relief as evidence that the harm is not irreparable
- Show that the movant can mitigate the harm through its own actions
- Challenge the movant's characterization of the harm as speculative or hypothetical

**Challenge the balance of equities:**
- Demonstrate the magnitude of harm the injunction would cause to the defendant
- Identify harm to third parties (employees, customers, business partners)
- Show that the proposed injunction is overbroad relative to the claimed harm
- Argue for a narrower alternative that addresses the movant's concerns with less disruption

**Challenge public interest:**
- Demonstrate that the injunction would harm competition, consumers, or innovation
- Show that the movant is using the injunction to gain an anticompetitive advantage

### 5.2 Requesting a Substantial Bond

If the court is inclined to grant the injunction, argue for a substantial bond:
- Calculate the defendant's projected losses during the injunction period (lost revenue, development costs, market position deterioration)
- Present evidence of these potential losses through declarations and financial analysis
- A requirement for a large bond may deter the movant from pursuing the injunction

### 5.3 Proposing Alternatives

Offer less restrictive alternatives that address the movant's legitimate concerns:
- Escrow arrangements for disputed code or data
- Clean room development protocols with independent monitoring
- Enhanced security measures rather than complete cessation of use
- Accelerated discovery and trial schedule rather than preliminary injunctive relief
- A consent order with agreed-upon restrictions that are narrower than the requested injunction

---

## 6. DTSA Seizure Orders

The Defend Trade Secrets Act includes a unique provision allowing ex parte seizure of property "necessary to prevent the propagation or dissemination of the trade secret." 18 U.S.C. Section 1836(b)(2).

### 6.1 Requirements for Seizure

The court must find that:
1. A Rule 65 order would be inadequate because the party would evade, avoid, or otherwise not comply
2. Immediate and irreparable injury will occur without seizure
3. The balance of hardships and the public interest favor seizure
4. The applicant is likely to succeed on the merits
5. The person against whom seizure would be ordered has possession of the trade secret and the property to be seized
6. The applicant describes the matter with reasonable particularity
7. The applicant has not publicized the requested seizure
8. The harm to the applicant outweighs the harm to the legitimate interests of the seizure target and substantially outweighs the harm to any third parties

### 6.2 Seizure in Technology Contexts

In practice, DTSA seizure orders in technology cases might target:
- Laptops, servers, and storage devices containing misappropriated code or data
- Copies of proprietary software, AI models, or training datasets
- Devices used to access the plaintiff's systems without authorization

**Practical challenges:**
- Modern technology companies use cloud storage, encrypted communications, and distributed systems that make physical seizure less effective
- The defendant may have copies of the trade secrets in multiple locations, including personal devices and cloud accounts
- Seizure can disrupt legitimate business operations if the devices also contain non-infringing materials
- Federal marshals executing seizure orders may not have the technical expertise to identify and separate trade secret materials from other data — request appointment of a forensic specialist to accompany the marshals

---

## 7. Post-Injunction Procedures

### 7.1 Compliance Monitoring

- Establish clear metrics and timelines for compliance
- Appoint a technical monitor if compliance requires specialized assessment
- Schedule compliance status conferences with the court
- Document any violations promptly (violations of an injunction may be punished as contempt)

### 7.2 Modification or Dissolution

Either party may move to modify or dissolve the preliminary injunction based on:
- Changed circumstances (new evidence, changed market conditions, resolution of some claims)
- The injunction is overly burdensome in practice (unforeseen consequences)
- The movant's likelihood of success has diminished (e.g., key evidence was excluded or a claim was dismissed)
- The parties have reached a partial agreement that renders some injunctive provisions unnecessary

### 7.3 Appeal

Interlocutory appeal of a preliminary injunction order is available as of right under 28 U.S.C. Section 1292(a)(1). The standard of review is abuse of discretion, with underlying legal conclusions reviewed de novo and factual findings reviewed for clear error.

**Timing:** The notice of appeal must be filed within 30 days of the order. The injunction typically remains in effect during the appeal unless the appellate court grants a stay.

---

## 8. Preliminary Injunction Checklist

**Pre-Filing Preparation:**
- [ ] Four-factor analysis completed and documented
- [ ] Specific irreparable harm identified with supporting evidence
- [ ] Delay analysis — can you explain any delay between discovery and filing?
- [ ] Proposed order drafted with specific, enforceable terms
- [ ] Bond amount assessed (both what to offer and what to argue if opposing)
- [ ] Expert declarations prepared (forensic, technical, industry)
- [ ] All key documents collected and authenticated

**Motion Filing:**
- [ ] Memorandum of law addressing all four factors
- [ ] Supporting declarations based on personal knowledge
- [ ] Exhibits authenticated and properly labeled
- [ ] Proposed order attached
- [ ] Bond offer or argument regarding bond amount
- [ ] Certificate of service
- [ ] Compliance with local rules (page limits, formatting, filing requirements)

**Hearing Preparation:**
- [ ] Witnesses prepared for direct and cross-examination
- [ ] Demonstrative exhibits prepared
- [ ] Binder of key exhibits for the bench
- [ ] Opening statement prepared (if the court permits)
- [ ] Proposed findings of fact and conclusions of law drafted (for submission after hearing if requested)

**Post-Hearing:**
- [ ] Proposed order revised to reflect the court's rulings
- [ ] Bond posted (if injunction granted)
- [ ] Compliance plan implemented
- [ ] Interlocutory appeal analysis completed (if injunction denied or granted against you)

---

*This guide is intended as a practice aid for licensed attorneys and does not constitute legal advice. Injunctive relief standards and procedures vary by jurisdiction and continue to evolve through case law. Verify current requirements and controlling authority before seeking or opposing injunctive relief.*
