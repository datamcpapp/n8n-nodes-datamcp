CREATE TABLE IF NOT EXISTS n8n_release_probe.mutations (
  id integer PRIMARY KEY,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'new'
);

GRANT USAGE ON SCHEMA n8n_release_probe TO datamcp_n8n_direct_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON n8n_release_probe.mutations TO datamcp_n8n_direct_rw;
