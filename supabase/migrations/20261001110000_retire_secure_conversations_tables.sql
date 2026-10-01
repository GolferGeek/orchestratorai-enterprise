-- Retire the Secure Conversations A2A backend's tables. The old
-- secure-conversations receiver, sender, registry and nonce replay check were
-- removed from the API on 2026-10-01; the Gatehouse (gatehouse schema) is the
-- A2A v1.0 boundary that replaces them. None of these tables ever held a row on
-- the Studio, and no code or view reads them.
--
-- The ambient tables are dropped without CASCADE so an unexpected dependency
-- fails the migration loudly. Their indexes, constraints and the
-- service_role_all_a2a_inbound_nonces policy go with them.
--
-- The guardhouse schema (a2a_messages, external_agents, nonces_seen) is an
-- orphan that no code or view references; it is dropped with CASCADE to take
-- its tables and indexes.
BEGIN;

DROP TABLE ambient.a2a_inbound_nonces;
DROP TABLE ambient.a2a_messages;
DROP TABLE ambient.external_agents;

DROP SCHEMA guardhouse CASCADE;

COMMIT;
