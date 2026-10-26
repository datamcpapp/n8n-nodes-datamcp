# DataMCP node for n8n

Use a source-scoped DataMCP Integration credential to read PostgreSQL or MySQL
from n8n. Private PostgreSQL sources can be reached through Local Agent Tunnel.
The n8n action is **DataMCP Database** for both direct and tunneled sources;
the tunnel is a routing choice in DataMCP, not a second n8n node.

**Setup guide:** [Credentials and operations](#credential-setup)

## Installation

When this package is available on npm, install `n8n-nodes-datamcp` through
n8n's Community Nodes settings. Before publication, use the local preview
below. Do not use an `npx install` command; n8n does not provide one.

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
npm pack --silent

# On the self-hosted n8n machine
mkdir -p ~/.n8n/nodes
cd ~/.n8n/nodes
npm install /absolute/path/to/the-copied-package.tgz
```

Copy the archive whose filename `npm pack` prints to the n8n machine, then
replace the example path. Restart n8n after installation. n8n Cloud cannot
load this unpublished local package.

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

Read Query is available in QA. Production requires the Integration API rollout
before this credential and action can work there. The operation accepts
read-only SQL and an optional JSON array of bound values. Use `$1`, `$2`, and
so on for PostgreSQL, or `?` for MySQL. Values are sent separately from SQL.

Reads return at most 100 rows and 512 KiB. Each result row becomes one n8n item
with `row`, `columns`, `values`, `rowCount`, `truncated`, and `sourceId`. An
empty result emits one item with `row: null`.

For larger tables, page by a stable unique key rather than increasing OFFSET:

```sql
SELECT id, label FROM public.orders WHERE id > $1 ORDER BY id LIMIT 100
```

Start with a bound parameter of `0` for a positive identity key, then pass the
last returned ID into the next request. Stop when a page is empty. If a query
already contains `LIMIT 100`, `truncated: false` does not prove that the table
has no later rows. Narrow wide rows with an explicit column list; a single
row larger than 512 KiB is rejected rather than silently cut in half.

### Create Row, Update Row, and Delete Row

Row mutations require integration writes to be enabled in your DataMCP
environment. Choose up to 20 schema-qualified tables in one source, then grant
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
401 immediately in a running n8n workflow. Temporarily canceling and then
restoring a QA test subscription produced a 402 denial followed by a
successful read after the entitlement cache expired. A QA rate-limit burst
returned HTTP 429, which a running n8n workflow displayed as a safe rate-limit
error. The packed archive was checked separately from the source checkout.

Do not publish this package before completing:

- production migration and write-feature review;
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
