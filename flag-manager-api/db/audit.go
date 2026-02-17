package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"
)

// AuditEvent represents an audit log entry.
type AuditEvent struct {
	ID           string          `json:"id"`
	Timestamp    time.Time       `json:"timestamp"`
	ActorID      string          `json:"actorId,omitempty"`
	ActorEmail   string          `json:"actorEmail,omitempty"`
	ActorName    string          `json:"actorName,omitempty"`
	ActorType    string          `json:"actorType,omitempty"`
	Action       string          `json:"action"`
	ResourceType string          `json:"resourceType"`
	ResourceID   string          `json:"resourceId,omitempty"`
	ResourceName string          `json:"resourceName,omitempty"`
	Project      string          `json:"project,omitempty"`
	Changes      json.RawMessage `json:"changes,omitempty"`
	Metadata     json.RawMessage `json:"metadata,omitempty"`
}

// AuditFilterParams extends pagination with audit-specific filters.
type AuditFilterParams struct {
	PaginationParams
	Action       string
	ResourceType string
	ActorID      string
	From         *time.Time
	To           *time.Time
}

// LogAudit writes an audit event to the database.
func (s *Store) LogAudit(ctx context.Context, event AuditEvent) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO audit_events (actor_id, actor_email, actor_name, actor_type, action, resource_type, resource_id, resource_name, project, changes, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		nullStr(event.ActorID), nullStr(event.ActorEmail), nullStr(event.ActorName), nullStr(event.ActorType),
		event.Action, event.ResourceType, nullStr(event.ResourceID), nullStr(event.ResourceName),
		nullStr(event.Project), nullableJSON(event.Changes), nullableJSON(event.Metadata),
	)
	return err
}

// ListAuditEvents returns paginated, filtered audit events.
func (s *Store) ListAuditEvents(ctx context.Context, params AuditFilterParams) (*PaginatedResult[AuditEvent], error) {
	where := "WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if params.Action != "" {
		where += fmt.Sprintf(" AND action = $%d", argIdx)
		args = append(args, params.Action)
		argIdx++
	}
	if params.ResourceType != "" {
		where += fmt.Sprintf(" AND resource_type = $%d", argIdx)
		args = append(args, params.ResourceType)
		argIdx++
	}
	if params.ActorID != "" {
		where += fmt.Sprintf(" AND (actor_id = $%d OR actor_email ILIKE $%d)", argIdx, argIdx)
		args = append(args, params.ActorID)
		argIdx++
	}
	if params.Search != "" {
		where += fmt.Sprintf(" AND (resource_name ILIKE $%d OR action ILIKE $%d OR project ILIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, "%"+params.Search+"%")
		argIdx++
	}
	if params.From != nil {
		where += fmt.Sprintf(" AND timestamp >= $%d", argIdx)
		args = append(args, *params.From)
		argIdx++
	}
	if params.To != nil {
		where += fmt.Sprintf(" AND timestamp <= $%d", argIdx)
		args = append(args, *params.To)
		argIdx++
	}

	// Count
	var total int
	countQuery := "SELECT COUNT(*) FROM audit_events " + where
	if err := s.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("count audit events: %w", err)
	}

	// Query
	query := `SELECT id, timestamp, COALESCE(actor_id, ''), COALESCE(actor_email, ''), COALESCE(actor_name, ''),
	                 COALESCE(actor_type, ''), action, resource_type, COALESCE(resource_id, ''),
	                 COALESCE(resource_name, ''), COALESCE(project, ''), changes, metadata
	          FROM audit_events ` + where

	sortCol := "timestamp"
	switch params.Sort {
	case "action":
		sortCol = "action"
	case "resource_type":
		sortCol = "resource_type"
	}
	query += fmt.Sprintf(" ORDER BY %s %s", sortCol, params.OrderDirection())
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", argIdx, argIdx+1)
	args = append(args, params.Limit(), params.Offset())

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()

	var events []AuditEvent
	for rows.Next() {
		var e AuditEvent
		var changes, metadata []byte
		if err := rows.Scan(&e.ID, &e.Timestamp, &e.ActorID, &e.ActorEmail, &e.ActorName,
			&e.ActorType, &e.Action, &e.ResourceType, &e.ResourceID,
			&e.ResourceName, &e.Project, &changes, &metadata); err != nil {
			return nil, err
		}
		e.Changes = changes
		e.Metadata = metadata
		events = append(events, e)
	}

	if events == nil {
		events = []AuditEvent{}
	}

	return &PaginatedResult[AuditEvent]{
		Data:       events,
		Total:      total,
		Page:       params.Page,
		PageSize:   params.Limit(),
		TotalPages: TotalPages(total, params.Limit()),
	}, nil
}

// GetAuditEventsForResource returns audit events for a specific resource.
func (s *Store) GetAuditEventsForResource(ctx context.Context, resourceType, resourceID string, params PaginationParams) (*PaginatedResult[AuditEvent], error) {
	return s.ListAuditEvents(ctx, AuditFilterParams{
		PaginationParams: params,
		ResourceType:     resourceType,
	})
}

func nullStr(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}
