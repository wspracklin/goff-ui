package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// Flag represents a feature flag in the database.
type Flag struct {
	ID        string          `json:"id"`
	ProjectID string          `json:"projectId"`
	Key       string          `json:"key"`
	Config    json.RawMessage `json:"config"`
	Disabled  bool            `json:"disabled"`
	Version   string          `json:"version,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// ListFlags returns all flags for a project as a map (backward-compatible format).
func (s *Store) ListFlags(ctx context.Context, projectName string) (map[string]json.RawMessage, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT f.key, f.config FROM flags f
		 JOIN projects p ON p.id = f.project_id
		 WHERE p.name = $1 ORDER BY f.key`,
		projectName,
	)
	if err != nil {
		return nil, fmt.Errorf("list flags: %w", err)
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

// ListFlagsPaginated returns paginated flags for a project.
func (s *Store) ListFlagsPaginated(ctx context.Context, projectName string, params PaginationParams) (*PaginatedResult[Flag], error) {
	// Get project ID
	projectID, err := s.GetProjectID(ctx, projectName)
	if err != nil {
		return nil, fmt.Errorf("project not found: %w", err)
	}

	// Count
	var total int
	countQuery := "SELECT COUNT(*) FROM flags WHERE project_id = $1"
	countArgs := []interface{}{projectID}
	argIdx := 2

	if params.Search != "" {
		countQuery += fmt.Sprintf(" AND key ILIKE $%d", argIdx)
		countArgs = append(countArgs, "%"+params.Search+"%")
		argIdx++
	}

	if err := s.pool.QueryRow(ctx, countQuery, countArgs...).Scan(&total); err != nil {
		return nil, err
	}

	// Query
	query := "SELECT id, project_id, key, config, disabled, COALESCE(version, ''), created_at, updated_at FROM flags WHERE project_id = $1"
	queryArgs := []interface{}{projectID}
	queryArgIdx := 2

	if params.Search != "" {
		query += fmt.Sprintf(" AND key ILIKE $%d", queryArgIdx)
		queryArgs = append(queryArgs, "%"+params.Search+"%")
		queryArgIdx++
	}

	sortCol := "key"
	switch params.Sort {
	case "created_at":
		sortCol = "created_at"
	case "updated_at":
		sortCol = "updated_at"
	}
	query += fmt.Sprintf(" ORDER BY %s %s", sortCol, params.OrderDirection())
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", queryArgIdx, queryArgIdx+1)
	queryArgs = append(queryArgs, params.Limit(), params.Offset())

	rows, err := s.pool.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var flags []Flag
	for rows.Next() {
		var f Flag
		if err := rows.Scan(&f.ID, &f.ProjectID, &f.Key, &f.Config, &f.Disabled, &f.Version, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		flags = append(flags, f)
	}

	if flags == nil {
		flags = []Flag{}
	}

	return &PaginatedResult[Flag]{
		Data:       flags,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.Limit(),
		TotalPages: TotalPages(total, params.Limit()),
	}, nil
}

// GetFlag returns a single flag by project name and key.
func (s *Store) GetFlag(ctx context.Context, projectName, flagKey string) (*Flag, error) {
	var f Flag
	err := s.pool.QueryRow(ctx,
		`SELECT f.id, f.project_id, f.key, f.config, f.disabled, COALESCE(f.version, ''), f.created_at, f.updated_at
		 FROM flags f JOIN projects p ON p.id = f.project_id
		 WHERE p.name = $1 AND f.key = $2`,
		projectName, flagKey,
	).Scan(&f.ID, &f.ProjectID, &f.Key, &f.Config, &f.Disabled, &f.Version, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// CreateFlag creates a new flag.
func (s *Store) CreateFlag(ctx context.Context, projectName, flagKey string, config json.RawMessage, disabled bool, version string) (*Flag, error) {
	projectID, err := s.GetProjectID(ctx, projectName)
	if err != nil {
		// Auto-create project if it doesn't exist
		p, createErr := s.CreateProject(ctx, projectName, "")
		if createErr != nil {
			return nil, fmt.Errorf("create project for flag: %w", createErr)
		}
		projectID = p.ID
	}

	var f Flag
	err = s.pool.QueryRow(ctx,
		`INSERT INTO flags (project_id, key, config, disabled, version)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, project_id, key, config, disabled, COALESCE(version, ''), created_at, updated_at`,
		projectID, flagKey, config, disabled, version,
	).Scan(&f.ID, &f.ProjectID, &f.Key, &f.Config, &f.Disabled, &f.Version, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create flag: %w", err)
	}
	return &f, nil
}

// UpdateFlag updates a flag's config. Supports rename via newKey.
func (s *Store) UpdateFlag(ctx context.Context, projectName, flagKey string, config json.RawMessage, disabled bool, version string, newKey string) (*Flag, error) {
	effectiveKey := flagKey
	if newKey != "" && newKey != flagKey {
		effectiveKey = newKey
	}

	var f Flag
	err := s.pool.QueryRow(ctx,
		`UPDATE flags SET key = $1, config = $2, disabled = $3, version = $4, updated_at = now()
		 WHERE project_id = (SELECT id FROM projects WHERE name = $5) AND key = $6
		 RETURNING id, project_id, key, config, disabled, COALESCE(version, ''), created_at, updated_at`,
		effectiveKey, config, disabled, version, projectName, flagKey,
	).Scan(&f.ID, &f.ProjectID, &f.Key, &f.Config, &f.Disabled, &f.Version, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update flag: %w", err)
	}
	return &f, nil
}

// DeleteFlag deletes a flag.
func (s *Store) DeleteFlag(ctx context.Context, projectName, flagKey string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM flags
		 WHERE project_id = (SELECT id FROM projects WHERE name = $1) AND key = $2`,
		projectName, flagKey,
	)
	if err != nil {
		return fmt.Errorf("delete flag: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("flag not found")
	}
	return nil
}

// FlagExists checks if a flag exists.
func (s *Store) FlagExists(ctx context.Context, projectName, flagKey string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx,
		`SELECT EXISTS(
			SELECT 1 FROM flags f JOIN projects p ON p.id = f.project_id
			WHERE p.name = $1 AND f.key = $2
		)`,
		projectName, flagKey,
	).Scan(&exists)
	return exists, err
}

// GetAllFlags returns all flags across all projects (for /api/flags/raw).
func (s *Store) GetAllFlags(ctx context.Context) (map[string]json.RawMessage, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT p.name, f.key, f.config FROM flags f
		 JOIN projects p ON p.id = f.project_id
		 ORDER BY p.name, f.key`,
	)
	if err != nil {
		return nil, fmt.Errorf("get all flags: %w", err)
	}
	defer rows.Close()

	allFlags := make(map[string]json.RawMessage)
	for rows.Next() {
		var project, key string
		var config json.RawMessage
		if err := rows.Scan(&project, &key, &config); err != nil {
			return nil, err
		}
		allFlags[project+"/"+key] = config
	}
	return allFlags, nil
}

// GetProjectFlags returns all flags for a project (for /api/flags/raw/{project}).
func (s *Store) GetProjectFlags(ctx context.Context, projectName string) (map[string]json.RawMessage, error) {
	return s.ListFlags(ctx, projectName)
}
