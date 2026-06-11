-- SQL for member_pages table
CREATE TABLE IF NOT EXISTS member_pages (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  account_id text,
  signal_id text,
  title text,
  slug text,
  html text,
  css text,
  full_document text,
  route_hint text,
  is_published boolean DEFAULT true,
  updated_at timestamp with time zone DEFAULT now()
);

-- Index for fast lookup by username
CREATE UNIQUE INDEX IF NOT EXISTS member_pages_username_idx ON member_pages(username);
