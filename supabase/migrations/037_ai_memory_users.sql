-- Add per-user and multi-conversation support to AI memory
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS idx_ai_convs_user ON ai_conversations (username, conversation_id, created_at);
