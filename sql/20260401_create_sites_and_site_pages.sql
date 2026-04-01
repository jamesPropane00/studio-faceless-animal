-- Faceless Animal Studios: Shared Site/Page Architecture
-- Migration: Create sites and site_pages tables

-- 1. SITES TABLE (one site per user)
CREATE TABLE IF NOT EXISTS sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE,
  signal_id text,
  username text NOT NULL UNIQUE,
  site_title text,
  default_template_name text,
  default_theme_name text,
  site_config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. SITE_PAGES TABLE (multiple pages per site)
CREATE TABLE IF NOT EXISTS site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  signal_id text,
  username text NOT NULL,
  page_slug text NOT NULL,
  page_title text,
  template_name text,
  theme_name text,
  page_config jsonb DEFAULT '{}'::jsonb,
  html text,
  css text,
  full_document text,
  builder_mode_last_used text,
  sort_order integer DEFAULT 0,
  is_homepage boolean DEFAULT false,
  is_published boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(site_id, page_slug)
);

-- Index for fast lookup by username/slug
CREATE INDEX IF NOT EXISTS idx_site_pages_username_slug ON site_pages(username, page_slug);
-- Index for homepage lookup
CREATE INDEX IF NOT EXISTS idx_site_pages_homepage ON site_pages(site_id, is_homepage);
