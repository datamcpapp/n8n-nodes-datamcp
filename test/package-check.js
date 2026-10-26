const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

const output = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
});
const [pack] = JSON.parse(output);
const files = new Set(pack.files.map((file) => file.path));
const manifest = require('../package.json');

for (const path of [
  'LICENSE',
  'README.md',
  'package.json',
  ...manifest.n8n.nodes,
  ...manifest.n8n.credentials,
  'dist/nodes/DataMcp/datamcp-brand.svg',
]) {
  assert.ok(files.has(path), `${path} is missing from the npm package`);
}

for (const path of files) {
  assert.ok(
    path === 'LICENSE' ||
      path === 'README.md' ||
      path === 'package.json' ||
      path.startsWith('dist/'),
    `${path} must not be included in the npm package`,
  );
}
