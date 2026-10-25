# DataMCP node for n8n

Use a source-scoped DataMCP Integration credential to read PostgreSQL or MySQL
from n8n. Private PostgreSQL sources can be reached through Local Agent Tunnel.
The n8n action is **DataMCP Database** for both direct and tunneled sources;
the tunnel is a routing choice in DataMCP, not a second n8n node.

**User guide:**
[Connect n8n to PostgreSQL with DataMCP](https://dashboard.datamcp.app/docs/n8n)

## Release status

This package is not published to npm and is not available in the n8n
marketplace. Public installation is not available yet. Do not use an
`npx install` command; n8n does not provide one.

People who receive this source package from DataMCP can run the verified local
preview:

```bash
cd n8n-nodes-datamcp
npm install
npm run build
npm test
npm run dev
```

The final command opens a local n8n editor with the DataMCP node installed. The
package has been loaded with n8n 2.44.6.

For a self-hosted n8n instance, build a supplied archive and install it into
the n8n user folder:

```bash
# In this package directory
npm install
npm run build
npm pack

# On the self-hosted n8n machine
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install /absolute/path/to/n8n-nodes-datamcp-0.1.0.tgz
```

Restart n8n after installation. n8n Cloud cannot load this unpublished local
package.

## Credential setup

1. Create the database source in DataMCP.
2. Open **API Keys → Integration credentials** in the DataMCP dashboard.
3. Create a read credential limited to only the source(s) the workflow needs.
4. Copy the `dm_int_` secret immediately; it is shown once.
5. In n8n, create **DataMCP Integration API**, choose QA or Production, and
   paste the secret.

Do not use a workspace `sk_live_` API key. Workspace keys have broader access.
An Integration credential is restricted to selected sources and operations.

## Operations

### Read Query

Read Query is available in QA and production. It accepts read-only SQL and an
optional JSON array of bound values. Use `$1`, `$2`, and so on for PostgreSQL,
or `?` for MySQL. Values are sent separately from SQL.

Reads return at most 100 rows and 512 KiB. Each result row becomes one n8n item
with `row`, `columns`, `values`, `rowCount`, `truncated`, and `sourceId`. An
empty result emits one item with `row: null`.

### Create Row, Update Row, and Delete Row

Row mutations are enabled and live-tested on QA, but are disabled in
production. Choose up to 20 schema-qualified tables in one source, then grant
only the Create, Update, and Delete actions the workflow needs. A write
credential may also allow Read Query. Read Query can reach any table covered
by the database user's SELECT grants in that source; selecting write tables
does not narrow SQL reads. Database grants remain the final permission
boundary.

Create and Update accept **Row Values**, a JSON object. Update and Delete also
require **Primary Key**, a JSON object containing every primary-key column.
Each action affects at most one row and returns `affectedRows` as `0` or `1`.

Do not add automatic retries to write nodes. If a response is lost, read the
row before retrying because the write may already have reached the database.

## Local Agent Tunnel

The node does not connect directly to a database. For a tunnel-backed source,
the PostgreSQL password remains on the Local Agent machine, while SQL and query
results pass through DataMCP and n8n. The agent must be online and the source
schema must be synchronized before the source can be used.

## Current release checks

QA n8n 2.44.6 has exercised direct hosted PostgreSQL and Local Agent Tunnel:
bounded 25,000-row reads, CTE/window queries, bound parameters, create/update/
delete, zero-row updates, read-only and cross-source denials, paused sources,
offline/recovered agents, and oversized result rows. Key revocation returned
401 immediately in the live Integration API.

Do not publish this package before completing:

- production migration and write-feature review;
- credential revocation in a running n8n workflow;
- live HTTP 402 and 429 workflow checks;
- production-backed regression and npm publication/scan.

The QA credentials and disposable databases used during development are test
fixtures and must never be included in this package.

## Publishing checklist

The package must live in a public GitHub repository before submission. Its
`v*.*.*` tag runs CI and publishes to npm from GitHub Actions with provenance.
The npm package must trust this repository's `publish.yml` workflow, or the
repository must have a narrowly scoped `NPM_TOKEN` secret for the first publish.
Do not tag a release until the QA checks above pass and production supports
every operation advertised by the node. After publication, run n8n's
`@n8n/scan-community-package` check against the published package version and
submit through the n8n Creator Portal. The scanner resolves npm packages; it
cannot validate an unpublished local directory.
