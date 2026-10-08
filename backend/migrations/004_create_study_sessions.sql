CREATE TABLE IF NOT EXISTS study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
  topic_index INTEGER NOT NULL CHECK (topic_index >= 0),
  title VARCHAR(200) NOT NULL,
  session_date DATE NOT NULL,
  start_minute SMALLINT NOT NULL DEFAULT 1080 CHECK (start_minute BETWEEN 0 AND 1439),
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes IN (15, 25, 40)),
  learning_format VARCHAR(20) NOT NULL CHECK (learning_format IN ('read', 'listen', 'visual', 'practice')),
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'completed', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS study_sessions_user_date_idx
  ON study_sessions (user_id, session_date, start_minute);
