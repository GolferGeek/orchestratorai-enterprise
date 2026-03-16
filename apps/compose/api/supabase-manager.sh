#!/bin/bash

# Supabase Instance Manager
# Usage: ./supabase-manager.sh [dev|prod|stop|status]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to API directory
cd "$(dirname "$0")"

function check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

function start_dev() {
    echo -e "${BLUE}🚀 Starting Development Supabase on port 6010...${NC}"

    # Check if already running
    if check_port 6010; then
        echo -e "${YELLOW}⚠️  Development Supabase already running on port 6010${NC}"
        return 0
    fi

    # Stop any running instance
    supabase stop 2>/dev/null || true

    # Use dev config
    cp supabase/config.dev.toml supabase/config.toml

    # Start with dev project ID
    SUPABASE_PROJECT_ID=api-dev supabase start

    echo -e "${GREEN}✅ Development Supabase started:${NC}"
    echo -e "  API: http://127.0.0.1:6010"
    echo -e "  Database: postgres://postgres:postgres@127.0.0.1:6012/postgres"
    echo -e "  Studio: http://127.0.0.1:6015"
}

function start_prod() {
    echo -e "${BLUE}🚀 Starting Production Supabase on port 9010...${NC}"

    # Check if already running
    if check_port 9010; then
        echo -e "${YELLOW}⚠️  Production Supabase already running on port 9010${NC}"
        return 0
    fi

    # Stop any running instance
    supabase stop 2>/dev/null || true

    # Use production config
    cp supabase/config.production.toml supabase/config.toml

    # Start with production project ID
    SUPABASE_PROJECT_ID=api-production supabase start

    echo -e "${GREEN}✅ Production Supabase started:${NC}"
    echo -e "  API: http://127.0.0.1:9010"
    echo -e "  Database: postgres://postgres:postgres@127.0.0.1:9012/postgres"
    echo -e "  Studio: http://127.0.0.1:9015"
}

function stop_all() {
    echo -e "${RED}🛑 Stopping all Supabase instances...${NC}"
    supabase stop 2>/dev/null || true
    echo -e "${GREEN}✅ All Supabase instances stopped${NC}"
}

function show_status() {
    echo -e "${BLUE}📊 Supabase Status:${NC}"
    echo ""

    if check_port 6010; then
        echo -e "${GREEN}✅ Development (port 6010): Running${NC}"
        echo -e "   API: http://127.0.0.1:6010"
        echo -e "   Studio: http://127.0.0.1:6015"
    else
        echo -e "${YELLOW}⚠️  Development (port 6010): Not running${NC}"
    fi

    echo ""

    if check_port 9010; then
        echo -e "${GREEN}✅ Production (port 9010): Running${NC}"
        echo -e "   API: http://127.0.0.1:9010"
        echo -e "   Studio: http://127.0.0.1:9015"
    else
        echo -e "${YELLOW}⚠️  Production (port 9010): Not running${NC}"
    fi

    echo ""
    echo -e "${BLUE}Docker containers:${NC}"
    docker ps --filter "name=supabase" --format "table {{.Names}}\t{{.Ports}}" | head -5
}

# Main script logic
case "$1" in
    dev)
        start_dev
        ;;
    prod)
        start_prod
        ;;
    stop)
        stop_all
        ;;
    status)
        show_status
        ;;
    *)
        echo "Usage: $0 {dev|prod|stop|status}"
        echo ""
        echo "  dev    - Start development Supabase on port 6010"
        echo "  prod   - Start production Supabase on port 9010"
        echo "  stop   - Stop all Supabase instances"
        echo "  status - Show status of all instances"
        exit 1
        ;;
esac