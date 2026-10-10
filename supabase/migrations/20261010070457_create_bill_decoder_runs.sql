/*
# Create Utility Bill Decoder runs table

1. New Tables
- `bill_decoder_runs`
- `id` (uuid primary key)
- `bill_id` (text identifying the uploaded file without exposing bill identifiers)
- `file_name` (text original upload name)
- `provider` (text detected utility provider)
- `extraction` (jsonb Level 1 JSON result)
- `answers` (jsonb Level 2 answer rows)
- `created_at` (timestamptz creation time)

2. Security
- Row level security is enabled.
- This is a single-tenant, no-sign-in workspace, so anon and authenticated clients can read and write runs.

3. Notes
- Image files and API keys are never stored.
- JSON results are stored to preserve completed work across reloads.
*/

CREATE TABLE IF NOT EXISTS bill_decoder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id text NOT NULL,
  file_name text NOT NULL,
  provider text,
  extraction jsonb NOT NULL,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bill_decoder_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bill_decoder_runs" ON bill_decoder_runs;
CREATE POLICY "anon_select_bill_decoder_runs" ON bill_decoder_runs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bill_decoder_runs" ON bill_decoder_runs;
CREATE POLICY "anon_insert_bill_decoder_runs" ON bill_decoder_runs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bill_decoder_runs" ON bill_decoder_runs;
CREATE POLICY "anon_update_bill_decoder_runs" ON bill_decoder_runs
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bill_decoder_runs" ON bill_decoder_runs;
CREATE POLICY "anon_delete_bill_decoder_runs" ON bill_decoder_runs
  FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS bill_decoder_runs_created_at_idx
  ON bill_decoder_runs (created_at DESC);