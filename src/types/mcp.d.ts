declare module '@modelcontextprotocol/sdk' {
  export class Server {
    constructor(
      info: { name: string; version: string },
      options: { capabilities: { tools: Record<string, any> } }
    );
    
    setRequestHandler(options: { method: string }, handler: (request: any) => Promise<any>): void;
    
    connect(transport: StdioServerTransport): Promise<void>;
  }

  export class StdioServerTransport {
    constructor();
  }
}
