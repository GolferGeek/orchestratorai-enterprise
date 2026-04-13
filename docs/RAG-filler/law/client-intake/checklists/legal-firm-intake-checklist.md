# Boutique Legal Firm Platform Intake Checklist

**Document Type:** Client Intake Checklist — Legal Firm OrchestratorAI Onboarding
**Prepared By:** OrchestratorAI Practice Management Consulting
**Version:** 1.0
**Last Updated:** April 2026
**Applicable To:** Boutique and mid-size law firms evaluating or onboarding onto the OrchestratorAI platform for AI-assisted legal practice management

---

## Purpose

This checklist is specifically designed for onboarding boutique legal firms onto the OrchestratorAI platform. Legal firms present the highest confidentiality requirements of any client vertical and have unique regulatory obligations (bar rules, ethics opinions, client privilege) that must be evaluated before platform deployment.

OrchestratorAI's local-first deployment model is particularly well-suited for legal firms because client data never leaves the firm's physical premises. This checklist ensures that every technical, ethical, and operational consideration is addressed before deployment begins.

---

## Section 1: Firm Information

### 1.1 General Firm Profile

- [ ] Full legal name of the firm
- [ ] Entity type (LLP, PLLC, PC, sole proprietorship)
- [ ] State(s) of organization
- [ ] Date of formation
- [ ] Managing partner name, email, and direct phone
- [ ] Office administrator / operations manager name, email, and direct phone
- [ ] IT manager or IT vendor contact (name, company, email, phone)
- [ ] Principal office address
- [ ] All additional office locations
- [ ] Firm website URL
- [ ] Number of years in operation

### 1.2 Firm Size and Structure

- [ ] Total number of attorneys
  - [ ] Partners / shareholders
  - [ ] Of counsel
  - [ ] Associates
  - [ ] Contract / temporary attorneys
- [ ] Total number of paralegals and legal assistants
- [ ] Total number of administrative staff
- [ ] Total number of IT staff (in-house)
- [ ] Organizational chart or description of reporting structure
- [ ] Any affiliated entities (title company, consulting arm, mediation center)

### 1.3 Practice Areas

- [ ] Primary practice areas (list all):
  - [ ] Personal injury / plaintiff's litigation
  - [ ] Defense litigation
  - [ ] Corporate / transactional
  - [ ] Real estate
  - [ ] Family law
  - [ ] Criminal defense
  - [ ] Immigration
  - [ ] Employment law
  - [ ] Intellectual property
  - [ ] Estate planning / probate
  - [ ] Bankruptcy
  - [ ] Tax
  - [ ] Environmental
  - [ ] Healthcare law
  - [ ] Other: _______________
- [ ] Practice areas by revenue (rank order, top 5)
- [ ] Any practice areas being expanded or added
- [ ] Geographic scope of practice (local, statewide, multi-state, national)
- [ ] Courts and jurisdictions regularly practiced in

### 1.4 Client Base Profile

- [ ] Approximate number of active client matters
- [ ] Average new matters opened per month
- [ ] Client type breakdown (individual consumers, small business, corporate, government)
- [ ] Average matter duration by practice area
- [ ] Client intake volume (inquiries per month vs. retained per month)
- [ ] Referral sources (advertising, referral network, online, bar association)

---

## Section 2: Current Technology Stack

### 2.1 Practice Management Software

- [ ] Current practice management system (Clio, MyCase, PracticePanther, Smokeball, PCLaw, Tabs3, custom, none)
- [ ] Version and deployment (cloud vs. on-premises)
- [ ] Number of active users
- [ ] Satisfaction level (1-5 scale)
- [ ] Contract terms and renewal date
- [ ] Data export capability (formats available)
- [ ] Integration points with other systems
- [ ] Custom fields or configurations in use

### 2.2 Document Management

- [ ] Document management system (NetDocuments, iManage, Worldox, SharePoint, file server, cloud storage)
- [ ] Total document volume (estimated number of documents)
- [ ] Total storage consumed (GB/TB)
- [ ] Document naming and filing conventions in use
- [ ] Version control practices
- [ ] Document retention and destruction policies
- [ ] Template library (number of templates, managed how)
- [ ] Document assembly tools in use (if any)

### 2.3 Billing and Accounting

- [ ] Billing software (same as practice management, or separate)
- [ ] Accounting software (QuickBooks, Xero, PCLaw, Tabs3, custom)
- [ ] Billing model (hourly, flat fee, contingency, hybrid)
- [ ] Trust accounting system and compliance status
- [ ] IOLTA account management
- [ ] Electronic payment processing (LawPay, Headnote, other)
- [ ] Billing rate structure

### 2.4 Communication and Collaboration

- [ ] Email platform (Microsoft 365, Google Workspace, on-premises Exchange)
- [ ] Email archiving and retention system
- [ ] Secure client communication portal (if any)
- [ ] Video conferencing platform (Zoom, Teams, Google Meet)
- [ ] Internal messaging (Slack, Teams, none)
- [ ] Client portal for document sharing (if any)
- [ ] Phone system (VoIP, traditional, provider)

### 2.5 Research and Legal AI

- [ ] Legal research platforms (Westlaw, LexisNexis, Fastcase, Casetext, vLex)
- [ ] Current AI tools in use (list all):
  - [ ] CoCounsel / Casetext
  - [ ] Harvey
  - [ ] Spellbook
  - [ ] ChatGPT / Claude (direct usage)
  - [ ] Other AI tools: _______________
- [ ] AI usage policy (formal, informal, none)
- [ ] Attorney comfort level with AI tools (survey results if available)
- [ ] Any AI-related ethics opinions reviewed or relied upon

---

## Section 3: Hardware and Infrastructure Assessment

### 3.1 Current Hardware Inventory

- [ ] Desktop/workstation inventory:
  - [ ] Number and models
  - [ ] Operating systems and versions
  - [ ] RAM per machine (OrchestratorAI minimum: 16GB per workstation)
  - [ ] Storage per machine
  - [ ] Age of machines (average and oldest)
- [ ] Laptop inventory (same details)
- [ ] Server inventory (if any on-premises servers):
  - [ ] Number and models
  - [ ] Operating systems
  - [ ] RAM and storage
  - [ ] Current workloads running on servers
  - [ ] Age and warranty status
- [ ] Printer and scanner inventory
- [ ] Mobile devices managed by the firm

### 3.2 OrchestratorAI Hardware Requirements Assessment

- [ ] Dedicated hardware available or to be procured for OrchestratorAI:
  - [ ] **Recommended Tier 1:** Apple Mac Studio with M-series chip, 64GB+ RAM
    - Ideal for firms with 1-15 attorneys
    - Runs full OrchestratorAI stack including local LLM inference
    - Silent, compact form factor suitable for office environment
  - [ ] **Recommended Tier 2:** NVIDIA DGX Spark
    - For firms wanting maximum local AI performance
    - Supports larger models and higher concurrent usage
    - Recommended for firms with 15+ attorneys or heavy AI workloads
  - [ ] **Minimum Viable:** Any machine with 64GB RAM, 8+ core CPU, 1TB SSD
    - Suitable for evaluation and light production use
- [ ] Physical location identified for deployment hardware:
  - [ ] Dedicated server room / closet
  - [ ] Under-desk placement (Mac Studio form factor)
  - [ ] Existing server rack space
- [ ] Power and cooling assessment for deployment location
- [ ] UPS / battery backup available

### 3.3 Network Infrastructure

- [ ] Internet service provider and bandwidth (download/upload speeds)
- [ ] Internal network topology (flat, segmented, VLAN)
- [ ] Network switch capacity and age
- [ ] Wi-Fi infrastructure (access points, coverage, security protocol)
- [ ] Firewall appliance (make, model, managed by whom)
- [ ] VPN solution in use (for remote access)
- [ ] DNS management (internal and external)
- [ ] Static IP addresses available
- [ ] Network monitoring tools in use

### 3.4 Network Security Evaluation

- [ ] Firewall configuration review (rules, logging, IDS/IPS)
- [ ] Network segmentation between staff, guest, and server networks
- [ ] Wireless security protocol (WPA3, WPA2-Enterprise, other)
- [ ] Remote access security (VPN, MFA, conditional access)
- [ ] Email security (SPF, DKIM, DMARC, anti-phishing)
- [ ] Endpoint protection (antivirus, EDR) — product and version
- [ ] Patch management process and cadence
- [ ] Last security assessment or penetration test (date and findings)
- [ ] Cyber insurance policy (carrier, limits, coverage scope)
- [ ] Security awareness training program for staff

---

## Section 4: Confidentiality and Ethics Requirements

### 4.1 Client Confidentiality Obligations

- [ ] Bar jurisdiction(s) and applicable Rules of Professional Conduct
- [ ] Firm's written confidentiality / information security policy
- [ ] Client data classification scheme (if any)
- [ ] Specific client matters with heightened confidentiality requirements
- [ ] Government clients with data handling mandates
- [ ] Corporate clients with vendor security requirements
- [ ] Protective orders or court orders affecting data handling
- [ ] Chinese wall / ethical screen procedures and tracking

### 4.2 AI Ethics and Competency

- [ ] Review of applicable bar ethics opinions on AI in legal practice:
  - [ ] ABA Formal Opinion 512 (Generative AI Tools)
  - [ ] State-specific AI ethics opinions (list applicable)
- [ ] Firm AI usage policy (existing or to be developed)
- [ ] Required attorney disclosures regarding AI usage
- [ ] AI output review and verification procedures
- [ ] Prohibited AI use cases identified by the firm
- [ ] Malpractice insurance notification requirements for AI tools
- [ ] Continuing legal education (CLE) plan for AI competency

### 4.3 Data Sovereignty and Residency

- [ ] **Critical for legal firms:** Does client data leave the firm's premises?
  - [ ] OrchestratorAI local deployment: All data stays on-premises
  - [ ] Sovereign mode: All AI inference runs locally (no cloud API calls)
  - [ ] Hybrid mode: Some cloud features with explicit data classification
- [ ] Client consent requirements for AI processing of their data
- [ ] Document any clients who have prohibited AI usage on their matters
- [ ] Regulatory requirements for data residency (state-specific, HIPAA, etc.)
- [ ] Data export and portability requirements

---

## Section 5: Operational Workflows

### 5.1 Current Client Intake Process

- [ ] How do new client inquiries arrive (phone, web form, email, walk-in, referral)?
- [ ] Who handles initial screening (receptionist, intake specialist, attorney)?
- [ ] Current conflict check process and tools
- [ ] Intake form(s) currently in use (collect copies)
- [ ] Average time from inquiry to engagement letter execution
- [ ] Engagement letter template(s) (collect copies)
- [ ] Retainer / fee agreement structure
- [ ] Declined matter tracking and referral process

### 5.2 Matter Management Workflows

- [ ] Matter opening checklist / procedure
- [ ] Task assignment and tracking process
- [ ] Deadline and calendar management (docketing system, if any)
- [ ] Status reporting to clients (frequency, method)
- [ ] Internal case review meetings (frequency, structure)
- [ ] Matter closing checklist / procedure
- [ ] File retention and destruction policy

### 5.3 Document Workflows

- [ ] Document creation workflow (drafting, review, approval, execution)
- [ ] Document intake from clients (method, filing process)
- [ ] Court filing workflows (electronic filing systems used)
- [ ] Discovery document handling (e-discovery tools, if any)
- [ ] Document search and retrieval frequency and pain points
- [ ] Most time-consuming document-related tasks (identify top 5)

### 5.4 AI Opportunity Assessment

- [ ] Which workflows would benefit most from AI assistance? (rank):
  - [ ] Legal research and case law analysis
  - [ ] Document drafting and review
  - [ ] Contract analysis and extraction
  - [ ] Client intake and conflict checking
  - [ ] Deposition and transcript analysis
  - [ ] Billing narrative generation
  - [ ] Case strategy and outcome prediction
  - [ ] Client communication drafting
  - [ ] Regulatory compliance monitoring
  - [ ] Knowledge management and institutional memory
- [ ] Estimated hours per week spent on tasks AI could assist with
- [ ] Staff members most likely to adopt AI tools first (champions)
- [ ] Staff members most resistant to AI adoption (concerns to address)

---

## Section 6: Compliance and Risk

### 6.1 Regulatory Compliance

- [ ] State bar registration status (all attorneys, all jurisdictions)
- [ ] Malpractice insurance carrier, limits, and policy period
- [ ] Trust account compliance (most recent audit date and findings)
- [ ] Client file retention requirements (by practice area and jurisdiction)
- [ ] HIPAA compliance (if handling healthcare-related matters)
- [ ] IRS compliance for tax practice (if applicable)
- [ ] Immigration-specific compliance (if applicable)

### 6.2 Insurance Coverage

- [ ] Professional liability / malpractice insurance:
  - [ ] Carrier name
  - [ ] Per-claim limit
  - [ ] Aggregate limit
  - [ ] Deductible / retention
  - [ ] Policy period
  - [ ] AI-specific coverage or exclusions
- [ ] Cyber liability insurance:
  - [ ] Carrier name
  - [ ] Coverage limits
  - [ ] Coverage scope (first-party and third-party)
  - [ ] Notification requirements for new technology deployments
- [ ] General liability insurance
- [ ] Workers' compensation

### 6.3 Disaster Recovery and Business Continuity

- [ ] Current backup strategy (what, where, how often)
- [ ] Backup testing frequency (last successful restore test)
- [ ] Business continuity plan (written? tested?)
- [ ] Recovery time objective (RTO) and recovery point objective (RPO)
- [ ] Alternate work location plan (remote work capability)
- [ ] Critical systems priority for recovery

---

## Section 7: Budget, Timeline, and Success Criteria

### 7.1 Budget

- [ ] Approved budget for OrchestratorAI platform deployment
- [ ] Hardware procurement budget (if separate)
- [ ] Monthly/annual subscription budget for platform
- [ ] Training budget for attorney and staff onboarding
- [ ] IT support budget (internal or outsourced)
- [ ] Budget approval authority (who signs off)

### 7.2 Timeline

- [ ] Desired deployment start date
- [ ] Target go-live date for first use case
- [ ] Firm calendar constraints (busy seasons, trial schedules, vacations)
- [ ] Technology committee meeting schedule (if decisions need committee approval)
- [ ] Partnership vote required for technology expenditures?

### 7.3 Success Criteria

- [ ] Define measurable success criteria:
  - [ ] Time saved per attorney per week (target hours)
  - [ ] Reduction in document review time (target percentage)
  - [ ] Improvement in research accuracy / comprehensiveness
  - [ ] Client satisfaction improvement (measurement method)
  - [ ] Revenue per attorney increase (target percentage)
  - [ ] New practice area enablement
  - [ ] Staff satisfaction with technology (baseline survey score)
- [ ] 30-day success checkpoint metrics
- [ ] 60-day success checkpoint metrics
- [ ] 90-day success checkpoint metrics
- [ ] 6-month review and expansion decision criteria

---

## Section 8: Required Documents Checklist

### Firm Documents
- [ ] Firm partnership/operating agreement (relevant sections)
- [ ] Organizational chart
- [ ] Firm technology policy
- [ ] Firm AI usage policy (if existing)
- [ ] Information security policy
- [ ] Client confidentiality policy
- [ ] Document retention policy
- [ ] Business continuity plan

### Insurance Documents
- [ ] Malpractice insurance declarations page
- [ ] Cyber liability insurance declarations page

### Technology Documents
- [ ] Network diagram or topology
- [ ] Hardware inventory list
- [ ] Software license inventory
- [ ] Current IT support contract (if outsourced)
- [ ] Last security assessment report (if available)

### Sample Workflow Documents
- [ ] Current intake form(s)
- [ ] Engagement letter template(s)
- [ ] Matter opening checklist
- [ ] 3-5 sample documents representing typical work product (redacted)

---

## Section 9: Intake Meeting Agenda

**Duration:** 120 minutes (legal firm intakes require extended discussion of ethics and confidentiality)

| Time | Topic | Lead |
|------|-------|------|
| 0:00 - 0:10 | Introductions and agenda review | Account Manager |
| 0:10 - 0:25 | Firm profile, practice areas, and client base | Account Manager |
| 0:25 - 0:45 | Current technology stack deep-dive | Platform Engineer |
| 0:45 - 1:00 | Hardware and network assessment | Platform Engineer |
| 1:00 - 1:20 | Confidentiality, ethics, and data sovereignty discussion | Legal Compliance Lead |
| 1:20 - 1:35 | Workflow analysis and AI opportunity assessment | Solutions Architect |
| 1:35 - 1:50 | Budget, timeline, and success criteria | Account Manager |
| 1:50 - 2:00 | Next steps and document collection timeline | Account Manager |

---

## Section 10: Key Considerations for Legal Firm Deployments

### Local-First Architecture Benefits
OrchestratorAI's architecture is uniquely positioned for legal firms because:
- The platform runs entirely on local hardware (Mac Studio or equivalent)
- Client data never traverses the public internet for AI processing
- Sovereign mode ensures all LLM inference happens on the firm's hardware
- The Supabase database runs locally on the deployment machine
- RAG knowledge bases containing case law, firm precedents, and client documents remain on-premises

### Common Deployment Patterns for Legal Firms
1. **Solo/Small Firm (1-5 attorneys):** Single Mac Studio, Compose agents for research and drafting
2. **Mid-Size Firm (6-15 attorneys):** Mac Studio with expanded storage, Compose + Forge agents, practice-area-specific RAG knowledge bases
3. **Larger Boutique (15-30 attorneys):** Dedicated server or DGX Spark, full platform deployment with Pulse automation for deadline monitoring and Forge for complex workflows

### Ethics Compliance Checklist (Pre-Deployment)
- [ ] Reviewed ABA Model Rules 1.1 (Competence), 1.6 (Confidentiality), 5.3 (Supervision)
- [ ] Reviewed applicable state ethics opinions on AI in legal practice
- [ ] Confirmed malpractice insurer has been notified of AI tool adoption
- [ ] Established AI output review requirements (no AI-generated content sent to clients or courts without attorney review)
- [ ] Created client notification/consent protocol for AI usage on their matters
- [ ] Established prohibited use cases (matters where AI must not be used)
- [ ] Designated AI compliance officer within the firm

---

*This checklist is proprietary to Orchestrator AI LLC. It is designed for use within the OrchestratorAI platform knowledge base and by authorized legal and consulting professionals.*
