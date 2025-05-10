#!/usr/bin/env node
import "dotenv/config";
import { randomUUID } from "crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { streamSSE } from "hono/streaming";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  JSONRPCMessage,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { createConnectionPool, executeQuery } from "./connection.js";

// ─── Transport Interface ──────────────────────────────────────────────────────
interface Transport {
  start(): Promise<void>;
  send(msg: JSONRPCMessage): Promise<void>;
  close(): Promise<void>;
  onmessage?: (msg: JSONRPCMessage) => void;
  onerror?: (err: Error) => void;
  onclose?: () => void;
}

// ─── SSETransport ─────────────────────────────────────────────────────────────
class SSETransport implements Transport {
  public sessionId: string;
  public onmessage?: (msg: JSONRPCMessage) => void;
  public onerror?: (err: Error) => void;
  public onclose?: () => void;

  constructor(private stream: any) {
    this.sessionId = randomUUID();
    // Hono’s streaming API gives us onAbort, not .on('error')
    this.stream.onAbort(() => {
      this.onclose?.();
    });
  }

  async start(): Promise<void> {
    await this.send({
      jsonrpc: "2.0",
      method: "session.start",
      params: { sessionId: this.sessionId, timestamp: Date.now() },
    });
  }

  async send(msg: JSONRPCMessage): Promise<void> {
    try {
      await this.stream.writeSSE({ data: JSON.stringify(msg) });
    } catch (err: any) {
      this.onerror?.(err);
    }
  }

  async close(): Promise<void> {
    await this.stream.close();
    this.onclose?.();
  }
}

type JSONRPCRequest = Extract<
  JSONRPCMessage,
  { jsonrpc: "2.0"; method: string; params?: unknown }
>;

// ─── MCP Server Setup ─────────────────────────────────────────────────────────
const mcpServer = new Server(
  {
    name: "mariadb-mcp-server",
    version: "0.1.0",
    description: "MariaDB database access MCP server",
  },
  { capabilities: { tools: {} } }
);

// 1) ListTools handler
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_databases",
      description: "List all databases",
      inputSchema: { type: "object" },
    },
    {
      name: "list_tables",
      description: "List tables in a database",
      inputSchema: {
        type: "object",
        properties: { database: { type: "string" } },
      },
    },
    {
      name: "describe_table",
      description: "Show schema of a table",
      inputSchema: {
        type: "object",
        properties: { database: { type: "string" }, table: { type: "string" } },
        required: ["table"],
      },
    },
    {
      name: "execute_query",
      description: "Run an arbitrary SQL query",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, database: { type: "string" } },
        required: ["query"],
      },
    },
  ],
}));

// 2) CallTool handler
mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = req.params.name;
  const args = (req.params.arguments || {}) as Record<string, any>;
  createConnectionPool(); // ensure pool exists

  try {
    switch (tool) {
      case "list_databases": {
        const { rows } = await executeQuery("SHOW DATABASES");
        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      }
      case "list_tables": {
        const db = args.database as string | undefined;
        const { rows } = await executeQuery("SHOW FULL TABLES", [], db);
        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      }
      case "describe_table": {
        const tbl = args.table as string;
        if (!tbl)
          throw new McpError(ErrorCode.InvalidParams, "`table` is required");
        const db = args.database as string | undefined;
        const { rows } = await executeQuery(`DESCRIBE \`${tbl}\``, [], db);
        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      }
      case "execute_query": {
        const qry = args.query as string;
        if (!qry)
          throw new McpError(ErrorCode.InvalidParams, "`query` is required");
        const db = args.database as string | undefined;
        const { rows } = await executeQuery(qry, [], db);
        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      }
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${tool}`);
    }
  } catch (err: any) {
    console.error("[Tool Error]", err);
    return {
      isError: true,
      content: [{ type: "text", text: `Error: ${err.message || String(err)}` }],
    };
  }
});

// ─── Hono App & Routes ────────────────────────────────────────────────────────
const app = new Hono();
const transports = new Map<string, SSETransport>();

// SSE endpoint (server → client)
app.post("/sse", (c) =>
  streamSSE(c, async (stream) => {
    const transport = new SSETransport(stream);
    transports.set(transport.sessionId, transport);

    await mcpServer.connect(transport);
    // Keepalive
    while (true) {
      await stream.sleep(30_000);
      await transport.send({
        jsonrpc: "2.0",
        method: "keepalive",
        params: { timestamp: Date.now() },
      });
    }
  })
);

// Messages endpoint (client → server)
app.post("/messages", async (c) => {
  // 1) Raw parse
  const raw = (await c.req.json()) as JSONRPCMessage;

  // 2) Runtime guard: must have both `method` and `params`
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as any).method !== "string" ||
    typeof (raw as any).params !== "object"
  ) {
    return c.text("Invalid JSON-RPC request", 400);
  }

  // 3) Cast into our narrowed request type
  const msg = raw as JSONRPCRequest & { params: { sessionId: string; [k: string]: any } };

  const sessionId = msg.params.sessionId;
  if (!sessionId) {
    return c.text("Missing sessionId", 400);
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return c.text("Unknown sessionId", 404);
  }

  // 4) Now that TS knows msg.params exists, we can forward it:
  transport.onmessage?.(msg);

  return c.text("OK");
});

// CORS & Health
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Headers", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  return next();
});
app.get("/health", (c) => c.json({ status: "ok" }));

// ─── Startup Logic ───────────────────────────────────────────────────────────
async function start() {
  try {
    const pool = createConnectionPool();
    const conn = await pool.getConnection();
    await conn.query("SELECT 1");
    conn.release();
    console.log("✅ Database connection OK");
  } catch (err) {
    console.error("❌ Database init failed:", err);
    process.exit(1);
  }

  serve(app, (info) => {
    console.log(
      `🌐 Listening on http://${info.address ?? "localhost"}:${info.port}`
    );
    console.log(
      `🔄 SSE endpoint: http://${info.address ?? "localhost"}:${info.port}/sse`
    );
  });
}

start().catch((err) => {
  console.error("🔴 Startup error:", err);
  process.exit(1);
});
