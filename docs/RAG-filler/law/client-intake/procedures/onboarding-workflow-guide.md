# Post-Intake Onboarding Workflow Guide

**Document Type:** Client Onboarding Workflow — Post-Intake Through Go-Live
**Prepared By:** OrchestratorAI Practice Management Consulting
**Version:** 1.0
**Last Updated:** April 2026
**Applicable To:** All OrchestratorAI platform clients after engagement letter execution; onboarding teams, platform engineers, solutions architects, and account managers

---

## 1. Overview

### 1.1 Purpose

This guide governs the post-intake onboarding workflow for OrchestratorAI platform clients. It begins where the intake process ends (executed engagement letter, team assigned, file opened) and continues through hardware procurement, platform deployment, initial configuration, staff training, go-live, and the first 90 days of active usage.

A well-executed onboarding directly determines client success. Research consistently shows that clients who reach productive usage within the first 30 days are significantly more likely to expand their deployment and renew their engagement. Clients who struggle during onboarding — due to delays, technical issues, or poor training — are at high risk of disengagement.

### 1.2 Onboarding Phases

The onboarding workflow has six phases:

| Phase | Duration | Key Activities |
|-------|----------|---------------|
| **Phase 1: Kickoff** | Days 1-5 | Kickoff meeting, detailed planning, environment preparation |
| **Phase 2: Infrastructure** | Days 5-15 | Hardware procurement, network preparation, environment setup |
| **Phase 3: Deployment** | Days 15-25 | Platform installation, configuration, integration, testing |
| **Phase 4: Knowledge Base Setup** | Days 20-30 | RAG knowledge base creation, document ingestion, validation |
| **Phase 5: Training** | Days 25-35 | Staff training, workflow development, adoption support |
| **Phase 6: Go-Live** | Days 30-40 | Production transition, monitoring, stabilization |

Phases overlap intentionally. Knowledge base setup begins during deployment. Training begins before go-live. The total onboarding timeline is typically 30-40 business days, though complex deployments may extend to 60 business days.

### 1.3 Roles During Onboarding

| Role | Primary Responsibilities |
|------|------------------------|
| **Account Manager** | Client relationship, schedule coordination, escalation management, milestone tracking |
| **Solutions Architect** | Architecture design, configuration decisions, integration planning, technical leadership |
| **Platform Engineer** | Hardware setup, software installation, network configuration, deployment execution |
| **Training Specialist** | Training curriculum development, training delivery, adoption support, documentation |
| **Client IT Contact** | Network access, hardware placement, security approvals, internal coordination |
| **Client Champion** | Internal advocacy, staff communication, workflow identification, feedback collection |

---

## 2. Phase 1: Kickoff (Days 1-5)

### 2.1 Kickoff Meeting

The kickoff meeting is the formal start of onboarding. It sets the tone for the entire engagement. Schedule within 5 business days of engagement execution.

**Duration:** 90-120 minutes
**Attendees:** Full OrchestratorAI onboarding team + Client champion, IT contact, and any additional stakeholders

**Agenda:**

| Time | Topic | Lead | Deliverable |
|------|-------|------|-------------|
| 0:00 - 0:15 | Team introductions and relationship mapping | Account Manager | Contact sheet |
| 0:15 - 0:30 | Engagement scope and success criteria review | Account Manager | Confirmed success metrics |
| 0:30 - 0:50 | Technical architecture walkthrough | Solutions Architect | Architecture decision record |
| 0:50 - 1:05 | Infrastructure and hardware plan | Platform Engineer | Hardware and network checklist |
| 1:05 - 1:20 | Knowledge base and content plan | Solutions Architect | Document collection plan |
| 1:20 - 1:35 | Training approach and schedule | Training Specialist | Training calendar |
| 1:35 - 1:50 | Detailed timeline with milestones | Account Manager | Onboarding project plan |
| 1:50 - 2:00 | Communication cadence and escalation process | Account Manager | Communication plan |

### 2.2 Architecture Decision Record

During the kickoff meeting, the Solutions Architect works with the client to finalize key architecture decisions:

**Deployment Model:**
- [ ] On-premises (all components on client hardware)
- [ ] Cloud (Azure or GCP deployment)
- [ ] Hybrid (local deployment with cloud features)

**Hardware Tier:**
- [ ] **Mac Studio** (Apple M-series, 64GB+ RAM)
  - Ideal for: firms with 1-20 users
  - Footprint: compact, silent, office-friendly
  - Performance: runs full OrchestratorAI stack including local LLM inference
  - Cost: approximately $3,000-$6,000 depending on configuration
- [ ] **NVIDIA DGX Spark**
  - Ideal for: firms with 20+ users or heavy AI workloads
  - Footprint: desktop form factor, requires adequate ventilation
  - Performance: dedicated GPU for maximum AI throughput
  - Cost: approximately $10,000-$15,000
- [ ] **Custom Server**
  - Ideal for: firms with existing data center infrastructure
  - Requirements: 64GB+ RAM, 8+ core CPU, 1TB+ NVMe SSD, Ubuntu 22.04 or macOS
  - Performance: varies by specification

**AI Configuration:**
- [ ] Sovereign mode (all LLM inference local, no cloud API calls)
  - Requires: sufficient hardware for local model hosting
  - Models: Ollama-hosted models (Llama, Mistral, CodeLlama, etc.)
  - Trade-off: limited to models that run locally
- [ ] Cloud API mode (OpenAI, Anthropic, Azure OpenAI, Google Vertex AI)
  - Requires: API keys and network access
  - Models: full range of commercial LLMs
  - Trade-off: data leaves the premises for AI processing
- [ ] Hybrid mode (local for sensitive data, cloud for general workloads)
  - Most flexible option
  - Per-agent configuration of model provider
  - Recommended for most deployments

**Products to Deploy:**
- [ ] **Compose** (simple composable agents: context, RAG, API, external, media)
  - Use cases: research, drafting, analysis, Q&A over documents
- [ ] **Forge** (complex multi-step LangGraph workflows)
  - Use cases: due diligence, contract review, multi-document analysis
- [ ] **Pulse** (internal event-driven automation)
  - Use cases: deadline monitoring, compliance alerts, automated reporting
- [ ] **Bridge/Gatekeeper** (external agent communication)
  - Use cases: inter-firm communication, external data source integration
- [ ] **Divinr.ai integration** (market prediction)
  - Use cases: financial analysis, market trend prediction, investment research

**Database Configuration:**
- [ ] Local Supabase instance (default for on-premises deployment)
  - REST API port: 6010
  - PostgreSQL port: 6011
  - Runs on the deployment hardware
- [ ] Cloud-hosted database (for cloud deployments)

### 2.3 Onboarding Project Plan

The Account Manager creates a detailed project plan with the following structure:

```
Week 1: Kickoff and Planning
  - Day 1-2: Kickoff meeting
  - Day 3-5: Architecture finalization, hardware order, network planning

Week 2: Infrastructure Setup
  - Day 6-8: Hardware procurement and delivery
  - Day 9-10: Hardware setup and network configuration

Week 3: Platform Deployment
  - Day 11-13: Base platform installation and configuration
  - Day 14-15: Integration setup and initial testing

Week 4: Knowledge Base and Configuration
  - Day 16-18: RAG knowledge base creation and document ingestion
  - Day 19-20: Agent configuration and workflow setup

Week 5: Training
  - Day 21-22: Administrator training
  - Day 23-24: Power user training
  - Day 25: General staff training

Week 6: Go-Live
  - Day 26-27: Production readiness review
  - Day 28: Go-live
  - Day 29-30: Post-go-live support and stabilization
```

Adjust timelines based on client-specific factors (hardware availability, schedule constraints, complexity of deployment).

### 2.4 Communication Cadence

Establish regular communication during onboarding:

| Communication | Frequency | Format | Participants |
|--------------|-----------|--------|-------------|
| Status update email | Weekly | Email | Account Manager to Client Champion |
| Progress meeting | Bi-weekly | Video call (30 min) | Onboarding team + Client contacts |
| Technical working session | As needed | Video call or on-site | Platform Engineer + Client IT |
| Escalation call | As needed | Phone/video | Account Manager + Engagement Partner |
| Milestone review | At each phase completion | Email + meeting | Full team |

---

## 3. Phase 2: Infrastructure (Days 5-15)

### 3.1 Hardware Procurement Assistance

If the client needs to procure hardware, OrchestratorAI assists with:

**Mac Studio Configuration Recommendations:**

| Client Size | Configuration | Estimated Cost |
|------------|---------------|----------------|
| 1-5 users | Mac Studio M4, 64GB RAM, 1TB SSD | ~$3,000 |
| 5-15 users | Mac Studio M4 Max, 96GB RAM, 2TB SSD | ~$4,500 |
| 15-25 users | Mac Studio M4 Ultra, 192GB RAM, 4TB SSD | ~$6,000+ |

**NVIDIA DGX Spark Configuration:**
- Standard configuration for 20+ users
- Dedicated AI inference capability
- Contact NVIDIA or authorized reseller
- Estimated cost: $10,000-$15,000
- Lead time: 2-4 weeks

**Procurement Process:**
1. Solutions Architect provides hardware specification document
2. Client places order through their preferred vendor (Apple, NVIDIA, CDW, etc.)
3. OrchestratorAI can recommend vendors if client has no preference
4. Platform Engineer verifies hardware specifications upon delivery
5. Client retains ownership of all hardware

### 3.2 Network Preparation

**Pre-Deployment Network Checklist:**

- [ ] **Dedicated network connection** for OrchestratorAI hardware:
  - Wired Ethernet connection (1Gbps minimum)
  - Static IP address assigned (recommended for stability)
  - DHCP reservation acceptable if static not available

- [ ] **Firewall rules** configured:
  - Allow outbound HTTPS (443) for cloud API calls (if not sovereign mode)
  - Allow outbound for package updates (npm, Docker, system updates)
  - Allow inbound on deployment ports from internal network only:
    - Auth API: 6100
    - Forge API: 6200, Web: 6201
    - Compose API: 6300, Web: 6301
    - Pulse API: 6500, Web: 6501
    - Bridge API: 6600, Web: 6601
    - Supabase REST: 6010, PostgreSQL: 6011
  - Block all inbound from external networks (unless remote access configured)

- [ ] **DNS configuration** (optional but recommended):
  - Internal DNS entry for the deployment machine (e.g., `orchestratorai.internal.firm.com`)
  - Simplifies user access and avoids IP address changes

- [ ] **VPN / Remote Access** (if staff work remotely):
  - Tailscale mesh network (recommended — zero-config, secure)
  - Traditional VPN (if firm has existing VPN infrastructure)
  - Ensure remote users can reach deployment ports through the VPN

- [ ] **SSL/TLS certificates** (for production use):
  - Self-signed certificates for internal-only access
  - Let's Encrypt or commercial certificate for DNS-named access
  - Wildcard certificate if multiple subdomains needed

### 3.3 Environment Preparation

Before the Platform Engineer begins deployment:

**Client IT Responsibilities:**
- [ ] Hardware unboxed and powered on
- [ ] Network connection established and tested
- [ ] IP address confirmed and documented
- [ ] Firewall rules applied
- [ ] Remote access credentials provided to Platform Engineer (temporary, scoped)
- [ ] Admin user account created on the machine for OrchestratorAI
- [ ] Physical security confirmed (hardware in a secure location)

**Platform Engineer Verification:**
- [ ] SSH or remote access confirmed
- [ ] Operating system version verified (macOS 14+ or Ubuntu 22.04+)
- [ ] Available RAM confirmed (64GB+ minimum)
- [ ] Available storage confirmed (500GB+ minimum free)
- [ ] Network connectivity verified (internal and external as needed)
- [ ] DNS resolution verified
- [ ] Time synchronization verified (NTP configured)

---

## 4. Phase 3: Deployment (Days 15-25)

### 4.1 Base Platform Installation

The Platform Engineer performs the deployment following the standard installation procedure. This section provides the workflow overview; detailed technical steps are in the platform engineering runbook.

**Step 1: Prerequisites Installation**
- [ ] Node.js v20+ (via nvm)
- [ ] Docker and Docker Compose
- [ ] Git
- [ ] Supabase CLI
- [ ] pnpm or npm

**Step 2: Repository Setup**
- [ ] Clone OrchestratorAI enterprise repository
- [ ] Configure environment variables (.env)
- [ ] Install dependencies (`npm install`)

**Step 3: Database Initialization**
- [ ] Start local Supabase instance
- [ ] Verify Supabase is running (REST API on 6010, PostgreSQL on 6011)
- [ ] Run database migrations
- [ ] Seed initial data (organization, admin user)

**Step 4: Product Deployment**
- [ ] Start selected products based on architecture decision:
  - Auth API (always required): port 6100
  - Selected product APIs and web interfaces
- [ ] Verify each product starts without errors
- [ ] Run health checks on all deployed products

**Step 5: Initial Configuration**
- [ ] Create the client's organization in the system
- [ ] Create admin user accounts
- [ ] Configure authentication (local auth, SSO integration if applicable)
- [ ] Set up user roles and permissions
- [ ] Configure LLM providers (API keys for cloud providers, or Ollama for sovereign mode)

### 4.2 Integration Setup

Based on the client's requirements:

**LLM Provider Configuration:**
- [ ] Cloud providers: enter API keys for OpenAI, Anthropic, Azure OpenAI, or Google Vertex AI
- [ ] Sovereign mode: install and configure Ollama with selected models
- [ ] Test each configured provider with a simple prompt
- [ ] Verify cost tracking is operational

**External Integrations:**
- [ ] Email integration (if using Pulse for email monitoring)
- [ ] Calendar integration (if using Pulse for scheduling)
- [ ] Document management integration (if connecting to existing DMS)
- [ ] CRM integration (if connecting to client's CRM)
- [ ] Custom API integrations (per engagement scope)

**Security Configuration:**
- [ ] JWT token configuration
- [ ] Session timeout settings
- [ ] Password policy configuration
- [ ] MFA setup (if required)
- [ ] IP allowlist (if restricted access required)
- [ ] Audit logging enabled and verified

### 4.3 Deployment Testing

Before proceeding to knowledge base setup:

**Functional Testing:**
- [ ] Login and authentication works for all user accounts
- [ ] Each deployed product loads correctly in the browser
- [ ] Basic agent interaction works (send a message, receive a response)
- [ ] File upload works (for document processing)
- [ ] All configured LLM providers respond correctly
- [ ] Database read and write operations succeed
- [ ] Search functionality works

**Performance Testing:**
- [ ] Response time for simple queries is under 3 seconds
- [ ] Response time for complex queries is under 15 seconds
- [ ] Multiple concurrent users do not degrade performance (test with expected user count)
- [ ] Large document upload and processing completes without timeout

**Security Testing:**
- [ ] Unauthenticated access is blocked
- [ ] Users can only access authorized resources
- [ ] Audit logs capture user actions
- [ ] Data isolation between users/departments works correctly

**Backup Testing:**
- [ ] Database backup procedure works
- [ ] Database restore procedure works
- [ ] Document the backup schedule and retention policy

---

## 5. Phase 4: Knowledge Base Setup (Days 20-30)

### 5.1 Knowledge Base Architecture

RAG (Retrieval-Augmented Generation) knowledge bases are the foundation of productive AI usage. They allow the platform to answer questions and generate content based on the client's own documents, policies, and institutional knowledge.

**Knowledge Base Design Principles:**
- One knowledge base per subject area or document collection
- Separate knowledge bases for different confidentiality levels
- For agencies and multi-client firms: one knowledge base per client
- For legal firms: separate knowledge bases by practice area and/or client matter
- For financial firms: separate knowledge bases by compliance area and investment strategy

**Common Knowledge Base Architecture by Vertical:**

| Vertical | Knowledge Bases | Content |
|----------|----------------|---------|
| Legal Firm | Firm policies, Practice area law, Client matters (per client), Templates | Firm handbook, bar opinions, case law, client documents, form library |
| Financial Firm | Compliance, Investment research, Client portfolios, Market data | Regulatory guidance, research reports, portfolio docs, market analysis |
| Marketing Agency | Per-client brand, Industry research, Best practices, Templates | Brand guidelines, competitive research, campaign playbooks, templates |
| Technology Company | Product docs, Engineering wiki, Customer support, Sales enablement | Technical docs, architecture decisions, support tickets, sales materials |
| General Business | Company policies, Product/service info, Customer data, Operations | Employee handbook, product specs, CRM data, operational procedures |

### 5.2 Document Collection and Preparation

**Document Collection Process:**

1. **Solutions Architect creates a document collection plan** during kickoff that specifies:
   - Which knowledge bases will be created
   - What documents are needed for each knowledge base
   - Who at the client is responsible for providing each document set
   - Deadline for document delivery
   - Acceptable file formats

2. **Client provides documents** via secure transfer:
   - Secure file sharing link (provided during onboarding)
   - Encrypted email (for sensitive documents)
   - Direct upload to the platform (once deployed)
   - Physical media transfer (USB drive for highly sensitive content)

3. **Document preparation:**
   - Convert documents to supported formats (PDF, DOCX, TXT, MD, HTML)
   - Remove duplicate documents
   - Verify document quality (OCR quality for scanned documents)
   - Classify documents by knowledge base
   - Create a document inventory with metadata

**Supported Document Types:**
- PDF (text-based and OCR-processed scanned)
- Microsoft Word (DOCX)
- Plain text (TXT)
- Markdown (MD)
- HTML
- CSV (for structured data)
- JSON (for structured data)

### 5.3 Document Ingestion

For each knowledge base:

1. **Create the knowledge base** in the OrchestratorAI platform
   - Name and description
   - Access permissions (who can query this knowledge base)
   - Embedding model selection

2. **Ingest documents:**
   - Upload documents to the knowledge base
   - Platform processes documents: chunking, embedding, and storage
   - Monitor ingestion progress and handle any errors

3. **Validate the knowledge base:**
   - Test with 10-15 representative questions that the documents should answer
   - Verify that retrieved context is relevant and accurate
   - Verify that answers correctly cite source documents
   - Adjust chunking strategy if results are poor
   - Document any gaps (questions the knowledge base cannot answer)

4. **Iterate:**
   - Add missing documents identified during validation
   - Re-test after additions
   - Repeat until knowledge base meets quality standards

### 5.4 Agent Configuration

With knowledge bases in place, configure agents for the client's workflows:

**Compose Agents:**
- Configure one agent per primary use case
- Attach appropriate knowledge bases to each agent
- Set system prompts that define the agent's role, tone, and constraints
- Configure model provider and model selection
- Test each agent with representative queries

**Forge Workflows (if deployed):**
- Configure multi-step workflows for complex processes
- Define input, processing steps, and output format
- Test with sample data end-to-end
- Verify human-in-the-loop checkpoints work correctly

**Pulse Automation (if deployed):**
- Configure event listeners for automated triggers
- Set up notification channels (email, in-app, webhook)
- Define automation rules and thresholds
- Test each automation with simulated events

---

## 6. Phase 5: Training (Days 25-35)

### 6.1 Training Approach

Training is delivered in three tiers, each building on the previous:

**Tier 1: Administrator Training (4-6 hours)**
- Audience: IT administrator, firm administrator, designated platform admin
- Topics:
  - Platform architecture overview
  - User management (create, modify, deactivate accounts)
  - Role and permission management
  - Knowledge base administration (add, update, remove documents)
  - Agent configuration and management
  - System monitoring and health checks
  - Backup and recovery procedures
  - Troubleshooting common issues
  - Security settings and audit log review
  - Updating the platform
- Format: In-person or video call, hands-on exercises
- Deliverable: Administrator reference guide

**Tier 2: Power User Training (3-4 hours)**
- Audience: Staff members who will use the platform daily and configure workflows
- Topics:
  - Platform navigation and user interface
  - Working with Compose agents (querying, document upload, conversation management)
  - Working with Forge workflows (initiating workflows, reviewing results, providing feedback)
  - Effective prompting techniques
  - Understanding AI output (when to trust, when to verify)
  - Knowledge base querying best practices
  - Creating and managing conversations
  - Exporting and sharing results
  - Industry-specific use cases and demonstrations
- Format: In-person or video call, hands-on exercises with real work scenarios
- Deliverable: Power user guide

**Tier 3: General Staff Training (1-2 hours)**
- Audience: All staff members who will interact with the platform
- Topics:
  - What is OrchestratorAI and why are we using it
  - How to log in and navigate
  - Basic agent interaction (ask a question, get an answer)
  - Understanding AI limitations and the importance of human review
  - When to use AI and when not to
  - Getting help (who to ask, how to report issues)
  - Company AI usage policy review
- Format: Group session (in-person or video call), minimal hands-on
- Deliverable: Quick-start guide (1-2 pages)

### 6.2 Training Schedule Template

| Day | Session | Duration | Audience | Trainer |
|-----|---------|----------|----------|---------|
| Day 25 | Admin Training - Part 1 | 3 hours | IT admin, firm admin | Training Specialist |
| Day 26 | Admin Training - Part 2 | 3 hours | IT admin, firm admin | Training Specialist |
| Day 27 | Power User Training - Session 1 | 2 hours | Designated power users | Training Specialist |
| Day 28 | Power User Training - Session 2 | 2 hours | Designated power users | Training Specialist |
| Day 29 | General Staff Training - Session 1 | 1.5 hours | Staff group 1 | Training Specialist |
| Day 30 | General Staff Training - Session 2 | 1.5 hours | Staff group 2 | Training Specialist |
| Day 31+ | Office hours / Q&A | 1 hour/day | Anyone | Training Specialist |

Adjust for client schedule. Multiple general staff sessions may be needed for larger organizations. Remote staff may require separate sessions.

### 6.3 Training Materials

For each training tier, prepare and deliver:
- Slide deck with screenshots and step-by-step instructions
- Hands-on exercise workbook with real-world scenarios
- Quick reference card (laminated single page for desk reference)
- Video recordings of training sessions (for absent staff and future hires)
- FAQ document addressing common questions and concerns
- AI usage policy acknowledgment form (for staff signature)

### 6.4 Adoption Support

Training alone does not ensure adoption. The following support mechanisms extend beyond formal training:

**Week 1 Post-Training (Days 31-35):**
- Training Specialist available for daily 1-hour "office hours" (in-person or video)
- Slack/Teams channel for real-time questions (if client uses these tools)
- Account Manager checks in with Client Champion daily

**Weeks 2-4 Post-Training (Days 36-50):**
- Office hours reduced to 3x per week, then 2x per week
- Weekly tips and best practices email
- Account Manager checks in with Client Champion weekly

**Month 2 (Days 51-80):**
- Office hours reduced to 1x per week
- Monthly tips email
- Account Manager checks in bi-weekly

---

## 7. Phase 6: Go-Live (Days 30-40)

### 7.1 Go-Live Readiness Review

Before declaring go-live, complete the production readiness checklist:

**Technical Readiness:**
- [ ] All deployed products are running and healthy
- [ ] All configured LLM providers are responding correctly
- [ ] All knowledge bases are loaded and validated
- [ ] All agents are configured and tested
- [ ] Backup procedures are in place and tested
- [ ] Monitoring is operational (health checks, error logging)
- [ ] SSL/TLS certificates are installed (if applicable)
- [ ] Performance meets acceptable thresholds under expected load

**User Readiness:**
- [ ] All user accounts are created and tested
- [ ] Roles and permissions are correctly configured
- [ ] Administrator training is complete
- [ ] Power user training is complete
- [ ] General staff training is complete (or scheduled within 5 days of go-live)
- [ ] AI usage policy is signed by all staff
- [ ] Quick reference materials are distributed

**Process Readiness:**
- [ ] Workflows are documented for primary use cases
- [ ] Escalation procedures are defined (who to call when something breaks)
- [ ] Feedback collection mechanism is in place
- [ ] Support channel is established and tested

**Client Sign-Off:**
- [ ] Client Champion confirms readiness
- [ ] Client IT confirms technical readiness
- [ ] Client leadership approves go-live

### 7.2 Go-Live Day

**Go-live is not an event. It is a transition.** The platform has been running during testing and training. Go-live simply means staff begin using it for real work.

**Go-Live Day Checklist:**
- [ ] Platform Engineer verifies all systems are healthy (morning of go-live)
- [ ] Account Manager sends "go-live" announcement to client staff
- [ ] Training Specialist is available on-site or on-call for the full day
- [ ] Platform Engineer monitors system health throughout the day
- [ ] Account Manager and Client Champion check in at midday and end of day
- [ ] Any issues are logged, prioritized, and addressed immediately or scheduled

**Go-Live Announcement Template:**
> Subject: OrchestratorAI Is Live — Getting Started
>
> [Company Name] Team,
>
> I'm pleased to announce that OrchestratorAI is now live and ready for your use.
>
> How to access: [URL/instructions]
> Your login: [credentials or how to retrieve them]
> Quick start guide: [attached or linked]
>
> For questions or help today:
> - [Training Specialist name] is available at [contact info]
> - Your internal champion [Client Champion name] can help with workflow questions
>
> Remember: AI is a powerful tool, but always review AI-generated content before using it in your work. If something looks wrong, trust your professional judgment.
>
> Welcome to the future of work.

### 7.3 Post-Go-Live Stabilization (Days 31-40)

The first 10 business days after go-live are the stabilization period. During this time:

**Platform Engineer:**
- Monitors system health daily
- Addresses any technical issues within 4 business hours
- Optimizes performance based on real usage patterns
- Adjusts resource allocation if needed

**Training Specialist:**
- Conducts daily office hours
- Collects user feedback and common questions
- Creates additional documentation for frequently asked questions
- Identifies users who are struggling and provides targeted support

**Account Manager:**
- Daily check-in with Client Champion
- Weekly status report to client leadership
- Tracks adoption metrics (number of active users, queries per day, agent usage)
- Escalates any issues that could threaten adoption

---

## 8. Success Milestones: 30/60/90 Days

### 8.1 30-Day Success Review

**When:** 30 calendar days after go-live
**Format:** 60-minute meeting with client leadership and OrchestratorAI onboarding team
**Purpose:** Assess initial adoption, address issues, and confirm value delivery

**30-Day Metrics to Review:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users (logged in at least once in past 7 days) | 70% of licensed users | Platform analytics |
| Average queries per user per day | 3+ | Platform analytics |
| Knowledge base utilization (queries hitting RAG) | 50%+ of total queries | Platform analytics |
| User satisfaction score | 3.5+ / 5 | Survey (distributed at Day 25) |
| Issues reported | Declining week-over-week | Issue tracker |
| Issues resolved | 90%+ within SLA | Issue tracker |
| Time saved per user per week (self-reported) | 2+ hours | Survey |

**30-Day Review Agenda:**

1. Metrics review and analysis
2. User feedback summary (positive highlights and concerns)
3. Technical stability report
4. Knowledge base quality assessment
5. Adoption barriers identified and mitigation plan
6. Additional training needs
7. Scope adjustment (if needed)
8. 60-day goals setting

**30-Day Remediation (if targets not met):**
- Below 50% active users: schedule additional training sessions, identify and address specific barriers, engage reluctant users directly
- Below 3 queries/user/day: review configured agents for relevance, adjust system prompts, create more relevant knowledge bases
- User satisfaction below 3.0: conduct user interviews to understand dissatisfaction, prioritize fixes based on feedback
- Technical issues persistent: escalate to Solutions Architect for architecture review

### 8.2 60-Day Success Review

**When:** 60 calendar days after go-live
**Format:** 45-minute meeting with client leadership
**Purpose:** Assess sustained adoption, measure productivity impact, plan expansion

**60-Day Metrics to Review:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users | 80%+ of licensed users | Platform analytics |
| Average queries per user per day | 5+ | Platform analytics |
| User satisfaction score | 4.0+ / 5 | Survey (distributed at Day 55) |
| Time saved per user per week | 3+ hours | Survey |
| Knowledge base updates (new documents added) | At least 1 update in past 30 days | Platform analytics |
| New use cases identified by users | 2+ | Feedback collection |
| Support ticket volume | Decreasing trend | Issue tracker |

**60-Day Focus Areas:**
- Transition from onboarding support to steady-state support
- Identify power users who can become internal trainers
- Evaluate opportunities for additional knowledge bases
- Discuss expansion to additional products or departments
- Begin ROI documentation for client leadership

### 8.3 90-Day Success Review

**When:** 90 calendar days after go-live
**Format:** 60-minute strategic review with client leadership and OrchestratorAI account team
**Purpose:** Comprehensive value assessment, expansion planning, relationship evolution

**90-Day Metrics to Review:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Active users | 85%+ of licensed users | Platform analytics |
| Average queries per user per day | 5+ (sustained) | Platform analytics |
| User satisfaction score | 4.0+ / 5 | Survey |
| Time saved per user per week | 4+ hours | Survey |
| Documented ROI | Positive (savings > cost) | Financial analysis |
| Internal champions identified | 3+ power users | Client Champion feedback |
| New departments or use cases ready for expansion | 1+ | Discussion |

**90-Day Review Agenda:**

1. Comprehensive metrics review (30/60/90 trend analysis)
2. ROI analysis and documentation
3. User success stories and testimonials
4. Remaining adoption challenges
5. Knowledge base health and expansion needs
6. Product expansion discussion:
   - Additional Compose agents for new workflows
   - Forge workflows for complex processes
   - Pulse automation for repetitive tasks
   - Bridge/Gatekeeper for external connections
   - Divinr.ai for predictive capabilities
7. Training refresh needs (new hires, advanced topics)
8. Contract review and renewal discussion
9. Referral opportunity discussion

**90-Day Outcomes:**
- **Expanding:** Client is seeing value and wants more products, users, or knowledge bases. Transition to expansion planning.
- **Stable:** Client is satisfied and using the platform productively. Transition to steady-state support and periodic reviews.
- **At Risk:** Adoption or satisfaction below targets. Develop remediation plan with specific actions, owners, and timeline.
- **Disengaging:** Client has lost interest or is experiencing significant issues. Escalate to Engagement Partner for strategic intervention.

---

## 9. Ongoing Support Transition

### 9.1 Steady-State Support Model

After the 90-day review, onboarding transitions to steady-state support:

| Support Area | Provider | Frequency |
|-------------|----------|-----------|
| Account management | Account Manager | Quarterly business reviews, monthly check-in |
| Technical support | Support team | Ticket-based, SLA-driven |
| Platform updates | Platform Engineering | As released (monthly/quarterly) |
| Knowledge base maintenance | Client admin (with support) | As needed |
| Training (new hires) | Client admin or Training Specialist | As needed |
| Strategic review | Engagement Partner + Account Manager | Semi-annual or annual |

### 9.2 Client Self-Service Capabilities

By the end of onboarding, the client's administrator should be capable of:
- Creating and managing user accounts
- Adding and removing documents from knowledge bases
- Basic agent configuration changes
- Reviewing audit logs
- Running database backups
- First-level troubleshooting (restart services, check logs)
- Contacting support for issues beyond their capability

### 9.3 Expansion Triggers

Monitor for these signals that a client is ready for expansion:
- Power users asking for capabilities beyond current deployment
- New departments expressing interest in the platform
- Client acquiring new business lines or clients
- Regulatory changes creating new compliance needs
- Client's business growing (new hires, new offices)
- Client requesting API integration for custom applications
- Client asking about Divinr.ai prediction capabilities

---

## 10. Appendices

### Appendix A: Onboarding Checklist Summary

**Phase 1: Kickoff**
- [ ] Kickoff meeting conducted
- [ ] Architecture decision record finalized
- [ ] Onboarding project plan created and approved
- [ ] Communication cadence established
- [ ] Hardware ordered (if needed)

**Phase 2: Infrastructure**
- [ ] Hardware delivered and set up
- [ ] Network configured and tested
- [ ] Environment prepared and verified
- [ ] Remote access established for Platform Engineer

**Phase 3: Deployment**
- [ ] Base platform installed
- [ ] Products deployed and configured
- [ ] Integrations set up
- [ ] User accounts created
- [ ] Security configured
- [ ] Deployment testing passed

**Phase 4: Knowledge Base**
- [ ] Documents collected from client
- [ ] Knowledge bases created
- [ ] Documents ingested
- [ ] Knowledge bases validated
- [ ] Agents configured with knowledge bases

**Phase 5: Training**
- [ ] Administrator training complete
- [ ] Power user training complete
- [ ] General staff training complete
- [ ] Training materials distributed
- [ ] AI usage policy signed by all staff

**Phase 6: Go-Live**
- [ ] Production readiness review passed
- [ ] Client sign-off obtained
- [ ] Go-live announcement sent
- [ ] Post-go-live stabilization completed
- [ ] 30-day review scheduled

### Appendix B: Common Onboarding Issues and Resolutions

| Issue | Cause | Resolution |
|-------|-------|-----------|
| Platform slow after deployment | Insufficient RAM or too many concurrent services | Verify hardware meets specs, reduce deployed products, optimize configuration |
| LLM responses are poor quality | Wrong model selected, or system prompts need tuning | Adjust model selection (larger models for complex tasks), refine system prompts |
| Knowledge base returns irrelevant results | Poor document chunking, or documents do not contain relevant information | Adjust chunking parameters, add more relevant documents, improve document quality |
| Users not adopting the platform | Insufficient training, AI anxiety, or platform not solving real problems | Additional targeted training, address specific concerns, reconfigure for real workflows |
| Network connectivity issues | Firewall blocking required ports, DNS misconfiguration | Review firewall rules per Section 3.2, verify DNS resolution |
| Authentication failures | JWT misconfiguration, expired tokens, SSO integration issues | Review auth configuration, check token expiration settings, verify SSO provider |
| Database errors | Supabase not running, migration failures, connection issues | Verify Supabase status on ports 6010/6011, re-run migrations, check connection string |

### Appendix C: Hardware Placement Guide

**Mac Studio Placement:**
- Can be placed under a desk, on a shelf, or in a small server closet
- Requires: power outlet, Ethernet connection
- Dimensions: 7.7" x 7.7" x 3.7" (very compact)
- Noise level: very quiet (suitable for office environment)
- Temperature: operates in normal office temperature range (50-95F)
- No special cooling required

**NVIDIA DGX Spark Placement:**
- Desktop or rack-mountable form factor
- Requires: power outlet (higher wattage), Ethernet connection, adequate ventilation
- Generates more heat than Mac Studio — ensure space for airflow
- Noise level: audible fan noise (better suited for server closet than desktop)
- Recommended: dedicated shelf or rack position with unobstructed airflow

**Security Considerations:**
- Hardware should be in a physically secure location (locked room or closet)
- UPS (uninterruptible power supply) recommended for both options
- Label hardware clearly ("OrchestratorAI Platform - Do Not Disconnect")
- Document location, serial numbers, and configuration details

---

*This onboarding workflow guide is proprietary to Orchestrator AI LLC. It is designed for use within the OrchestratorAI platform knowledge base and by authorized onboarding and delivery professionals. Review and update this guide quarterly based on onboarding feedback and evolving platform capabilities.*
