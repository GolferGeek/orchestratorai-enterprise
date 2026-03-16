# Standalone Test Scripts

This directory contains standalone test scripts that can be run manually outside of the Jest test framework.

## Media Storage Provider Smoke Script

**File:** `smoke-media-storage-provider.ts`

Validates media storage provider wiring end-to-end for the active profile.

### Usage

```bash
# Azure profile
ENV_FILE=../../.env.azure WORK_PROVIDER=flow STORAGE_PROVIDER=azure_blob npm run smoke:media-storage

# Local Supabase profile
ENV_FILE=../../.env STORAGE_PROVIDER=supabase_storage npm run smoke:media-storage

# Local Supabase signed URL mode
ENV_FILE=../../.env STORAGE_PROVIDER=supabase_storage SUPABASE_STORAGE_USE_SIGNED_URLS=true SUPABASE_STORAGE_SIGNED_URL_TTL_SECONDS=900 npm run smoke:media-storage

# Azure SAS URL mode
ENV_FILE=../../.env.azure WORK_PROVIDER=flow STORAGE_PROVIDER=azure_blob AZURE_STORAGE_USE_SAS_URLS=true AZURE_STORAGE_SAS_TTL_SECONDS=900 npm run smoke:media-storage
```

### What It Tests

The script:

1. Boots Nest application context
2. Resolves `MEDIA_STORAGE_PROVIDER`
3. Stores a smoke asset (`storeGeneratedMedia`)
4. Deletes the same asset (`deleteAsset`)
5. Exits non-zero on failure

### Notes

- For local Supabase profile, ensure bucket `media` exists.
- Script uses `ts-node` with path alias registration.

## Media Bucket Bootstrap Script

**File:** `ensure-media-bucket.ts`

Ensures the local Supabase media bucket exists (idempotent).

### Usage

```bash
ENV_FILE=../../.env npm run bootstrap:media-bucket
```

### What It Does

1. Loads env profile (`ENV_FILE` or root `.env`)
2. Connects using `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
3. Creates bucket `MEDIA_STORAGE_BUCKET` (default `media`) if missing
4. Exits successfully if bucket already exists

## Database Provider Pilot Smoke Script

**File:** `smoke-database-provider-pilot.ts`

Validates runtime resolution for the Phase 4 `DatabaseProvider` pilot.

### Usage

```bash
# Local baseline provider
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run smoke:data-pilot-db-provider

# Enterprise SQL Server provider
ENV_FILE=../../.env.azure DB_PROVIDER=sqlserver npm run smoke:data-pilot-db-provider
```

### What It Tests

1. Boots Nest application context
2. Resolves `DATABASE_PROVIDER`
3. Executes a safe identity-link lookup (`findIdentityLinkUserId`) with smoke values
4. Verifies response shape (`string | null`)
5. Exits non-zero on failure

## Work Task Sink Smoke Script

**File:** `smoke-work-task-sink.ts`

Validates runtime resolution and execution for `WORK_TASK_SINK` providers.

### Usage

```bash
# Local flow provider
ENV_FILE=../../.env WORK_PROVIDER=flow DB_PROVIDER=supabase_pg npm run smoke:work-task-sink

# Local flow provider (skip comment when no channel mapping is available)
ENV_FILE=../../.env WORK_PROVIDER=flow DB_PROVIDER=supabase_pg SMOKE_SKIP_COMMENT=true npm run smoke:work-task-sink

# Slack provider (requires Slack env keys and default team/channel ids)
ENV_FILE=../../.env.azure WORK_PROVIDER=slack DB_PROVIDER=supabase_pg npm run smoke:work-task-sink

# ADO provider (requires ADO env keys)
ENV_FILE=../../.env.azure WORK_PROVIDER=ado DB_PROVIDER=supabase_pg npm run smoke:work-task-sink
```

### What It Tests

1. Boots Nest application context
2. Resolves `WORK_TASK_SINK`
3. Creates a task (`createTask`)
4. Updates task status (`updateTaskStatus`)
5. Adds a comment (`addTaskComment`)
6. Exits non-zero on failure

Set `SMOKE_SKIP_COMMENT=true` to skip step 5 for providers/environments where comment routing requires a mapped external channel.

For `WORK_PROVIDER=flow`, `FLOW_DEFAULT_TEAM_ID` must be set.

## ADO Environment Precheck Script

**File:** `smoke-ado-env.ts`

Performs a fast profile check for required ADO keys before running ADO runtime smoke.

### Usage

```bash
ENV_FILE=../../.env.azure npm run smoke:ado-env
```

### What It Tests

1. Loads env profile (`ENV_FILE` or root `.env`)
2. Validates required ADO keys are present:
   - `ADO_ORG_URL`
   - `ADO_PROJECT`
   - `ADO_PAT`
   - `ADO_WORK_ITEM_TYPE`
3. Detects common placeholder-style values
4. Prints masked values (`ADO_PAT` masked)
5. Exits non-zero if any key is missing/placeholder

## Slack Environment Precheck Script

**File:** `smoke-slack-env.ts`

Performs a fast profile check for required Slack work-plane keys before
running Slack runtime smoke.

### Usage

```bash
ENV_FILE=../../.env.azure npm run smoke:slack-env
```

### What It Tests

1. Loads env profile (`ENV_FILE` or root `.env`)
2. Validates required Slack keys are present:
   - `FLOW_DEFAULT_TEAM_ID`
   - `SLACK_DEFAULT_CHANNEL_ID`
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
3. Detects common placeholder-style values
4. Prints masked values (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` masked)
5. Exits non-zero if any key is missing/placeholder

## SQL Server Pilot Schema Bootstrap Script

**File:** `bootstrap-sqlserver-pilot-schema.ts`

Creates/validates minimal SQL Server pilot schemas and tables used by
`SqlServerDatabaseProviderService`.

### Usage

```bash
ENV_FILE=../../.env.azure npm run bootstrap:sqlserver-pilot-schema
```

### What It Does

1. Connects to SQL Server using `SQLSERVER_*` variables
2. Ensures schema/table `authz.identity_links` exists
3. Ensures schema/table `orch_flow.shared_tasks` exists
4. Ensures index `IX_orch_flow_shared_tasks_external_provider_id` exists
5. Exits non-zero on failure

## Work Routing Matrix Smoke Script

**File:** `smoke-work-routing-matrix.ts`

Runs the full Phase 5 routing matrix in one command.

### Usage

```bash
npm run smoke:work-routing-matrix
```

### What It Tests

1. Flow provider smoke (`WORK_PROVIDER=flow`, baseline `.env`)
2. Slack env precheck + Slack provider smoke (`.env.azure`)
3. ADO env precheck + ADO provider smoke (`.env.azure`)
4. Exits non-zero on first failing step

## SQL Server Dual-Path Verification Script

**File:** `smoke-sqlserver-dual-path.ts`

Runs the same SQL Server bootstrap + verification contract for local and Azure profiles.

### Usage

```bash
SQLSERVER_LOCAL_ENV_FILE=../../.env.sqlserver.local \
SQLSERVER_AZURE_ENV_FILE=../../.env.azure \
npm run smoke:sqlserver-dual-path
```

### What It Tests

1. Local SQL profile bootstrap (`bootstrap:sqlserver-pilot-schema`)
2. Local SQL init verification (`init:verify`)
3. Local SQL schema portability verification (`init:verify-schema`)
4. Azure SQL profile bootstrap (`bootstrap:sqlserver-pilot-schema`)
5. Azure SQL init verification (`init:verify`)
6. Azure SQL schema portability verification (`init:verify-schema`)

## Seed Manifest Validation Script

**File:** `validate-seed-manifest.ts`

Validates the Phase 9 seed manifest shape before bootstrap/verification.

### Usage

```bash
npm run init:validate-manifest
```

### What It Tests

1. Loads `../../scripts/init/seed-manifest.json` (or `MANIFEST_PATH`)
2. Validates provider entries, checks, and required slugs shape
3. Exits non-zero on malformed manifest

## Init Data Verification Script

**File:** `verify-init-data.ts`

Performs profile-aware verification against required seed baselines.

### Usage

```bash
# Local baseline profile
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run init:verify

# Enterprise SQL Server profile
ENV_FILE=../../.env.azure DB_PROVIDER=sqlserver npm run init:verify
```

### What It Tests

1. Loads env profile (`ENV_FILE` or root `.env`)
2. Loads seed manifest (`MANIFEST_PATH` or `../../scripts/init/seed-manifest.json`)
3. Runs provider-specific table minimum-count checks
4. Verifies required agent slugs for providers that define them
5. Exits non-zero with actionable error output on any mismatch

## Schema Portability Verification Script

**File:** `verify-schema-portability.ts`

Checks provider-specific required table presence using the Phase 8 schema portability contract.

### Usage

```bash
# Local Supabase profile
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run init:verify-schema

# Enterprise SQL Server profile
ENV_FILE=../../.env.azure DB_PROVIDER=sqlserver npm run init:verify-schema
```

### What It Tests

1. Loads schema manifest (`SCHEMA_MANIFEST_PATH` or `../../scripts/init/schema-portability-manifest.json`)
2. Validates required `schema.table` presence for the active provider
3. Fails fast and lists missing tables

## Unified Seed Bootstrap Script

**File:** `unified-seed.sh`

Runs provider-aware bootstrap + verification in one command.

### Usage

```bash
# Supabase full reset + verify
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run init:bootstrap

# SQL Server schema bootstrap + verify
ENV_FILE=../../.env.azure DB_PROVIDER=sqlserver npm run init:bootstrap

# Verify only
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run init:bootstrap -- --verify-only

# Dry run
ENV_FILE=../../.env DB_PROVIDER=supabase_pg npm run init:bootstrap -- --dry-run
```

### What It Does

1. Requires explicit `DB_PROVIDER`
2. `supabase_pg`: runs `supabase db reset` (unless `--skip-reset`)
3. `sqlserver`: runs `npm run bootstrap:sqlserver-pilot-schema`
4. Runs `npm run init:verify`

## User Management Test Script

**File:** `test-user-management.ts`

A comprehensive standalone test for user management functionality.

### Usage

```bash
ADMIN_PASSWORD=your-password ts-node scripts/test-user-management.ts
```

Or with custom API URL:

```bash
API_BASE_URL=http://localhost:6100 ADMIN_PASSWORD=your-password ts-node scripts/test-user-management.ts
```

### What It Tests

The script performs a complete user lifecycle test:

1. **Authentication** - Logs in as admin user
2. **Create User** - Creates a test user with:
   - Email: `golfer@orchestratorai.io`
   - Password: `Golfer123!`
   - Display Name: `Golfer`
   - Role: `member`
   - Organization: `demo-org`
   - Email Confirmation: `false`
3. **Change Role** - Assigns `admin` role to the user
4. **Delete User** - Removes the test user
5. **Verify Deletion** - Confirms user no longer exists

### Environment Variables

- `ADMIN_EMAIL` (optional): Admin email (default: golfergeek@orchestratorai.io)
- `ADMIN_PASSWORD` (required): Admin password for authentication
- `API_BASE_URL` (optional): API base URL (default: http://localhost:6100)

### Output

The script provides detailed console output showing each step:

```
═══════════════════════════════════════════════════════
   User Management E2E Test
═══════════════════════════════════════════════════════
API Base URL: http://localhost:6100

🔐 Step 1: Authenticating as admin...
✅ Authentication successful
   Admin: golfergeek@orchestratorai.io

📝 Step 2: Creating test user...
✅ User created successfully
   ID: abc-123-def
   Email: golfer@orchestratorai.io
   Display Name: Golfer
   Roles: member
   Organizations: demo-org
   Email Confirmation Required: false

🔄 Step 3: Changing user role...
   Fetching current roles...
   Current roles: Member
   Assigning "admin" role...
✅ Role changed successfully
   New roles: Member, Admin

🗑️  Step 4: Deleting test user...
✅ User deleted successfully
   Message: User deleted successfully
   Verifying deletion...
✅ User deletion verified (user not found)

═══════════════════════════════════════════════════════
✅ All tests passed successfully!
═══════════════════════════════════════════════════════
```

### When to Use

Use this script when:
- You want to manually verify user management functionality
- You need to debug issues with user creation/deletion
- You want to test against a specific environment
- You need a quick smoke test before deployment

### Comparison with E2E Tests

| Feature | Standalone Script | E2E Tests |
|---------|------------------|-----------|
| Framework | None (raw TypeScript) | Jest |
| CI Integration | No | Yes |
| Assertions | Basic error handling | Comprehensive expect() |
| Output | Console logs | Test reporter |
| Coverage | Not tracked | Tracked |
| Speed | Fast | Slower (test framework overhead) |
| Use Case | Manual testing, debugging | Automated regression testing |

### Error Handling

The script includes comprehensive error handling:
- Network errors are caught and displayed with details
- Cleanup runs automatically on failure
- Exit codes: 0 for success, 1 for failure

### Cleanup

The script automatically cleans up after itself:
- If any step fails, the cleanup function runs
- The test user is deleted if it was created
- No manual cleanup needed

## Test Users Cleanup Script

**File:** `cleanup-test-users.ts`

A utility script to find and delete all test users from both `auth.users` and `public.users` tables.

### Usage

```bash
ts-node scripts/cleanup-test-users.ts
```

Or with custom API URL:

```bash
API_BASE_URL=http://localhost:6100 ts-node scripts/cleanup-test-users.ts
```

**Note:** The script automatically loads `SUPABASE_TEST_USER` and `SUPABASE_TEST_PASSWORD` from your root `.env` file. If these are not set, it will fall back to `ADMIN_PASSWORD`.

### What It Does

The script:
1. Authenticates as admin user
2. Fetches all users from all organizations
3. Identifies test users by email patterns:
   - `test-*@orchestratorai.io`
   - `*-test@orchestratorai.io`
   - `test*@orchestratorai.io`
   - `golfer@orchestratorai.io`
   - `duplicate-test@orchestratorai.io`
   - `weak-password@orchestratorai.io`
4. Deletes each test user using the admin API endpoint
5. Provides a summary of deleted users

### Environment Variables

- `SUPABASE_TEST_USER` (preferred): Test user email from root `.env` file
- `SUPABASE_TEST_PASSWORD` (preferred): Test user password from root `.env` file
- `ADMIN_PASSWORD` (fallback): Admin password if test user credentials are not available
- `API_BASE_URL` (optional): API base URL (default: http://localhost:6100)

The script automatically loads environment variables from the root `.env` file.

### Output

The script provides detailed console output:

```
═══════════════════════════════════════════════════════
   Test Users Cleanup Script
═══════════════════════════════════════════════════════
API Base URL: http://localhost:6100

🔐 Authenticating as admin...
✅ Authentication successful

📋 Fetching all users...
✅ Found 15 total users

🔍 Found 3 test user(s) to delete:

   - golfer@orchestratorai.io (abc-123-def)
   - test-golfer-1234567890@orchestratorai.io (xyz-789-ghi)
   - duplicate-test@orchestratorai.io (def-456-jkl)

🗑️  Deleting golfer@orchestratorai.io...
   ✅ Deleted successfully

🗑️  Deleting test-golfer-1234567890@orchestratorai.io...
   ✅ Deleted successfully

🗑️  Deleting duplicate-test@orchestratorai.io...
   ✅ Deleted successfully

═══════════════════════════════════════════════════════
   Cleanup Summary
═══════════════════════════════════════════════════════
Total test users found: 3
Successfully deleted: 3
Failed: 0
═══════════════════════════════════════════════════════
```

### When to Use

Use this script when:
- You need to clean up test users after running tests
- You want to remove orphaned test users from the database
- You need to clean up users that exist in `public.users` but not `auth.users` (or vice versa)
- You're preparing a clean database for testing

### Important Notes

- The script uses the admin API endpoint which properly deletes from both `auth.users` and `public.users`
- Users are deleted in the correct order (auth.users first, then public.users via cascade)
- The script will skip users that are already deleted (404 errors are treated as success)
- Make sure you have admin permissions before running this script

### Example Error Output

```
❌ User creation failed
   Status: 403
   Message: Request failed with status code 403
   Response: {
     "statusCode": 403,
     "message": "Permission denied: admin:users"
   }

═══════════════════════════════════════════════════════
❌ Test failed
═══════════════════════════════════════════════════════

🧹 Cleanup: Ensuring test user is deleted...
✅ User already deleted
```
