# DD Room: Access Controls

## What

Restrict visibility of a Due Diligence Room to an explicit list of users within the owning org. By default a DD room is visible to anyone in the org with `agents:execute`; this effort introduces an **opt-in per-room allow-list** so sensitive deals (earn-outs, adverse litigation, distressed targets) are not visible across the firm.

Scope: reads (list, detail, risk-matrix, report) AND derived work products (deal memos generated from the room). If a user can't see the parent DD room, they must also not see its deal memos.

## Why

Everything inside a DD room — the target company, the deal structure, the 10-K findings, the deal breakers, the cap-table analysis — is confidential by deal team. Partners on deal A shouldn't see deal B by default.

Today the org-scope check treats all DD rooms as equally visible to org members with the right role. That's fine for a small firm but breaks for a firm running multiple concurrent deals where different associates are assigned to different deal teams.

A firm needs:
1. When creating a DD room, optionally restrict access to a named deal team.
2. Members not on the deal team cannot list, view, or derive from the room.
3. The deal room owner (creator) and org admins can always see the room (for succession / oversight).
4. Access changes are auditable.

Without this, we cannot credibly pitch the DD Room to a firm with more than one deal at a time.

## Shape

### Backend
- **`agent_jobs` table**: optional JSON column `access_control` with shape:
  ```json
  {
    "mode": "open" | "allowlist",
    "allowedUserIds": ["user-uuid-1", "user-uuid-2"]
  }
  ```
  Default `mode: "open"` for backward compatibility.
- **Repository `findByIdForOrg` + `listForOrg`** gain an `allowedForUserId` filter argument. When the caller's userId is not in `allowedUserIds` (and they are not the job creator or org admin), the repository returns null / excludes the row. This is a single point of enforcement — all endpoints that read DD state (`:id`, `:id/risk-matrix`, `:id/report`, `:id/document-index`, `:id/reasoning`, `:id/events`, `:id/file`) go through it.
- **Deal memos** inherit from parent: reading `:memoId` where `parent_job_id` is restricted requires the same userId check against the parent's allow-list.
- **`generate-deal-memo` endpoint**: checks parent access before minting a new memo job.
- **Intake payload**: `CreateDDRoomModal` can pass `accessControl` in the multipart form. When omitted, server writes `mode: "open"`.
- **Update endpoint**: `PATCH /legal-department/jobs/:id/access-control` (owner or admin) to change allow-list mid-deal (adding a new associate, removing someone who rolled off). Writes an observability event for audit.

### Frontend
- **CreateDDRoomModal**: new collapsed section "Access Control (optional)" with a toggle (open vs restricted) and a user picker (pulls from org members). When restricted is toggled on, creator is auto-added and cannot be removed from the UI.
- **DueDiligenceRoomView**: subtle badge ("Restricted" lock icon) shown when `mode === 'allowlist'` — signals confidentiality. Owner / admin sees a "Manage access" button that opens a modal listing current users + add/remove controls.
- **JobActivityList**: DD rooms the viewer cannot access never appear (filtered server-side). No visible breakage.
- **DealMemosPanel**: if the deal memo's parent DD is inaccessible to the viewer, the memo row is also hidden.

### Out of scope (deliberately)
- **Cross-org access** — this is within-org only. Sharing with outside counsel or external deal parties is a separate concern (A2A / external party invites).
- **Document-level ACLs** — a user either sees the whole room or none of it.
- **Time-bound access** (e.g., "access expires after close"). Not needed for v1.
- **Role-to-allowlist mapping** — we don't support "all partners see all distressed deals" rules. Allow-lists are explicit userId lists.

## Constraints

- Reuses the existing `agent_jobs` table + `law.agent_jobs` repository rather than a new schema. One table to read, one place to enforce.
- Creator + org admin are ALWAYS in the effective allow-list regardless of what's stored. This prevents lockout (a departing associate who created a room can't lock it from the firm).
- All existing rooms (pre-migration) behave as `mode: "open"` — no default restriction, no regression.
- Access denials return 404, never 403 — we don't leak the existence of a restricted room to a user who can't see it. (Same posture the repository already uses for cross-org denial.)
- Observability: every access-control change (create with allow-list, PATCH to allow-list) emits a dedicated event with the old/new lists + actor userId, so the audit trail is complete.
