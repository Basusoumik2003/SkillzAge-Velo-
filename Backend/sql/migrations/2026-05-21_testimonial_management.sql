-- Admin-managed testimonials for the public homepage stories section.

CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  testimonial_type VARCHAR(20) NOT NULL DEFAULT 'text',
  name VARCHAR(160) NOT NULL,
  role VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  text_content TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL DEFAULT '',
  video_public_id TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_testimonials_type CHECK (testimonial_type IN ('text', 'video'))
);

CREATE INDEX IF NOT EXISTS ix_testimonials_active_order
  ON testimonials(is_active, display_order, id);
