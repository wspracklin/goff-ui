package db

import (
	"context"
	"fmt"
	"time"
)

// Project represents a project in the database.
type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// ListProjects returns all project names (for backward compatibility).
func (s *Store) ListProjects(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, "SELECT name FROM projects ORDER BY name")
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, nil
}

// ListProjectsFull returns paginated projects with full details.
func (s *Store) ListProjectsFull(ctx context.Context, params PaginationParams) (*PaginatedResult[Project], error) {
	// Count total
	var total int
	countQuery := "SELECT COUNT(*) FROM projects"
	args := []interface{}{}
	argIdx := 1

	if params.Search != "" {
		countQuery += fmt.Sprintf(" WHERE name ILIKE $%d", argIdx)
		args = append(args, "%"+params.Search+"%")
		argIdx++
	}

	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count projects: %w", err)
	}

	// Query with pagination
	query := "SELECT id, name, COALESCE(description, ''), created_at, updated_at FROM projects"
	queryArgs := []interface{}{}
	queryArgIdx := 1

	if params.Search != "" {
		query += fmt.Sprintf(" WHERE name ILIKE $%d", queryArgIdx)
		queryArgs = append(queryArgs, "%"+params.Search+"%")
		queryArgIdx++
	}

	// Safe sort columns
	sortCol := "created_at"
	switch params.Sort {
	case "name":
		sortCol = "name"
	case "updated_at":
		sortCol = "updated_at"
	}
	query += fmt.Sprintf(" ORDER BY %s %s", sortCol, params.OrderDirection())
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", queryArgIdx, queryArgIdx+1)
	queryArgs = append(queryArgs, params.Limit(), params.Offset())

	rows, err := s.pool.Query(ctx, query, queryArgs...)
	if err != nil {
		return nil, fmt.Errorf("list projects: %w", err)
	}
	defer rows.Close()

	var projects []Project
	for rows.Next() {
		var p Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		projects = append(projects, p)
	}

	if projects == nil {
		projects = []Project{}
	}

	return &PaginatedResult[Project]{
		Data:       projects,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.Limit(),
		TotalPages: TotalPages(total, params.Limit()),
	}, nil
}

// GetProject returns a project by name.
func (s *Store) GetProject(ctx context.Context, name string) (*Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		"SELECT id, name, COALESCE(description, ''), created_at, updated_at FROM projects WHERE name = $1",
		name,
	).Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// GetProjectID returns the project ID for a given name.
func (s *Store) GetProjectID(ctx context.Context, name string) (string, error) {
	var id string
	err := s.pool.QueryRow(ctx, "SELECT id FROM projects WHERE name = $1", name).Scan(&id)
	return id, err
}

// CreateProject creates a new project.
func (s *Store) CreateProject(ctx context.Context, name, description string) (*Project, error) {
	var p Project
	err := s.pool.QueryRow(ctx,
		`INSERT INTO projects (name, description) VALUES ($1, $2)
		 RETURNING id, name, COALESCE(description, ''), created_at, updated_at`,
		name, description,
	).Scan(&p.ID, &p.Name, &p.Description, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create project: %w", err)
	}
	return &p, nil
}

// DeleteProject deletes a project by name (cascades to flags).
func (s *Store) DeleteProject(ctx context.Context, name string) error {
	tag, err := s.pool.Exec(ctx, "DELETE FROM projects WHERE name = $1", name)
	if err != nil {
		return fmt.Errorf("delete project: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("project not found")
	}
	return nil
}

// ProjectExists checks if a project exists.
func (s *Store) ProjectExists(ctx context.Context, name string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM projects WHERE name = $1)", name).Scan(&exists)
	return exists, err
}
