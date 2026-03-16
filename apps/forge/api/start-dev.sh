#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

LANGGRAPH_STARTED_BY_SCRIPT=false
OPENCLAW_STARTED_BY_SCRIPT=false
API_PORT=${API_PORT:-6100}
# Remember API directory so we can cd back before starting Nest (start_langgraph leaves CWD in apps/langgraph)
API_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${BLUE}🚀 Starting OrchAI NestJS API${NC}"

# Kill any existing stale nest/api processes for this project
cleanup_stale_processes() {
    local found_any=false

    # Kill nest start processes
    local nest_pids=$(pgrep -f "nest start" 2>/dev/null)
    if [ -n "$nest_pids" ]; then
        echo -e "${YELLOW}🧹 Cleaning up stale NestJS watcher processes...${NC}"
        echo "$nest_pids" | xargs kill -9 2>/dev/null || true
        found_any=true
    fi

    # Kill any running api/dist/main processes
    local main_pids=$(pgrep -f "apps/api/dist/main" 2>/dev/null)
    if [ -n "$main_pids" ]; then
        echo -e "${YELLOW}🧹 Cleaning up stale API main processes...${NC}"
        echo "$main_pids" | xargs kill -9 2>/dev/null || true
        found_any=true
    fi

    # Also check if our API port is in use and kill that process
    local port_pid=$(lsof -ti:${API_PORT} 2>/dev/null)
    if [ -n "$port_pid" ]; then
        echo -e "${YELLOW}🧹 Clearing port ${API_PORT}...${NC}"
        echo "$port_pid" | xargs kill -9 2>/dev/null || true
        found_any=true
    fi

    if [ "$found_any" = true ]; then
        sleep 2
        echo -e "${GREEN}✅ Stale processes cleaned up${NC}"
    fi
}

cleanup_stale_processes

# Load environment variables from project root
if [ -f "../../.env" ]; then
    echo -e "${BLUE}📄 Loading base environment from .env...${NC}"
    set -a
    source ../../.env
    set +a
    echo -e "${GREEN}✅ Base environment loaded${NC}"
else
    echo -e "${RED}⚠️  No .env file found in project root${NC}"
fi

# Load profile overlay if ENV_PROFILE is set (e.g. ENV_PROFILE=azure)
if [ -n "$ENV_PROFILE" ] && [ -f "../../.env.${ENV_PROFILE}" ]; then
    echo -e "${BLUE}📄 Loading profile overlay: .env.${ENV_PROFILE}${NC}"
    set -a
    source "../../.env.${ENV_PROFILE}"
    set +a
    echo -e "${GREEN}✅ Profile overlay loaded (${ENV_PROFILE})${NC}"
elif [ -n "$ENV_PROFILE" ]; then
    echo -e "${RED}⚠️  Profile requested but ../../.env.${ENV_PROFILE} not found${NC}"
fi

# Check Docker daemon status
echo -e "${BLUE}🐳 Checking Docker daemon status...${NC}"

# Function to check if Docker daemon is running
check_docker() {
    # Try docker command first, then fall back to full path on macOS
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        return 0
    elif /Applications/Docker.app/Contents/Resources/bin/docker info >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Function to start Docker Desktop (macOS)
start_docker_desktop() {
    echo -e "${BLUE}🚀 Starting Docker Desktop...${NC}"
    
    # Try to start Docker Desktop
    if command -v open >/dev/null 2>&1; then
        open -a Docker
        echo -e "${BLUE}⏳ Waiting for Docker Desktop to start (this may take 30-60 seconds)...${NC}"
        
        # Wait for Docker to start (max 2 minutes)
        local count=0
        local max_attempts=24  # 24 * 5 seconds = 2 minutes
        while [ $count -lt $max_attempts ]; do
            if check_docker; then
                echo -e "${GREEN}✅ Docker Desktop started successfully${NC}"
                return 0
            fi
            echo -e "${BLUE}   Waiting... ($((count + 1))/$max_attempts)${NC}"
            sleep 5
            count=$((count + 1))
        done
        
        echo -e "${RED}❌ Docker Desktop failed to start within 2 minutes${NC}"
        echo -e "${BLUE}💡 Please start Docker Desktop manually and try again${NC}"
        return 1
    else
        echo -e "${RED}❌ Cannot start Docker Desktop automatically on this system${NC}"
        echo -e "${BLUE}💡 Please start Docker Desktop manually and try again${NC}"
        return 1
    fi
}

# Check if Docker is running
if check_docker; then
    echo -e "${GREEN}✅ Docker daemon is running${NC}"
else
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    echo -e "${BLUE}🔧 Attempting to start Docker Desktop...${NC}"
    
    if start_docker_desktop; then
        echo -e "${GREEN}✅ Docker is now ready${NC}"
    else
        echo -e "${RED}❌ Failed to start Docker Desktop${NC}"
        echo -e "${BLUE}💡 Please start Docker Desktop manually and run this script again${NC}"
        echo -e "${BLUE}   Docker Desktop is required for Supabase local development${NC}"
        exit 1
    fi
fi

# Check and start local Supabase
echo -e "${BLUE}🗄️  Checking local Supabase status (Development - Port ${SUPABASE_API_PORT:-6010})...${NC}"

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

is_langgraph_running() {
    if check_port ${LANGGRAPH_PORT:-6200}; then
        return 0
    else
        return 1
    fi
}

start_langgraph() {
    if is_langgraph_running; then
        echo -e "${GREEN}✅ LangGraph server already running on port ${LANGGRAPH_PORT:-6200}${NC}"
        return 0
    fi

    if [ ! -d "../langgraph" ]; then
        echo -e "${YELLOW}⚠️  LangGraph app directory not found at ../langgraph${NC}"
        return 1
    fi

    echo -e "${BLUE}🔄 Starting LangGraph workflow server...${NC}"

    # Build LangGraph first (from its directory)
    cd ../langgraph
    if [ ! -d "node_modules" ]; then
        echo -e "${BLUE}📦 Installing LangGraph dependencies...${NC}"
        npm install >/dev/null 2>&1
    fi
    echo -e "${BLUE}📦 Building LangGraph...${NC}"
    npm run build >/dev/null 2>&1
    cd - > /dev/null

    # Run from monorepo root to properly resolve hoisted dependencies (e.g., opencascade.js)
    cd ../..
    node apps/langgraph/dist/main.js > /tmp/langgraph.log 2>&1 &
    LANGGRAPH_PID=$!
    cd - > /dev/null

    # Wait for it to start
    local count=0
    local max_attempts=10
    while [ $count -lt $max_attempts ]; do
        if check_port ${LANGGRAPH_PORT:-6200}; then
            echo -e "${GREEN}✅ LangGraph server running at http://localhost:${LANGGRAPH_PORT:-6200}${NC}"
            LANGGRAPH_STARTED_BY_SCRIPT=true
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done

    echo -e "${RED}❌ Failed to start LangGraph server${NC}"
    echo -e "${BLUE}💡 Check logs: tail -f /tmp/langgraph.log${NC}"
    return 1
}

is_openclaw_running() {
    if check_port ${OPENCLAW_PORT:-6300}; then
        return 0
    else
        return 1
    fi
}

start_openclaw() {
    if is_openclaw_running; then
        echo -e "${GREEN}✅ OpenClaw gateway already running on port ${OPENCLAW_PORT:-6300}${NC}"
        return 0
    fi

    if ! command -v openclaw &> /dev/null; then
        echo -e "${YELLOW}⚠️  OpenClaw not installed (npm install -g openclaw@latest)${NC}"
        return 1
    fi

    if [ ! -f "../openclaw/openclaw.json" ]; then
        echo -e "${YELLOW}⚠️  OpenClaw config not found at ../openclaw/openclaw.json${NC}"
        return 1
    fi

    echo -e "${BLUE}🦞 Starting OpenClaw gateway...${NC}"

    # Resolve env vars in workspace files (OpenClaw doesn't template-substitute them)
    local openclaw_dir="$(cd ../openclaw && pwd)"
    local generated_dir="$openclaw_dir/.workspace-generated"
    local envsubst_vars='${PUBLIC_API_URL} ${OPENCLAW_API_KEY} ${OPENCLAW_ORG_SLUG} ${OPENCLAW_USER_ID}'

    rm -rf "$generated_dir"
    mkdir -p "$generated_dir"
    cp -r "$openclaw_dir/workspace/"* "$generated_dir/"
    find "$generated_dir" -name '*.md' -exec sh -c '
      envsubst "$1" < "$2" > "$2.tmp" && mv "$2.tmp" "$2"
    ' _ "$envsubst_vars" {} \;

    # Launch from openclaw dir
    (cd "$openclaw_dir" && OPENCLAW_WORKSPACE="$generated_dir" \
      OPENCLAW_CONFIG_PATH="$openclaw_dir/openclaw.json" \
      openclaw gateway --port "${OPENCLAW_PORT:-6300}") > /tmp/openclaw.log 2>&1 &
    OPENCLAW_PID=$!

    # Wait for it to start
    local count=0
    local max_attempts=10
    while [ $count -lt $max_attempts ]; do
        if check_port ${OPENCLAW_PORT:-6300}; then
            echo -e "${GREEN}✅ OpenClaw gateway running at http://localhost:${OPENCLAW_PORT:-6300}${NC}"
            OPENCLAW_STARTED_BY_SCRIPT=true
            return 0
        fi
        sleep 1
        count=$((count + 1))
    done

    echo -e "${RED}❌ Failed to start OpenClaw gateway${NC}"
    echo -e "${BLUE}💡 Check logs: tail -f /tmp/openclaw.log${NC}"
    return 1
}

# Check if Supabase is running on the configured port
if check_port ${SUPABASE_API_PORT:-6010}; then
    echo -e "${GREEN}✅ Local Supabase is already running on port ${SUPABASE_API_PORT:-6010}${NC}"
    echo -e "${BLUE}   Studio: http://127.0.0.1:${SUPABASE_STUDIO_PORT:-6015}${NC}"
    echo -e "${BLUE}   API: http://127.0.0.1:${SUPABASE_API_PORT:-6010}${NC}"
    echo -e "${BLUE}   Database: postgres://postgres:postgres@127.0.0.1:${SUPABASE_DB_PORT:-6012}/postgres${NC}"

    # Remind about backup system if available
    if [ -f "supabase/backup-local-db.sh" ]; then
        echo -e "${BLUE}💡 Backup system available: ./supabase/backup-local-db.sh --list${NC}"
    fi
else
    echo -e "${BLUE}🚀 Starting local Supabase development instance on port ${SUPABASE_API_PORT:-6010}...${NC}"

    # Check if backup script exists and create a backup if Supabase has data
    if [ -f "supabase/backup-local-db.sh" ] && check_docker; then
        # Check if there are existing Docker volumes (indicating previous data)
        if docker volume ls | grep -q "supabase_db_api-dev"; then
            echo -e "${BLUE}💾 Creating safety backup before starting Supabase...${NC}"
            ./supabase/backup-local-db.sh --force > /dev/null 2>&1 || echo -e "${YELLOW}⚠️  Backup failed, but continuing...${NC}"
        fi
    fi

    # Start Supabase with development config
    echo -e "${BLUE}🔧 Starting Supabase with development configuration...${NC}"

    # Start Supabase (config.toml controls the actual ports)
    supabase start
    SUPABASE_EXIT_CODE=$?
    if [ $SUPABASE_EXIT_CODE -eq 0 ]; then
        echo -e "${GREEN}✅ Local Supabase started successfully on port ${SUPABASE_API_PORT:-6010}${NC}"
        echo -e "${BLUE}   Studio: http://127.0.0.1:${SUPABASE_STUDIO_PORT:-6015}${NC}"
        echo -e "${BLUE}   API: http://127.0.0.1:${SUPABASE_API_PORT:-6010}${NC}"
        echo -e "${BLUE}   Database: postgres://postgres:postgres@127.0.0.1:${SUPABASE_DB_PORT:-6012}/postgres${NC}"
        SUPABASE_STARTED_BY_SCRIPT=true

        # Remind about backup system
        if [ -f "supabase/backup-local-db.sh" ]; then
            echo -e "${BLUE}💡 Backup system available: ./supabase/backup-local-db.sh${NC}"
        fi
    else
        echo -e "${RED}❌ Failed to start local Supabase on port ${SUPABASE_API_PORT:-6010}${NC}"
        echo -e "${BLUE}💡 This might be due to Docker not being ready yet${NC}"
        echo -e "${BLUE}💡 Try running: supabase start --config ./supabase/config.dev.toml${NC}"
        echo -e "${BLUE}💡 Or check Docker Desktop status and restart if needed${NC}"
        exit 1
    fi
fi

# Build transport-types before LangGraph (LangGraph depends on it at runtime)
TRANSPORT_TYPES_DIR="$(cd ../.. && pwd)/apps/transport-types"
if [ ! -d "$TRANSPORT_TYPES_DIR/dist" ] || [ -n "$(find "$TRANSPORT_TYPES_DIR/src" -newer "$TRANSPORT_TYPES_DIR/dist" -type f 2>/dev/null | head -1)" ]; then
    echo -e "${BLUE}📦 Building transport-types (required by LangGraph)...${NC}"
    npm --prefix ../.. run build:transport-types
    echo -e "${GREEN}✅ Transport-types built${NC}"
else
    echo -e "${GREEN}✅ Transport-types already built${NC}"
fi

if ! start_langgraph; then
    echo -e "${YELLOW}⚠️  Continuing without local LangGraph server${NC}"
fi

if ! start_openclaw; then
    echo -e "${YELLOW}⚠️  Continuing without OpenClaw gateway${NC}"
fi

# Function to cleanup on exit
cleanup() {
    echo -e "\n${RED}🛑 Shutting down services...${NC}"

    # Kill the NestJS development server
    if [ -n "$NESTJS_PID" ]; then
        echo -e "${RED}📦 Stopping NestJS server...${NC}"
        kill $NESTJS_PID 2>/dev/null
        wait $NESTJS_PID 2>/dev/null
    fi

    # Also kill any process still on the API port
    local port_pid=$(lsof -ti:${API_PORT} 2>/dev/null)
    if [ -n "$port_pid" ]; then
        echo "$port_pid" | xargs kill -9 2>/dev/null || true
    fi
    echo -e "${GREEN}✅ NestJS server stopped${NC}"

    # Kill the LangGraph server if we started it
    if [ "$LANGGRAPH_STARTED_BY_SCRIPT" = true ]; then
        echo -e "${RED}🔄 Stopping LangGraph server...${NC}"
        if [ -n "$LANGGRAPH_PID" ]; then
            kill $LANGGRAPH_PID 2>/dev/null
        fi
        # Also kill any child processes on the LangGraph port
        lsof -ti:${LANGGRAPH_PORT:-6200} | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ LangGraph server stopped${NC}"
    fi

    # Kill the OpenClaw gateway if we started it
    if [ "$OPENCLAW_STARTED_BY_SCRIPT" = true ]; then
        echo -e "${RED}🦞 Stopping OpenClaw gateway...${NC}"
        if [ -n "$OPENCLAW_PID" ]; then
            kill $OPENCLAW_PID 2>/dev/null
        fi
        lsof -ti:${OPENCLAW_PORT:-6300} | xargs kill -9 2>/dev/null || true
        echo -e "${GREEN}✅ OpenClaw gateway stopped${NC}"
    fi

    echo -e "${GREEN}🏁 Cleanup complete${NC}"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start NestJS development server in background (must run from API dir so nest CLI and package are correct)
cd "$API_DIR"
# Pass the root .env file as ABSOLUTE path so NestJS can load it directly
ROOT_ENV_FILE="$(cd ../.. && pwd)/.env"
echo -e "${BLUE}🔥 Starting NestJS development server...${NC}"
echo -e "${BLUE}   Using env file: ${ROOT_ENV_FILE}${NC}"
ENV_FILE="${ROOT_ENV_FILE}" npm run start:dev &
NESTJS_PID=$!

# Wait for API to be healthy (max 60 seconds - watch mode compilation takes time)
echo -e "${BLUE}⏳ Waiting for API to be ready (watch mode may take up to 60s)...${NC}"
count=0
max_attempts=30
while [ $count -lt $max_attempts ]; do
    if curl -s "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ API is healthy and responding (took ~$((count * 2))s)${NC}"
        break
    fi
    sleep 2
    count=$((count + 1))
    if [ $((count % 5)) -eq 0 ]; then
        echo -e "${BLUE}   Still waiting... ($((count * 2))s/$((max_attempts * 2))s)${NC}"
    fi
done

if [ $count -eq $max_attempts ]; then
    echo -e "${YELLOW}⚠️  API health check timed out after 60 seconds${NC}"
    echo -e "${BLUE}💡 Check for stale processes: ps aux | grep nest${NC}"
    echo -e "${BLUE}💡 Or check: curl http://localhost:${API_PORT}/health${NC}"
fi

echo -e "${GREEN}✅ Development environment ready!${NC}"
echo -e "${BLUE}📡 NestJS API: http://localhost:${API_PORT}${NC}"
if [ "$LANGGRAPH_STARTED_BY_SCRIPT" = true ]; then
    echo -e "${BLUE}🔄 LangGraph Workflows: http://localhost:${LANGGRAPH_PORT:-6200}${NC}"
fi
if [ "$OPENCLAW_STARTED_BY_SCRIPT" = true ]; then
    echo -e "${BLUE}🦞 OpenClaw Gateway: http://localhost:${OPENCLAW_PORT:-6300}${NC}"
fi
echo -e "\n${BLUE}Press Ctrl+C to stop all services${NC}"

# Wait for NestJS process to finish
wait $NESTJS_PID

# If we get here, NestJS exited normally
cleanup 
