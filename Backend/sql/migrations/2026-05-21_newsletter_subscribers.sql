-- Footer newsletter subscriptions.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'subscribed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_newsletter_subscribers_status CHECK (status IN ('subscribed', 'unsubscribed'))
);

CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS ix_newsletter_subscribers_created_at ON newsletter_subscribers(created_at);
