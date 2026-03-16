#!/bin/bash

# Start Production Supabase on port 9010
echo "Starting Production Supabase on port 9010..."

# Navigate to API directory
cd "$(dirname "$0")"

# Backup existing config if it exists
if [ -f "supabase/config.toml" ]; then
    cp supabase/config.toml supabase/config.toml.backup
fi

# Use production config
cp supabase/config.production.toml supabase/config.toml

# Start Supabase
supabase start

# Restore original config
if [ -f "supabase/config.toml.backup" ]; then
    mv supabase/config.toml.backup supabase/config.toml
fi

echo "Production Supabase started on:"
echo "  API: http://127.0.0.1:9010"
echo "  Database: postgres://postgres:postgres@127.0.0.1:9012/postgres"
echo "  Studio: http://127.0.0.1:9015"