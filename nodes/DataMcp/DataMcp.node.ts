import type {
  IDataObject,
  IExecuteFunctions,
  ILoadOptionsFunctions,
  INodeExecutionData,
  INodePropertyOptions,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { apiBaseUrl, parseQueryParameters, parseRowObject, queryOutput, readMutationResult, readQueryResult, readSources, safeRequestError } from './api';

export class DataMcp implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'DataMCP Database',
    name: 'dataMcp',
    icon: { light: 'file:datamcp-brand.svg', dark: 'file:datamcp-brand.svg' },
    group: ['input'],
    version: 1,
    description: 'Read and change rows in a DataMCP database source',
    subtitle: '={{$parameter["operation"]}}',
    defaults: { name: 'DataMCP Database' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    usableAsTool: true,
    credentials: [{ name: 'dataMcpApi', required: true }],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        options: [
          { name: 'Read Query', value: 'readQuery' },
          { name: 'Create Row', value: 'createRow' },
          { name: 'Update Row', value: 'updateRow' },
          { name: 'Delete Row', value: 'deleteRow' },
        ],
        default: 'readQuery',
        noDataExpression: true,
      },
      {
        displayName: 'Source Name or ID',
        name: 'sourceId',
        type: 'options',
        typeOptions: { loadOptionsMethod: 'getSources' },
        default: '',
        required: true,
        description:
          'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
      },
      {
        displayName: 'SQL Query',
        name: 'query',
        displayOptions: { show: { operation: ['readQuery'] } },
        type: 'string',
        typeOptions: { rows: 5 },
        default: '',
        required: true,
        description: 'Read-only SQL. DataMCP enforces permissions and result limits.',
      },
      {
        displayName: 'Maximum Rows',
        name: 'maxRows',
        displayOptions: { show: { operation: ['readQuery'] } },
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 100 },
        default: 100,
        description: 'The API also caps the response size at 512 KiB',
      },
      {
        displayName: 'Query Parameters',
        name: 'queryParameters',
        displayOptions: { show: { operation: ['readQuery'] } },
        type: 'string',
        typeOptions: { rows: 2 },
        default: '',
        description: 'Optional JSON array of values bound to SQL placeholders ($1, $2 for PostgreSQL; ? for MySQL). Do not concatenate values into SQL.',
      },
      {
        displayName: 'Table',
        name: 'table',
        type: 'string',
        default: '',
        required: true,
        displayOptions: { show: { operation: ['createRow', 'updateRow', 'deleteRow'] } },
        description: 'Schema-qualified table name, for example public.orders. The integration key must allow this table.',
      },
      {
        displayName: 'Row Values',
        name: 'rowValues',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '{}',
        required: true,
        displayOptions: { show: { operation: ['createRow', 'updateRow'] } },
        description: 'JSON object of columns and values to insert or update',
      },
      {
        displayName: 'Primary Key',
        name: 'primaryKey',
        type: 'string',
        typeOptions: { rows: 2 },
        default: '{}',
        required: true,
        displayOptions: { show: { operation: ['updateRow', 'deleteRow'] } },
        description: 'JSON object with every primary-key column, targeting exactly one row',
      },
    ],
  };

  methods = {
    loadOptions: {
      async getSources(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
        try {
          const credentials = await this.getCredentials('dataMcpApi');
          const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
            this,
            'dataMcpApi',
            {
              method: 'GET',
              url: `${apiBaseUrl(credentials.environment)}/integrations/v1/sources`,
              json: true,
              disableFollowRedirect: true,
              sendCredentialsOnCrossOriginRedirect: false,
            },
          );
          const operation = this.getCurrentNodeParameter?.('operation') as string | undefined;
          const scope = ({ readQuery: 'read_query', createRow: 'create_row', updateRow: 'update_row', deleteRow: 'delete_row' } as Record<string, string>)[operation ?? 'readQuery'];
          return readSources(response)
            .filter((source) => source.operations.includes(scope))
            .map((source) => ({
              name: `${source.name} (${source.databaseType ?? 'database'})`,
              value: source.id,
            }));
        } catch (error) {
          throw new NodeOperationError(this.getNode(), safeRequestError(error));
        }
      },
    },
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const output: INodeExecutionData[] = [];
    const credentials = await this.getCredentials('dataMcpApi');
    const baseUrl = apiBaseUrl(credentials.environment);

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      let operation = 'readQuery';
      try {
        const sourceId = this.getNodeParameter('sourceId', itemIndex) as string;
        operation = (this.getNodeParameter('operation', itemIndex, 'readQuery') as string | undefined) ?? 'readQuery';
        if (!/^conn_[A-Za-z0-9_-]{1,100}$/.test(sourceId)) {
          throw new NodeOperationError(this.getNode(), 'Select a valid DataMCP source', {
            itemIndex,
          });
        }
        if (operation === 'readQuery') {
          const query = this.getNodeParameter('query', itemIndex) as string;
          const maxRows = this.getNodeParameter('maxRows', itemIndex) as number;
          const parameters = parseQueryParameters(
            this.getNodeParameter('queryParameters', itemIndex, '') as unknown,
            this.getNode(),
          );
          if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 100) {
            throw new NodeOperationError(this.getNode(), 'Maximum rows must be between 1 and 100', {
              itemIndex,
            });
          }
          const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
            this,
            'dataMcpApi',
            {
              method: 'POST',
              url: `${baseUrl}/integrations/v1/sources/${encodeURIComponent(sourceId)}/query`,
              body: parameters.length > 0 ? { query, maxRows, parameters } : { query, maxRows },
              json: true,
              disableFollowRedirect: true,
              sendCredentialsOnCrossOriginRedirect: false,
            },
          );
          const result = readQueryResult(response);
          for (const row of queryOutput(sourceId, result)) {
            output.push({ json: row as IDataObject, pairedItem: { item: itemIndex } });
          }
        } else {
          const methods: Record<string, 'POST' | 'PATCH' | 'DELETE'> = {
            createRow: 'POST', updateRow: 'PATCH', deleteRow: 'DELETE',
          };
          const method = methods[operation];
          if (!method) throw new NodeOperationError(this.getNode(), 'Unsupported DataMCP operation', { itemIndex });
          const table = this.getNodeParameter('table', itemIndex) as string;
          if (!/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/.test(table)) {
            throw new NodeOperationError(this.getNode(), 'Enter a schema-qualified table name', { itemIndex });
          }
          const body: Record<string, unknown> = { table };
          if (operation !== 'deleteRow') {
            body.values = parseRowObject(this.getNodeParameter('rowValues', itemIndex), this.getNode(), 'values');
          }
          if (operation !== 'createRow') {
            body.key = parseRowObject(this.getNodeParameter('primaryKey', itemIndex), this.getNode(), 'key');
          }
          const response: unknown = await this.helpers.httpRequestWithAuthentication.call(
            this,
            'dataMcpApi',
            {
              method,
              url: `${baseUrl}/integrations/v1/sources/${encodeURIComponent(sourceId)}/rows`,
              body,
              json: true,
              disableFollowRedirect: true,
              sendCredentialsOnCrossOriginRedirect: false,
            },
          );
          output.push({
            json: { sourceId, table, operation, affectedRows: readMutationResult(response, this.getNode()) },
            pairedItem: { item: itemIndex },
          });
        }
      } catch (error) {
        const message =
          error instanceof NodeOperationError
            ? error.message
            : safeRequestError(error, operation !== 'readQuery');
        if (this.continueOnFail()) {
          output.push({ json: { error: message }, pairedItem: { item: itemIndex } });
          continue;
        }
        throw new NodeOperationError(this.getNode(), message, { itemIndex });
      }
    }
    return [output];
  }
}
