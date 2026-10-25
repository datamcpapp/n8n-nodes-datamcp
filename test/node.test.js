const assert = require('node:assert/strict');
const test = require('node:test');
const { DataMcp } = require('../dist/nodes/DataMcp/DataMcp.node');

test('the node sends a scoped read query and emits paired row items', async () => {
  const requests = [];
  const context = {
    getInputData: () => [{ json: { input: 1 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name) => ({ sourceId: 'conn_private', query: 'SELECT id FROM private_probe', maxRows: 25 })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => false,
    helpers: {
      httpRequestWithAuthentication: async (credentialType, request) => {
        requests.push({ credentialType, request });
        return {
          success: true,
          data: { columns: ['id'], rows: [[1], [2]], rowCount: 2, truncated: false },
        };
      },
    },
  };
  const result = await new DataMcp().execute.call(context);

  assert.deepEqual(requests, [{
    credentialType: 'dataMcpApi',
    request: {
      method: 'POST',
      url: 'https://api-qa.datamcp.app/api/integrations/v1/sources/conn_private/query',
      body: { query: 'SELECT id FROM private_probe', maxRows: 25 },
      json: true,
    },
  }]);
  assert.deepEqual(result, [[
    { json: { sourceId: 'conn_private', columns: ['id'], values: [1], row: { id: 1 }, rowCount: 2, truncated: false }, pairedItem: { item: 0 } },
    { json: { sourceId: 'conn_private', columns: ['id'], values: [2], row: { id: 2 }, rowCount: 2, truncated: false }, pairedItem: { item: 0 } },
  ]]);
});

test('the source dropdown excludes sources without read-query permission', async () => {
  const context = {
    getCredentials: async () => ({ environment: 'production' }),
    helpers: {
      httpRequestWithAuthentication: async () => ({
        success: true,
        data: [
          { id: 'conn_database', name: 'Database', type: 'database', operations: ['read_query'] },
          { id: 'conn_memory', name: 'Memory', type: 'memory', operations: ['write_memory'] },
        ],
      }),
    },
  };
  const options = await new DataMcp().methods.loadOptions.getSources.call(context);
  assert.deepEqual(options, [{ name: 'Database (database)', value: 'conn_database' }]);
});

test('the source dropdown only offers sources authorized for the selected write action', async () => {
  const requests = [];
  const context = {
    getCredentials: async () => ({ environment: 'qa' }),
    getCurrentNodeParameter: () => 'deleteRow',
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    helpers: {
      httpRequestWithAuthentication: async (credentialType, request) => {
        requests.push({ credentialType, request });
        return {
          success: true,
          data: [
            { id: 'conn_read', name: 'Reader', type: 'database', operations: ['read_query'] },
            { id: 'conn_create', name: 'Creator', type: 'database', operations: ['create_row'] },
            { id: 'conn_delete', name: 'Deleter', type: 'database', operations: ['delete_row'] },
          ],
        };
      },
    },
  };
  const options = await new DataMcp().methods.loadOptions.getSources.call(context);
  assert.deepEqual(options, [{ name: 'Deleter (database)', value: 'conn_delete' }]);
  assert.equal(requests[0].credentialType, 'dataMcpApi');
  assert.equal(requests[0].request.url, 'https://api-qa.datamcp.app/api/integrations/v1/sources');
});

test('an empty read still emits one paired item for downstream workflow steps', async () => {
  const context = {
    getInputData: () => [{ json: { id: 7 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name) => ({ sourceId: 'conn_private', query: 'SELECT id FROM private_probe WHERE id = 7', maxRows: 10 })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => false,
    helpers: {
      httpRequestWithAuthentication: async () => ({
        success: true,
        data: { columns: ['id'], rows: [], rowCount: 0, truncated: false },
      }),
    },
  };
  const result = await new DataMcp().execute.call(context);
  assert.deepEqual(result, [[{
    json: { sourceId: 'conn_private', columns: ['id'], values: null, row: null, rowCount: 0, truncated: false },
    pairedItem: { item: 0 },
  }]]);
});

test('the node binds query parameters without interpolating them into SQL', async () => {
  const requests = [];
  const context = {
    getInputData: () => [{ json: { id: 7 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name) => ({
      sourceId: 'conn_private',
      query: 'SELECT label FROM private_probe WHERE id = $1',
      queryParameters: '[7]',
      maxRows: 1,
    })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => false,
    helpers: {
      httpRequestWithAuthentication: async (_credentialType, request) => {
        requests.push(request);
        return { success: true, data: { columns: ['label'], rows: [['private']], rowCount: 1, truncated: false } };
      },
    },
  };
  await new DataMcp().execute.call(context);
  assert.deepEqual(requests[0].body, {
    query: 'SELECT label FROM private_probe WHERE id = $1',
    maxRows: 1,
    parameters: [7],
  });
});

test('row actions use scoped methods and emit affected row counts', async () => {
  for (const [operation, method] of [['createRow', 'POST'], ['updateRow', 'PATCH'], ['deleteRow', 'DELETE']]) {
    const requests = [];
    const context = {
      getInputData: () => [{ json: { id: 7 } }],
      getCredentials: async () => ({ environment: 'qa' }),
      getNodeParameter: (name) => ({
        operation,
        sourceId: 'conn_private',
        table: 'public.private_probe',
        rowValues: '{"label":"edited"}',
        primaryKey: '{"id":7}',
      })[name],
      getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
      continueOnFail: () => false,
      helpers: {
        httpRequestWithAuthentication: async (_credentialType, request) => {
          requests.push(request);
          return { success: true, data: { affectedRows: 1 } };
        },
      },
    };
    const result = await new DataMcp().execute.call(context);
    assert.equal(requests[0].method, method);
    assert.equal(requests[0].url, 'https://api-qa.datamcp.app/api/integrations/v1/sources/conn_private/rows');
    assert.equal(requests[0].body.table, 'public.private_probe');
    assert.deepEqual(result[0][0].json, { sourceId: 'conn_private', table: 'public.private_probe', operation, affectedRows: 1 });
  }
});

test('invalid row values are rejected before any network request', async () => {
  let requests = 0;
  const context = {
    getInputData: () => [{ json: { id: 7 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name) => ({
      operation: 'updateRow',
      sourceId: 'conn_private',
      table: 'public.private_probe',
      rowValues: '{"label":{"nested":"not allowed"}}',
      primaryKey: '{"id":7}',
    })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => false,
    helpers: { httpRequestWithAuthentication: async () => { requests++; } },
  };
  await assert.rejects(new DataMcp().execute.call(context), /values contains unsupported fields or values/);
  assert.equal(requests, 0);
});

test('continue on fail emits a safe error without query or credential details', async () => {
  const context = {
    getInputData: () => [{ json: { input: 1 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name) => ({ sourceId: 'conn_private', query: 'SELECT secret FROM private_probe', maxRows: 10 })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => true,
    helpers: {
      httpRequestWithAuthentication: async () => {
        throw { response: { statusCode: 403 }, message: 'dm_int_secret SELECT secret FROM private_probe' };
      },
    },
  };

  const result = await new DataMcp().execute.call(context);
  assert.deepEqual(result, [[{
    json: { error: 'Source access or query is not permitted' },
    pairedItem: { item: 0 },
  }]]);
});

test('multiple input items keep their pairing when one request fails', async () => {
  const context = {
    getInputData: () => [{ json: { id: 1 } }, { json: { id: 2 } }],
    getCredentials: async () => ({ environment: 'qa' }),
    getNodeParameter: (name, index) => ({
      sourceId: 'conn_private',
      query: 'SELECT id FROM private_probe WHERE id = $1',
      queryParameters: JSON.stringify([index + 1]),
      maxRows: 1,
    })[name],
    getNode: () => ({ name: 'DataMCP', type: 'dataMcp' }),
    continueOnFail: () => true,
    helpers: {
      httpRequestWithAuthentication: async (_credentialType, request) => {
        if (request.body.parameters[0] === 2) {
          throw { response: { statusCode: 503 }, message: 'postgres://secret@private' };
        }
        return { success: true, data: { columns: ['id'], rows: [[1]], rowCount: 1, truncated: false } };
      },
    },
  };

  const result = await new DataMcp().execute.call(context);
  assert.equal(result[0][0].json.row.id, 1);
  assert.deepEqual(result[0][0].pairedItem, { item: 0 });
  assert.deepEqual(result[0][1], {
    json: { error: 'DataMCP source is unavailable. If it uses a tunnel, check that the Local Agent is running' },
    pairedItem: { item: 1 },
  });
});
