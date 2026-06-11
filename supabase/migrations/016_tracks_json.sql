-- Migration 016: Add tracks_json column to member_accounts
-- Purpose: Store uploaded track metadata (title, url, path, size, uploaded_at)
--          Array of { id, title, description, url, path, size, uploaded_at }
--          Max 10 tracks per member (client-enforced)
-- Run in: Supabase SQL Editor

ALTER TABLE member_accounts
  ADD COLUMN IF NOT EXISTS tracks_json JSONB NOT NULL DEFAULT '[]';
