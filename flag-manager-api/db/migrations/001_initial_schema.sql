-- 001_initial_schema.sql
-- Core tables for the feature flag platform

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Flags
CREATE TABLE IF NOT EXISTS flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    config JSONB NOT NULL,
    disabled BOOLEAN DEFAULT false,
    version TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, key)
);

CREATE INDEX IF NOT EXISTS idx_flags_project ON flags(project_id);
CREATE INDEX IF NOT EXISTS idx_flags_key ON flags(key);

-- Flag Sets
CREATE TABLE IF NOT EXISTS flag_sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    retriever JSONB,
    exporter JSONB,
    notifier JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flag_set_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_set_id UUID REFERENCES flag_sets(id) ON DELETE CASCADE,
    key TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flag_set_api_keys_set ON flag_set_api_keys(flag_set_id);

-- Flag Set Flags (separate storage per flag set)
CREATE TABLE IF NOT EXISTS flag_set_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_set_id UUID REFERENCES flag_sets(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(flag_set_id, key)
);

CREATE INDEX IF NOT EXISTS idx_flag_set_flags_set ON flag_set_flags(flag_set_id);

-- Integrations (Git providers)
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Notifiers
CREATE TABLE IF NOT EXISTS notifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Exporters
CREATE TABLE IF NOT EXISTS exporters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Retrievers
CREATE TABLE IF NOT EXISTS retrievers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT false,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys (for API authentication)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    permissions TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ DEFAULT now(),
    actor_id TEXT,
    actor_email TEXT,
    actor_name TEXT,
    actor_type TEXT,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    resource_name TEXT,
    project TEXT,
    changes JSONB,
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_id);
