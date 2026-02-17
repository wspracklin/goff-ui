package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// ChangeRequest represents a change request for flag modifications.
type ChangeRequest struct {
	ID             string          `json:"id"`
	Title          string          `json:"title"`
	Description    string          `json:"description,omitempty"`
	Status         string          `json:"status"`
	AuthorID       string          `json:"authorId,omitempty"`
	AuthorEmail    string          `json:"authorEmail,omitempty"`
	AuthorName     string          `json:"authorName,omitempty"`
	Project        string          `json:"project,omitempty"`
	FlagKey        string          `json:"flagKey,omitempty"`
	ResourceType   string          `json:"resourceType"`
	CurrentConfig  json.RawMessage `json:"currentConfig,omitempty"`
	ProposedConfig json.RawMessage `json:"proposedConfig,omitempty"`
	CreatedAt      time.Time       `json:"createdAt"`
	UpdatedAt      time.Time       `json:"updatedAt"`
	AppliedAt      *time.Time      `json:"appliedAt,omitempty"`
	AppliedBy      string          `json:"appliedBy,omitempty"`
}

// ChangeRequestReview represents a review on a change request.
type ChangeRequestReview struct {
	ID              string    `json:"id"`
	ChangeRequestID string    `json:"changeRequestId"`
	ReviewerID      string    `json:"reviewerId,omitempty"`
	ReviewerEmail   string    `json:"reviewerEmail,omitempty"`
	ReviewerName    string    `json:"reviewerName,omitempty"`
	Decision        string    `json:"decision"`
	Comment         string    `json:"comment,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
}

// ChangeRequestFilterParams extends pagination with CR-specific filters.
type ChangeRequestFilterParams struct {
	PaginationParams
	Status string
}

// ListChangeRequests returns paginated change requests.
func (s *Store) ListChangeRequests(ctx context.Context, params ChangeRequestFilterParams) (*PaginatedResult[ChangeRequest], error) {
	where := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if params.Status != "" {
		where += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, params.Status)
		argIdx++
	}
	if params.Search != "" {
		where += fmt.Sprintf(" AND (title ILIKE $%d OR flag_key ILIKE $%d OR project ILIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, "%"+params.Search+"%")
		argIdx++
	}

	// Count
	var total int
	if err := s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM change_requests "+where, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count change requests: %w", err)
	}

	query := `SELECT id, title, COALESCE(description, ''), status,
	                 COALESCE(author_id, ''), COALESCE(author_email, ''), COALESCE(author_name, ''),
	                 COALESCE(project, ''), COALESCE(flag_key, ''), resource_type,
	                 current_config, proposed_config,
	                 created_at, updated_at, applied_at, COALESCE(applied_by, '')
	          FROM change_requests ` + where

	query += fmt.Sprintf(" ORDER BY created_at %s", params.OrderDirection())
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, params.Limit(), params.Offset())

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list change requests: %w", err)
	}
	defer rows.Close()

	var crs []ChangeRequest
	for rows.Next() {
		var cr ChangeRequest
		var currentConfig, proposedConfig []byte
		if err := rows.Scan(&cr.ID, &cr.Title, &cr.Description, &cr.Status,
			&cr.AuthorID, &cr.AuthorEmail, &cr.AuthorName,
			&cr.Project, &cr.FlagKey, &cr.ResourceType,
			&currentConfig, &proposedConfig,
			&cr.CreatedAt, &cr.UpdatedAt, &cr.AppliedAt, &cr.AppliedBy); err != nil {
			return nil, err
		}
		cr.CurrentConfig = currentConfig
		cr.ProposedConfig = proposedConfig
		crs = append(crs, cr)
	}
	if crs == nil {
		crs = []ChangeRequest{}
	}

	return &PaginatedResult[ChangeRequest]{
		Data:       crs,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.Limit(),
		TotalPages: TotalPages(total, params.Limit()),
	}, nil
}

// GetChangeRequest returns a change request by ID.
func (s *Store) GetChangeRequest(ctx context.Context, id string) (*ChangeRequest, error) {
	var cr ChangeRequest
	var currentConfig, proposedConfig []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, title, COALESCE(description, ''), status,
		        COALESCE(author_id, ''), COALESCE(author_email, ''), COALESCE(author_name, ''),
		        COALESCE(project, ''), COALESCE(flag_key, ''), resource_type,
		        current_config, proposed_config,
		        created_at, updated_at, applied_at, COALESCE(applied_by, '')
		 FROM change_requests WHERE id = $1`, id,
	).Scan(&cr.ID, &cr.Title, &cr.Description, &cr.Status,
		&cr.AuthorID, &cr.AuthorEmail, &cr.AuthorName,
		&cr.Project, &cr.FlagKey, &cr.ResourceType,
		&currentConfig, &proposedConfig,
		&cr.CreatedAt, &cr.UpdatedAt, &cr.AppliedAt, &cr.AppliedBy)
	if err != nil {
		return nil, err
	}
	cr.CurrentConfig = currentConfig
	cr.ProposedConfig = proposedConfig
	return &cr, nil
}

// CreateChangeRequest creates a new change request.
func (s *Store) CreateChangeRequest(ctx context.Context, cr ChangeRequest) (*ChangeRequest, error) {
	var created ChangeRequest
	var currentConfig, proposedConfig []byte
	err := s.pool.QueryRow(ctx,
		`INSERT INTO change_requests (title, description, author_id, author_email, author_name,
		                              project, flag_key, resource_type, current_config, proposed_config)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, title, COALESCE(description, ''), status,
		           COALESCE(author_id, ''), COALESCE(author_email, ''), COALESCE(author_name, ''),
		           COALESCE(project, ''), COALESCE(flag_key, ''), resource_type,
		           current_config, proposed_config,
		           created_at, updated_at, applied_at, COALESCE(applied_by, '')`,
		cr.Title, nullStr(cr.Description), nullStr(cr.AuthorID), nullStr(cr.AuthorEmail), nullStr(cr.AuthorName),
		nullStr(cr.Project), nullStr(cr.FlagKey), cr.ResourceType,
		nullableJSON(cr.CurrentConfig), nullableJSON(cr.ProposedConfig),
	).Scan(&created.ID, &created.Title, &created.Description, &created.Status,
		&created.AuthorID, &created.AuthorEmail, &created.AuthorName,
		&created.Project, &created.FlagKey, &created.ResourceType,
		&currentConfig, &proposedConfig,
		&created.CreatedAt, &created.UpdatedAt, &created.AppliedAt, &created.AppliedBy)
	if err != nil {
		return nil, fmt.Errorf("create change request: %w", err)
	}
	created.CurrentConfig = currentConfig
	created.ProposedConfig = proposedConfig
	return &created, nil
}

// UpdateChangeRequestStatus updates the status of a change request.
func (s *Store) UpdateChangeRequestStatus(ctx context.Context, id, status, appliedBy string) error {
	var query string
	var args []interface{}

	if status == "applied" {
		query = `UPDATE change_requests SET status = $1, applied_at = now(), applied_by = $2, updated_at = now() WHERE id = $3`
		args = []interface{}{status, appliedBy, id}
	} else {
		query = `UPDATE change_requests SET status = $1, updated_at = now() WHERE id = $2`
		args = []interface{}{status, id}
	}

	tag, err := s.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("update change request status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("change request not found")
	}
	return nil
}

// AddChangeRequestReview adds a review to a change request.
func (s *Store) AddChangeRequestReview(ctx context.Context, review ChangeRequestReview) (*ChangeRequestReview, error) {
	var created ChangeRequestReview
	err := s.pool.QueryRow(ctx,
		`INSERT INTO change_request_reviews (change_request_id, reviewer_id, reviewer_email, reviewer_name, decision, comment)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, change_request_id, COALESCE(reviewer_id, ''), COALESCE(reviewer_email, ''),
		           COALESCE(reviewer_name, ''), decision, COALESCE(comment, ''), created_at`,
		review.ChangeRequestID, nullStr(review.ReviewerID), nullStr(review.ReviewerEmail),
		nullStr(review.ReviewerName), review.Decision, nullStr(review.Comment),
	).Scan(&created.ID, &created.ChangeRequestID, &created.ReviewerID, &created.ReviewerEmail,
		&created.ReviewerName, &created.Decision, &created.Comment, &created.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("add review: %w", err)
	}
	return &created, nil
}

// GetChangeRequestReviews returns reviews for a change request.
func (s *Store) GetChangeRequestReviews(ctx context.Context, crID string) ([]ChangeRequestReview, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, change_request_id, COALESCE(reviewer_id, ''), COALESCE(reviewer_email, ''),
		        COALESCE(reviewer_name, ''), decision, COALESCE(comment, ''), created_at
		 FROM change_request_reviews WHERE change_request_id = $1
		 ORDER BY created_at ASC`, crID)
	if err != nil {
		return nil, fmt.Errorf("get reviews: %w", err)
	}
	defer rows.Close()

	var reviews []ChangeRequestReview
	for rows.Next() {
		var r ChangeRequestReview
		if err := rows.Scan(&r.ID, &r.ChangeRequestID, &r.ReviewerID, &r.ReviewerEmail,
			&r.ReviewerName, &r.Decision, &r.Comment, &r.CreatedAt); err != nil {
			return nil, err
		}
		reviews = append(reviews, r)
	}
	if reviews == nil {
		reviews = []ChangeRequestReview{}
	}
	return reviews, nil
}

// CountPendingChangeRequests returns the count of pending change requests.
func (s *Store) CountPendingChangeRequests(ctx context.Context) (int, error) {
	var count int
	err := s.pool.QueryRow(ctx, "SELECT COUNT(*) FROM change_requests WHERE status = 'pending'").Scan(&count)
	return count, err
}
