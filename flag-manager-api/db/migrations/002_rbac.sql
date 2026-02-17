CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL,
  is_builtin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_roles (
  user_id TEXT NOT NULL,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id);

-- Seed built-in roles
INSERT INTO roles (name, description, permissions, is_builtin) VALUES
  ('viewer', 'Read-only access', '[{"resource":"*","actions":["read"]}]', true),
  ('editor', 'Read/write flags and projects', '[{"resource":"flag","actions":["read","write","delete"]},{"resource":"project","actions":["read","write","delete"]},{"resource":"flagset","actions":["read","write"]},{"resource":"segment","actions":["read","write"]},{"resource":"settings","actions":["read"]}]', true),
  ('admin', 'Full access to all resources', '[{"resource":"*","actions":["read","write","delete","admin"]}]', true),
  ('owner', 'Full access including user management', '[{"resource":"*","actions":["read","write","delete","admin","manage_users"]}]', true)
ON CONFLICT (name) DO NOTHING;
