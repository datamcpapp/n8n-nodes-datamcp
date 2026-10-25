CREATE SCHEMA IF NOT EXISTS n8n_release_probe;

CREATE TABLE IF NOT EXISTS n8n_release_probe.items (
  id integer PRIMARY KEY,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO n8n_release_probe.items (id, label)
SELECT item_id, 'hosted-qa-' || item_id
FROM generate_series(1, 25000) AS item_id
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA n8n_release_probe TO datamcp_n8n_direct_ro;
GRANT SELECT ON n8n_release_probe.items TO datamcp_n8n_direct_ro;
