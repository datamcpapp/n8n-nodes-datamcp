# DataMCP node for n8n

Use a source-scoped DataMCP Integration credential to read PostgreSQL or MySQL
from n8n. Private PostgreSQL sources can be reached through Local Agent Tunnel.
The n8n action is **DataMCP Database** for both direct and tunneled sources;
the tunnel is a routing choice in DataMCP, not a second n8n node.

**Setup guide:** [Credentials and operations](#credential-setup)

## Installation

On self-hosted n8n, open **Settings → Community Nodes**, select **Install a
community node**, and enter `n8n-nodes-datamcp`. Restart n8n if the node does
not appear immediately. n8n Cloud availability depends on n8n's verification
and rollout of the package. Do not use an `npx install` command; n8n does not
provide one.

To develop the node from source, run:

```bash
cd n8n-nodes-datamcp
npm install
npm run build
npm test
npm run dev
```

The final command opens a local n8n editor with the DataMCP node installed.
The published package has also been loaded with n8n 2.44.6.

## Credential setup

1. Create the database source in DataMCP.
2. Open **API Keys → Integration keys** in the DataMCP dashboard.
3. Create a read-only key limited to only the source(s) the workflow needs.
4. Copy the `dm_int_` secret immediately; it is shown once.
5. In n8n, create **DataMCP Integration API**, choose QA or Production, and
   paste the secret.

Do not use a workspace `sk_live_` API key. Workspace keys have broader access.
An Integration credential is restricted to selected sources and operations.

To try a first read, import the
[example workflow](https://github.com/datamcpapp/n8n-nodes-datamcp/blob/main/examples/read-query.json)
into n8n. Select your saved Integration credential and a permitted database
source in the DataMCP Database node, then execute it. The example has no key,
credential reference, or database address embedded in it.

## Operations

### Read Query

Read Query is available in QA and production. The operation accepts read-only
SQL and an optional JSON array of bound values. Use `$1`, `$2`, and so on for
PostgreSQL, or `?` for MySQL. Values are sent separately from SQL.

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

Row mutations are currently enabled in QA but disabled in production. They
require integration writes to be enabled in your DataMCP environment. Choose
up to 20 schema-qualified tables in one source, then grant
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

Production Read Query was verified with a source-scoped key and `SELECT 1`;
the key was revoked after the test. Production row mutations have not yet been
enabled or verified. Version 0.1.0 was published manually, but did not include
provenance and therefore did not pass the n8n community-package scanner.

The QA credentials and disposable databases used during development are test
fixtures and must never be included in this package.

## Publishing checklist

The `v*.*.*` tag runs CI and publishes to npm from GitHub Actions with
provenance. Configure npm trusted publishing for the public
`datamcpapp/n8n-nodes-datamcp` repository and `publish.yml` workflow before
tagging a new version. Do not tag until the matching version is merged to main
and CI passes. After publication, run n8n's `@n8n/scan-community-package`
against the published version and submit through the n8n Creator Portal only
after it passes. The scanner resolves npm packages; it cannot validate an
unpublished local directory.
