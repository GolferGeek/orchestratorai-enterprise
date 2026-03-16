#!/bin/bash

# Start Development Supabase on port 6010
echo "Starting Development Supabase on port 6010..."

# Navigate to API directory
cd "$(dirname "$0")"

# Backup existing config if it exists
if [ -f "supabase/config.toml" ]; then
    cp supabase/config.toml supabase/config.toml.backup
fi

# Use development config
cp supabase/config.dev.toml supabase/config.toml

# Start Supabase
supabase start

# Restore original config
if [ -f "supabase/config.toml.backup" ]; then
    mv supabase/config.toml.backup supabase/config.toml
fi

echo "Development Supabase started on:"
echo "  API: http://127.0.0.1:6010"
echo "  Database: postgres://postgres:postgres@127.0.0.1:6012/postgres"
echo "  Studio: http://127.0.0.1:6015"