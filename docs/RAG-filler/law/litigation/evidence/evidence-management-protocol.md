# Evidence Management and Preservation Protocol

## Purpose and Scope

This protocol establishes comprehensive procedures for evidence management and preservation in litigation, with particular emphasis on electronically stored information (ESI) in the context of AI platforms, SaaS applications, cloud/local hybrid deployments, and technology disputes. It addresses litigation holds, ESI preservation for complex technology environments, chain of custody requirements, spoliation risks, and e-discovery workflows.

Evidence management is not an afterthought. In technology litigation, the evidence is the technology itself: source code, model weights, training data, system configurations, access logs, conversation histories, database records, and deployment artifacts. The failure to preserve, collect, and produce this evidence properly can be more damaging than the underlying merits of the dispute.

---

## 1. Litigation Hold Procedures

### 1.1 Trigger Events

The duty to preserve evidence arises when litigation is "reasonably anticipated." This is an objective standard: would a reasonable person in the party's position anticipate litigation? Trigger events include:

- Receipt of a complaint, subpoena, or regulatory investigation notice
- Receipt of a cease-and-desist letter or demand letter
- Receipt of a preservation letter from opposing counsel
- Internal discovery of facts likely to give rise to a claim or defense
- Filing of a complaint by the organization
- Termination of an employee under circumstances suggesting potential claims
- Discovery of a data breach or security incident
- Customer complaint involving significant damages
- Regulatory inquiry or audit notice
- Media coverage suggesting potential claims or investigations

**For AI platform companies specifically:**
- Discovery that an AI model produced harmful or inaccurate outputs that caused client harm
- Customer allegation that platform data was mishandled or exposed
- Discovery that training data may have included proprietary or copyrighted material without authorization
- Departure of key technical employees to a competitor
- Discovery of unauthorized access to proprietary systems or code repositories

### 1.2 Litigation Hold Notice

See the companion Litigation Hold Template for detailed notice language. The notice must:

1. **Identify the matter** and provide sufficient context for custodians to understand what must be preserved
2. **Identify the categories of information** to be preserved (documents, emails, files, databases, code, logs, models, configurations)
3. **Identify the relevant time period**
4. **Identify the custodians** (individuals and systems responsible for the information)
5. **Instruct custodians** on their specific obligations (do not delete, do not alter, do not move, do not allow routine destruction)
6. **Suspend automated deletion** of relevant data (email retention policies, log rotation, database purges, model version cleanup)
7. **Provide a contact** for questions
8. **Require acknowledgment** from each custodian

### 1.3 Implementation and Monitoring

- [ ] Issue the hold notice to all identified custodians within 24-48 hours of the trigger event
- [ ] Collect signed acknowledgments from all custodians
- [ ] Suspend relevant automated deletion processes
- [ ] Notify IT/DevOps to preserve relevant systems, backups, and logs
- [ ] Document all preservation actions taken
- [ ] Issue periodic reminders (quarterly at minimum, more frequently if custodians change or the scope changes)
- [ ] Update the hold as new custodians or data sources are identified
- [ ] Maintain a hold log documenting: date issued, custodians notified, acknowledgments received, reminders sent, scope modifications

### 1.4 Releasing the Hold

The litigation hold remains in effect until:
- The litigation is fully resolved (including all appeals and post-judgment proceedings)
- A determination is made that the specific data or custodian is no longer relevant
- Counsel provides written authorization to release the hold

**Never release a hold unilaterally. Always consult with counsel before modifying or releasing any hold.**

---

## 2. ESI Preservation for Technology Environments

### 2.1 Identifying ESI Sources

Technology companies generate and store data across numerous systems. A comprehensive ESI identification should map the following:

**Source Code and Development Artifacts:**
| Data Type | Location | Preservation Method |
|-----------|----------|-------------------|
| Source code repositories | Git (GitHub, GitLab, Bitbucket), SVN | Snapshot/clone entire repository including all branches, tags, and commit history |
| Build artifacts | CI/CD systems (Jenkins, GitHub Actions, CircleCI) | Export build logs, deployment records, artifact storage |
| Configuration files | Version control, deployment tools (Docker, Kubernetes) | Preserve all configuration versions within the relevant time period |
| Infrastructure as code | Terraform, CloudFormation, Ansible | Preserve all versions of infrastructure definitions |
| Package dependencies | npm, pip, Maven, NuGet | Preserve lock files and dependency trees |
| Code review history | Pull request discussions, code review tools | Export complete review history including comments and approvals |

**AI and Machine Learning Artifacts:**
| Data Type | Location | Preservation Method |
|-----------|----------|-------------------|
| Training data | Data lakes, storage buckets, databases | Snapshot and preserve the exact training datasets used for each model version |
| Model weights and architectures | Model registries, file storage | Preserve all model versions, including intermediate checkpoints |
| Hyperparameters and training configurations | Experiment tracking tools (MLflow, Weights & Biases, Neptune) | Export complete experiment history |
| Model evaluation results | Experiment tracking, internal dashboards | Preserve all evaluation metrics, test results, and comparison data |
| Inference logs | Application logs, monitoring systems | Preserve all input/output logs within the relevant time period |
| Prompt templates and system prompts | Configuration management, code repositories | Preserve all versions of prompts used in production |

**Databases and Application Data:**
| Data Type | Location | Preservation Method |
|-----------|----------|-------------------|
| Production databases | PostgreSQL, Supabase, MySQL, MongoDB, SQL Server | Full backup/snapshot at the time of the hold; ongoing incremental preservation |
| Database schemas and migrations | Version control, migration tools | Preserve complete migration history |
| Audit logs and access logs | Database audit tables, log management systems | Preserve all audit data within the relevant time period |
| User data and conversation histories | Application databases, object storage | Preserve in compliance with data privacy obligations |
| Analytics and telemetry | Analytics platforms, data warehouses | Preserve relevant metrics and usage data |

**Communications:**
| Data Type | Location | Preservation Method |
|-----------|----------|-------------------|
| Email | Exchange, Gmail, corporate email | Legal hold through email provider; do not rely on individual custodians |
| Instant messaging | Slack, Teams, Discord | Enable legal hold/export for relevant channels and DMs |
| Video conferencing recordings | Zoom, Teams, Google Meet | Preserve recordings of relevant meetings |
| Project management | Jira, Asana, Linear, GitHub Issues | Export relevant project data including comments and attachments |
| Internal documentation | Confluence, Notion, Google Docs | Preserve relevant documents with edit history |

**Infrastructure and Operations:**
| Data Type | Location | Preservation Method |
|-----------|----------|-------------------|
| Server logs | Application servers, web servers, load balancers | Adjust log rotation to preserve relevant logs indefinitely |
| Access control records | IAM systems, LDAP, SSO providers | Preserve all access grants, revocations, and authentication logs |
| Network logs | Firewalls, VPNs, network monitoring | Preserve relevant network traffic logs |
| Cloud provider logs | AWS CloudTrail, Azure Activity Log, GCP Audit Logs | Enable and preserve cloud audit logs |
| Deployment history | Container registries, deployment pipelines | Preserve all deployment records |
| Incident response records | PagerDuty, Opsgenie, incident tracking | Preserve all incident records, postmortems, and response actions |

### 2.2 Preservation for Cloud/Local Hybrid Deployments

When the platform deploys on client hardware (as with on-premises AI platform deployments), preservation requires coordination between the platform provider and the client:

**Platform provider's obligations:**
- Preserve all code, configurations, and updates deployed to the client environment
- Preserve all telemetry and diagnostic data received from the client deployment
- Preserve all support communications and trouble tickets related to the client
- Preserve all license records, deployment records, and version histories
- Preserve the specific versions of any AI models deployed to the client environment

**Client's obligations:**
- Preserve the deployment as-is (do not update, uninstall, or modify without counsel approval)
- Preserve local databases, logs, and configuration files
- Preserve any locally stored model data, training data, or inference logs
- Coordinate with the platform provider on joint preservation efforts

**Contractual considerations:**
- Review the license agreement for data ownership, access, and preservation clauses
- Determine whether the platform provider has remote access to the client deployment for preservation purposes
- Address data privacy and confidentiality concerns when coordinating cross-party preservation

### 2.3 Preservation of Ephemeral Data

Some technology data is inherently ephemeral and requires immediate action to preserve:

- **Log data with short retention periods:** Many systems rotate logs daily or weekly. Extend retention immediately upon hold issuance.
- **Cache and temporary data:** Application caches, build artifacts, and temporary files may be automatically purged. Disable automatic purging for relevant systems.
- **Ephemeral messaging:** Messages in Slack, Teams, or other platforms may be subject to retention policies that automatically delete older messages. Disable deletion and enable legal hold features.
- **Container environments:** Docker containers and Kubernetes pods are inherently ephemeral. Preserve the images, configurations, and persistent volumes, not the running containers.
- **Streaming data:** Real-time data streams (event buses, message queues) may not be stored by default. Enable persistence for relevant streams.
- **A/B test data:** Experiment configurations and results may be purged after experiments conclude. Preserve all test data within the relevant scope.

---

## 3. Chain of Custody

### 3.1 Principles

Chain of custody documentation ensures that evidence is authentic, has not been altered, and can be traced from collection through presentation at trial. For ESI, this requires:

1. **Identification:** Document what was collected, from where, and by whom
2. **Collection:** Use forensically sound methods that do not alter the data
3. **Preservation:** Store in a secure, access-controlled environment
4. **Documentation:** Maintain a complete log of every person who accessed or handled the evidence, every transfer, and every action taken

### 3.2 Collection Best Practices

**For source code:**
- Clone the entire repository using `git clone --mirror` to capture all branches, tags, and history
- Record the clone date, the repository URL, and the commit hash of HEAD at the time of collection
- Calculate and record hash values (SHA-256) of the cloned repository
- Store the repository clone in a read-only, access-controlled environment

**For databases:**
- Perform a full database dump using the database's native backup tool (e.g., `pg_dump` for PostgreSQL/Supabase)
- Record the backup date, time, database version, and the command used
- Calculate and record hash values of the backup file
- For Supabase deployments: preserve both the PostgreSQL database and the Supabase metadata (storage buckets, auth records, edge function configurations)
- Document the database schema at the time of backup

**For AI models:**
- Export the model in its native format (ONNX, SavedModel, PyTorch checkpoints)
- Record the model version identifier, training run identifier, and the date of the last training
- Calculate and record hash values of the model files
- Preserve the training configuration (hyperparameters, data splits, random seeds)
- Document the model's expected behavior through test inputs and outputs

**For logs and communications:**
- Export using the platform's native export tool (Slack export, email PST/MBOX export)
- Record the export date, the scope of the export (date range, channels/mailboxes), and the export tool version
- Calculate and record hash values of the export files
- Verify completeness by spot-checking against known communications

### 3.3 Chain of Custody Log

Maintain a log for each evidence item documenting:

| Field | Description |
|-------|-------------|
| Evidence ID | Unique identifier for the evidence item |
| Description | What the evidence is (e.g., "Complete clone of orchestratorai-enterprise GitHub repository") |
| Source | Where the evidence was collected from (system, location, custodian) |
| Collection date/time | Exact date and time of collection (with timezone) |
| Collected by | Name and role of the person who performed the collection |
| Collection method | Tool and methodology used (e.g., "git clone --mirror via SSH") |
| Hash value | SHA-256 hash of the collected data at the time of collection |
| Storage location | Where the evidence is stored (e.g., "Litigation evidence server, /evidence/case-2025-001/repo/") |
| Access log | Every person who accessed the evidence, the date, time, and purpose |
| Transfer log | Every transfer of the evidence (to counsel, to expert, to opposing party), with dates and recipients |

---

## 4. Spoliation Risks and Mitigation

### 4.1 What Constitutes Spoliation

Spoliation is the destruction, alteration, or failure to preserve evidence that a party has a duty to preserve. In technology contexts, spoliation can take many forms:

- Deleting files, emails, or messages after the preservation duty attaches
- Overwriting database records without preserving the prior version
- Deploying a software update that replaces the version at issue
- Retraining an AI model without preserving the prior version
- Allowing automated deletion processes to continue after the hold is issued
- Failing to preserve relevant log data before it rotates out
- Wiping a departing employee's laptop without imaging it first
- Destroying backup tapes or purging cloud storage
- Modifying code repositories by force-pushing, rebasing, or squashing history

### 4.2 Consequences of Spoliation

**Federal courts (Fed. R. Civ. P. 37(e)):**
For ESI lost because a party failed to take reasonable steps to preserve it:

1. If the ESI is not recoverable from other sources, the court may order measures "no greater than necessary to cure the prejudice"
2. Only upon finding that the party "acted with the intent to deprive another party of the information's use in the litigation" may the court:
   - Presume the lost information was unfavorable to the party that lost it
   - Instruct the jury that it may or must presume the information was unfavorable
   - Dismiss the action or enter a default judgment

**Minnesota courts:**
Spoliation sanctions are governed by the court's inherent authority and include adverse inference instructions, evidentiary sanctions, monetary sanctions, and in extreme cases, dismissal or default.

### 4.3 Spoliation Mitigation Strategies

1. **Issue the litigation hold immediately.** Every day of delay after a trigger event is a day of potential spoliation exposure.
2. **Suspend all automated deletion.** Do not rely on custodians to save individual items — disable the deletion process itself.
3. **Image departing employees' devices.** When an employee involved in the litigation (or the underlying events) departs, create a forensic image of their devices before decommissioning.
4. **Freeze code repositories.** If the code at issue is the subject of the litigation, consider creating a locked archive branch or a complete mirror that is not subject to ongoing development.
5. **Preserve entire systems, not just selected data.** Selective preservation invites accusations that relevant data was intentionally omitted.
6. **Document everything.** Every preservation action, every custodian notification, every system modification. If spoliation is alleged, the defense is the documentation showing the reasonable steps taken.
7. **Engage a forensic specialist.** For complex technology environments, engage a digital forensics firm to assist with preservation and collection. Their involvement strengthens the chain of custody and provides expert testimony if preservation is challenged.
8. **Communicate with opposing counsel.** If there is a genuine question about the scope of the preservation obligation, address it proactively rather than waiting for a motion to compel or a spoliation motion.

---

## 5. E-Discovery for Cloud/Local Hybrid Systems

### 5.1 E-Discovery Framework (EDRM)

The Electronic Discovery Reference Model (EDRM) provides a standard framework for e-discovery:

1. **Information Governance** — proactive management of data (ongoing, not litigation-specific)
2. **Identification** — locating potential sources of ESI
3. **Preservation** — ensuring ESI is protected from alteration or destruction
4. **Collection** — gathering ESI for use in the legal process
5. **Processing** — reducing the volume of ESI through deduplication, filtering, and format conversion
6. **Review** — evaluating ESI for relevance, privilege, and responsiveness
7. **Analysis** — evaluating ESI for patterns, themes, and key documents
8. **Production** — delivering ESI to opposing parties in the required format
9. **Presentation** — presenting ESI in hearings, depositions, and trial

### 5.2 Collection from Technology Systems

**Cloud platforms (AWS, Azure, GCP):**
- Use the cloud provider's compliance and export tools
- Collect cloud audit logs (CloudTrail, Activity Log, Audit Logs) for the relevant period
- Collect relevant storage objects (S3 buckets, Azure Blob, GCS)
- Collect relevant database snapshots
- Collect IAM records and access policies
- Document the collection methodology, including any API calls or scripts used

**SaaS applications (Slack, Salesforce, HubSpot, etc.):**
- Use the platform's built-in export or compliance tools
- For Slack: administrative export includes all messages, files, and metadata for the workspace
- For Salesforce: use the Data Export service or Data Loader
- Document any limitations of the export tool (e.g., Slack free tier limits export to public channels)

**Local deployments (on-premises servers, developer workstations):**
- Create forensic images of relevant servers and workstations using validated forensic tools (EnCase, FTK, dd)
- Preserve the server configuration, installed software, and environment variables
- For containerized deployments: preserve Docker images, Kubernetes manifests, and persistent volumes
- For Supabase local deployments: preserve the complete PostgreSQL database, storage buckets, and configuration (supabase/config.toml)

**Hybrid considerations:**
- Map the data flow between cloud and local components to ensure no data sources are missed
- Identify data that exists in both environments (synchronized data, replicated databases) and determine which version is authoritative
- Address data residency and privacy requirements that may affect collection (e.g., EU data collected from cloud systems may be subject to GDPR)
- Coordinate collection across environments to ensure temporal consistency

### 5.3 Processing and Review

**Technology-specific processing challenges:**

- **Source code:** Standard e-discovery review tools are not designed for source code. Consider using specialized tools (e.g., Black Duck for code comparison, Git-based analysis tools for commit history review) alongside traditional review platforms.
- **Database records:** Database exports may need to be converted to a reviewable format. Consider exporting to CSV or JSON with field-level descriptions.
- **AI model artifacts:** Model weights and training data are not human-reviewable in their native format. Work with technical experts to identify what aspects of these artifacts are relevant and how to present them.
- **Log files:** Log files can be massive. Use processing tools to filter by date range, event type, user, and other relevant criteria before loading into the review platform.
- **Multimedia:** If the platform processes or stores audio, video, or images, review tools must support these formats. Consider transcription services for audio and video content.

**Privilege review considerations for technology companies:**
- Attorney-client communications embedded in project management tools (Jira tickets, GitHub issues, Slack channels) may be difficult to identify through keyword searches
- Communications with patent counsel about technology development may be privileged
- Internal legal assessments of AI model behavior or data privacy compliance are likely privileged
- Implement privilege review workflows that account for the informal communication channels used by technology teams

### 5.4 Production Formats

**Common production formats:**
- **Native format:** Produced in the original file format (appropriate for spreadsheets, databases, source code, and files where metadata is relevant)
- **TIFF/PDF with load file:** Images of documents with metadata in a load file (standard for general document production)
- **ESI production protocol:** Negotiate a production protocol with opposing counsel that specifies formats, metadata fields, Bates numbering, and handling of confidential/privileged materials

**Technology-specific production considerations:**
- **Source code** should be produced in native format with the complete file structure, not as printed pages or PDFs
- **Database records** should be produced in a structured format (CSV, JSON, or XML) with field definitions
- **AI model artifacts** should be discussed with opposing counsel to determine what is relevant and how it should be produced (full model files, configuration files, or summary documentation)
- **Logs** should be produced in a searchable format with consistent timestamps and field parsing

---

## 6. Proportionality and Cost Management

### 6.1 Proportionality Under Rule 26(b)(1)

The scope of discovery must be "proportional to the needs of the case, considering the importance of the issues at stake in the action, the amount in controversy, the parties' relative access to relevant information, the parties' resources, the importance of the discovery in resolving the issues, and whether the burden or expense of the proposed discovery outweighs its likely benefit."

**Proportionality arguments in technology cases:**
- Collecting, processing, and reviewing terabytes of ESI from multiple technology systems can cost hundreds of thousands or millions of dollars
- Not all data in a technology company's systems is relevant — argue for targeted collection based on custodians, date ranges, and data types
- AI training data may be massive (petabytes); argue for sampling methodologies rather than complete production
- Log data grows continuously and may be duplicative across systems; negotiate reasonable collection parameters

### 6.2 Cost-Shifting

Under certain circumstances, the court may shift the costs of e-discovery to the requesting party. The Zubulake factors (Zubulake v. UBS Warburg LLC, 217 F.R.D. 309 (S.D.N.Y. 2003)) and their progeny provide the framework:

1. The extent to which the request is specifically tailored to discover relevant information
2. The availability of such information from other sources
3. The total cost of production compared to the amount in controversy
4. The total cost of production compared to the resources available to each party
5. The relative ability of each party to control costs and incentive to do so
6. The importance of the issues at stake in the litigation
7. The relative benefits to the parties of obtaining the information

---

## 7. Evidence Management Checklist

**Litigation Hold Phase:**
- [ ] Trigger event identified and documented
- [ ] Litigation hold notice drafted and reviewed by counsel
- [ ] All custodians identified and notified
- [ ] Acknowledgments collected from all custodians
- [ ] Automated deletion processes suspended
- [ ] IT/DevOps notified of preservation requirements
- [ ] Hold log created and maintained
- [ ] Periodic reminders scheduled

**Identification Phase:**
- [ ] All relevant ESI sources mapped (see Section 2.1)
- [ ] Data volumes estimated for each source
- [ ] Custodians and data stewards identified for each source
- [ ] Data retention policies reviewed for each source
- [ ] Hybrid/cloud deployment data flows mapped

**Collection Phase:**
- [ ] Forensic collection tools selected and validated
- [ ] Collection protocol documented
- [ ] Chain of custody log created for each evidence item
- [ ] Hash values calculated and recorded at collection
- [ ] Collected data stored in secure, access-controlled environment
- [ ] Collection verified for completeness

**Processing and Review Phase:**
- [ ] Processing specifications defined (deduplication, filtering, format conversion)
- [ ] Review platform selected and configured
- [ ] Review team trained on technology-specific issues
- [ ] Privilege review protocol established
- [ ] Quality control procedures implemented

**Production Phase:**
- [ ] Production protocol negotiated with opposing counsel
- [ ] Production format specified and implemented
- [ ] Privilege log prepared for withheld documents
- [ ] Redaction protocol applied for sensitive information
- [ ] Production verified for completeness and accuracy
- [ ] Production transmittal documented

---

*This protocol is intended as a practice aid for licensed attorneys and litigation support professionals. Evidence management requirements vary by jurisdiction, case, and the specific technology environment involved. Consult with counsel and forensic specialists to tailor these procedures to your specific situation.*
