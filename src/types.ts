/**
 * Type definitions for MariaDB MCP server
 */

// MariaDB connection configuration
export interface MariaDBConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database?: string;
  allow_insert: boolean;
  allow_update: boolean;
  allow_delete: boolean;
}

// Database information
export interface DatabaseInfo {
  name: string;
}

// Table information
export interface TableInfo {
  name: string;
  type: string;
}

// Column information
export interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

// Query result
export interface QueryResult {
  rows: any[];
  fields: any[];
}
