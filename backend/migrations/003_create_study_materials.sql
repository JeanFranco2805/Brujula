CREATE TABLE IF NOT EXISTS study_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  sha256 CHAR(64) NOT NULL,
  file_size INTEGER NOT NULL,
  file_data BYTEA NOT NULL,
  extracted_text TEXT NOT NULL,
  summary TEXT NOT NULL,
  key_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  analysis_provider VARCHAR(20) NOT NULL DEFAULT 'local' CHECK (analysis_provider IN ('openai', 'local')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, sha256)
);

CREATE INDEX IF NOT EXISTS study_materials_user_created_idx
  ON study_materials (user_id, created_at DESC);
