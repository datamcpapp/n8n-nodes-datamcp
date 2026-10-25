BEGIN;

CREATE TABLE IF NOT EXISTS public.n8n_release_stress (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bucket integer NOT NULL,
  label text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

TRUNCATE public.n8n_release_stress RESTART IDENTITY;

INSERT INTO public.n8n_release_stress (bucket, label, payload)
SELECT
  series_id % 17,
  'probe-' || series_id,
  jsonb_build_object('index', series_id, 'tags', jsonb_build_array('qa', 'n8n'))
FROM generate_series(1, 25000) AS series_id;

INSERT INTO public.n8n_release_stress (bucket, label, payload)
VALUES
  (99, 'unicode-🙂-тест', '{"kind":"unicode","nested":{"ready":true}}'::jsonb),
  (99, 'wide-row', jsonb_build_object('kind', 'wide', 'blob', repeat('w', 600 * 1024)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_release_stress TO datamcp_e2e_writer;
GRANT USAGE, SELECT ON SEQUENCE public.n8n_release_stress_id_seq TO datamcp_e2e_writer;

DELETE FROM public.integration_probe WHERE label LIKE 'n8n-release-%';

INSERT INTO public.integration_probe (label)
SELECT 'n8n-release-' || series_id
FROM generate_series(1, 25000) AS series_id;

INSERT INTO public.integration_probe (label)
VALUES
  ('n8n-release-unicode-🙂-тест'),
  ('n8n-release-wide-' || repeat('w', 600 * 1024));

COMMIT;
