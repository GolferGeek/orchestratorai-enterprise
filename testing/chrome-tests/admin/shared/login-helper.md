# Login Helper

Shared login steps for all admin Chrome tests.

## Prerequisites
- Admin web running on http://localhost:6101
- Auth API running on http://localhost:6100

## Login Steps
1. Navigate to http://localhost:6101/login
2. Enter email: golfergeek@orchestratorai.io
3. Enter password: GolferGeek123!
4. Click Sign In
5. Verify redirect to /app/admin/organizations
6. Verify no console errors
