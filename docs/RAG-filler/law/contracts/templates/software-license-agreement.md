# Software License Agreement

**ORCHESTRATOR AI LLC**

---

## ORCHESTRATORAI PLATFORM LICENSE AGREEMENT

**Effective Date:** [DATE]

**Agreement Number:** OAI-LIC-[YEAR]-[###]

---

THIS SOFTWARE LICENSE AGREEMENT (this "Agreement") is entered into as of the Effective Date set forth above by and between:

**Orchestrator AI LLC**, a Florida limited liability company with its principal place of business at Minneapolis/St. Paul, Minnesota ("Licensor"), and

**[CLIENT FULL LEGAL NAME]**, a [STATE] [ENTITY TYPE] with its principal place of business at [ADDRESS] ("Licensee").

Licensor and Licensee are each referred to herein as a "Party" and collectively as the "Parties."

---

## RECITALS

WHEREAS, Licensor has developed and owns the OrchestratorAI platform, a proprietary artificial intelligence orchestration system that enables organizations to deploy, manage, and operate AI agents across local, cloud, and hybrid infrastructure;

WHEREAS, Licensee desires to obtain a license to deploy and use the OrchestratorAI platform on Licensee's local hardware infrastructure for Licensee's internal business purposes;

WHEREAS, Licensor is willing to grant such a license on the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants contained herein, the Parties agree as follows:

---

## SECTION 1. DEFINITIONS

1.1. **"Authorized Users"** means Licensee's employees and authorized contractors who are permitted to access and use the Platform under this Agreement, up to the number specified in the applicable License Schedule.

1.2. **"Client Data"** means all data, content, files, and information that Licensee or its Authorized Users input into, process through, or generate using the Platform, excluding Platform analytics and telemetry data.

1.3. **"Confidential Information"** means all non-public information disclosed by either Party, including the Platform source code, architecture, documentation, business terms, and Client Data.

1.4. **"Deployment Environment"** means the specific hardware, operating system, network configuration, and infrastructure on which the Platform is installed, as described in the License Schedule.

1.5. **"Documentation"** means all user manuals, technical specifications, API references, deployment guides, and other instructional materials provided by Licensor in connection with the Platform.

1.6. **"License Fee"** means the annual fee payable by Licensee for the license granted hereunder, as specified in the License Schedule.

1.7. **"License Schedule"** means the schedule attached hereto as Exhibit A, specifying the license tier, fees, Authorized User count, Deployment Environment, support level, and other license parameters.

1.8. **"Platform"** means the OrchestratorAI software platform, including all components, modules, agent frameworks, APIs, user interfaces, and associated utilities, in the version specified in the License Schedule.

1.9. **"Support Services"** means the maintenance, technical support, and update services described in Section 7 and the License Schedule.

1.10. **"Updates"** means bug fixes, patches, security updates, and minor version releases (e.g., v2.1 to v2.2) that Licensor makes generally available to its licensees.

1.11. **"Upgrades"** means major version releases (e.g., v2.x to v3.x) that introduce substantial new features or architectural changes.

---

## SECTION 2. LICENSE GRANT

2.1. **License.** Subject to the terms and conditions of this Agreement and payment of the License Fee, Licensor hereby grants to Licensee a non-exclusive, non-transferable, non-sublicensable license to install, deploy, and use the Platform on the Deployment Environment for Licensee's internal business purposes during the Term.

2.2. **Scope of License.** The license granted herein includes the right to:

(a) Install and deploy the Platform on hardware owned or controlled by Licensee at Licensee's facilities as specified in the License Schedule;

(b) Permit Authorized Users to access and use the Platform through Licensee's internal network;

(c) Configure, customize, and extend the Platform through the Platform's published APIs and configuration interfaces;

(d) Create and deploy custom AI agents using the Platform's agent frameworks;

(e) Process Client Data through the Platform; and

(f) Use the Documentation in connection with the foregoing.

2.3. **License Tiers.** The Platform is licensed under the following tier structure:

| Tier | Annual Fee | Authorized Users | Agents | Support Level |
|------|------------|------------------|--------|---------------|
| Starter | $20,000/yr | Up to 10 | Up to 20 | Standard |
| Professional | $45,000/yr | Up to 50 | Up to 100 | Priority |
| Enterprise | $85,000/yr | Unlimited | Unlimited | Premium |

The applicable tier shall be specified in the License Schedule.

2.4. **Deployment Model.** The Platform shall be deployed locally on Licensee's hardware infrastructure ("Local Deployment"). This deployment model ensures that:

(a) All Client Data remains on Licensee's hardware and network;

(b) AI model inference occurs locally on Licensee's hardware (for locally-hosted models);

(c) Licensee retains physical control over all Platform infrastructure;

(d) No Client Data is transmitted to Licensor's systems except as necessary for license validation and as otherwise described in Section 6.

2.5. **Cloud and Hybrid Deployment.** If the License Schedule specifies a cloud or hybrid deployment model, additional terms in Exhibit B shall apply, including data processing provisions and cloud infrastructure responsibilities.

---

## SECTION 3. LICENSE RESTRICTIONS

3.1. **Prohibited Uses.** Licensee shall not, and shall not permit any third party to:

(a) Copy, reproduce, or duplicate the Platform except as reasonably necessary for backup and disaster recovery purposes;

(b) Modify, adapt, translate, reverse engineer, decompile, disassemble, or create derivative works based on the Platform, except to the extent that such restriction is prohibited by applicable law;

(c) Sublicense, lease, rent, loan, distribute, or otherwise transfer the Platform or any rights therein to any third party;

(d) Use the Platform to provide service bureau, time-sharing, or similar services to third parties;

(e) Remove, alter, or obscure any proprietary notices, labels, or marks on the Platform or Documentation;

(f) Use the Platform in violation of any applicable law, regulation, or third-party right;

(g) Exceed the Authorized User count or Agent limits specified in the License Schedule;

(h) Deploy the Platform on hardware or infrastructure not specified in the License Schedule without prior written approval from Licensor;

(i) Use the Platform to develop a product or service that competes with the Platform;

(j) Publish benchmark or performance testing results for the Platform without Licensor's prior written consent; or

(k) Circumvent or disable any license validation, usage metering, or access control mechanisms in the Platform.

3.2. **Third-Party Components.** The Platform may incorporate third-party open-source software components. A list of such components and their applicable licenses is provided in the Documentation. Licensee agrees to comply with the license terms applicable to such third-party components.

3.3. **LLM Provider Agreements.** The Platform integrates with third-party large language model (LLM) providers (e.g., OpenAI, Anthropic, Google, Azure). Licensee is solely responsible for: (a) obtaining and maintaining its own accounts and API keys with such providers; (b) complying with such providers' terms of service; and (c) all costs associated with LLM API usage.

---

## SECTION 4. DATA OWNERSHIP AND PRIVACY

4.1. **Client Data Ownership.** As between the Parties, Licensee owns all right, title, and interest in and to all Client Data. Licensor claims no ownership interest in Client Data.

4.2. **Data Locality.** In a Local Deployment, Client Data is stored and processed entirely on Licensee's hardware. Licensor does not have access to Client Data except: (a) when Licensee explicitly grants remote access for support purposes as described in Section 7; or (b) when aggregated, anonymized usage analytics are transmitted as described in Section 4.4.

4.3. **Data Processing.** To the extent that Licensee processes personal data through the Platform, the data processing terms set forth in the Data Processing Agreement (if executed separately or attached as Exhibit C) shall apply.

4.4. **Usage Analytics.** The Platform may collect and transmit to Licensor aggregated, anonymized usage analytics for the purpose of improving the Platform. Such analytics shall not include Client Data or personally identifiable information. Licensee may disable analytics transmission through the Platform's configuration settings.

4.5. **Data Portability.** Licensee shall have the right to export all Client Data from the Platform at any time during the Term in standard, machine-readable formats (JSON, CSV, or SQL). Upon termination, Licensor shall provide reasonable assistance to facilitate data export.

4.6. **Data Security.** Licensee is responsible for implementing and maintaining appropriate security measures for the Deployment Environment, including access controls, network security, encryption, and physical security. Licensor shall provide security configuration guidelines in the Documentation.

---

## SECTION 5. FEES AND PAYMENT

5.1. **License Fee.** Licensee shall pay the annual License Fee specified in the License Schedule. The initial License Fee is due within thirty (30) days of the Effective Date.

5.2. **Renewal Fees.** License Fees for each Renewal Term shall be invoiced sixty (60) days prior to the start of each Renewal Term. Licensor may increase the License Fee by up to seven percent (7%) for each Renewal Term upon sixty (60) days' prior written notice.

5.3. **Deployment Services.** Initial deployment, configuration, and training services shall be billed separately at Licensor's then-current consulting rates, as specified in the License Schedule or a separate Statement of Work.

5.4. **Payment Terms.** All invoices are due within thirty (30) calendar days of the invoice date. Late payments shall accrue interest at the rate of one and one-half percent (1.5%) per month, or the maximum rate permitted by law, whichever is less.

5.5. **Taxes.** All fees are exclusive of taxes. Licensee shall be responsible for all sales, use, VAT, and other taxes arising from this Agreement, excluding taxes based on Licensor's income.

5.6. **Suspension for Non-Payment.** If any undisputed invoice remains unpaid for more than forty-five (45) days, Licensor may, upon fifteen (15) days' prior written notice, suspend Licensee's access to Support Services. Licensor shall not remotely disable the locally-deployed Platform; however, license validation may reflect the non-payment status.

---

## SECTION 6. INTELLECTUAL PROPERTY

6.1. **Licensor Ownership.** Licensor retains all right, title, and interest in and to the Platform, Documentation, and all associated Intellectual Property, including all patents, copyrights, trade secrets, trademarks, and other proprietary rights. This Agreement grants Licensee only the license rights expressly stated herein.

6.2. **Feedback.** If Licensee provides Licensor with suggestions, enhancement requests, or other feedback regarding the Platform ("Feedback"), Licensor shall have an unrestricted, perpetual, irrevocable, royalty-free license to use, modify, and incorporate such Feedback into the Platform without obligation to Licensee.

6.3. **Custom Agents and Configurations.** AI agents, workflows, prompts, and configurations created by Licensee using the Platform's tools are owned by Licensee. However, the underlying agent frameworks, execution engines, and platform infrastructure remain the property of Licensor.

6.4. **Marks.** Licensee shall not use Licensor's name, trademarks, or logos without prior written consent, except that Licensee may state that it is a licensed user of the OrchestratorAI platform.

---

## SECTION 7. SUPPORT AND MAINTENANCE

7.1. **Support Levels.** Licensor shall provide Support Services in accordance with the support level specified in the License Schedule:

**Standard Support:**
- Business hours support (9 AM - 5 PM CT, Monday through Friday, excluding holidays)
- Email and ticketing system access
- 24-hour response time for critical issues
- 48-hour response time for non-critical issues
- Access to Updates during the Term

**Priority Support:**
- Extended hours support (7 AM - 9 PM CT, Monday through Friday)
- Email, ticketing, and video call support
- 8-hour response time for critical issues
- 24-hour response time for non-critical issues
- Access to Updates during the Term
- Quarterly platform health review

**Premium Support:**
- 24/7 support for critical issues
- Dedicated support contact
- 4-hour response time for critical issues
- 8-hour response time for non-critical issues
- Access to Updates and Upgrades during the Term
- Monthly platform health review
- Annual on-site architecture review

7.2. **Updates.** Licensor shall make Updates available to Licensee during the Term. Licensee is responsible for applying Updates to the Deployment Environment. Licensor shall provide installation instructions and change logs for each Update.

7.3. **Upgrades.** Major version Upgrades are included with Premium Support. For Standard and Priority Support tiers, Upgrades may be purchased separately at Licensor's then-current pricing.

7.4. **Remote Access.** For the purpose of providing Support Services, Licensee may grant Licensor temporary remote access to the Deployment Environment. Such access shall be: (a) initiated by Licensee; (b) limited in duration to the support session; (c) logged and auditable; and (d) subject to the confidentiality provisions of this Agreement.

7.5. **End of Life.** Licensor shall provide at least twelve (12) months' notice before discontinuing support for any major version of the Platform.

---

## SECTION 8. WARRANTIES

8.1. **Platform Warranty.** Licensor warrants that the Platform will materially conform to the Documentation for a period of ninety (90) days following initial deployment ("Warranty Period"). If the Platform fails to conform during the Warranty Period, Licensor shall, at its option, repair or replace the non-conforming component or, if unable to do so within sixty (60) days, refund the License Fee.

8.2. **Malicious Code.** Licensor warrants that the Platform, as delivered, does not contain any virus, malware, trojan horse, worm, or other malicious code.

8.3. **Authority.** Each Party warrants that it has the authority to enter into this Agreement.

8.4. **DISCLAIMER.** EXCEPT AS EXPRESSLY SET FORTH IN THIS SECTION 8, THE PLATFORM IS PROVIDED "AS IS." LICENSOR DISCLAIMS ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. LICENSOR DOES NOT WARRANT THAT THE PLATFORM WILL BE ERROR-FREE, UNINTERRUPTED, OR FREE FROM VULNERABILITIES. LICENSOR DOES NOT WARRANT THE ACCURACY, RELIABILITY, OR QUALITY OF ANY AI-GENERATED OUTPUTS PRODUCED BY THE PLATFORM.

---

## SECTION 9. LIMITATION OF LIABILITY

9.1. **Consequential Damages.** IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, REVENUE, DATA, OR BUSINESS OPPORTUNITY.

9.2. **Liability Cap.** LICENSOR'S AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL LICENSE FEES PAID BY LICENSEE DURING THE TWELVE (12) MONTHS PRECEDING THE CLAIM.

9.3. **Exceptions.** The limitations in this Section 9 shall not apply to: (a) Licensor's indemnification obligations under Section 10.1; (b) Licensee's breach of Section 3 (License Restrictions); or (c) either Party's breach of confidentiality obligations.

---

## SECTION 10. INDEMNIFICATION

10.1. **Licensor Indemnification.** Licensor shall indemnify, defend, and hold harmless Licensee from any third-party claim that the Platform, as delivered and used in accordance with this Agreement, infringes a United States patent, copyright, or trade secret. If the Platform becomes the subject of an infringement claim, Licensor may, at its option: (a) obtain for Licensee the right to continue using the Platform; (b) modify the Platform to be non-infringing; or (c) terminate the license and refund a pro-rata portion of the License Fee.

10.2. **Licensee Indemnification.** Licensee shall indemnify, defend, and hold harmless Licensor from any claim arising from: (a) Licensee's use of the Platform in violation of this Agreement; (b) Client Data; or (c) Licensee's AI agents, custom configurations, or outputs.

10.3. **Procedure.** The indemnified Party shall promptly notify the indemnifying Party of any claim, provide reasonable cooperation, and grant the indemnifying Party sole control of the defense and settlement.

---

## SECTION 11. TERM AND TERMINATION

11.1. **Term.** This Agreement shall commence on the Effective Date and continue for an initial period of one (1) year (the "Initial Term"). Thereafter, this Agreement shall automatically renew for successive one-year periods (each, a "Renewal Term") unless either Party provides written notice of non-renewal at least ninety (90) days prior to expiration.

11.2. **Termination for Cause.** Either Party may terminate this Agreement upon written notice if the other Party materially breaches and fails to cure within thirty (30) days of written notice.

11.3. **Termination for Non-Payment.** Licensor may terminate this Agreement if Licensee fails to pay any undisputed invoice for more than sixty (60) days after the due date.

11.4. **Effect of Termination.** Upon termination: (a) all license rights granted herein shall immediately cease; (b) Licensee shall cease use of the Platform and delete all copies within thirty (30) days; (c) Licensee shall have sixty (60) days to export all Client Data; (d) Licensee shall certify in writing that all copies of the Platform have been deleted; and (e) the Company shall refund any prepaid, unused License Fees on a pro-rata basis (except in cases of termination for Licensee's breach).

11.5. **Survival.** Sections 1, 3, 4, 5, 6, 8.4, 9, 10, and 12 shall survive termination.

---

## SECTION 12. GENERAL PROVISIONS

12.1. **Governing Law.** This Agreement shall be governed by the laws of the State of Florida without regard to conflict-of-laws principles. For disputes related to Deployments in Minnesota, Minnesota law shall apply to the extent required by mandatory provisions.

12.2. **Dispute Resolution.** Disputes shall be resolved through negotiation, then mediation in Hennepin County, Minnesota, then binding arbitration under AAA Commercial Arbitration Rules. Either Party may seek injunctive relief to prevent IP infringement or unauthorized disclosure.

12.3. **Export Compliance.** Licensee shall comply with all applicable export control laws and regulations, including the U.S. Export Administration Regulations (EAR).

12.4. **Entire Agreement.** This Agreement, together with all Exhibits and Schedules, constitutes the entire agreement between the Parties.

12.5. **Amendment.** This Agreement may only be amended by written instrument signed by both Parties.

12.6. **Assignment.** Licensee may not assign without Licensor's consent. Licensor may assign to a successor entity.

12.7. **Notices.** All notices in writing, effective upon receipt.

12.8. **Severability.** Invalid provisions shall be modified to be enforceable; remaining provisions continue.

12.9. **Counterparts.** This Agreement may be executed in counterparts.

12.10. **Force Majeure.** Neither Party liable for delays caused by events beyond reasonable control.

12.11. **Government Rights.** If Licensee is a U.S. government entity, the Platform is commercial computer software licensed under FAR 12.212 and DFARS 227.7202.

---

## SIGNATURE BLOCK

**IN WITNESS WHEREOF**, the Parties have executed this Agreement as of the Effective Date.

**ORCHESTRATOR AI LLC**

| | |
|---|---|
| Signature: | ______________________________ |
| Name: | [AUTHORIZED SIGNATORY] |
| Title: | Managing Member |
| Date: | ______________________________ |

**LICENSEE: [CLIENT NAME]**

| | |
|---|---|
| Signature: | ______________________________ |
| Name: | [AUTHORIZED SIGNATORY] |
| Title: | [TITLE] |
| Date: | ______________________________ |

---

## EXHIBIT A: LICENSE SCHEDULE

**License Tier:** [ ] Starter [ ] Professional [ ] Enterprise

**Annual License Fee:** $[AMOUNT]

**Authorized Users:** [NUMBER]

**Agent Limit:** [NUMBER or "Unlimited"]

**Support Level:** [ ] Standard [ ] Priority [ ] Premium

**Deployment Environment:**
- Hardware: [e.g., Apple Mac Studio M2 Ultra, 192GB RAM]
- Operating System: [e.g., macOS Sonoma 14.x]
- Network: [e.g., Isolated internal network with VPN access]
- Location: [Physical address of deployment]

**Deployment Model:** [ ] Local [ ] Cloud [ ] Hybrid

**Initial Deployment Date:** [DATE]

**Deployment Services:**
| Service | Fee |
|---------|-----|
| Initial installation and configuration | $[AMOUNT] |
| Admin training (up to [X] hours) | $[AMOUNT] |
| User training (up to [X] hours) | $[AMOUNT] |
| Custom agent development (up to [X] hours) | $[AMOUNT] |

**LLM Provider Configuration:**
- [ ] OpenAI (Licensee's API key)
- [ ] Anthropic (Licensee's API key)
- [ ] Google Vertex AI (Licensee's credentials)
- [ ] Azure OpenAI (Licensee's subscription)
- [ ] Local models (Ollama/vLLM on Licensee hardware)

---

*This document is a template provided for informational purposes. Orchestrator AI LLC recommends that all parties seek independent legal counsel before executing any agreement.*
