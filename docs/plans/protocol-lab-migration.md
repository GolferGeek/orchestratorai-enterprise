# Protocol Lab Migration Plan

**Date:** 2026-03-19
**Status:** In Progress

## Summary

Migrating `orchestrator-ai-dev/apps/agent-communication/` into `orchestratorai-enterprise/apps/protocol-lab/` as a self-contained product. The playground is a working proof of every protocol claim Bridge makes: 12-layer protocol stack, 31+ providers, 4 industry standards, real payment rails, 11 fishbowl scenarios.

## Port Mapping

| Service | Old | New | Role |
|---------|-----|-----|------|
| Frontend Dashboard | 4010 | 6400 | Main observability UI |
| Protocol API | 4000 | 6402 | Central orchestration hub |
| ResearchHub | 4001 | 6403 | Research agent |
| MarketPulse | 4002 | 6404 | Market signals agent |
| ContentForge | 4003 | 6405 | Content generation agent |
| AgentConsumer | 4006 | 6406 | Consumer demo agent |
| SunStream App | 4007 | 6407 | Farm Credit fishbowl |
| Ascentek App | 4008 | 6408 | Manufacturing fishbowl |
| SunStream Frontend | 4017 | 6409 | Farm Credit UI |
| Ascentek Frontend | 4018 | 6410 | Manufacturing UI |

## Steps

1. `cp -r` agent-communication → apps/protocol-lab/ (done)
2. Remap ports 4xxx → 64xx
3. Wire into root package.json scripts
4. Clean Bridge: remove duplicate apps/ and packages/
5. Delete apps/landing/ (port 6400 freed)
6. Update CLAUDE.md and port tables
