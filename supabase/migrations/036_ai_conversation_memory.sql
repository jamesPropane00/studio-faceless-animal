-- AI conversation memory system.
-- Stores chat history so the AI can remember past conversations.
-- Session-based: each browser gets a persistent session_id via localStorage.

CREATE TABLE ai_conversations (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id    TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT        NOT NULL,
  model         TEXT        NOT NULL DEFAULT '@cf/meta/llama-3.2-3b-instruct',
  created_at    TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_ai_convs_lookup ON ai_conversations (session_id, created_at);

-- Allow anonymous insert/select so the AI chat works without login
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_ai" ON ai_conversations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_select_ai" ON ai_conversations FOR SELECT TO anon USING (true);
