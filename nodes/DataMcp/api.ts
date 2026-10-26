import type { INode } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export interface DataMcpSource {
  id: string;
  name: string;
  type: string;
  databaseType?: string;
  routingType?: string;
  operations: string[];
}

export interface DataMcpQueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
}

export function parseRowObject(
  input: unknown,
  node: INode,
  kind: 'values' | 'key',
): Record<string, string | number | boolean | null> {
  let parsed: unknown;
  try {
    parsed = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new NodeOperationError(node, `${kind} must be a JSON object`);
  }
  if (!isRecord(parsed)) {
    throw new NodeOperationError(node, `${kind} must be a JSON object`);
  }
  const entries = Object.entries(parsed);
  if (
    entries.length < 1 ||
    entries.length > (kind === 'key' ? 4 : 25) ||
    entries.some(
      ([name, value]) =>
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        (kind === 'key' && value === null) ||
        (value !== null &&
          !(
            (typeof value === 'string' && value.length <= 4096) ||
            (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) ||
            typeof value === 'boolean'
          )),
    ) ||
    Buffer.byteLength(JSON.stringify(parsed), 'utf8') > 64 * 1024
  ) {
    throw new NodeOperationError(node, `${kind} contains unsupported fields or values`);
  }
  return parsed as Record<string, string | number | boolean | null>;
}

export function readMutationResult(response: unknown, node: INode): number {
  if (
    !isRecord(response) ||
    response.success !== true ||
    !isRecord(response.data) ||
    !Number.isInteger(response.data.affectedRows) ||
    (response.data.affectedRows as number) < 0 ||
    (response.data.affectedRows as number) > 1
  ) {
    throw new NodeOperationError(node, 'DataMCP returned an invalid mutation result');
  }
  return response.data.affectedRows as number;
}

export function apiBaseUrl(environment: unknown): string {
  if (environment === 'qa') return 'https://api-qa.datamcp.app/api';
  if (environment === 'production') return 'https://api.datamcp.app/api';
  throw new Error('Unsupported DataMCP environment');
}

export function parseQueryParameters(input: unknown, node: INode): Array<string | number | boolean | null> {
  if (input === '' || input === undefined || input === null) return [];
  let parameters: unknown;
  try {
    parameters = typeof input === 'string' ? JSON.parse(input) : input;
  } catch {
    throw new NodeOperationError(node, 'Query parameters must be a JSON array');
  }
  if (
    !Array.isArray(parameters) ||
    parameters.length > 50 ||
    parameters.some(
      (value) =>
        value !== null &&
        !(
          (typeof value === 'string' && value.length <= 4096) ||
          (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) ||
          typeof value === 'boolean'
        ),
    ) ||
    Buffer.byteLength(JSON.stringify(parameters), 'utf8') > 64 * 1024
  ) {
    throw new NodeOperationError(node, 'Query parameters must contain at most 50 scalar values');
  }
  return parameters;
}

export function readSources(response: unknown): DataMcpSource[] {
  if (!isRecord(response) || response.success !== true || !Array.isArray(response.data)) {
    throw new Error('DataMCP returned an invalid source list');
  }
  if (!response.data.every(isSource)) {
    throw new Error('DataMCP returned an invalid source list');
  }
  return response.data;
}

export function readQueryResult(response: unknown): DataMcpQueryResult {
  if (!isRecord(response) || response.success !== true || !isRecord(response.data)) {
    throw new Error('DataMCP returned an invalid query result');
  }
  const data = response.data;
  const columns = data.columns;
  if (
    !Array.isArray(columns) ||
    !columns.every((column) => typeof column === 'string') ||
    !Array.isArray(data.rows) ||
    !data.rows.every((row) => Array.isArray(row) && row.length === columns.length) ||
    !Number.isInteger(data.rowCount) ||
    (data.rowCount as number) !== data.rows.length ||
    typeof data.truncated !== 'boolean'
  ) {
    throw new Error('DataMCP returned an invalid query result');
  }
  return data as unknown as DataMcpQueryResult;
}

export function queryOutput(
  sourceId: string,
  result: DataMcpQueryResult,
): Array<Record<string, unknown>> {
  if (result.rows.length === 0) {
    return [{ sourceId, columns: result.columns, values: null, row: null, rowCount: 0, truncated: result.truncated }];
  }
  return result.rows.map((values) => {
    if (values.length !== result.columns.length) {
      throw new Error('DataMCP returned a row with mismatched columns');
    }
    const row = Object.fromEntries(
      result.columns.map((column, index) => [column, values[index]]),
    );
    return {
      sourceId,
      columns: result.columns,
      values,
      row,
      rowCount: result.rowCount,
      truncated: result.truncated,
    };
  });
}

export function safeRequestError(error: unknown, write = false): string {
  const response = isRecord(error) && isRecord(error.response) ? error.response : undefined;
  const status = response?.statusCode ?? response?.status ??
    (isRecord(error) ? error.statusCode ?? error.status ?? error.httpCode : undefined);
  switch (Number(status)) {
    case 401:
      return 'Integration key is invalid or revoked';
    case 402:
      return 'DataMCP subscription or trial is inactive';
    case 403:
      return 'Source access or query is not permitted';
    case 400:
      return 'DataMCP rejected the query';
    case 409:
      return 'Write outcome is unknown. Check the row before retrying';
    case 413:
      return 'One result row exceeds 512 KiB. Select fewer columns or shorten the value';
    case 412:
      return 'Sync the DataMCP source schema before writing';
    case 429:
      return 'DataMCP query rate limit exceeded';
    case 500:
      return 'DataMCP request failed. Check data before retrying a write';
    case 503:
      return write
        ? 'Write outcome is unknown. Check the row and Local Agent before retrying'
        : 'DataMCP source is unavailable. If it uses a tunnel, check that the Local Agent is running';
    case 504:
      return write ? 'Write outcome is unknown. Check the row before retrying' : 'DataMCP query timed out';
    default:
      return write ? 'Write outcome is unknown. Check the row before retrying' : 'DataMCP request failed';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): value is DataMcpSource {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.type === 'string' &&
    Array.isArray(value.operations) &&
    value.operations.every((operation) => typeof operation === 'string')
  );
}

