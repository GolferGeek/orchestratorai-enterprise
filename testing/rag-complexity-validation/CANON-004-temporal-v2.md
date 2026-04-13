---
**Document ID:** CANON-004
**Version:** 2.0
**Effective Date:** January 15, 2026
**Supersedes:** Version 1.0 (March 1, 2025)
**Classification:** Internal — Restricted
**Owner:** Chief Operations Officer (COO)
**Approved By:** Board of Directors, OrchestratorAI LLC
**Review Cycle:** Annual
---

# Orchestrator AI Business Continuity Plan

## Purpose and Scope

This Business Continuity Plan ("Plan") establishes the policies, procedures, and responsibilities for maintaining essential business operations and recovering critical systems in the event of a disruption affecting OrchestratorAI LLC ("Company"), a Florida limited liability company with principal operations in Minneapolis, Minnesota. This Plan applies to all Company operations, personnel, systems, and facilities.

The objectives of this Plan are to: (a) minimize the impact of disruptions on Company operations and client services; (b) ensure the safety and well-being of Company personnel; (c) provide a structured framework for recovery of critical business functions; (d) maintain compliance with contractual and regulatory obligations during and after disruptions; (e) ensure continuity of AI model inference and automation services that clients depend on.

---

## Article I — Risk Assessment and Business Impact Analysis

### Section 1.1 — Identified Risks

The following categories of risk have been identified through the Company's risk assessment process:

(a) **Natural Disasters:** Severe weather events (blizzards, tornadoes, flooding) affecting Minneapolis operations, earthquakes, pandemics;
(b) **Technology Failures:** Hardware failure, software defects, network outages, cloud provider outages, database corruption;
(c) **Cyber Incidents:** Ransomware, data breach, denial-of-service attacks, supply chain compromise (managed per the Incident Response Procedures [CANON-003]);
(d) **Facility Disruptions:** Power outages, building damage, HVAC failure, loss of physical access;
(e) **Personnel Disruptions:** Key person unavailability, labor disputes, pandemic-related workforce reduction;
(f) **Third-Party Failures:** Cloud provider outage, critical vendor insolvency, API service discontinuation;
(g) **AI Model Provider Disruptions:** Model deprecation, API breaking changes, provider service degradation, safety policy changes affecting model availability.

### Section 1.2 — Critical Business Functions

The following business functions have been identified as critical and prioritized for recovery:

| Priority | Business Function | Maximum Tolerable Downtime |
|----------|------------------|---------------------------|
| 1 | AI Inference Services (Production) | 4 hours |
| 2 | Authentication and Authorization Services | 4 hours |
| 3 | Client-Facing Web Applications | 8 hours |
| 4 | AI Automation Services (Pulse) | 12 hours |
| 5 | Internal Communication Systems | 24 hours |
| 6 | Development and Testing Environments | 48 hours |
| 7 | Administrative and Reporting Systems | 72 hours |

### Section 1.3 — Dependencies

Critical business functions depend on the following infrastructure components: (a) cloud compute resources (primary: on-premises Mac Studio infrastructure; secondary: cloud provider with automated failover); (b) Supabase database services with hot standby; (c) network connectivity (primary ISP, backup ISP, and cellular failover); (d) DNS services with multi-provider configuration; (e) third-party AI model provider APIs with multi-provider fallback via LLM Service plane; (f) email and collaboration platforms; (g) Tailscale mesh network for inter-site connectivity.

---

## Article II — Continuity Strategies

### Section 2.1 — Data Protection Strategy

The Company's data protection strategy is based on continuous replication, frequent backups, geographic redundancy, and tested recovery procedures. All backup procedures shall comply with the data classification and handling requirements established in the Data Classification Policy [CANON-001].

### Section 2.2 — Infrastructure Redundancy

Critical infrastructure components shall have redundancy as follows: (a) database services with automated failover and hot standby replication; (b) network connectivity with dual ISP configuration and cellular backup; (c) power supply with uninterruptible power supply (UPS) and generator backup for on-premises equipment, with automatic transfer switch; (d) DNS with multiple authoritative nameservers across providers; (e) AI inference with multi-provider capability via the LLM Service plane, enabling automatic failover between model providers; (f) cross-site replication between Enterprise and Diviner infrastructure via Tailscale.

### Section 2.3 — Personnel Continuity

Key roles shall have designated alternates capable of performing essential functions. Cross-training shall be conducted to ensure that no single individual is a single point of failure for critical operations. The succession plan for key technical and leadership roles is maintained separately and reviewed quarterly. Remote work capabilities ensure personnel can perform essential functions regardless of facility access.

---

## Article III — Recovery Objectives

### Section 3.1 — Recovery Point Objective (RPO)

The Recovery Point Objective defines the maximum acceptable data loss measured in time:

| System Category | RPO |
|----------------|-----|
| Production Databases | 15 minutes |
| AI Model Artifacts | 4 hours |
| Application Configuration | 4 hours |
| Automation State (Pulse) | 1 hour |
| Development Environments | 24 hours |
| Administrative Data | 24 hours |

### Section 3.2 — Recovery Time Objective (RTO)

The Recovery Time Objective defines the maximum acceptable time to restore system functionality:

| System Category | RTO |
|----------------|-----|
| Authentication Services | 4 hours |
| AI Inference Services | 4 hours |
| Client Web Applications | 8 hours |
| AI Automation Services | 12 hours |
| Internal Tools | 24 hours |
| Development Environments | 48 hours |

Recovery time objective (RTO) for critical systems: 4 hours. This target applies to all Priority 1 and Priority 2 business functions as defined in Section 1.2 and represents the maximum time from disruption onset to restoration of minimum viable service. This is a significant improvement over the previous 24-hour target, made possible by the infrastructure investments described in Section 2.2.

### Section 3.3 — Minimum Viable Service

Minimum viable service is defined as: (a) authentication functional for all active users; (b) AI inference available for at least two approved model providers via the LLM Service plane; (c) client web applications serving read-only content; (d) incident communication channels operational; (e) Pulse automation monitoring active in observation mode.

---

## Article IV — Backup and Recovery Procedures

### Section 4.1 — Backup Schedule

Backup frequency: Daily incremental, weekly full backups. The following backup schedule applies to production systems:

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Full Database Backup | Weekly (Sunday 02:00 CST) | 180 days |
| Incremental Database Backup | Daily (02:00 CST) | 90 days |
| Continuous WAL Archiving | Continuous (real-time) | 30 days |
| AI Model Artifact Backup | Daily (04:00 CST) | 365 days |
| Application Configuration | Daily (03:00 CST) | 180 days |
| File Storage Backup | Daily (05:00 CST) | 180 days |
| Automation State Snapshot | Every 4 hours | 30 days |

### Section 4.2 — Backup Storage

Backups shall be stored in at least two geographically separated locations. Primary backup storage is on the secondary infrastructure site connected via Tailscale. Secondary backup storage is in a cloud provider's object storage service in a different region. Backup storage shall meet the encryption requirements specified in the Data Classification Policy [CANON-001], Section 3.2. Backup integrity shall be verified daily through automated checksum validation. Backup media shall be tested monthly to verify recoverability.

### Section 4.3 — Recovery Procedures

Recovery procedures for each critical system are documented in the system-specific recovery runbooks maintained by the Engineering Operations team. General recovery steps include: (a) assess the scope of data loss and select recovery strategy (failover vs. restore); (b) for automated failover systems, verify failover has completed successfully; (c) for manual recovery, identify the appropriate backup set and restore to a clean environment; (d) verify data integrity using checksums and consistency checks; (e) redirect traffic to the recovered environment; (f) verify service functionality through automated smoke tests; (g) notify stakeholders of restoration; (h) monitor recovered systems for 24 hours with enhanced alerting.

### Section 4.4 — Recovery Testing

Recovery testing shall be conducted monthly for Priority 1 systems, quarterly for Priority 2 and Priority 3 systems, and semi-annually for all other systems. Testing shall include actual restoration from backup to verify both the integrity of backups and the accuracy of recovery procedures. Automated recovery testing shall supplement manual testing. Results shall be documented and any failures shall trigger immediate remediation with a root cause analysis.

---

## Article V — AI Model Continuity

### Section 5.1 — Multi-Provider Resilience

The Company's AI inference architecture, through the LLM Service plane, supports automatic failover between multiple model providers. The following provider failover priorities are established:

| Primary Provider | Failover Provider(s) | Maximum Failover Time |
|-----------------|----------------------|----------------------|
| Anthropic (Claude) | Azure AI (hosted) | 30 seconds |
| OpenAI (GPT) | Anthropic (Claude) | 30 seconds |
| Google (Gemini) | Anthropic (Claude) | 30 seconds |
| Azure AI (hosted) | Anthropic (Claude) | 60 seconds |

### Section 5.2 — Model Version Management

To ensure continuity in the event of model deprecation or capability changes: (a) production deployments shall pin to specific model versions rather than using "latest" aliases; (b) model version changes shall follow the Company's change management process; (c) evaluation benchmarks shall be maintained for all production models and re-run against new versions before deployment; (d) rollback procedures shall be documented for each model version transition.

### Section 5.3 — Sovereign Mode Continuity

For clients operating in Sovereign Mode (as defined in the Data Classification Policy [CANON-001]): (a) all model inference failover must remain within the designated jurisdictional boundary; (b) sovereign-mode environments shall maintain locally hosted model artifacts capable of independent operation; (c) failover between sovereign-mode providers shall be tested semi-annually; (d) sovereign-mode data shall never egress the jurisdictional boundary, even during disaster recovery.

### Section 5.4 — Automation Continuity (Pulse)

The Pulse automation system requires specific continuity provisions: (a) automation state shall be persisted to the database with regular snapshots; (b) in-flight automations interrupted by a disruption shall be automatically resumed upon system recovery; (c) event queues shall be durable and survive system restarts; (d) a grace period of 30 minutes shall be observed after recovery before resuming non-critical automations, to avoid overwhelming recovered systems.

---

## Article VI — Communication Plan

### Section 6.1 — Internal Communication

During a business continuity event, internal communications shall be managed as follows: (a) the Incident Commander (as defined in the Incident Response Procedures [CANON-003]) shall issue initial notifications to all affected personnel within 30 minutes of event declaration; (b) status updates shall be provided at minimum every 2 hours during active incidents (improved from 4 hours in v1); (c) communication channels include email, SMS, the Company's emergency notification system, and a dedicated status page.

### Section 6.2 — External Communication

External communications during a business continuity event shall be coordinated by the Communications Lead and approved by the CEO or designated alternate. Client notifications shall include: (a) nature of the disruption (without disclosing sensitive security details); (b) expected impact on services; (c) estimated recovery timeline with confidence level; (d) alternative access methods if available; (e) contact information for questions; (f) public status page URL for real-time updates.

### Section 6.3 — Regulatory Communication

Regulatory notifications required as a result of a business continuity event shall be managed in accordance with the Incident Response Procedures [CANON-003], Article IV. The Legal Advisor shall assess notification obligations for each event.

---

## Article VII — Plan Maintenance

### Section 7.1 — Review Schedule

This Plan shall be reviewed and updated: (a) at least annually; (b) after any activation of the Plan; (c) after significant changes to Company infrastructure, operations, or personnel; (d) after any material change in the risk landscape; (e) after any Priority 1 system recovery test failure.

### Section 7.2 — Testing Schedule

The Plan shall be tested through: (a) tabletop exercises quarterly (increased from semi-annually in v1); (b) component recovery testing monthly for Priority 1 systems; (c) full-scale simulation semi-annually (increased from annually in v1). Test results shall be documented, and identified gaps shall be addressed within 15 days (reduced from 30 days in v1).

### Section 7.3 — Distribution

Current copies of this Plan shall be maintained: (a) in the Company's document management system; (b) in printed form in a secured location accessible during facility disruptions; (c) on the mobile devices of all IRT members; (d) in an offline-accessible format on each infrastructure site. Distribution is limited to personnel with a need-to-know based on their role in business continuity.

---

## Change Log

| Section | Change | Rationale |
|---------|--------|-----------|
| Section 1.1(g) | Added AI Model Provider Disruptions as a risk category | Recognizes growing dependency on third-party AI model providers |
| Section 1.2 | Reduced Maximum Tolerable Downtime for AI Inference from 24 hours to 4 hours; added AI Automation Services (Pulse) | Reflects increased client dependency on real-time AI services |
| Section 1.3 | Added Tailscale mesh network and multi-provider AI failover to dependencies | Documents new infrastructure investments |
| Section 3.1 | Reduced RPO for Production Databases from 1 hour to 15 minutes; added Automation State | Enabled by continuous WAL archiving and Pulse state snapshots |
| Section 3.2 | **Recovery time objective (RTO) for critical systems reduced from 24 hours to 4 hours** | Enabled by infrastructure redundancy investments (hot standby, automated failover) |
| Section 3.3 | Enhanced minimum viable service to require two model providers and Pulse monitoring | Higher baseline for acceptable recovery state |
| Section 4.1 | **Backup frequency changed from weekly full only to daily incremental, weekly full backups**; added continuous WAL archiving and automation state snapshots | Reduces potential data loss; meets new 15-minute RPO target |
| Section 4.2 | Added second geographic backup location and daily automated integrity verification | Improved resilience and early detection of backup corruption |
| Section 4.4 | Increased Priority 1 recovery testing from quarterly to monthly | More frequent validation of recovery capabilities |
| Article V | **New section: AI Model Continuity** | Addresses multi-provider failover, model version management, sovereign mode continuity, and Pulse automation continuity — none of which existed in v1 |
| Section 6.1 | Reduced status update frequency from 4 hours to 2 hours; added status page | Improved communication during incidents |
| Section 7.2 | Increased tabletop frequency to quarterly; increased simulation to semi-annually; reduced gap remediation to 15 days | More aggressive testing and remediation cadence |

---

## Appendix A — Emergency Contact List

The emergency contact list is maintained separately in the Company's secure operations portal and is updated monthly. Key contacts include: Incident Commander (CISO), COO, CEO, Legal Counsel, IT Operations Lead, AI Operations Lead, Facilities Manager, and primary contacts at critical vendors and service providers.

## Appendix B — Critical System Inventory

A detailed inventory of critical systems, including hardware specifications, software versions, configuration details, and dependencies, is maintained in the Company's configuration management database (CMDB) and is referenced by this Plan but not reproduced here for security reasons.

## Appendix C — Failover Architecture Diagram

The failover architecture diagram is maintained in the Company's engineering documentation system and depicts: primary site topology, secondary site topology, Tailscale mesh connectivity, database replication paths, AI model provider failover chains, and DNS failover configuration.

---

*Adopted by the Board of Directors of OrchestratorAI LLC on January 15, 2026.*
*This Plan supersedes Version 1.0 dated March 1, 2025.*
*This Plan shall be tested and maintained in accordance with Article VII.*
