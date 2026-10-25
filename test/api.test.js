const assert = require('node:assert/strict');
const test = require('node:test');
const { apiBaseUrl, parseQueryParameters, parseRowObject, queryOutput, readMutationResult, readQueryResult, readSources, safeRequestError } = require('../dist/nodes/DataMcp/api');

test('row values and mutation results are strictly shaped', () => {
  const node = { name: 'DataMCP', type: 'dataMcp' };
  assert.deepEqual(parseRowObject('{"label":"safe","enabled":true}', node, 'values'), { label: 'safe', enabled: true });
  assert.throws(() => parseRowObject('{"id":null}', node, 'key'));
  assert.throws(() => parseRowObject('{"label":{"nested":true}}', node, 'values'));
  assert.throws(() => parseRowObject('{"label; DROP":"x"}', node, 'values'));
  assert.throws(() => parseRowObject({ id: Number.MAX_SAFE_INTEGER + 1 }, node, 'key'));
  assert.equal(readMutationResult({ success: true, data: { affectedRows: 1 } }, node), 1);
  assert.throws(() => readMutationResult({ success: true, data: { affectedRows: 2 } }, node));
});

test('query parameters accept only bounded scalar arrays', () => {
  const node = { name: 'DataMCP', type: 'dataMcp' };
  assert.deepEqual(parseQueryParameters('', node), []);
  assert.deepEqual(parseQueryParameters('[1,"text",true,null]', node), [1, 'text', true, null]);
  assert.throws(() => parseQueryParameters('{"id":1}', node));
  assert.throws(() => parseQueryParameters('[{"id":1}]', node));
  assert.throws(() => parseQueryParameters('not json', node));
  assert.throws(() => parseQueryParameters(JSON.stringify(Array(51).fill(1)), node));
  assert.throws(() => parseQueryParameters(Array(17).fill('🙂'.repeat(4096)), node));
  assert.throws(() => parseQueryParameters([Number.MAX_SAFE_INTEGER + 1], node));
});

test('only known DataMCP environments can be selected', () => {
  assert.equal(apiBaseUrl('qa'), 'https://api-qa.datamcp.app/api');
  assert.equal(apiBaseUrl('production'), 'https://api.datamcp.app/api');
  assert.throws(() => apiBaseUrl('https://evil.example'));
});

test('source discovery accepts the scoped API envelope', () => {
  assert.deepEqual(readSources({ success: true, data: [{ id: 'conn_1', name: 'DB', type: 'database', operations: ['read_query'] }] }), [
    { id: 'conn_1', name: 'DB', type: 'database', operations: ['read_query'] },
  ]);
  assert.throws(() => readSources({ success: false, data: [] }));
  assert.throws(() => readSources({ success: true, data: [{ id: 'conn_1', name: 'DB', type: 'database', operations: ['read_query', 1] }] }));
});

test('query rows map to n8n items without losing truncation state', () => {
  const result = readQueryResult({
    success: true,
    data: { columns: ['id', 'label'], rows: [[1, 'private']], rowCount: 1, truncated: true },
  });
  assert.deepEqual(queryOutput('conn_1', result), [
    { sourceId: 'conn_1', columns: ['id', 'label'], values: [1, 'private'], row: { id: 1, label: 'private' }, rowCount: 1, truncated: true },
  ]);
  assert.deepEqual(queryOutput('conn_1', { columns: [], rows: [], rowCount: 0, truncated: false }), [
    { sourceId: 'conn_1', columns: [], values: null, row: null, rowCount: 0, truncated: false },
  ]);
  assert.throws(() => queryOutput('conn_1', { columns: ['id'], rows: [[1, 2]], rowCount: 1, truncated: false }));
});

test('duplicate SQL column names retain all values', () => {
  assert.deepEqual(queryOutput('conn_1', { columns: ['id', 'id'], rows: [[1, 2]], rowCount: 1, truncated: false })[0].values, [1, 2]);
});

test('malformed query responses fail before mapping into workflow items', () => {
  assert.throws(() => readQueryResult({ success: true, data: { columns: ['id'], rows: {}, rowCount: 1, truncated: false } }));
  assert.throws(() => readQueryResult({ success: true, data: { columns: ['id', 2], rows: [[1, 2]], rowCount: 1, truncated: false } }));
  assert.throws(() => readQueryResult({ success: true, data: { columns: ['id'], rows: [[1, 2]], rowCount: 1, truncated: false } }));
  assert.throws(() => readQueryResult({ success: true, data: { columns: ['id'], rows: [[1]], rowCount: 2, truncated: false } }));
  assert.throws(() => readQueryResult({ success: true, data: { columns: ['id'], rows: [[1]], rowCount: NaN, truncated: false } }));
});

test('request errors never expose tokens or SQL text', () => {
  assert.equal(safeRequestError({ response: { statusCode: 401 }, message: 'dm_int_secret SELECT * FROM private' }), 'Integration key is invalid or revoked');
  assert.equal(safeRequestError({ response: { statusCode: 403 }, message: 'SELECT secret FROM private' }), 'Source access or query is not permitted');
  assert.equal(safeRequestError({ response: { statusCode: 400 }, message: 'SELECT secret FROM private' }), 'DataMCP rejected the query');
  assert.equal(safeRequestError({ response: { statusCode: 409 }, message: 'dm_int_secret' }), 'Write outcome is unknown. Check the row before retrying');
  assert.equal(safeRequestError({ response: { statusCode: 413 }, message: 'private large cell' }), 'One result row exceeds 512 KiB. Select fewer columns or shorten the value');
  assert.equal(safeRequestError({ response: { statusCode: 412 }, message: 'private schema' }), 'Sync the DataMCP source schema before writing');
  assert.equal(safeRequestError({ response: { statusCode: 503 }, message: 'postgres://readonly:password@private' }), 'DataMCP source is unavailable. If it uses a tunnel, check that the Local Agent is running');
  assert.equal(safeRequestError({ response: { statusCode: 402 }, message: 'private billing details' }), 'DataMCP subscription or trial is inactive');
  assert.equal(safeRequestError({ response: { statusCode: 429 }, message: 'dm_int_secret' }), 'DataMCP query rate limit exceeded');
  assert.equal(safeRequestError({ response: { statusCode: 500 }, message: 'private row' }), 'DataMCP request failed. Check data before retrying a write');
  assert.equal(safeRequestError({ httpCode: '503', message: 'postgres://readonly:password@private' }), 'DataMCP source is unavailable. If it uses a tunnel, check that the Local Agent is running');
  assert.equal(safeRequestError({ status: 504, message: 'SELECT secret FROM private' }), 'DataMCP query timed out');
  assert.equal(safeRequestError(new Error('dm_int_secret SELECT * FROM private')), 'DataMCP request failed');
});
