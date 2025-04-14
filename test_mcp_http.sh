#!/bin/bash
# test_mcp_http.sh - MCP HTTP Server Test Script

BASE_URL="http://localhost:3000/mcp"
ID=1

# Function to send MCP requests
function send_mcp_request() {
  local method="$1"
  local params="$2"
  
  echo "📤 Sending $method request..."
  curl -s -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $ID,
      \"method\": \"$method\",
      \"params\": $params
    }" | jq .
    
  ID=$((ID + 1))
  echo ""
  sleep 1
}

echo "🧪 MCP HTTP Server Test Script"
echo "============================="
echo "This script tests the MCP HTTP server implementation."
echo ""

# Test the server health endpoint
echo "🩺 Checking server health..."
curl -s "http://localhost:3000/health" | jq .
echo ""
sleep 1

# Initialize connection
echo "🔄 Initializing MCP connection..."
send_mcp_request "initialize" "{\"protocolVersion\": \"0.1.0\", \"capabilities\": {}}"

# Send initialized notification
send_mcp_request "initialized" "{}"

# List available tools
echo "📋 Listing available tools..."
send_mcp_request "tools/list" "{}"

# Set a goal
echo "🎯 Setting a goal..."
send_mcp_request "tools/call" "{
  \"name\": \"setGoal\", 
  \"arguments\": {
    \"goal\": \"Research quantum computing basics\"
  }
}"

# Navigate to a website
echo "🚀 Navigating to Wikipedia..."
send_mcp_request "tools/call" "{
  \"name\": \"navigate\", 
  \"arguments\": {
    \"value\": \"https://en.wikipedia.org/wiki/Quantum_computing\"
  }
}"

# Get page info
echo "📄 Getting page info..."
send_mcp_request "tools/call" "{
  \"name\": \"getPageInfo\", 
  \"arguments\": {}
}"

# Scroll down
echo "⬇️ Scrolling down..."
send_mcp_request "tools/call" "{
  \"name\": \"scroll\", 
  \"arguments\": {
    \"direction\": \"down\"
  }
}"

# Add a note
echo "📝 Adding a note..."
send_mcp_request "tools/call" "{
  \"name\": \"notes\", 
  \"arguments\": {
    \"operation\": \"add\",
    \"note\": \"Quantum computing uses quantum bits which can exist in multiple states at once.\"
  }
}"

# Read notes
echo "📖 Reading notes..."
send_mcp_request "tools/call" "{
  \"name\": \"notes\", 
  \"arguments\": {
    \"operation\": \"read\"
  }
}"

# Test MCP manifest discovery
echo "🔍 Checking MCP manifest..."
curl -s "http://localhost:3000/.well-known/mcp/manifest.json" | jq .
echo ""
sleep 1

# Test tool description
echo "📖 Getting tool description for 'navigate'..."
send_mcp_request "tools/describe" "{\"name\": \"navigate\"}"

echo "✅ Test complete!"