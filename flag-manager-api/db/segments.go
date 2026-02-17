package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Segment represents a reusable targeting segment.
type Segment struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Rules       []string `json:"rules"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// ListSegments returns paginated segments.
func (s *Store) ListSegments(ctx context.Context, params PaginationParams) (*PaginatedResult[Segment], error) {
	where := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if params.Search != "" {
		where += fmt.Sprintf(" AND (name ILIKE $%d OR description ILIKE $%d)", argIdx, argIdx)
		args = append(args, "%"+params.Search+"%")
		argIdx++
	}

	var total int
	if err := s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM segments "+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count segments: %w", err)
	}

	query := `SELECT id, name, COALESCE(description, ''), rules, created_at, updated_at
	          FROM segments ` + where
	query += fmt.Sprintf(" ORDER BY name ASC")
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, params.Limit(), params.Offset())

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list segments: %w", err)
	}
	defer rows.Close()

	var segments []Segment
	for rows.Next() {
		var seg Segment
		var rulesJSON []byte
		if err := rows.Scan(&seg.ID, &seg.Name, &seg.Description, &rulesJSON, &seg.CreatedAt, &seg.UpdatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(rulesJSON, &seg.Rules)
		segments = append(segments, seg)
	}
	if segments == nil {
		segments = []Segment{}
	}

	return &PaginatedResult[Segment]{
		Data:       segments,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.Limit(),
		TotalPages: TotalPages(total, params.Limit()),
	}, nil
}

// GetSegment returns a segment by ID.
func (s *Store) GetSegment(ctx context.Context, id string) (*Segment, error) {
	var seg Segment
	var rulesJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(description, ''), rules, created_at, updated_at
		 FROM segments WHERE id = $1`, id,
	).Scan(&seg.ID, &seg.Name, &seg.Description, &rulesJSON, &seg.CreatedAt, &seg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(rulesJSON, &seg.Rules)
	return &seg, nil
}

// GetSegmentByName returns a segment by name.
func (s *Store) GetSegmentByName(ctx context.Context, name string) (*Segment, error) {
	var seg Segment
	var rulesJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(description, ''), rules, created_at, updated_at
		 FROM segments WHERE name = $1`, name,
	).Scan(&seg.ID, &seg.Name, &seg.Description, &rulesJSON, &seg.CreatedAt, &seg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(rulesJSON, &seg.Rules)
	return &seg, nil
}

// CreateSegment creates a new segment.
func (s *Store) CreateSegment(ctx context.Context, seg Segment) (*Segment, error) {
	rulesJSON, err := json.Marshal(seg.Rules)
	if err != nil {
		return nil, fmt.Errorf("marshal rules: %w", err)
	}

	var created Segment
	var createdRulesJSON []byte
	err = s.pool.QueryRow(ctx,
		`INSERT INTO segments (name, description, rules)
		 VALUES ($1, $2, $3)
		 RETURNING id, name, COALESCE(description, ''), rules, created_at, updated_at`,
		seg.Name, nullStr(seg.Description), rulesJSON,
	).Scan(&created.ID, &created.Name, &created.Description, &createdRulesJSON, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create segment: %w", err)
	}
	json.Unmarshal(createdRulesJSON, &created.Rules)
	return &created, nil
}

// UpdateSegment updates an existing segment.
func (s *Store) UpdateSegment(ctx context.Context, id string, seg Segment) (*Segment, error) {
	rulesJSON, err := json.Marshal(seg.Rules)
	if err != nil {
		return nil, fmt.Errorf("marshal rules: %w", err)
	}

	var updated Segment
	var updatedRulesJSON []byte
	err = s.pool.QueryRow(ctx,
		`UPDATE segments SET name = $1, description = $2, rules = $3, updated_at = now()
		 WHERE id = $4
		 RETURNING id, name, COALESCE(description, ''), rules, created_at, updated_at`,
		seg.Name, nullStr(seg.Description), rulesJSON, id,
	).Scan(&updated.ID, &updated.Name, &updated.Description, &updatedRulesJSON, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, fmt.Errorf("segment not found")
		}
		return nil, fmt.Errorf("update segment: %w", err)
	}
	json.Unmarshal(updatedRulesJSON, &updated.Rules)
	return &updated, nil
}

// DeleteSegment deletes a segment.
func (s *Store) DeleteSegment(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, "DELETE FROM segments WHERE id = $1", id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("segment not found")
	}
	return nil
}
