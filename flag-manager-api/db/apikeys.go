package db

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

// APIKey represents an API key in the database.
type APIKey struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	KeyPrefix   string     `json:"keyPrefix"`
	Permissions []string   `json:"permissions"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
}

// CreateAPIKey creates a new API key and returns it with the unhashed key.
func (s *Store) CreateAPIKey(ctx context.Context, name string, permissions []string, expiresAt *time.Time) (*APIKey, string, error) {
	// Generate a random key
	rawKey := generateAPIKey()
	prefix := rawKey[:8]

	hash, err := bcrypt.GenerateFromPassword([]byte(rawKey), bcrypt.DefaultCost)
	if err != nil {
		return nil, "", fmt.Errorf("hash API key: %w", err)
	}

	var key APIKey
	err = s.pool.QueryRow(ctx,
		`INSERT INTO api_keys (name, key_hash, key_prefix, permissions, expires_at)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, name, key_prefix, permissions, created_at, expires_at, last_used_at`,
		name, string(hash), prefix, permissions, expiresAt,
	).Scan(&key.ID, &key.Name, &key.KeyPrefix, &key.Permissions, &key.CreatedAt, &key.ExpiresAt, &key.LastUsedAt)
	if err != nil {
		return nil, "", fmt.Errorf("create API key: %w", err)
	}

	return &key, rawKey, nil
}

// ListAPIKeys returns all API keys (without hashes).
func (s *Store) ListAPIKeys(ctx context.Context) ([]APIKey, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, key_prefix, permissions, created_at, expires_at, last_used_at
		 FROM api_keys ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []APIKey
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.KeyPrefix, &k.Permissions, &k.CreatedAt, &k.ExpiresAt, &k.LastUsedAt); err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	if keys == nil {
		keys = []APIKey{}
	}
	return keys, nil
}

// ValidateAPIKey checks if a raw API key is valid and returns the associated key record.
func (s *Store) ValidateAPIKey(ctx context.Context, rawKey string) (*APIKey, error) {
	if len(rawKey) < 8 {
		return nil, fmt.Errorf("invalid API key")
	}

	prefix := rawKey[:8]

	// Find keys matching this prefix
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, key_hash, key_prefix, permissions, created_at, expires_at, last_used_at
		 FROM api_keys WHERE key_prefix = $1`,
		prefix)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var k APIKey
		var keyHash string
		if err := rows.Scan(&k.ID, &k.Name, &keyHash, &k.KeyPrefix, &k.Permissions, &k.CreatedAt, &k.ExpiresAt, &k.LastUsedAt); err != nil {
			return nil, err
		}

		// Check expiry
		if k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now()) {
			continue
		}

		// Verify hash
		if err := bcrypt.CompareHashAndPassword([]byte(keyHash), []byte(rawKey)); err == nil {
			// Update last used
			s.pool.Exec(ctx, "UPDATE api_keys SET last_used_at = now() WHERE id = $1", k.ID)
			return &k, nil
		}
	}

	return nil, fmt.Errorf("invalid API key")
}

// DeleteAPIKey deletes an API key.
func (s *Store) DeleteAPIKey(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, "DELETE FROM api_keys WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// generateAPIKey creates a cryptographically random API key string.
func generateAPIKey() string {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		panic("failed to generate random bytes: " + err.Error())
	}
	return "goff_" + hex.EncodeToString(b)
}
