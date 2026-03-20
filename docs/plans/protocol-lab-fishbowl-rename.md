# Protocol Lab Fishbowl Rename Plan

**Date:** 2026-03-19
**Status:** Ready to Execute

## Why

The fishbowl scenarios use real company names (SunStream, Ascentek, FCS Financial, AgriBank, Lube-Tech) that cannot be shown in investor demos or public contexts. Replacing with fictional but industry-appropriate names.

## Name Mapping

### Farm Credit Fishbowl

| Role | Old Name | New Name | Directory | Code ID | Display |
|------|----------|----------|-----------|---------|---------|
| Association | SunStream | Prairie Ridge Credit | `prairie-ridge` | `PrairieRidge` | "Prairie Ridge Credit" |
| Financial Services | FCS Financial | AgriServ Financial | `agriserv` | `Agriserv` | "AgriServ Financial" |
| Regulatory Bank | AgriBank | Central Farm Bank | `central-farm-bank` | `CentralFarmBank` | "Central Farm Bank" |

### Manufacturing Fishbowl

| Role | Old Name | New Name | Directory | Code ID | Display |
|------|----------|----------|-----------|---------|---------|
| Manufacturer | Ascentek | BuildWell Manufacturing | `buildwell` | `Buildwell` | "BuildWell Manufacturing" |
| Supplier | Lube-Tech | AlloyTech Supply | `alloytech` | `Alloytech` | "AlloyTech Supply" |
| OEM Partner | OEM Partner | Apex OEM | `apex-oem` | `ApexOem` | "Apex OEM" |

## Scope: ~3,064 references across ~100 files

## Execution Steps

### Phase 1: Directory Renames
1. `apps/sunstream-app/` → `apps/prairie-ridge-app/`
2. `apps/ascentek-app/` → `apps/buildwell-app/`
3. Internal subdirectories (src/, data/) renamed after top-level move

### Phase 2: File Renames
- All `sunstream.*` → `prairie-ridge.*`
- All `fcs-financial.*` → `agriserv.*`
- All `agribank.*` → `central-farm-bank.*`
- All `ascentek.*` → `buildwell.*`
- All `lube-tech.*` → `alloytech.*`
- All `oem-partner.*` → `apex-oem.*`

### Phase 3: Content Renames (find-and-replace across all .ts, .vue, .json, .md, .yml)
- All code identifiers (PascalCase, camelCase, kebab-case, UPPER_CASE)
- All display strings
- All import paths
- All documentation references

### Phase 4: Config Updates
- package.json names and scripts
- docker-compose.yml service names
- Root package.json script names
- vite.config.ts proxy targets
- jest config paths
- dev-servers.sh references

### Phase 5: Verify
- Build shared packages
- Build all NestJS services
- Start all 10 Protocol Lab services
- Frontend loads without errors
