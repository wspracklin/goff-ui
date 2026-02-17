CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  author_id TEXT,
  author_email TEXT,
  author_name TEXT,
  project TEXT,
  flag_key TEXT,
  resource_type TEXT NOT NULL DEFAULT 'flag',
  current_config JSONB,
  proposed_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  applied_at TIMESTAMPTZ,
  applied_by TEXT
);

CREATE TABLE change_request_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_request_id UUID REFERENCES change_requests(id) ON DELETE CASCADE,
  reviewer_id TEXT,
  reviewer_email TEXT,
  reviewer_name TEXT,
  decision TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cr_status ON change_requests(status);
CREATE INDEX idx_cr_author ON change_requests(author_id);
CREATE INDEX idx_cr_flag ON change_requests(project, flag_key);
CREATE INDEX idx_crr_cr ON change_request_reviews(change_request_id);
