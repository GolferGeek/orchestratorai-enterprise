# Business Continuity and Disaster Recovery Plan

**Policy Number:** OAI-OPS-003
**Effective Date:** January 1, 2026
**Last Revised:** April 1, 2026
**Policy Owner:** Chief Technology Officer / Managing Member
**Approved By:** Managing Member, Orchestrator AI LLC

---

## 1. Purpose

This Business Continuity and Disaster Recovery Plan ("BCP/DR Plan") establishes the procedures, responsibilities, and resources necessary to ensure the continued operation of Orchestrator AI LLC ("the Company") in the event of a disruption, disaster, or emergency. The Company's clients — boutique legal firms, marketing agencies, financial firms, and development teams — depend on the availability and integrity of the OrchestratorAI platform, Divinr.ai, and associated services. This plan ensures that client services can be maintained or rapidly restored, client data is protected, and business operations can continue under adverse conditions.

Given the Company's infrastructure model of local deployment on dedicated hardware (Apple Mac Studio for OrchestratorAI Enterprise, NVIDIA DGX Spark for Divinr.ai), this plan addresses hardware-specific scenarios that differ from traditional cloud-only disaster recovery approaches.

---

## 2. Scope

This plan covers:

- **Critical systems:** OrchestratorAI platform (all microservices), Divinr.ai, Supabase databases, network infrastructure, authentication services.
- **Hardware assets:** Apple Mac Studio (Enterprise), NVIDIA DGX Spark (Divinr.ai), networking equipment, UPS systems.
- **Software and data:** Application code, database contents, configuration files, API keys, client data, backup archives.
- **Personnel:** Managing Member, all contractors and interns involved in platform operations.
- **Facilities:** Home office (primary operations center), remote work locations.

---

## 3. Definitions

**Recovery Time Objective (RTO):** The maximum acceptable duration of time within which a business process or system must be restored after a disruption.

**Recovery Point Objective (RPO):** The maximum acceptable amount of data loss measured in time. For example, an RPO of one hour means no more than one hour of data may be lost.

**Maximum Tolerable Downtime (MTD):** The longest period the business can survive without a particular function or system before suffering irreversible harm.

**Business Impact Analysis (BIA):** The process of identifying critical business functions and the potential impact of disruptions to those functions.

**Hot Standby:** A backup system that is running and synchronized in near-real-time, capable of assuming production workloads with minimal switchover time.

**Warm Standby:** A backup system that is operational but not actively processing production workloads, requiring configuration and data synchronization before assuming production duties.

---

## 4. Business Impact Analysis

### 4.1 Critical Systems and Recovery Objectives

| System | RTO | RPO | MTD | Priority |
|--------|-----|-----|-----|----------|
| Auth Service (port 6100/7100) | 1 hour | 15 minutes | 4 hours | P1 — Critical |
| Supabase Database (port 6010-6011/7010-7011) | 2 hours | 1 hour | 8 hours | P1 — Critical |
| Forge API & Web (ports 6200-6201/7200-7201) | 4 hours | 1 hour | 24 hours | P2 — High |
| Compose API & Web (ports 6300-6301/7300-7301) | 4 hours | 1 hour | 24 hours | P2 — High |
| Divinr.ai (DGX Spark) | 8 hours | 4 hours | 48 hours | P2 — High |
| Bridge/Gatekeeper (ports 6600-6601/7600-7601) | 4 hours | 1 hour | 24 hours | P2 — High |
| Pulse (ports 6500-6501/7500-7501) | 8 hours | 4 hours | 48 hours | P3 — Medium |
| Command Shell (port 6102/7102) | 8 hours | N/A | 48 hours | P3 — Medium |
| Admin UI (port 6101/7101) | 12 hours | N/A | 72 hours | P3 — Medium |
| Protocol Lab (ports 6400-6408/7400-7408) | 24 hours | 4 hours | 72 hours | P4 — Low |
| AI Coding Course platform | 24 hours | 24 hours | 1 week | P4 — Low |
| Cloudflare DNS/CDN | Cloudflare SLA | N/A | Per Cloudflare SLA | External dependency |
| Tailscale Network | 1 hour | N/A | 4 hours | P1 — Critical (for inter-machine communication) |

### 4.2 Dependencies

- **Auth Service** is a dependency for all other platform services. Auth must be restored first.
- **Supabase Database** is a dependency for all services that persist data. Database must be restored before application services.
- **Tailscale** is required for communication between Mac Studio and DGX Spark. Loss of Tailscale affects Divinr.ai integration but not Enterprise standalone operation.
- **Cloudflare** is required for public access to orchestratorai.io and divinr.ai. Internal operations continue without Cloudflare.
- **LLM Provider APIs** (OpenAI, Anthropic, Google, Azure) are external dependencies. Sovereign Mode clients are unaffected by LLM provider outages.

---

## 5. Backup Procedures

### 5.1 Database Backups

#### 5.1.1 Supabase PostgreSQL (Enterprise — Mac Studio)

(a) **Automated Daily Backups:** The Supabase daily backup script (`apps/auth/api/storage/scripts/backup-supabase-daily.sh`, with copies in Compose and Forge APIs) shall execute daily at 02:00 AM Central Time. Backups shall include all schemas: public, prediction, crawler, risk, marketing, and orch_flow.

(b) **Backup Method:** `pg_dump` with custom format (-Fc) for efficient compression and selective restoration capability. Connection via `DATABASE_URL` targeting PostgreSQL on port 6011 (development) or 7011 (production).

(c) **Backup Storage:**
  - Primary: Local backup directory on the Mac Studio with timestamped filenames.
  - Secondary: Encrypted copy to an external USB drive stored in a fireproof safe (rotated weekly).
  - Tertiary: Encrypted upload to Cloudflare R2 or equivalent object storage (for off-site protection).

(d) **Retention Schedule:**
  - Daily backups: Retained for thirty (30) days.
  - Weekly backups (Sunday): Retained for ninety (90) days.
  - Monthly backups (first of month): Retained for one (1) year.
  - Annual backups (January 1): Retained for seven (7) years.

(e) **Backup Verification:** Automated restoration test to a temporary database shall be performed weekly to verify backup integrity. Results shall be logged.

#### 5.1.2 Supabase PostgreSQL (Divinr.ai — DGX Spark)

(a) Identical backup procedures as Section 5.1.1, adjusted for the DGX Spark environment.

(b) Backup scripts shall be maintained in the Divinr.ai repository at the corresponding storage/scripts/ paths.

(c) Cross-machine backup replication: A copy of each daily backup shall be transmitted to the Mac Studio over the Tailscale mesh for redundancy.

### 5.2 Application and Configuration Backups

(a) **Source Code:** All application source code is maintained in GitHub repositories with full version history. GitHub serves as the primary code backup. Local clones on the Mac Studio and DGX Spark provide immediate access if GitHub is unavailable.

(b) **Configuration Files:** Environment files (.env, .env.secrets) shall be backed up daily alongside database backups. These files contain API keys, database URLs, and service configurations critical for system restoration.

(c) **Docker Configuration:** Docker Compose files, nginx configurations, and Cloudflare tunnel configurations shall be version-controlled in the repository and additionally backed up with configuration backups.

(d) **Supabase Configuration:** `supabase/config.toml` and migration files shall be version-controlled. The Supabase project configuration is reproducible from the repository.

### 5.3 Hardware Configuration Documentation

(a) A hardware configuration document shall be maintained listing:
  - Mac Studio: macOS version, installed software, system preferences, network configuration, FileVault recovery key location.
  - DGX Spark: OS version, CUDA/driver versions, installed frameworks, network configuration, encryption key location.
  - Networking: Router/firewall configuration, port forwarding rules, Tailscale node configuration.

(b) This document shall be stored in the encrypted off-site backup and updated whenever hardware configurations change.

---

## 6. Disaster Recovery Scenarios and Procedures

### 6.1 Scenario 1: Mac Studio Hardware Failure

**Impact:** Complete loss of OrchestratorAI Enterprise platform.

**Recovery Procedure:**

1. **Immediate (0-1 hours):**
   - Notify all affected clients of the service disruption via email and any active communication channels.
   - Assess the nature of the hardware failure (disk, memory, logic board, power supply).
   - If the failure is a peripheral component (keyboard, display, USB), resolve with replacement peripherals.

2. **Short-Term (1-24 hours):**
   - If the boot drive is recoverable, attempt to boot from the drive in a replacement Mac Studio or via Target Disk Mode.
   - If the boot drive is not recoverable, procure a replacement Mac Studio (Apple Store, authorized reseller, or pre-identified backup hardware source).
   - Begin OS installation and system configuration from the hardware configuration document.

3. **System Restoration (4-48 hours):**
   - Install macOS and required development tools (Node.js v20+, Docker, Supabase CLI).
   - Clone repositories from GitHub.
   - Restore configuration files (.env, .env.secrets) from the encrypted off-site backup.
   - Restore the Supabase database from the most recent backup using the restore-db script.
   - Configure Tailscale and re-establish the mesh network with the DGX Spark.
   - Configure Cloudflare tunnel to the new machine.
   - Verify all services start correctly (Auth, Forge, Compose, Pulse, Bridge, Command, Admin).
   - Run smoke tests (`/smoke`) to validate platform functionality.

4. **Validation and Restoration of Service:**
   - Verify database integrity by spot-checking client data.
   - Verify authentication flows.
   - Restore public access through Cloudflare.
   - Notify clients of service restoration.

**Estimated Total Recovery Time:** 24-48 hours (within MTD for all P2+ systems).

### 6.2 Scenario 2: DGX Spark Hardware Failure

**Impact:** Loss of Divinr.ai prediction services. OrchestratorAI Enterprise continues operating independently.

**Recovery Procedure:**

1. **Immediate:** Notify Divinr.ai users of the service disruption. Enterprise clients are unaffected; confirm their service continuity.

2. **Short-Term:** Contact NVIDIA support for hardware diagnostics and warranty service. The DGX Spark is a specialized appliance; replacement may require NVIDIA involvement.

3. **Interim Measures:**
   - If the DGX Spark disk is recoverable, extract data and database backups.
   - If prediction capabilities are needed urgently, evaluate temporary cloud GPU deployment (Azure NC-series, GCP A100) with data from the most recent backup.

4. **Full Restoration:** Restore from backups once replacement or repaired hardware is available. Re-establish Tailscale mesh. Verify Gatekeeper connectivity from Enterprise.

**Estimated Total Recovery Time:** 48-96 hours (within MTD).

### 6.3 Scenario 3: Database Corruption

**Impact:** Data integrity compromised for one or more services.

**Recovery Procedure:**

1. **Immediate:** Stop all write operations to the affected database. Identify the scope of corruption (which schemas, tables, or records).

2. **Assessment:**
   - If corruption is limited to specific tables, attempt targeted restoration from the most recent backup using `pg_restore` with table-level granularity.
   - If corruption is widespread, plan for full database restoration.

3. **Restoration:**
   - Restore the entire database from the most recent verified backup.
   - Apply any transaction logs or WAL archives to recover data between the last backup and the point of corruption (if available and not themselves corrupted).
   - Verify data integrity through checksums and application-level validation.

4. **Post-Recovery:** Investigate the root cause of corruption (hardware issue, software bug, improper shutdown). Implement preventive measures.

**Estimated Data Loss:** Up to RPO (1 hour for critical systems).

### 6.4 Scenario 4: Network/Internet Outage

**Impact:** Public-facing services inaccessible. Internal operations may continue if local network is functional.

**Recovery Procedure:**

1. **Immediate:** Confirm whether the outage is ISP-level, equipment-level, or broader.
2. **If ISP outage:** Contact ISP. If resolution exceeds two (2) hours, activate mobile hotspot as temporary internet connectivity for critical operations.
3. **If equipment failure:** Replace or reconfigure networking equipment. Tailscale and Cloudflare tunnel will automatically reconnect once internet connectivity is restored.
4. **Client Communication:** Notify clients via phone or personal mobile if email/platform communication is unavailable.

### 6.5 Scenario 5: Security Breach / Ransomware

**Impact:** Potential data compromise, system unavailability.

**Recovery Procedure:**

1. **Immediate:** Isolate affected systems from all networks (disconnect Ethernet, disable Wi-Fi). Do NOT power off systems (preserve forensic evidence).
2. **Assessment:** Determine the scope of compromise following the Incident Response procedures in the Data Privacy and Security Policy.
3. **Recovery from Clean State:**
   - If ransomware: Do NOT pay ransom. Rebuild systems from scratch using backup media.
   - Wipe and reinstall operating systems on affected machines.
   - Restore from the most recent backup verified to pre-date the compromise.
   - Rotate ALL credentials: database passwords, API keys, SSH keys, Tailscale node keys, Cloudflare API tokens.
4. **Post-Recovery:** Conduct thorough post-incident review. Notify clients and regulators as required.

### 6.6 Scenario 6: Home Office Facility Loss

**Impact:** Loss of access to all on-premise hardware.

**Recovery Procedure:**

1. **Immediate:** Ensure personal safety. Contact emergency services if necessary.
2. **Assessment:** Once safe, assess whether hardware is recoverable.
3. **Temporary Operations:**
   - Establish temporary workspace at a co-working space or alternative location.
   - If hardware is destroyed, initiate hardware procurement (Mac Studio, DGX Spark).
   - Restore from off-site encrypted backups (Cloudflare R2 or external drive from safe).
4. **Client Communication:** Notify all clients within twenty-four (24) hours of the event.
5. **Insurance:** File claims under business property and business interruption insurance.

---

## 7. Client Communication During Outages

### 7.1 Communication Timelines

| Event | Initial Notification | Status Updates | Resolution Notice |
|-------|---------------------|----------------|-------------------|
| Planned maintenance | 72 hours in advance | Day before, 1 hour before | Upon completion |
| Unplanned outage (< 2 hours expected) | Within 30 minutes | Every 30 minutes | Upon restoration |
| Unplanned outage (> 2 hours expected) | Within 30 minutes | Every hour | Upon restoration |
| Data breach | Within 48 hours of confirmation | As material updates are available | Upon resolution with final report |
| Hardware failure | Within 2 hours | Daily | Upon restoration |

### 7.2 Communication Channels

(a) **Primary:** Email to client's designated contact(s).

(b) **Secondary:** Phone call to client's primary contact for P1/P2 incidents.

(c) **Tertiary:** Status page at status.orchestratorai.io (if available) or social media update.

### 7.3 Communication Content

All outage communications shall include:

(a) Nature of the disruption (in general terms appropriate for the audience; avoid exposing security details).

(b) Services affected.

(c) Estimated time to resolution (if known).

(d) Impact on client data (confirmation of data safety or acknowledgment of potential impact).

(e) Contact information for questions.

(f) Next scheduled update time.

---

## 8. Testing and Maintenance

### 8.1 BCP/DR Testing Schedule

| Test Type | Frequency | Scope |
|-----------|-----------|-------|
| Backup restoration verification | Weekly (automated) | Verify backup integrity by restoring to temp database |
| Tabletop exercise | Quarterly | Walk through a disaster scenario with all personnel |
| Partial recovery drill | Semi-annually | Restore a single service from backup on alternate hardware |
| Full recovery drill | Annually | Complete system restoration from backups on clean hardware |

### 8.2 Test Documentation

Each test shall be documented with:

(a) Date and participants.

(b) Scenario tested.

(c) Actual recovery times versus RTO targets.

(d) Issues discovered and remediation actions.

(e) Updates to this plan resulting from test findings.

### 8.3 Plan Maintenance

(a) This BCP/DR Plan shall be reviewed and updated quarterly, or whenever there is a significant change in infrastructure, personnel, or business operations.

(b) All personnel shall be familiar with their roles and responsibilities under this plan.

(c) Current contact information for all personnel, vendors, and service providers shall be maintained and verified quarterly.

---

## 9. Roles and Responsibilities

### 9.1 Managing Member

- Overall responsibility for BCP/DR Plan execution
- Decision authority for disaster declarations and recovery prioritization
- Client communication lead
- Vendor and insurance coordination

### 9.2 Contractors (Operations/DevOps)

- Execute technical recovery procedures as directed
- Maintain backup systems and verify backup integrity
- Document technical recovery actions and timelines

### 9.3 Interns

- Assist with client communications as directed
- Document events and actions during recovery operations
- Support testing activities

---

## 10. Emergency Contact Information

Emergency contact information is maintained in a separate, encrypted document accessible to the Managing Member and designated backup personnel. This document includes:

- Managing Member: personal phone, personal email
- Key contractors: phone numbers, email addresses
- ISP support line
- Apple Support / AppleCare
- NVIDIA Enterprise Support
- Cloudflare Support
- Tailscale Support
- GitHub Support
- LLM Provider support contacts (OpenAI, Anthropic, Google, Azure)
- Insurance carrier: policy number and claims phone number
- Legal counsel contact information
- Local emergency services: 911

---

## 11. Insurance

The Company shall maintain the following insurance coverages relevant to business continuity:

(a) **Business property insurance:** Covering hardware assets (Mac Studio, DGX Spark, networking equipment).

(b) **Business interruption insurance:** Covering lost revenue during extended outages.

(c) **Cyber liability insurance:** Covering costs associated with data breaches, including notification, forensics, and legal defense.

(d) **Professional liability / E&O insurance:** Covering claims arising from service disruptions affecting clients.

Insurance policies shall be reviewed annually for adequacy of coverage.

---

## 12. Related Policies

- Data Privacy and Security Policy (OAI-OPS-002)
- File Retention Policy (OAI-OPS-007)
- Acceptable Use Policy (OAI-OPS-001)
- Client Confidentiality Policy (OAI-ETH-001)

---

## 13. Policy Review

This plan shall be reviewed quarterly and updated as necessary. The annual review shall coincide with the full recovery drill to incorporate lessons learned.

---

**Governing Law:** This plan shall be interpreted in accordance with the laws of the State of Florida, with operational considerations under Minnesota state law as applicable.

**Orchestrator AI LLC**
A Florida Limited Liability Company
Operating in Minneapolis/St. Paul, Minnesota

*This plan is effective as of the date first written above and supersedes all prior business continuity and disaster recovery plans of the Company.*
