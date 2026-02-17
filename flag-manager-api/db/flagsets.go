package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// DBFlagSet represents a flag set in the database.
type DBFlagSet struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	IsDefault   bool            `json:"isDefault"`
	Retriever   json.RawMessage `json:"retriever,omitempty"`
	Exporter    json.RawMessage `json:"exporter,omitempty"`
	Notifier    json.RawMessage `json:"notifier,omitempty"`
	APIKeys     []string        `json:"apiKeys"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// DBFlagSetFlag represents a flag within a flag set.
type DBFlagSetFlag struct {
	ID        string          `json:"id"`
	FlagSetID string          `json:"flagSetId"`
	Key       string          `json:"key"`
	Config    json.RawMessage `json:"config"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// ListFlagSets returns all flag sets with their API keys.
func (s *Store) ListFlagSets(ctx context.Context) ([]DBFlagSet, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, COALESCE(description, ''), is_default,
		        retriever, exporter, notifier,
		        created_at, updated_at
		 FROM flag_sets ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list flag sets: %w", err)
	}
	defer rows.Close()

	var flagSets []DBFlagSet
	for rows.Next() {
		var fs DBFlagSet
		var retriever, exporter, notifier []byte
		if err := rows.Scan(&fs.ID, &fs.Name, &fs.Description, &fs.IsDefault,
			&retriever, &exporter, &notifier,
			&fs.CreatedAt, &fs.UpdatedAt); err != nil {
			return nil, err
		}
		fs.Retriever = retriever
		fs.Exporter = exporter
		fs.Notifier = notifier
		flagSets = append(flagSets, fs)
	}

	// Load API keys for each flag set
	for i := range flagSets {
		keys, err := s.getFlagSetAPIKeys(ctx, flagSets[i].ID)
		if err != nil {
			return nil, err
		}
		flagSets[i].APIKeys = keys
	}

	if flagSets == nil {
		flagSets = []DBFlagSet{}
	}
	return flagSets, nil
}

// GetFlagSet returns a flag set by ID.
func (s *Store) GetFlagSet(ctx context.Context, id string) (*DBFlagSet, error) {
	var fs DBFlagSet
	var retriever, exporter, notifier []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(description, ''), is_default,
		        retriever, exporter, notifier,
		        created_at, updated_at
		 FROM flag_sets WHERE id = $1`, id,
	).Scan(&fs.ID, &fs.Name, &fs.Description, &fs.IsDefault,
		&retriever, &exporter, &notifier,
		&fs.CreatedAt, &fs.UpdatedAt)
	if err != nil {
		return nil, err
	}
	fs.Retriever = retriever
	fs.Exporter = exporter
	fs.Notifier = notifier

	keys, err := s.getFlagSetAPIKeys(ctx, id)
	if err != nil {
		return nil, err
	}
	fs.APIKeys = keys
	return &fs, nil
}

// CreateFlagSet creates a new flag set.
func (s *Store) CreateFlagSet(ctx context.Context, fs DBFlagSet) (*DBFlagSet, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	// If this is default, clear other defaults
	if fs.IsDefault {
		if _, err := tx.Exec(ctx, "UPDATE flag_sets SET is_default = false"); err != nil {
			return nil, err
		}
	}

	var created DBFlagSet
	var retriever, exporter, notifier []byte
	err = tx.QueryRow(ctx,
		`INSERT INTO flag_sets (name, description, is_default, retriever, exporter, notifier)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, COALESCE(description, ''), is_default, retriever, exporter, notifier, created_at, updated_at`,
		fs.Name, fs.Description, fs.IsDefault, nullableJSON(fs.Retriever), nullableJSON(fs.Exporter), nullableJSON(fs.Notifier),
	).Scan(&created.ID, &created.Name, &created.Description, &created.IsDefault,
		&retriever, &exporter, &notifier,
		&created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create flag set: %w", err)
	}
	created.Retriever = retriever
	created.Exporter = exporter
	created.Notifier = notifier

	// Add API keys
	for _, key := range fs.APIKeys {
		if _, err := tx.Exec(ctx, "INSERT INTO flag_set_api_keys (flag_set_id, key) VALUES ($1, $2)", created.ID, key); err != nil {
			return nil, err
		}
	}
	created.APIKeys = fs.APIKeys

	return &created, tx.Commit(ctx)
}

// UpdateFlagSet updates a flag set.
func (s *Store) UpdateFlagSet(ctx context.Context, id string, fs DBFlagSet) (*DBFlagSet, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if fs.IsDefault {
		if _, err := tx.Exec(ctx, "UPDATE flag_sets SET is_default = false WHERE id != $1", id); err != nil {
			return nil, err
		}
	}

	var updated DBFlagSet
	var retriever, exporter, notifier []byte
	err = tx.QueryRow(ctx,
		`UPDATE flag_sets SET name = $1, description = $2, is_default = $3,
		        retriever = $4, exporter = $5, notifier = $6, updated_at = now()
		 WHERE id = $7
		 RETURNING id, name, COALESCE(description, ''), is_default, retriever, exporter, notifier, created_at, updated_at`,
		fs.Name, fs.Description, fs.IsDefault, nullableJSON(fs.Retriever), nullableJSON(fs.Exporter), nullableJSON(fs.Notifier), id,
	).Scan(&updated.ID, &updated.Name, &updated.Description, &updated.IsDefault,
		&retriever, &exporter, &notifier,
		&updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update flag set: %w", err)
	}
	updated.Retriever = retriever
	updated.Exporter = exporter
	updated.Notifier = notifier

	keys, _ := s.getFlagSetAPIKeys(ctx, id)
	updated.APIKeys = keys

	return &updated, tx.Commit(ctx)
}

// DeleteFlagSet deletes a flag set.
func (s *Store) DeleteFlagSet(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM flag_sets WHERE id = $1", id)
	return err
}

// GenerateFlagSetAPIKey adds a new API key to a flag set.
func (s *Store) GenerateFlagSetAPIKey(ctx context.Context, flagSetID, key string) error {
	_, err := s.pool.Exec(ctx, "INSERT INTO flag_set_api_keys (flag_set_id, key) VALUES ($1, $2)", flagSetID, key)
	return err
}

// RemoveFlagSetAPIKey removes an API key from a flag set.
func (s *Store) RemoveFlagSetAPIKey(ctx context.Context, flagSetID, key string) error {
	// Check if this is the last key
	var count int
	if err := s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM flag_set_api_keys WHERE flag_set_id = $1", flagSetID).Scan(&count); err != nil {
		return err
	}
	if count <= 1 {
		return fmt.Errorf("cannot remove last API key")
	}
	_, err := s.pool.Exec(ctx, "DELETE FROM flag_set_api_keys WHERE flag_set_id = $1 AND key = $2", flagSetID, key)
	return err
}

// getFlagSetAPIKeys returns all API keys for a flag set.
func (s *Store) getFlagSetAPIKeys(ctx context.Context, flagSetID string) ([]string, error) {
	rows, err := s.pool.Query(ctx, "SELECT key FROM flag_set_api_keys WHERE flag_set_id = $1", flagSetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	if keys == nil {
		keys = []string{}
	}
	return keys, nil
}

// Flag Set Flags operations

// ListFlagSetFlags returns all flags in a flag set.
func (s *Store) ListFlagSetFlags(ctx context.Context, flagSetID string) (map[string]json.RawMessage, error) {
	rows, err := s.pool.Query(ctx,
		"SELECT key, config FROM flag_set_flags WHERE flag_set_id = $1 ORDER BY key",
		flagSetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	flags := make(map[string]json.RawMessage)
	for rows.Next() {
		var key string
		var config json.RawMessage
		if err := rows.Scan(&key, &config); err != nil {
			return nil, err
		}
		flags[key] = config
	}
	return flags, nil
}

// GetFlagSetFlag returns a single flag from a flag set.
func (s *Store) GetFlagSetFlag(ctx context.Context, flagSetID, flagKey string) (json.RawMessage, error) {
	var config json.RawMessage
	err := s.pool.QueryRow(ctx,
		"SELECT config FROM flag_set_flags WHERE flag_set_id = $1 AND key = $2",
		flagSetID, flagKey).Scan(&config)
	if err != nil {
		return nil, err
	}
	return config, nil
}

// CreateFlagSetFlag creates a flag in a flag set.
func (s *Store) CreateFlagSetFlag(ctx context.Context, flagSetID, flagKey string, config json.RawMessage) error {
	_, err := s.pool.Exec(ctx,
		"INSERT INTO flag_set_flags (flag_set_id, key, config) VALUES ($1, $2, $3)",
		flagSetID, flagKey, config)
	return err
}

// UpdateFlagSetFlag updates a flag in a flag set. Supports rename.
func (s *Store) UpdateFlagSetFlag(ctx context.Context, flagSetID, flagKey string, config json.RawMessage, newKey string) error {
	effectiveKey := flagKey
	if newKey != "" && newKey != flagKey {
		effectiveKey = newKey
	}

	tag, err := s.pool.Exec(ctx,
		"UPDATE flag_set_flags SET key = $1, config = $2, updated_at = now() WHERE flag_set_id = $3 AND key = $4",
		effectiveKey, config, flagSetID, flagKey)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// DeleteFlagSetFlag deletes a flag from a flag set.
func (s *Store) DeleteFlagSetFlag(ctx context.Context, flagSetID, flagKey string) error {
	tag, err := s.pool.Exec(ctx,
		"DELETE FROM flag_set_flags WHERE flag_set_id = $1 AND key = $2",
		flagSetID, flagKey)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// FlagSetFlagExists checks if a flag exists in a flag set.
func (s *Store) FlagSetFlagExists(ctx context.Context, flagSetID, flagKey string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		"SELECT EXISTS(SELECT 1 FROM flag_set_flags WHERE flag_set_id = $1 AND key = $2)",
		flagSetID, flagKey).Scan(&exists)
	return exists, err
}

// nullableJSON converts a json.RawMessage to interface{} for nullable JSONB columns.
func nullableJSON(data json.RawMessage) interface{} {
	if len(data) == 0 || string(data) == "null" {
		return nil
	}
	return data
}
