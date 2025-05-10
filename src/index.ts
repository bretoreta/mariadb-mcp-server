#!/usr/bin/env node

/**
 * MariaDB Database Access MCP Server
 *
 * This MCP server provides access to MariaDB databases.
 * It allows:
 * - Listing available databases
 * - Listing tables in a database
 * - Describing table schemas
 * - Executing read-only SQL queries
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import {
  createConnectionPool,
  executeQuery,
  endConnection,
} from "./connection.js";

/**
 * Create an MCP server with tools for MariaDB database access
 */
const server = new Server(
  {
    name: "mariadb-mcp-server",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Handler that lists available tools for MariaDB database access
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_databases",
        description: "List all accessible databases on the MariaDB server",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "list_tables",
        description: "List all tables in a specified database",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
          },
          required: [],
        },
      },
      {
        name: "describe_table",
        description: "Show the schema for a specific table",
        inputSchema: {
          type: "object",
          properties: {
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
            table: {
              type: "string",
              description: "Table name",
            },
          },
          required: ["table"],
        },
      },
      {
        name: "execute_query",
        description: "Execute a SQL query",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: `SQL query (only SELECT, ${
                process.env.MARIADB_ALLOW_INSERT ? "INSERT," : ""
              } ${process.env.MARIADB_ALLOW_UPDATE ? "UPDATE," : ""} ${
                process.env.MARIADB_ALLOW_DELETE ? "DELETE," : ""
              } SHOW, DESCRIBE, and EXPLAIN statements are allowed)`,
            },
            database: {
              type: "string",
              description:
                "Database name (optional, uses default if not specified)",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

/**
 * Handler for MariaDB database access tools
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    createConnectionPool();
  } catch (error) {
    console.error("[Fatal] Failed to initialize MariaDB connection:", error);
    process.exit(1);
  }

  try {
    switch (request.params.name) {
      case "list_databases": {
        console.error("[Tool] Executing list_databases");
        const { rows } = await executeQuery("SHOW DATABASES");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      case "list_tables": {
        console.error("[Tool] Executing list_tables");

        const database = request.params.arguments?.database as
          | string
          | undefined;

        const { rows } = await executeQuery("SHOW FULL TABLES", [], database);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      case "describe_table": {
        console.error("[Tool] Executing describe_table");

        const database = request.params.arguments?.database as
          | string
          | undefined;
        const table = request.params.arguments?.table as string;

        if (!table) {
          throw new McpError(ErrorCode.InvalidParams, "Table name is required");
        }

        const { rows } = await executeQuery(
          `DESCRIBE \`${table}\``,
          [],
          database
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      case "execute_query": {
        console.error("[Tool] Executing execute_query");

        const query = request.params.arguments?.query as string;
        const database = request.params.arguments?.database as
          | string
          | undefined;

        if (!query) {
          throw new McpError(ErrorCode.InvalidParams, "Query is required");
        }

        const { rows } = await executeQuery(query, [], database);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    console.error("[Error] Tool execution failed:", error);

    // Format error message for client
    return {
      content: [
        {
          type: "text",
          text: `Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
});

/**
 * Start the server using stdio transport
 */
async function main() {
  console.error("[Setup] Starting MariaDB MCP server");

  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[Setup] MariaDB MCP server running on stdio");
  } catch (error) {
    console.error("[Fatal] Failed to start server:", error);
    process.exit(1);
  }
}

// Handle process termination
process.on("SIGINT", async () => {
  console.error("[Shutdown] Closing MariaDB connection pool");
  await endConnection();
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error("[Fatal] Unhandled error:", error);
  process.exit(1);
});
