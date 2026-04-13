# AI Ethics and Governance Policy

**Policy Number:** OAI-OPS-006
**Effective Date:** January 1, 2026
**Last Revised:** April 1, 2026
**Policy Owner:** Chief Technology Officer / Managing Member
**Approved By:** Managing Member, Orchestrator AI LLC

---

## 1. Purpose

This AI Ethics and Governance Policy ("Policy") establishes the principles, standards, and procedures governing the responsible development, deployment, and use of artificial intelligence systems by Orchestrator AI LLC ("the Company"). As a company that builds and deploys AI-powered platforms for clients in the legal, financial, marketing, and technology sectors, the Company bears a heightened responsibility to ensure that its AI systems are trustworthy, transparent, fair, and aligned with the interests of clients and the public.

The Company operates three distinct AI-powered products — the OrchestratorAI platform (orchestratorai.io), Divinr.ai market prediction analytics (divinr.ai), and the AI Coding Course — each presenting unique ethical considerations. This Policy provides a unified governance framework while addressing the specific ethical requirements of each product.

This Policy is designed to:

(a) Establish responsible AI principles that guide all Company AI development and deployment decisions.

(b) Define governance structures for AI model selection, deployment, and monitoring.

(c) Ensure transparency with clients regarding AI capabilities, limitations, and risks.

(d) Prevent harm from biased, inaccurate, or misused AI outputs.

(e) Comply with emerging AI regulations and industry standards.

(f) Maintain client trust in an industry where AI outputs can have significant legal, financial, and business consequences.

---

## 2. Scope

This Policy applies to:

(a) **All AI systems** developed, deployed, operated, or used by the Company, including:
  - Large Language Model (LLM) integrations within the OrchestratorAI platform (OpenAI GPT models, Anthropic Claude, Google Gemini, Azure OpenAI, local inference models)
  - Agent workflows in Forge (LangGraph-based complex agents)
  - Composable agent pipelines in Compose (context, RAG, API, external, media runners)
  - Automated event-driven AI processing in Pulse
  - External A2A (agent-to-agent) communications through Bridge/Gatekeeper
  - Predictive models and algorithms in Divinr.ai
  - AI-assisted educational content in the AI Coding Course

(b) **All personnel** involved in AI development, deployment, configuration, or client-facing AI services.

(c) **All client deployments** of the OrchestratorAI platform, whether cloud-hosted, locally deployed on Company hardware, or locally deployed on client hardware.

(d) **All stages** of the AI lifecycle: design, development, testing, deployment, monitoring, and decommissioning.

---

## 3. Definitions

**AI System:** Any software system that uses machine learning models, large language models, natural language processing, predictive analytics, or other artificial intelligence techniques to process inputs and generate outputs.

**AI Model:** A trained machine learning model or large language model used within an AI System, including both third-party models (GPT-4, Claude, Gemini) and locally deployed models.

**Bias:** Systematic and unfair discrimination in AI outputs based on protected characteristics (race, gender, age, etc.) or other factors that produce unjust outcomes.

**Hallucination:** The generation of AI outputs that are factually incorrect, fabricated, or unsupported by the input data, presented with apparent confidence.

**Ground Truth:** Verified, factually accurate information against which AI outputs can be evaluated.

**Human-in-the-Loop (HITL):** A system design in which human review and approval are required before AI outputs are acted upon or delivered to end users.

**Sovereign Mode:** A deployment configuration in which all AI processing occurs on local hardware without data transmission to external providers, providing maximum data sovereignty.

**Responsible AI:** The practice of developing and deploying AI systems that are fair, transparent, accountable, safe, and aligned with human values and applicable laws.

**Model Card:** A standardized document describing an AI model's intended use, limitations, performance characteristics, training data, and known biases.

**Output Validation:** The process of reviewing, verifying, and potentially correcting AI outputs before they are delivered to clients or acted upon.

---

## 4. Responsible AI Principles

The Company adopts the following principles as the foundation of its AI ethics framework:

### 4.1 Principle 1: Transparency

(a) Clients shall be informed when AI systems are used to generate, process, or augment the services provided to them.

(b) AI-generated content shall be clearly identified as such. The Company shall not represent AI outputs as human-generated work without disclosure.

(c) The Company shall be transparent about the capabilities and limitations of its AI systems, avoiding overpromising or misrepresenting AI performance.

(d) Upon request, clients shall be provided with information about the AI models used in their service, including the model provider, general capability class, and known limitations relevant to the client's use case.

### 4.2 Principle 2: Fairness and Non-Discrimination

(a) AI systems shall be designed and configured to minimize bias and avoid discriminatory outputs based on protected characteristics.

(b) AI outputs that inform decisions affecting individuals (e.g., legal analysis, financial assessments) shall be reviewed for potential bias before delivery.

(c) The Company shall not deploy AI systems that systematically disadvantage individuals or groups based on protected characteristics.

(d) Where AI models exhibit known biases, the Company shall implement mitigation measures and disclose relevant limitations to clients.

### 4.3 Principle 3: Accountability

(a) Human beings, not AI systems, are ultimately responsible for decisions made using AI outputs. The Company shall ensure that AI is used as a tool to augment human judgment, not replace it for consequential decisions.

(b) Every AI operation within the OrchestratorAI platform is traceable through the ExecutionContext (orgSlug, userId, conversationId, agentSlug, agentType, provider, model), providing a complete audit trail.

(c) The Managing Member is accountable for the Company's AI governance framework and for ensuring compliance with this Policy.

(d) AI errors, failures, or harmful outputs shall be investigated, documented, and addressed. The Company shall not deflect responsibility for AI outputs by attributing them solely to third-party model providers.

### 4.4 Principle 4: Safety and Security

(a) AI systems shall be deployed with appropriate safeguards to prevent harmful outputs, including content filtering, output validation, and rate limiting.

(b) AI systems shall not be used to generate content that is illegal, harmful, threatening, abusive, defamatory, or violates the rights of others.

(c) Security controls shall prevent unauthorized access to AI systems, model configurations, and AI-generated data, consistent with the Data Privacy and Security Policy.

(d) The Company shall monitor AI systems for unexpected or potentially harmful behaviors and shall have mechanisms to rapidly disable or constrain AI systems when necessary.

### 4.5 Principle 5: Privacy and Data Minimization

(a) AI systems shall process only the minimum data necessary to accomplish the intended purpose.

(b) Client data used as input to AI models shall be handled in accordance with the Data Privacy and Security Policy and the Client Confidentiality Policy.

(c) Client data shall not be used to train or fine-tune AI models without the client's express written consent.

(d) Sovereign Mode shall be offered to clients who require that their data not be transmitted to external AI model providers.

### 4.6 Principle 6: Human Oversight

(a) For high-stakes AI applications (legal document analysis, financial predictions, agent workflows that execute actions), human review shall be required before AI outputs are finalized and delivered.

(b) The OrchestratorAI platform's Forge product supports Human-in-the-Loop (HITL) workflows through LangGraph interrupt points, enabling human review and approval at critical decision points.

(c) Automated Pulse workflows shall include appropriate human checkpoints for actions that could have significant consequences.

---

## 5. AI Model Selection and Governance

### 5.1 Model Selection Criteria

The selection of AI models for use within Company products and client deployments shall consider the following criteria:

(a) **Capability Fitness:** The model's demonstrated capability for the intended use case, including accuracy, language understanding, reasoning, and domain-specific performance.

(b) **Safety Profile:** The model provider's approach to safety, including content filtering, refusal behaviors, and alignment techniques.

(c) **Data Privacy:** The model provider's data handling practices, including whether input data is used for model training, retention policies, and compliance certifications (SOC 2, GDPR, etc.).

(d) **Bias and Fairness:** Available information about the model's known biases, the provider's bias mitigation efforts, and performance across diverse demographic groups.

(e) **Cost and Efficiency:** The model's cost per token/request and computational efficiency, balanced against performance requirements.

(f) **Availability and Reliability:** The model provider's SLA, uptime history, and redundancy provisions.

(g) **Licensing and Terms:** The model provider's terms of service, including restrictions on use cases, liability provisions, and data ownership.

### 5.2 Approved Model Providers

The following model providers are currently approved for use within Company products:

(a) **OpenAI** (GPT-4, GPT-4o, GPT-4o-mini, and successor models): General-purpose capabilities, coding, analysis.

(b) **Anthropic** (Claude 3.5 Sonnet, Claude 3 Opus, Claude Opus 4, and successor models): Analysis, writing, coding, safety-focused applications.

(c) **Google** (Gemini Pro, Gemini Ultra, and successor models via Vertex AI): Multimodal capabilities, analysis.

(d) **Azure OpenAI Service:** Enterprise-grade OpenAI model access with Azure compliance certifications.

(e) **Local Models** (via Mac Studio or DGX Spark): For Sovereign Mode deployments where data must not leave local infrastructure. Model selection for local inference shall prioritize models with appropriate licenses (Apache 2.0, MIT, or commercial licenses).

New model providers or models must be evaluated against the criteria in Section 5.1 and approved by the Managing Member before deployment.

### 5.3 Model Configuration Standards

(a) **Temperature and Sampling:** Model temperature and sampling parameters shall be configured appropriately for each use case:
  - Legal analysis: Low temperature (0.1-0.3) for consistency and accuracy
  - Creative content: Moderate temperature (0.5-0.8) for variety while maintaining quality
  - Code generation: Low temperature (0.1-0.2) for precision

(b) **System Prompts:** System prompts shall include:
  - Clear instructions about the AI's role and limitations
  - Prohibitions on generating harmful, illegal, or misleading content
  - Instructions to acknowledge uncertainty rather than fabricate answers
  - Domain-specific guardrails appropriate to the use case

(c) **Context Windows:** Input data shall be managed to stay within model context limits. Retrieval-Augmented Generation (RAG) through the Compose RAG runner shall be used to provide relevant context without exceeding limits.

(d) **Output Length:** Output length limits shall be configured to prevent excessive generation and control costs.

### 5.4 Model Change Management

(a) Changes to AI models used in production client services (model version upgrades, provider switches, configuration changes) shall be:
  - Tested in a development environment before production deployment
  - Evaluated for output quality compared to the previous model/configuration
  - Documented, including the reason for the change and test results
  - Communicated to affected clients if the change is material

(b) Emergency model changes (e.g., provider outage) may bypass full testing but must be documented and reviewed within forty-eight (48) hours.

---

## 6. Bias Monitoring and Mitigation

### 6.1 Bias Assessment

(a) The Company shall conduct periodic bias assessments of AI outputs across its products, with a focus on:
  - Legal analysis outputs: Review for bias based on party demographics, geographic region, or case type
  - Financial predictions (Divinr.ai): Review for systematic bias in sector, geographic, or market-cap predictions
  - Content generation: Review for stereotyping, underrepresentation, or discriminatory language

(b) Bias assessments shall be conducted:
  - Before deploying a new AI model or significant configuration change
  - Quarterly for actively deployed models
  - When a bias concern is reported by a client or team member

### 6.2 Bias Mitigation

(a) When bias is identified, the Company shall implement one or more of the following mitigation measures:
  - System prompt modifications to counteract identified biases
  - Post-processing filters to detect and flag potentially biased outputs
  - Model switching to an alternative model with better performance on the identified bias dimension
  - Human review requirements for outputs in the affected domain
  - Client notification of the identified bias and mitigation measures

(b) Bias mitigation actions shall be documented, including the bias identified, the mitigation implemented, and the effectiveness of the mitigation.

### 6.3 Bias Reporting

(a) All personnel are encouraged to report suspected AI bias through the channels described in the Whistleblower and Ethics Reporting Policy.

(b) Clients shall be provided with a mechanism to report perceived bias in AI outputs, and such reports shall be investigated promptly.

---

## 7. Output Validation

### 7.1 Validation Requirements

(a) **High-Stakes Outputs:** AI outputs that will be used for legal analysis, financial decision-making, regulatory compliance, or other high-stakes purposes shall be validated by a qualified human reviewer before delivery to the client.

(b) **Standard Outputs:** AI outputs for general business purposes (content drafting, code generation, data summarization) should be reviewed by the requesting user before being treated as final.

(c) **Automated Outputs (Pulse):** AI outputs generated by automated Pulse workflows shall include human checkpoints for any action that modifies data, sends communications, or triggers external system interactions.

### 7.2 Validation Procedures

(a) **Fact-Checking:** AI outputs containing factual claims (legal citations, financial data, technical specifications) shall be verified against authoritative sources.

(b) **Hallucination Detection:** Reviewers shall be trained to identify potential hallucinations, including fabricated citations, invented data points, and plausible-sounding but unverifiable claims.

(c) **Consistency Check:** AI outputs shall be reviewed for internal consistency and consistency with known facts and prior outputs on the same topic.

(d) **Appropriateness Review:** AI outputs shall be reviewed for inappropriate content, bias, or language that does not meet professional standards.

### 7.3 Validation Documentation

(a) For high-stakes outputs, the validation review shall be documented, including the reviewer's identity, date of review, and any modifications made.

(b) Validation records shall be retained as part of the client engagement file.

---

## 8. Client Disclosure Requirements

### 8.1 Pre-Engagement Disclosure

Before commencing AI-powered services for a new client, the Company shall disclose:

(a) That AI systems (including LLMs) are used in the delivery of services.

(b) The general nature of AI involvement (e.g., "AI-assisted document analysis," "AI-powered prediction analytics").

(c) The types of AI models used (e.g., "large language models from OpenAI and Anthropic," "locally deployed models for sovereign deployments").

(d) That AI outputs are reviewed by human professionals (where applicable).

(e) Known limitations of AI systems relevant to the client's use case.

(f) The client's option to request Sovereign Mode deployment (if applicable).

### 8.2 Ongoing Disclosure

(a) Material changes to AI models or AI processing methods used in a client's service shall be communicated to the client.

(b) If an AI system produces an output that is subsequently identified as materially inaccurate or harmful, the client shall be notified promptly.

(c) Clients shall be informed of any AI-related incidents that affect the confidentiality, integrity, or availability of their data.

### 8.3 Disclosure Format

(a) Pre-engagement disclosures shall be incorporated into the client's service agreement or provided as a separate AI disclosure addendum.

(b) Ongoing disclosures shall be provided in writing (email or platform notification).

---

## 9. Divinr.ai-Specific Governance

### 9.1 No Investment Advice

(a) **Absolute Prohibition:** Divinr.ai provides market prediction analytics for informational purposes only. Under no circumstances shall Divinr.ai outputs be represented, marketed, or delivered as investment advice, financial advice, trading recommendations, or any form of regulated financial guidance.

(b) **Disclaimer Requirements:** All Divinr.ai outputs shall include the following disclaimer (or substantially similar language):

> "This prediction is generated by artificial intelligence for informational purposes only. It does not constitute investment advice, financial advice, trading advice, or any other type of advice. Past predictions do not guarantee future results. You should conduct your own research and consult with a qualified financial professional before making any investment decisions. Orchestrator AI LLC is not registered as an investment adviser, broker-dealer, or financial planner."

(c) **Platform Integration:** The Divinr.ai platform shall display the disclaimer:
  - On the login/registration page
  - On every prediction output page
  - In the platform footer
  - In API responses (as a metadata field)

(d) **Marketing Compliance:** All marketing materials for Divinr.ai shall include the "not investment advice" disclaimer. Marketing claims about prediction accuracy shall be substantiated and shall include appropriate caveats about past performance.

### 9.2 Prediction Model Governance

(a) Prediction models used in Divinr.ai shall be:
  - Documented with model cards describing methodology, training data, performance metrics, and known limitations
  - Tested for systematic bias (e.g., geographic bias, sector bias, market-cap bias)
  - Monitored for prediction accuracy over time, with degradation triggers for model review

(b) Prediction outputs shall include confidence indicators where available.

(c) The Company shall not cherry-pick successful predictions for marketing purposes without disclosing overall prediction accuracy metrics.

### 9.3 Regulatory Awareness

(a) The Company shall monitor developments in financial AI regulation, including SEC guidance on AI in financial services, FINRA rules, and state-level financial technology regulations.

(b) If regulatory requirements emerge that are applicable to Divinr.ai, the Company shall promptly implement necessary compliance measures.

(c) The Company shall consult with legal counsel regarding any Divinr.ai activities that may approach regulated financial services boundaries.

---

## 10. Responsible AI in Legal Services

### 10.1 AI-Assisted Legal Analysis

(a) AI outputs used in connection with legal services (document analysis, legal research, contract review) shall be treated as drafts requiring human professional review.

(b) The Company shall not represent that AI-generated legal analysis constitutes legal advice or replaces the judgment of a licensed attorney.

(c) Legal AI outputs shall be reviewed for accuracy of legal citations, applicability of cited authorities to the specific jurisdiction and facts, and currency of the legal analysis.

### 10.2 Unauthorized Practice of Law

(a) The Company and its AI systems shall not engage in the unauthorized practice of law. AI outputs shall be clearly identified as technology-assisted analysis, not legal counsel.

(b) Client-facing legal AI features shall include appropriate disclaimers that the output does not constitute legal advice and that the client should consult with a licensed attorney.

---

## 11. AI Incident Response

### 11.1 AI-Specific Incidents

The following are considered AI-specific incidents requiring investigation:

(a) AI output that causes or could cause material harm to a client.

(b) Discovery of systematic bias in AI outputs.

(c) AI hallucination that leads to a factual error in a client deliverable.

(d) AI system behavior that violates this Policy or applicable law.

(e) Unauthorized use of AI systems for prohibited purposes.

(f) AI model provider security breach that may affect Company or client data.

### 11.2 Incident Response Procedure

(a) AI incidents shall be reported immediately to the Managing Member.

(b) The Managing Member shall assess the scope and severity of the incident.

(c) Affected AI systems may be temporarily disabled or constrained pending investigation.

(d) Affected clients shall be notified if the incident impacts the accuracy, reliability, or security of services provided to them.

(e) Root cause analysis shall be conducted and documented.

(f) Corrective actions shall be implemented and verified.

---

## 12. Governance Structure

### 12.1 AI Governance Responsibility

(a) The Managing Member serves as the Company's AI Governance Lead, responsible for:
  - Maintaining and enforcing this Policy
  - Approving new AI model deployments
  - Reviewing bias assessments and validation results
  - Responding to AI incidents
  - Staying informed of AI regulatory developments

(b) As the Company grows, the Managing Member may delegate specific governance responsibilities to qualified personnel or establish an AI Ethics Committee.

### 12.2 External Advisors

(a) The Company shall engage external expertise as needed for:
  - AI bias audits
  - Regulatory compliance assessments
  - AI safety evaluations
  - Legal review of AI-related disclosures and disclaimers

---

## 13. Compliance with Emerging AI Regulations

(a) The Company shall monitor and prepare for compliance with emerging AI regulations, including:
  - The EU AI Act (for any EEA-facing services)
  - US federal AI legislation and executive orders
  - State-level AI regulations (Colorado AI Act, and similar)
  - Industry-specific AI guidance from regulators (SEC, FTC, state bar associations)

(b) When new regulations are enacted that apply to the Company's AI systems, the Managing Member shall assess the impact and implement necessary changes within the compliance timeline.

(c) The Company shall maintain documentation sufficient to demonstrate compliance with applicable AI regulations.

---

## 14. Training and Awareness

(a) All personnel involved in AI development or deployment shall receive training on this Policy during onboarding.

(b) Annual refresher training shall cover AI ethics principles, bias awareness, output validation practices, and updates to AI regulations.

(c) Client-facing personnel shall be trained on AI disclosure requirements and the proper framing of AI capabilities and limitations.

---

## 15. Enforcement

Violations of this Policy may result in:

- **Minor violations** (e.g., failure to include a required disclaimer, incomplete validation documentation): Written guidance and corrective action.
- **Significant violations** (e.g., deploying an unapproved model, failing to disclose AI use to a client, inadequate bias mitigation): Written warning, mandatory retraining, enhanced oversight.
- **Severe violations** (e.g., representing AI outputs as investment advice, knowingly delivering harmful AI outputs, circumventing safety controls): Immediate termination of engagement, potential legal action, regulatory notification.

---

## 16. Related Policies

- Acceptable Use Policy (OAI-OPS-001)
- Data Privacy and Security Policy (OAI-OPS-002)
- Client Confidentiality Policy (OAI-ETH-001)
- Social Media and Public Communications Policy (OAI-ETH-003)
- Whistleblower and Ethics Reporting Policy (OAI-ETH-004)
- Anti-Discrimination and Harassment Policy (OAI-ETH-005)

---

## 17. Policy Review

This Policy shall be reviewed and updated at least semi-annually, given the rapidly evolving nature of AI technology and regulation. Additional reviews shall be triggered by:

(a) Deployment of a new AI model or provider.

(b) Enactment of new AI legislation or regulation applicable to the Company.

(c) An AI incident that reveals gaps in the current Policy.

(d) Material changes in the Company's AI product offerings.

---

**Governing Law:** This Policy shall be interpreted in accordance with the laws of the State of Florida, with additional compliance requirements under applicable AI regulations in all jurisdictions in which the Company operates or provides services.

**Orchestrator AI LLC**
A Florida Limited Liability Company
Operating in Minneapolis/St. Paul, Minnesota

*This policy is effective as of the date first written above and supersedes all prior AI ethics and governance policies of the Company.*
