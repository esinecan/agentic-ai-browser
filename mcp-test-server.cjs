// npm install express @modelcontextprotocol/sdk zod zod-to-json-schema

const express = require('express');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } = require('@modelcontextprotocol/sdk/types.js');
const { z } = require('zod');
const { zodToJsonSchema } = require('zod-to-json-schema');

// Define the echo input schema
const EchoSchema = z.object({
  message: z.string().describe('Message to echo')
});

// Create the MCP server with only the echo tool
function createServer() {
  const server = new Server(
    { name: 'mcp-test-server', version: '1.0.0' },
    { capabilities: { tools: {}, prompts: {}, resources: {}, logging: {} } }
  );

  // List available tools (just echo)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'echo',
        description: 'Echoes back the input',
        inputSchema: zodToJsonSchema(EchoSchema)
      }
    ]
  }));

  // Handle echo calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const args = EchoSchema.parse(request.params.arguments);
    return {
      content: [
        { type: 'text', text: `Echo: ${args.message}` }
      ]
    };
  });

  return server;
}

async function main() {
  const app = express();
  const server = createServer();
  let transport;

  app.get('/sse', async (_req, res) => {
    transport = new SSEServerTransport('/message', res);
    await server.connect(transport);
    server.onclose = () => process.exit(0);
    console.log('SSE connection established');
  });

  app.post('/message', async (req, res) => {
    await transport.handlePostMessage(req, res);
  });

  const PORT = 3001;
  app.listen(PORT, () => {
    console.log(`MCP SSE echo server listening on http://localhost:${PORT}/sse`);
  });
}

main().catch(err => {
  console.error('Server error:', err);
  process.exit(1);
});
