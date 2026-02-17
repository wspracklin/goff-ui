package main

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"flag-manager-api/db"

	"github.com/gorilla/mux"
)

// AuditLogger provides methods to log audit events.
type AuditLogger struct {
	store *db.Store
}

// NewAuditLogger creates a new audit logger.
func NewAuditLogger(store *db.Store) *AuditLogger {
	return &AuditLogger{store: store}
}

// Log records an audit event. It does not fail the request if logging fails.
func (al *AuditLogger) Log(ctx context.Context, actor Actor, action, resourceType, resourceID, resourceName, project string, changes, metadata interface{}) {
	if al == nil || al.store == nil {
		return
	}

	var changesJSON, metadataJSON json.RawMessage
	if changes != nil {
		if data, err := json.Marshal(changes); err == nil {
			changesJSON = data
		}
	}
	if metadata != nil {
		if data, err := json.Marshal(metadata); err == nil {
			metadataJSON = data
		}
	}

	event := db.AuditEvent{
		ActorID:      actor.ID,
		ActorEmail:   actor.Email,
		ActorName:    actor.Name,
		ActorType:    actor.Type,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		ResourceName: resourceName,
		Project:      project,
		Changes:      changesJSON,
		Metadata:     metadataJSON,
	}

	if err := al.store.LogAudit(ctx, event); err != nil {
		log.Printf("Warning: failed to log audit event: %v", err)
	}
}

// Audit endpoint handlers

func (fm *FlagManager) listAuditEventsHandler(w http.ResponseWriter, r *http.Request) {
	params := parseAuditParams(r)

	result, err := fm.store.ListAuditEvents(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (fm *FlagManager) exportAuditEventsHandler(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "csv"
	}

	// Fetch all matching events (up to 10000)
	params := parseAuditParams(r)
	params.PageSize = 10000
	params.Page = 1

	result, err := fm.store.ListAuditEvents(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	switch format {
	case "csv":
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", "attachment; filename=audit-events.csv")

		writer := csv.NewWriter(w)
		// Header
		writer.Write([]string{"Timestamp", "Actor", "Actor Type", "Action", "Resource Type", "Resource ID", "Resource Name", "Project"})

		for _, e := range result.Data {
			actorDisplay := e.ActorEmail
			if actorDisplay == "" {
				actorDisplay = e.ActorName
			}
			writer.Write([]string{
				e.Timestamp.Format(time.RFC3339),
				actorDisplay,
				e.ActorType,
				e.Action,
				e.ResourceType,
				e.ResourceID,
				e.ResourceName,
				e.Project,
			})
		}
		writer.Flush()

	case "json":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Disposition", "attachment; filename=audit-events.json")
		json.NewEncoder(w).Encode(result.Data)

	default:
		http.Error(w, "Unsupported format. Use csv or json.", http.StatusBadRequest)
	}
}

func (fm *FlagManager) getFlagAuditHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	params := parsePaginationParams(r)

	result, err := fm.store.ListAuditEvents(r.Context(), db.AuditFilterParams{
		PaginationParams: params,
		ResourceType:     "flag",
		Action:           "", // All actions
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Filter to just this flag's events (using project + resource_name match)
	var filtered []db.AuditEvent
	for _, e := range result.Data {
		if e.Project == project && e.ResourceName == flagKey {
			filtered = append(filtered, e)
		}
	}
	if filtered == nil {
		filtered = []db.AuditEvent{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  filtered,
		"total": len(filtered),
	})
}

// parseAuditParams parses audit-specific query parameters.
func parseAuditParams(r *http.Request) db.AuditFilterParams {
	params := db.AuditFilterParams{
		PaginationParams: parsePaginationParams(r),
		Action:           r.URL.Query().Get("action"),
		ResourceType:     r.URL.Query().Get("resource_type"),
		ActorID:          r.URL.Query().Get("actor"),
	}

	if from := r.URL.Query().Get("from"); from != "" {
		if t, err := time.Parse(time.RFC3339, from); err == nil {
			params.From = &t
		}
	}
	if to := r.URL.Query().Get("to"); to != "" {
		if t, err := time.Parse(time.RFC3339, to); err == nil {
			params.To = &t
		}
	}

	return params
}

// parsePaginationParams parses common pagination query parameters.
func parsePaginationParams(r *http.Request) db.PaginationParams {
	params := db.DefaultPagination()

	if page := r.URL.Query().Get("page"); page != "" {
		if p, err := strconv.Atoi(page); err == nil && p > 0 {
			params.Page = p
		}
	}
	if pageSize := r.URL.Query().Get("pageSize"); pageSize != "" {
		if ps, err := strconv.Atoi(pageSize); err == nil && ps > 0 {
			params.PageSize = ps
		}
	}
	if sort := r.URL.Query().Get("sort"); sort != "" {
		params.Sort = sort
	}
	if order := r.URL.Query().Get("order"); order != "" {
		params.Order = order
	}
	if search := r.URL.Query().Get("search"); search != "" {
		params.Search = search
	}

	return params
}

// API Key management endpoints

func (fm *FlagManager) listAPIKeysHandler(w http.ResponseWriter, r *http.Request) {
	keys, err := fm.store.ListAPIKeys(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"apiKeys": keys})
}

func (fm *FlagManager) createAPIKeyHandler(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
		ExpiresIn   string   `json:"expiresIn,omitempty"` // e.g., "30d", "90d", "never"
	}

	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if len(body.Permissions) == 0 {
		body.Permissions = []string{"read"}
	}

	var expiresAt *time.Time
	if body.ExpiresIn != "" && body.ExpiresIn != "never" {
		duration, err := parseDuration(body.ExpiresIn)
		if err != nil {
			http.Error(w, fmt.Sprintf("Invalid expiresIn: %v", err), http.StatusBadRequest)
			return
		}
		t := time.Now().Add(duration)
		expiresAt = &t
	}

	key, rawKey, err := fm.store.CreateAPIKey(r.Context(), body.Name, body.Permissions, expiresAt)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Log audit event
	fm.audit.Log(r.Context(), GetActor(r), "apikey.created", "apikey", key.ID, key.Name, "", nil, nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"apiKey": key,
		"key":    rawKey, // Only returned once at creation
	})
}

func (fm *FlagManager) deleteAPIKeyHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.store.DeleteAPIKey(r.Context(), id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "apikey.deleted", "apikey", id, "", "", nil, nil)

	w.WriteHeader(http.StatusNoContent)
}

// parseDuration parses a human-readable duration like "30d", "90d".
func parseDuration(s string) (time.Duration, error) {
	if len(s) < 2 {
		return 0, fmt.Errorf("invalid duration: %s", s)
	}

	unit := s[len(s)-1]
	value, err := strconv.Atoi(s[:len(s)-1])
	if err != nil {
		return 0, fmt.Errorf("invalid duration value: %s", s)
	}

	switch unit {
	case 'h':
		return time.Duration(value) * time.Hour, nil
	case 'd':
		return time.Duration(value) * 24 * time.Hour, nil
	default:
		return 0, fmt.Errorf("unsupported duration unit: %c (use h or d)", unit)
	}
}
