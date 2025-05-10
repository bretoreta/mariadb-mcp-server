# MariaDB / MySQL Database Access MCP Server

This MCP server provides access to MariaDB / MySQL databases.

It allows you to:
- List available databases
- List tables in a database
- Describe table schemas
- Execute SQL queries

## Security Features
- **Read-only access Default**: SELECT, SHOW, DESCRIBE, and EXPLAIN
- **Query validation**: Prevents SQL injection and blocks any data modification attempts
- **Query timeout**: Prevents long-running queries from consuming resources
- **Row limit**: Prevents excessive data return

## Installation

### Option 1: Build from Source
```bash
# Clone the repository
git clone https://github.com/bretoreta/mariadb-mcp-server.git
cd mariadb-mcp-server

# Install dependencies and build
pnpm install
pnpm run build
```

### 2. Configure environment variables
The server requires the following environment variables:

- MARIADB_HOST: Database server hostname
- MARIADB_PORT: Database server port (default: 3306)
- MARIADB_USER: Database username
- MARIADB_PASSWORD: Database password
- MARIADB_DATABASE: Default database name (optional)
- MARIADB_ALLOW_INSERT: false
- MARIADB_ALLOW_UPDATE: false
- MARIADB_ALLOW_DELETE: false
- MARIADB_TIMEOUT_MS: 10000
- MARIADB_ROW_LIMIT: 1000


### 3. Add to MCP settings
Add the following configuration to your MCP settings file:

If you built from source:
```json
{
  "mcpServers": {
    "mariadb": {
      "command": "node",
      "args": ["/path/to/mariadb-mcp-server/dist/index.js"],
      "env": {
        "MARIADB_HOST": "your-host",
        "MARIADB_PORT": "3306",
        "MARIADB_USER": "your-user",
        "MARIADB_PASSWORD": "your-password",
        "MARIADB_DATABASE": "your-default-database",
        "MARIADB_ALLOW_INSERT": "false",
        "MARIADB_ALLOW_UPDATE": "false",
        "MARIADB_ALLOW_DELETE": "false",
        "MARIADB_TIMEOUT_MS": "10000",
        "MARIADB_ROW_LIMIT": "1000",
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Available Tools

### list_databases
Lists all accessible databases on the MariaDB / MySQL server.
**Parameters**: None

**Example**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "sessionId": "session_id from /sse call",
    "name": "list_databases"
  }
}
```

### list_tables
Lists all tables in a specified database.

**Parameters**:
- `database` (optional): Database name (uses default if not specified)

**Example**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "sessionId": "session_id from /sse call",
    "name": "list_tables",
    "database": "my_database_name"
  }
}
```

### describe_table
Shows the schema for a specific table.

**Parameters**:
- `database` (optional): Database name (uses default if not specified)
- `table` (required): Table name

**Example**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "sessionId": "session_id from /sse call",
    "name": "describe_table",
    "database": "my_database_name"
  }
}
```

### execute_query
Executes a SQL query.

**Parameters**:
- `query` (required): SQL query
- `database` (optional): Database name (uses default if not specified)

**Example**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "sessionId": "session_id from /sse call",
    "name": "execute_query",
    "query": "SELECT * FROM my_table LIMIT 10"
  }
}
```

## Testing
The server automatically tests MariaDB to verify functionality with your MariaDB setup:


## Troubleshooting
If you encounter issues:

1. Check the server logs for error messages
2. Verify your MariaDB credentials and connection details
3. Ensure your MariaDB user has appropriate permissions
4. Check that your query is read-only and properly formatted


**Inspiration**
**https://github.com/rjsalgado/mariadb-mcp-server**

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.