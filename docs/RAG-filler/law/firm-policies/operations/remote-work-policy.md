# Remote Work and Home Office Policy

**Policy Number:** OAI-OPS-004
**Effective Date:** January 1, 2026
**Last Revised:** April 1, 2026
**Policy Owner:** Managing Member
**Approved By:** Managing Member, Orchestrator AI LLC

---

## 1. Purpose

This Remote Work and Home Office Policy ("Policy") establishes the standards, requirements, and expectations governing remote work arrangements for all personnel of Orchestrator AI LLC ("the Company"). As a technology company that operates primarily from a home office in Minneapolis/St. Paul, Minnesota, with all personnel working as independent contractors (1099) or interns, the Company embraces remote work as its standard operating model. However, the sensitive nature of client data processed through the OrchestratorAI platform and Divinr.ai requires that remote work environments meet rigorous security and professionalism standards.

This Policy ensures that all remote work arrangements maintain the same level of data security, client confidentiality, and professional service delivery that would be expected in a traditional office environment, while providing the flexibility inherent in the Company's distributed operating model.

---

## 2. Scope

This Policy applies to:

- **All personnel:** The Managing Member, all independent contractors (1099), interns (including Ethan and future interns), and any third-party consultants performing work for the Company.
- **All work locations:** Home offices, co-working spaces, client premises, and any other location from which Company work is performed.
- **All devices:** Company-owned equipment, personal devices used for Company work (under BYOD provisions), and client-provided equipment.

---

## 3. Definitions

**Primary Work Location:** The principal location from which an individual regularly performs work for the Company. For the Managing Member, this is the home office in Minneapolis/St. Paul, Minnesota.

**Remote Work Location:** Any location other than the Company's primary facility from which authorized work is performed.

**Home Office:** A dedicated workspace within a residential dwelling used for performing Company work.

**BYOD (Bring Your Own Device):** The practice of personnel using personally-owned devices (laptops, tablets, phones) for Company work.

**Secure Connection:** A network connection that employs encryption and authentication to protect data in transit, specifically Tailscale VPN, corporate VPN, or equivalent WireGuard-based connection.

---

## 4. Remote Work Eligibility and Arrangements

### 4.1 Eligibility

(a) All Company personnel are eligible for remote work, as the Company operates on a remote-first model.

(b) Certain activities may require on-site presence at the Company's home office or a client's premises, including:
  - Physical hardware maintenance on the Mac Studio or DGX Spark
  - Client demonstrations requiring specialized local hardware
  - Equipment provisioning and configuration
  - Incident response requiring physical access to infrastructure

(c) Interns may be required to attend periodic in-person sessions for training, mentoring, and collaboration, as determined by the Managing Member.

### 4.2 Work Schedule and Availability

(a) Independent contractors set their own work schedules, consistent with their Independent Contractor Agreements and project deadlines.

(b) Interns shall maintain agreed-upon schedules as specified in their internship agreements.

(c) All personnel shall be available during core collaboration hours of 10:00 AM to 3:00 PM Central Time for real-time communication when project needs require it, unless an alternative arrangement has been agreed upon with the Managing Member.

(d) Personnel shall communicate their general availability and any extended unavailability in advance through agreed-upon communication channels.

### 4.3 Performance Expectations

(a) Remote work does not alter performance expectations, deliverable quality, or deadlines.

(b) Work product shall be delivered through established channels (GitHub, project management tools, Company communication platforms).

(c) Regular check-ins shall be maintained at a frequency determined by the Managing Member and appropriate to the engagement.

---

## 5. Equipment and Technology Requirements

### 5.1 Company-Provided Equipment

(a) The Company may, at its discretion, provide equipment to contractors and interns for use in performing Company work. Any Company-provided equipment remains the property of the Company.

(b) Company-provided equipment shall be used exclusively for authorized Company business.

(c) Company-provided equipment shall be returned within five (5) business days of the termination of the engagement.

### 5.2 Personal Equipment (BYOD)

(a) Personnel using personal devices for Company work shall ensure that such devices meet the following minimum security standards:

  - **Operating System:** Current or immediately prior major version of macOS, Windows, or Linux, with automatic security updates enabled.
  - **Disk Encryption:** Full-disk encryption enabled (FileVault on macOS, BitLocker on Windows, LUKS on Linux).
  - **Screen Lock:** Automatic screen lock after five (5) minutes of inactivity, protected by a strong password or biometric authentication.
  - **Antivirus/Endpoint Protection:** Current endpoint protection software installed and updated (macOS built-in protections are acceptable for macOS devices; Windows requires third-party or Windows Defender with current definitions).
  - **Firewall:** Host-based firewall enabled.
  - **Backup:** Local backup mechanism enabled (Time Machine on macOS or equivalent).

(b) Personnel are responsible for maintaining their personal devices in compliance with these standards.

(c) The Company reserves the right to verify BYOD compliance with these security standards as a condition of continued access to Company systems.

### 5.3 Required Software and Services

All personnel performing remote work shall have the following installed and configured:

(a) **Tailscale:** For secure VPN access to Company infrastructure. Tailscale shall be running and connected whenever accessing Company systems. Tailscale provides WireGuard-based end-to-end encryption for all inter-node traffic.

(b) **Git and GitHub Access:** For version control and code collaboration. Two-factor authentication must be enabled on GitHub accounts.

(c) **Node.js v20+:** For local development and testing of OrchestratorAI platform services.

(d) **Docker Desktop:** For containerized development and testing environments.

(e) **Approved Communication Tools:** Video conferencing (Zoom, Google Meet, or equivalent), messaging (Slack or equivalent), and email.

(f) **Password Manager:** A reputable password manager (1Password, Bitwarden, or equivalent) for managing credentials. Reuse of passwords across services is prohibited.

---

## 6. Security Standards for Remote Work

### 6.1 Network Security

(a) **Secure Connection Required:** All access to Company systems, including the OrchestratorAI platform, GitHub repositories, and internal communication tools, shall occur over the Tailscale VPN or an equivalent encrypted connection.

(b) **Public Wi-Fi:** Access to Company systems over public Wi-Fi networks (coffee shops, airports, hotels) is permitted only when connected through Tailscale. Direct access to Company systems without VPN on public Wi-Fi is strictly prohibited.

(c) **Home Network Security:**
  - Home Wi-Fi networks shall use WPA3 or WPA2 encryption with a strong, unique password.
  - Default router administrative passwords shall be changed from factory defaults.
  - Router firmware shall be kept current.
  - Guest network separation is recommended where available.

(d) **Network Segmentation:** Where feasible, personnel should place work devices on a separate network segment (VLAN or guest network isolation) from IoT devices and personal entertainment devices.

### 6.2 Physical Security

(a) **Dedicated Workspace:** Personnel handling client data should maintain a workspace that provides visual and auditory privacy from household members, visitors, and other non-authorized individuals.

(b) **Screen Privacy:** When working in shared spaces or locations where others may view the screen, a privacy screen filter shall be used on laptops and monitors.

(c) **Clean Desk:** When stepping away from the workspace, screens shall be locked and sensitive documents (physical or visible on-screen) shall be secured.

(d) **Device Security:** Laptops shall not be left unattended in vehicles, public spaces, or unlocked areas. When traveling, devices shall be kept in carry-on luggage, not checked baggage.

(e) **Printed Materials:** Printing of client data or confidential Company information at home should be minimized. Any printed materials containing sensitive information shall be shredded when no longer needed.

### 6.3 Client Data Handling

(a) Client data shall not be stored on personal devices beyond what is necessary for active work. Upon completion of a task, client data should be removed from personal devices.

(b) Client data shall not be stored in personal cloud storage (personal Google Drive, iCloud, Dropbox, etc.). All client data shall reside on Company systems (Supabase databases, Company GitHub repositories).

(c) Screen sharing during video calls shall be conducted with care to ensure that only the intended content is visible. Notifications from other applications should be disabled during screen sharing sessions.

(d) Client calls and video meetings shall be conducted in a private space where conversations cannot be overheard by unauthorized individuals.

---

## 7. Client Meeting Protocols

### 7.1 Video Conferencing

(a) All client video meetings shall be conducted using approved, enterprise-grade video conferencing platforms (Zoom, Google Meet, Microsoft Teams).

(b) Meeting invitations shall include the appropriate confidentiality notice.

(c) Recording of client meetings is permitted only with the express consent of all participants.

(d) Virtual backgrounds or blurred backgrounds should be used when the physical background is unprofessional or reveals personal information.

(e) Personnel shall present a professional appearance during video calls with clients, consistent with the client's expectations and the nature of the engagement.

### 7.2 In-Person Client Meetings

(a) In-person client meetings shall be conducted at the client's premises, a professional meeting space (co-working space conference room, hotel business center), or a mutually agreed neutral location. Client meetings shall not be conducted at the Managing Member's home office unless the client specifically requests and agrees to this arrangement.

(b) Client demonstrations involving the OrchestratorAI platform may be conducted remotely via screen share, or on-site at the client's premises using a portable device configured with the demo environment.

(c) Travel to client sites shall comply with any client-specific security or access requirements.

### 7.3 Communication Professionalism

(a) All client-facing communications (email, messaging, video calls) shall maintain the Company's professional standards regardless of the sender's location.

(b) Response times to client communications shall meet the standards established in the applicable service agreement, regardless of work location.

---

## 8. Intern-Specific Provisions

### 8.1 Intern Remote Work

(a) Interns (including Ethan and future interns from the University of St. Thomas or other institutions) may work remotely subject to the same security requirements as contractors.

(b) Intern remote work arrangements shall be documented in the internship agreement.

(c) Interns shall participate in regular check-in meetings with the Managing Member (minimum weekly) via video conferencing.

### 8.2 Intern Equipment

(a) Interns using personal devices for Company work shall meet all BYOD security requirements specified in Section 5.2.

(b) The Company may provide equipment to interns at its discretion. Any Company-provided equipment shall be returned upon completion of the internship.

### 8.3 Intern Access

(a) Intern access to Company systems shall be limited to the minimum necessary for their assigned responsibilities, consistent with the principle of least privilege.

(b) Interns shall not be granted access to production systems or production client data without specific approval from the Managing Member.

(c) Intern access shall be automatically revoked upon the conclusion of the internship period.

---

## 9. Ergonomics and Wellness

(a) The Company encourages all remote personnel to maintain an ergonomic workspace, including:
  - A dedicated desk and ergonomic chair
  - Monitor(s) at appropriate height
  - Adequate lighting
  - Appropriate keyboard and pointing device positioning

(b) Personnel are encouraged to take regular breaks in accordance with ergonomic best practices.

(c) The Company is not responsible for providing ergonomic equipment to independent contractors or interns, but may recommend resources and best practices.

---

## 10. Expense Reimbursement

(a) Independent contractors are generally responsible for their own equipment, internet service, and home office expenses, as reflected in their contractor compensation rates.

(b) The Company may reimburse specific pre-approved expenses related to remote work, including:
  - Required software licenses not provided by the Company
  - Pre-approved travel to client sites or Company events
  - Specific hardware or equipment required for a particular engagement, if pre-approved in writing

(c) All reimbursable expenses must be pre-approved by the Managing Member and documented with receipts.

---

## 11. Compliance and Enforcement

### 11.1 Compliance Verification

(a) The Managing Member may request verification of compliance with this Policy's security requirements at any time.

(b) Personnel who cannot demonstrate compliance with security requirements may have their remote access suspended until compliance is achieved.

### 11.2 Violation Consequences

Violations of this Policy shall be addressed under the enforcement framework established in the Acceptable Use Policy:

- **Minor violations** (e.g., failure to lock screen, non-compliance with meeting protocols): Verbal or written warning.
- **Significant violations** (e.g., accessing Company systems without VPN, improper client data storage): Written warning, potential access suspension.
- **Severe violations** (e.g., client data breach resulting from security negligence): Termination of engagement.

---

## 12. Related Policies

- Acceptable Use Policy (OAI-OPS-001)
- Data Privacy and Security Policy (OAI-OPS-002)
- Client Confidentiality Policy (OAI-ETH-001)
- Contractor Onboarding Policy (OAI-OPS-005)
- Social Media and Public Communications Policy (OAI-ETH-003)

---

## 13. Policy Review

This Policy shall be reviewed and updated annually, or more frequently as necessitated by changes in the Company's operating model, remote work technologies, or applicable regulations.

---

**Governing Law:** This Policy shall be interpreted in accordance with the laws of the State of Florida, with operational requirements additionally governed by Minnesota state law as applicable.

**Orchestrator AI LLC**
A Florida Limited Liability Company
Operating in Minneapolis/St. Paul, Minnesota

*This policy is effective as of the date first written above and supersedes all prior remote work policies of the Company.*
