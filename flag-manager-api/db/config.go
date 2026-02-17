package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// DBIntegration represents a git integration in the database.
type DBIntegration struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Provider    string          `json:"provider"`
	Description string          `json:"description,omitempty"`
	IsDefault   bool            `json:"isDefault"`
	Config      json.RawMessage `json:"config"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// DBNotifier represents a notifier in the database.
type DBNotifier struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Kind        string          `json:"kind"`
	Description string          `json:"description,omitempty"`
	Enabled     bool            `json:"enabled"`
	Config      json.RawMessage `json:"config"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// DBExporter represents an exporter in the database.
type DBExporter struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Kind        string          `json:"kind"`
	Description string          `json:"description,omitempty"`
	Enabled     bool            `json:"enabled"`
	Config      json.RawMessage `json:"config"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// DBRetriever represents a retriever in the database.
type DBRetriever struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Kind        string          `json:"kind"`
	Description string          `json:"description,omitempty"`
	Enabled     bool            `json:"enabled"`
	Config      json.RawMessage `json:"config"`
	CreatedAt   time.Time       `json:"createdAt"`
	UpdatedAt   time.Time       `json:"updatedAt"`
}

// ===================== Integrations =====================

func (s *Store) ListIntegrations(ctx context.Context) ([]DBIntegration, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at
		 FROM integrations ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBIntegration
	for rows.Next() {
		var item DBIntegration
		if err := rows.Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.IsDefault, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DBIntegration{}
	}
	return items, nil
}

func (s *Store) GetIntegration(ctx context.Context, id string) (*DBIntegration, error) {
	var item DBIntegration
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at
		 FROM integrations WHERE id = $1`, id,
	).Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.IsDefault, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) CreateIntegration(ctx context.Context, item DBIntegration) (*DBIntegration, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if item.IsDefault {
		if _, err := tx.Exec(ctx, "UPDATE integrations SET is_default = false"); err != nil {
			return nil, err
		}
	}

	var created DBIntegration
	err = tx.QueryRow(ctx,
		`INSERT INTO integrations (id, name, provider, description, is_default, config)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at`,
		item.ID, item.Name, item.Provider, item.Description, item.IsDefault, item.Config,
	).Scan(&created.ID, &created.Name, &created.Provider, &created.Description, &created.IsDefault, &created.Config, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create integration: %w", err)
	}

	return &created, tx.Commit(ctx)
}

func (s *Store) UpdateIntegration(ctx context.Context, id string, item DBIntegration) (*DBIntegration, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if item.IsDefault {
		if _, err := tx.Exec(ctx, "UPDATE integrations SET is_default = false WHERE id != $1", id); err != nil {
			return nil, err
		}
	}

	var updated DBIntegration
	err = tx.QueryRow(ctx,
		`UPDATE integrations SET name = $1, provider = $2, description = $3, is_default = $4, config = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at`,
		item.Name, item.Provider, item.Description, item.IsDefault, item.Config, id,
	).Scan(&updated.ID, &updated.Name, &updated.Provider, &updated.Description, &updated.IsDefault, &updated.Config, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update integration: %w", err)
	}

	return &updated, tx.Commit(ctx)
}

func (s *Store) DeleteIntegration(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM integrations WHERE id = $1", id)
	return err
}

func (s *Store) GetDefaultIntegration(ctx context.Context) (*DBIntegration, error) {
	var item DBIntegration
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at
		 FROM integrations WHERE is_default = true LIMIT 1`,
	).Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.IsDefault, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	if err == pgx.ErrNoRows {
		// Fall back to first integration
		err = s.pool.QueryRow(ctx,
			`SELECT id, name, provider, COALESCE(description, ''), is_default, config, created_at, updated_at
			 FROM integrations LIMIT 1`,
		).Scan(&item.ID, &item.Name, &item.Provider, &item.Description, &item.IsDefault, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	}
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// ===================== Notifiers =====================

func (s *Store) ListNotifiers(ctx context.Context) ([]DBNotifier, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM notifiers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBNotifier
	for rows.Next() {
		var item DBNotifier
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DBNotifier{}
	}
	return items, nil
}

func (s *Store) GetNotifier(ctx context.Context, id string) (*DBNotifier, error) {
	var item DBNotifier
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM notifiers WHERE id = $1`, id,
	).Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) CreateNotifier(ctx context.Context, item DBNotifier) (*DBNotifier, error) {
	var created DBNotifier
	err := s.pool.QueryRow(ctx,
		`INSERT INTO notifiers (id, name, kind, description, enabled, config)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.ID, item.Name, item.Kind, item.Description, item.Enabled, item.Config,
	).Scan(&created.ID, &created.Name, &created.Kind, &created.Description, &created.Enabled, &created.Config, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create notifier: %w", err)
	}
	return &created, nil
}

func (s *Store) UpdateNotifier(ctx context.Context, id string, item DBNotifier) (*DBNotifier, error) {
	var updated DBNotifier
	err := s.pool.QueryRow(ctx,
		`UPDATE notifiers SET name = $1, kind = $2, description = $3, enabled = $4, config = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.Name, item.Kind, item.Description, item.Enabled, item.Config, id,
	).Scan(&updated.ID, &updated.Name, &updated.Kind, &updated.Description, &updated.Enabled, &updated.Config, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update notifier: %w", err)
	}
	return &updated, nil
}

func (s *Store) DeleteNotifier(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM notifiers WHERE id = $1", id)
	return err
}

func (s *Store) GetEnabledNotifiers(ctx context.Context) ([]DBNotifier, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM notifiers WHERE enabled = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBNotifier
	for rows.Next() {
		var item DBNotifier
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// ===================== Exporters =====================

func (s *Store) ListExporters(ctx context.Context) ([]DBExporter, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM exporters ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBExporter
	for rows.Next() {
		var item DBExporter
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DBExporter{}
	}
	return items, nil
}

func (s *Store) GetExporter(ctx context.Context, id string) (*DBExporter, error) {
	var item DBExporter
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM exporters WHERE id = $1`, id,
	).Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) CreateExporter(ctx context.Context, item DBExporter) (*DBExporter, error) {
	var created DBExporter
	err := s.pool.QueryRow(ctx,
		`INSERT INTO exporters (id, name, kind, description, enabled, config)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.ID, item.Name, item.Kind, item.Description, item.Enabled, item.Config,
	).Scan(&created.ID, &created.Name, &created.Kind, &created.Description, &created.Enabled, &created.Config, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create exporter: %w", err)
	}
	return &created, nil
}

func (s *Store) UpdateExporter(ctx context.Context, id string, item DBExporter) (*DBExporter, error) {
	var updated DBExporter
	err := s.pool.QueryRow(ctx,
		`UPDATE exporters SET name = $1, kind = $2, description = $3, enabled = $4, config = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.Name, item.Kind, item.Description, item.Enabled, item.Config, id,
	).Scan(&updated.ID, &updated.Name, &updated.Kind, &updated.Description, &updated.Enabled, &updated.Config, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update exporter: %w", err)
	}
	return &updated, nil
}

func (s *Store) DeleteExporter(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM exporters WHERE id = $1", id)
	return err
}

func (s *Store) GetEnabledExporters(ctx context.Context) ([]DBExporter, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM exporters WHERE enabled = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBExporter
	for rows.Next() {
		var item DBExporter
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// ===================== Retrievers =====================

func (s *Store) ListRetrievers(ctx context.Context) ([]DBRetriever, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM retrievers ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBRetriever
	for rows.Next() {
		var item DBRetriever
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if items == nil {
		items = []DBRetriever{}
	}
	return items, nil
}

func (s *Store) GetRetriever(ctx context.Context, id string) (*DBRetriever, error) {
	var item DBRetriever
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM retrievers WHERE id = $1`, id,
	).Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *Store) CreateRetriever(ctx context.Context, item DBRetriever) (*DBRetriever, error) {
	var created DBRetriever
	err := s.pool.QueryRow(ctx,
		`INSERT INTO retrievers (id, name, kind, description, enabled, config)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.ID, item.Name, item.Kind, item.Description, item.Enabled, item.Config,
	).Scan(&created.ID, &created.Name, &created.Kind, &created.Description, &created.Enabled, &created.Config, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create retriever: %w", err)
	}
	return &created, nil
}

func (s *Store) UpdateRetriever(ctx context.Context, id string, item DBRetriever) (*DBRetriever, error) {
	var updated DBRetriever
	err := s.pool.QueryRow(ctx,
		`UPDATE retrievers SET name = $1, kind = $2, description = $3, enabled = $4, config = $5, updated_at = now()
		 WHERE id = $6
		 RETURNING id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at`,
		item.Name, item.Kind, item.Description, item.Enabled, item.Config, id,
	).Scan(&updated.ID, &updated.Name, &updated.Kind, &updated.Description, &updated.Enabled, &updated.Config, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update retriever: %w", err)
	}
	return &updated, nil
}

func (s *Store) DeleteRetriever(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, "DELETE FROM retrievers WHERE id = $1", id)
	return err
}

func (s *Store) GetEnabledRetrievers(ctx context.Context) ([]DBRetriever, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, kind, COALESCE(description, ''), enabled, config, created_at, updated_at
		 FROM retrievers WHERE enabled = true`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []DBRetriever
	for rows.Next() {
		var item DBRetriever
		if err := rows.Scan(&item.ID, &item.Name, &item.Kind, &item.Description, &item.Enabled, &item.Config, &item.CreatedAt, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}
