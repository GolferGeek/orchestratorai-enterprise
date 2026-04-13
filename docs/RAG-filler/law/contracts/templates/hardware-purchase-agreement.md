# Hardware Purchase Agreement

**ORCHESTRATOR AI LLC**

---

## AI INFERENCE HARDWARE PROCUREMENT AGREEMENT

**Effective Date:** [DATE]

**Agreement Number:** OAI-HW-[YEAR]-[###]

---

THIS AI INFERENCE HARDWARE PROCUREMENT AGREEMENT (this "Agreement") is entered into as of the Effective Date set forth above by and between:

**Orchestrator AI LLC**, a Florida limited liability company with its principal place of business at Minneapolis/St. Paul, Minnesota ("Vendor"), and

**[CLIENT FULL LEGAL NAME]**, a [STATE] [ENTITY TYPE] with its principal place of business at [ADDRESS] ("Purchaser").

Vendor and Purchaser are each referred to herein as a "Party" and collectively as the "Parties."

---

## RECITALS

WHEREAS, Vendor provides AI platform deployment services and has expertise in specifying, procuring, and configuring hardware for local AI inference workloads;

WHEREAS, Purchaser desires to acquire hardware suitable for deploying the OrchestratorAI platform and running AI inference workloads locally at Purchaser's facilities;

WHEREAS, Vendor is willing to procure, configure, and deliver such hardware on the terms and conditions set forth herein;

NOW, THEREFORE, in consideration of the mutual covenants herein, the Parties agree as follows:

---

## SECTION 1. DEFINITIONS

1.1. **"Acceptance"** means Purchaser's written confirmation that the Hardware meets the Acceptance Criteria, as described in Section 5.

1.2. **"Acceptance Criteria"** means the functional and performance specifications that the Hardware must satisfy, as set forth in the Hardware Specification Schedule (Exhibit A).

1.3. **"Configuration Services"** means the installation of operating systems, drivers, AI frameworks, the OrchestratorAI platform, and initial setup and optimization performed by Vendor on the Hardware prior to or upon delivery.

1.4. **"Delivery Date"** means the date specified in the Hardware Specification Schedule by which Vendor shall deliver the Hardware to Purchaser.

1.5. **"Hardware"** means the computer hardware, components, peripherals, and associated equipment specified in the Hardware Specification Schedule.

1.6. **"Installation Services"** means the physical setup, network integration, and deployment of the Hardware at Purchaser's designated location.

1.7. **"Manufacturer"** means the original equipment manufacturer of the Hardware components (e.g., Apple Inc., NVIDIA Corporation, Dell Technologies, or other applicable manufacturers).

1.8. **"Manufacturer Warranty"** means the standard warranty provided by the Manufacturer for the Hardware, as described in Section 7.

1.9. **"Purchase Price"** means the total price for the Hardware, Configuration Services, and Installation Services, as specified in the Pricing Schedule (Exhibit B).

---

## SECTION 2. HARDWARE SPECIFICATIONS

2.1. **Specification Process.** Vendor shall work with Purchaser to determine the appropriate hardware specifications based on Purchaser's AI workload requirements, including: (a) expected model sizes and inference loads; (b) number of concurrent users and agents; (c) data storage requirements; (d) network architecture; and (e) physical space, power, and cooling constraints.

2.2. **Standard Configurations.** Vendor offers the following standard hardware configurations for OrchestratorAI deployments:

**Configuration A: Boutique Deployment (Small Firms)**
| Component | Specification |
|-----------|---------------|
| Platform | Apple Mac Studio |
| Chip | Apple M4 Ultra |
| Unified Memory | 192 GB |
| Storage | 4 TB SSD |
| Networking | 10 Gigabit Ethernet |
| Use Case | Up to 20 agents, 10 concurrent users |
| Estimated Price | $6,000 - $8,000 |

**Configuration B: Professional Deployment (Mid-Size)**
| Component | Specification |
|-----------|---------------|
| Platform | Apple Mac Studio (x2, clustered) |
| Chip | Apple M4 Ultra (each) |
| Unified Memory | 192 GB (each) |
| Storage | 8 TB SSD (total) |
| Networking | 10 Gigabit Ethernet |
| Use Case | Up to 100 agents, 50 concurrent users |
| Estimated Price | $14,000 - $18,000 |

**Configuration C: Enterprise GPU Deployment**
| Component | Specification |
|-----------|---------------|
| Platform | NVIDIA DGX Station A100 or equivalent |
| GPU | 4x NVIDIA A100 80GB |
| CPU | AMD EPYC 7742 (or equivalent) |
| System Memory | 512 GB DDR4 ECC |
| Storage | 15.36 TB NVMe SSD |
| Networking | Dual 100 Gigabit Ethernet |
| Use Case | Unlimited agents, enterprise-scale inference |
| Estimated Price | $120,000 - $200,000 |

**Configuration D: Enterprise Multi-Node Cluster**
| Component | Specification |
|-----------|---------------|
| Platform | NVIDIA DGX H100 Pod (or equivalent) |
| GPU | 8x NVIDIA H100 80GB per node |
| Nodes | 2-8 nodes |
| Networking | NVIDIA InfiniBand HDR |
| Use Case | Large-scale training and inference |
| Estimated Price | $300,000 - $1,500,000+ |

2.3. **Custom Configurations.** Purchaser may request custom hardware configurations. Vendor shall provide a detailed specification proposal and quotation within ten (10) business days of receiving Purchaser's requirements.

2.4. **Hardware Specification Schedule.** The specific Hardware to be procured shall be detailed in the Hardware Specification Schedule (Exhibit A), which shall include: (a) complete component specifications; (b) quantities; (c) Manufacturer part numbers; (d) compatibility certifications; and (e) Acceptance Criteria.

---

## SECTION 3. PROCUREMENT AND DELIVERY

3.1. **Procurement.** Vendor shall procure the Hardware from authorized Manufacturer channels or authorized resellers. All Hardware shall be new, unused, and genuine Manufacturer products.

3.2. **Lead Times.** Vendor shall provide estimated lead times in the Hardware Specification Schedule. Typical lead times are:

| Configuration | Estimated Lead Time |
|---------------|---------------------|
| Configuration A (Mac Studio) | 2-4 weeks |
| Configuration B (Mac Studio Cluster) | 3-5 weeks |
| Configuration C (NVIDIA DGX Station) | 6-12 weeks |
| Configuration D (DGX Pod) | 12-24 weeks |

Lead times are estimates and may vary based on Manufacturer availability. Vendor shall promptly notify Purchaser of any material delays.

3.3. **Shipping.** Hardware shall be shipped to Purchaser's designated location via insured carrier. Vendor shall select the carrier and method appropriate for the Hardware value and fragility. Title and risk of loss pass to Purchaser upon delivery to Purchaser's designated location (DAP Incoterms 2020).

3.4. **Delivery Inspection.** Purchaser shall inspect the Hardware upon delivery for visible damage or missing components and notify Vendor within three (3) business days of any discrepancies.

---

## SECTION 4. CONFIGURATION AND INSTALLATION SERVICES

4.1. **Configuration Services.** Unless Purchaser opts out in writing, Vendor shall perform the following Configuration Services on the Hardware prior to delivery or on-site:

(a) Installation and configuration of the operating system;
(b) Installation of required drivers, frameworks, and dependencies (CUDA, PyTorch, etc.);
(c) Installation and initial configuration of the OrchestratorAI platform;
(d) Security hardening per Vendor's standard security baseline;
(e) Performance benchmarking and optimization;
(f) Network configuration and testing; and
(g) Documentation of all configurations and credentials.

4.2. **Installation Services.** If Purchaser selects on-site Installation Services, Vendor shall:

(a) Physically install and rack the Hardware (for rack-mounted configurations);
(b) Connect the Hardware to Purchaser's network infrastructure;
(c) Verify network connectivity and performance;
(d) Conduct final system testing;
(e) Provide on-site training for Purchaser's IT staff (up to four hours); and
(f) Document the installation, including network diagrams and configuration details.

4.3. **Site Requirements.** Purchaser is responsible for ensuring that the installation site meets the following requirements: (a) adequate electrical power and circuits; (b) appropriate cooling and ventilation; (c) physical security (locked room or cage); (d) network infrastructure (switches, cabling, firewall); and (e) UPS or backup power (recommended).

4.4. **Remote Configuration.** For remote Configuration Services, Vendor shall coordinate with Purchaser's IT team via video conference and remote access tools. Purchaser shall provide secure remote access as needed.

---

## SECTION 5. ACCEPTANCE

5.1. **Acceptance Testing.** Upon completion of Configuration and Installation Services, Vendor shall conduct acceptance testing to verify that the Hardware meets the Acceptance Criteria specified in the Hardware Specification Schedule. Acceptance testing shall include:

(a) Hardware diagnostic tests (memory, storage, GPU, networking);
(b) OrchestratorAI platform startup and connectivity verification;
(c) AI inference benchmark (model loading, inference latency, throughput);
(d) Stress testing under simulated production load; and
(e) Security scan and verification.

5.2. **Acceptance Period.** Purchaser shall have ten (10) business days from completion of acceptance testing to review the results and either accept or reject the Hardware. If Purchaser does not provide written notice of rejection within the Acceptance Period, the Hardware shall be deemed accepted.

5.3. **Rejection.** If Purchaser rejects the Hardware, Purchaser shall provide a detailed written description of the deficiencies. Vendor shall have fifteen (15) business days to cure the deficiencies and re-submit for acceptance testing. If the Hardware fails acceptance testing a second time, Purchaser may: (a) grant Vendor an additional cure period; or (b) terminate this Agreement and receive a full refund of the Purchase Price.

---

## SECTION 6. PRICING AND PAYMENT

6.1. **Purchase Price.** The Purchase Price for the Hardware, Configuration Services, and Installation Services shall be as specified in the Pricing Schedule (Exhibit B).

6.2. **Payment Schedule.** Unless otherwise specified in the Pricing Schedule:

| Milestone | Percentage | Due |
|-----------|------------|-----|
| Upon execution of this Agreement | 50% | Net 15 days |
| Upon delivery of Hardware | 25% | Net 15 days |
| Upon Acceptance | 25% | Net 15 days |

6.3. **Vendor Markup.** The Purchase Price includes Vendor's procurement markup, which shall not exceed fifteen percent (15%) above the Manufacturer's list price for Hardware components. Vendor shall provide itemized pricing upon Purchaser's request.

6.4. **Taxes.** The Purchase Price is exclusive of applicable sales, use, and excise taxes. Purchaser shall pay all applicable taxes.

6.5. **Price Changes.** If Manufacturer pricing changes after execution of this Agreement but before procurement, Vendor shall notify Purchaser. If the price increase exceeds five percent (5%), Purchaser may cancel the order for affected items without penalty.

---

## SECTION 7. WARRANTY

7.1. **Manufacturer Warranty Passthrough.** Vendor shall pass through to Purchaser all Manufacturer warranties applicable to the Hardware. Vendor shall assist Purchaser in registering warranties and shall provide copies of all warranty documentation.

7.2. **Standard Manufacturer Warranties:**

| Manufacturer | Standard Warranty |
|--------------|-------------------|
| Apple Inc. | 1 year limited hardware warranty |
| NVIDIA Corporation | 3 years on DGX systems |
| Dell Technologies | 3 years ProSupport (standard) |

7.3. **Extended Warranty.** Purchaser may purchase extended warranty coverage directly from the Manufacturer or through Vendor. Extended warranty options and pricing shall be detailed in the Pricing Schedule.

7.4. **Vendor Configuration Warranty.** Vendor warrants that the Configuration Services will be performed in a professional and workmanlike manner and that the configured system will meet the Acceptance Criteria for a period of ninety (90) days following Acceptance. If a configuration issue arises during this period, Vendor shall remedy the issue at no additional charge.

7.5. **Warranty Exclusions.** Warranties do not cover: (a) damage caused by misuse, neglect, or unauthorized modifications; (b) damage caused by environmental factors (power surges, flooding, excessive heat); (c) consumable items; or (d) normal wear and tear.

7.6. **WARRANTY DISCLAIMER.** EXCEPT FOR THE WARRANTIES EXPRESSLY SET FORTH IN THIS SECTION 7, VENDOR MAKES NO WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. VENDOR IS NOT THE MANUFACTURER AND DOES NOT INDEPENDENTLY WARRANT THE HARDWARE.

---

## SECTION 8. LIMITATION OF LIABILITY

8.1. IN NO EVENT SHALL VENDOR BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.

8.2. VENDOR'S AGGREGATE LIABILITY SHALL NOT EXCEED THE TOTAL PURCHASE PRICE PAID BY PURCHASER UNDER THIS AGREEMENT.

8.3. The limitations in this Section 8 do not apply to Vendor's indemnification obligations or claims arising from Vendor's gross negligence or willful misconduct.

---

## SECTION 9. INTELLECTUAL PROPERTY

9.1. **Hardware Ownership.** Upon full payment and Acceptance, Purchaser shall own the Hardware free and clear of any liens or encumbrances.

9.2. **Software Licenses.** All software installed on the Hardware is licensed, not sold. Purchaser shall comply with all applicable software license terms, including: (a) the OrchestratorAI Platform License Agreement (executed separately); (b) operating system licenses; and (c) third-party framework licenses.

9.3. **Configuration IP.** Vendor retains ownership of its configuration methodologies, scripts, and templates. Vendor grants Purchaser a non-exclusive license to use the specific configuration applied to Purchaser's Hardware.

---

## SECTION 10. TERM AND TERMINATION

10.1. **Term.** This Agreement commences on the Effective Date and continues until all obligations have been fulfilled, including delivery, Acceptance, and payment.

10.2. **Termination for Convenience.** Purchaser may terminate this Agreement prior to procurement of Hardware upon written notice and payment of a cancellation fee equal to ten percent (10%) of the Purchase Price (or actual costs incurred by Vendor, whichever is greater). If Hardware has already been procured, Purchaser may terminate upon payment of the full Purchase Price for Hardware already ordered.

10.3. **Termination for Cause.** Either Party may terminate upon material breach that remains uncured for thirty (30) days after written notice.

10.4. **Effect of Termination.** Upon termination, Vendor shall deliver all Hardware procured to date (if purchased by Purchaser) and refund any prepayments for undelivered Hardware and unperformed services.

---

## SECTION 11. GENERAL PROVISIONS

11.1. **Governing Law.** This Agreement shall be governed by the laws of the State of Florida.

11.2. **Dispute Resolution.** Disputes resolved through negotiation, mediation, then arbitration in Hennepin County, Minnesota.

11.3. **Entire Agreement.** This Agreement and Exhibits constitute the entire agreement.

11.4. **Amendment.** Written amendment signed by both Parties required.

11.5. **Notices.** Written, effective upon receipt.

11.6. **Severability.** Invalid provisions severed.

11.7. **Counterparts.** May be executed in counterparts.

11.8. **Force Majeure.** Neither Party liable for delays beyond reasonable control, including semiconductor shortages and supply chain disruptions.

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

**PURCHASER: [CLIENT NAME]**

| | |
|---|---|
| Signature: | ______________________________ |
| Name: | [AUTHORIZED SIGNATORY] |
| Title: | [TITLE] |
| Date: | ______________________________ |

---

## EXHIBIT A: HARDWARE SPECIFICATION SCHEDULE

**Selected Configuration:** [ ] A [ ] B [ ] C [ ] D [ ] Custom

| Component | Specification | Qty | Manufacturer P/N |
|-----------|---------------|-----|------------------|
| | | | |
| | | | |
| | | | |

**Acceptance Criteria:**
1. All hardware diagnostics pass without errors
2. OrchestratorAI platform starts and serves requests within [X] seconds
3. AI inference benchmark: [model] completes in under [X] ms per request
4. System sustains [X] concurrent requests at [X]% GPU utilization for 30 minutes
5. Network throughput exceeds [X] Gbps

**Estimated Delivery Date:** [DATE]

---

## EXHIBIT B: PRICING SCHEDULE

| Line Item | Amount |
|-----------|--------|
| Hardware (see Exhibit A) | $[AMOUNT] |
| Configuration Services | $[AMOUNT] |
| Installation Services (if applicable) | $[AMOUNT] |
| Extended Warranty (if applicable) | $[AMOUNT] |
| Shipping and Insurance | $[AMOUNT] |
| **Total Purchase Price** | **$[AMOUNT]** |

**Payment Schedule:**
| Milestone | Amount | Due Date |
|-----------|--------|----------|
| Deposit (50%) | $[AMOUNT] | [DATE] |
| Delivery (25%) | $[AMOUNT] | Upon delivery |
| Acceptance (25%) | $[AMOUNT] | Upon acceptance |

---

*This document is a template provided for informational purposes. Orchestrator AI LLC recommends that all parties seek independent legal counsel before executing any agreement. Hardware specifications and pricing are subject to Manufacturer availability and pricing at time of procurement.*
