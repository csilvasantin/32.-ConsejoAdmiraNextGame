#!/bin/bash
# ══════════════════════════════════════════════════════════════
# AdmiraNext Council — Start API + Cloudflare Tunnel
# ══════════════════════════════════════════════════════════════
#
# Usage:
#   ./start-council.sh              # Quick tunnel (random URL)
#   ./start-council.sh --named      # Named tunnel (consejo.admiranext.com)
#
# Prerequisites:
#   brew install cloudflared
#   pip3 install fastapi uvicorn anthropic python-dotenv
#
# ══════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}🏛️  AdmiraNext Council — Startup${NC}"
echo "════════════════════════════════════"

# Check .env
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found. Create it with:${NC}"
    echo "   ANTHROPIC_API_KEY=sk-ant-..."
    echo "   COUNCIL_API_TOKEN=your-secret-token"
    exit 1
fi

# Check dependencies
python3 -c "import fastapi, anthropic, dotenv" 2>/dev/null || {
    echo -e "${RED}❌ Missing Python dependencies. Run:${NC}"
    echo "   pip3 install fastapi uvicorn anthropic python-dotenv"
    exit 1
}

command -v cloudflared >/dev/null || {
    echo -e "${RED}❌ cloudflared not found. Run:${NC}"
    echo "   brew install cloudflared"
    exit 1
}

# Kill any existing processes on port 8420
lsof -ti:8420 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start API server
echo -e "${GREEN}▶ Starting Council API on port 8420...${NC}"
python3 council-api.py > /tmp/council-api.log 2>&1 &
API_PID=$!
sleep 3

# Verify API is running
if curl -s http://localhost:8420/api/council/health | grep -q '"ok"'; then
    echo -e "${GREEN}✅ API server running (PID: $API_PID)${NC}"
else
    echo -e "${RED}❌ API failed to start. Check /tmp/council-api.log${NC}"
    cat /tmp/council-api.log | tail -10
    exit 1
fi

# Start Cloudflare tunnel
echo ""
if [ "$1" == "--named" ]; then
    echo -e "${BLUE}▶ Starting named Cloudflare Tunnel (consejo.admiranext.com)...${NC}"
    echo -e "${YELLOW}  ⚠ Requires: cloudflared tunnel login + DNS config${NC}"
    cloudflared tunnel --url http://localhost:8420 --hostname consejo.admiranext.com &
else
    echo -e "${BLUE}▶ Starting quick Cloudflare Tunnel...${NC}"
    cloudflared tunnel --url http://localhost:8420 2>&1 | tee /tmp/cloudflare-tunnel.log &
fi
TUNNEL_PID=$!
sleep 5

# Extract tunnel URL
TUNNEL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/cloudflare-tunnel.log 2>/dev/null | head -1)

echo ""
echo "════════════════════════════════════════════════════"
echo -e "${GREEN}🏛️  AdmiraNext Council is LIVE!${NC}"
echo "════════════════════════════════════════════════════"
echo -e "  API local:    ${BLUE}http://localhost:8420${NC}"
if [ -n "$TUNNEL_URL" ]; then
    echo -e "  API public:   ${GREEN}${TUNNEL_URL}${NC}"
    echo ""
    echo -e "  ${YELLOW}⚠ Update COUNCIL_API_URLS in council-scumm.html with:${NC}"
    echo -e "  ${GREEN}${TUNNEL_URL}${NC}"
fi
echo ""
echo -e "  Frontend:     ${BLUE}https://csilvasantin.github.io/32.-ConsejoAdmiraNextGame/council-scumm.html${NC}"
echo ""
echo -e "  API PID:      $API_PID"
echo -e "  Tunnel PID:   $TUNNEL_PID"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop everything${NC}"
echo "════════════════════════════════════════════════════"

# Cleanup on exit
cleanup() {
    echo ""
    echo -e "${RED}Shutting down...${NC}"
    kill $API_PID 2>/dev/null
    kill $TUNNEL_PID 2>/dev/null
    echo -e "${GREEN}Done.${NC}"
}
trap cleanup EXIT INT TERM

# Wait for processes
wait
