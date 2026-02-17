package main

import (
	"encoding/json"
	"net/http"

	"flag-manager-api/db"

	"github.com/gorilla/mux"
)

func (fm *FlagManager) listChangeRequestsHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	params := db.ChangeRequestFilterParams{
		PaginationParams: parsePaginationParams(r),
		Status:           r.URL.Query().Get("status"),
	}

	result, err := fm.store.ListChangeRequests(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (fm *FlagManager) getChangeRequestHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	cr, err := fm.store.GetChangeRequest(r.Context(), id)
	if err != nil {
		http.Error(w, "Change request not found", http.StatusNotFound)
		return
	}

	// Include reviews
	reviews, _ := fm.store.GetChangeRequestReviews(r.Context(), id)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"changeRequest": cr,
		"reviews":       reviews,
	})
}

func (fm *FlagManager) createChangeRequestHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	var cr db.ChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&cr); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if cr.Title == "" {
		http.Error(w, "Title is required", http.StatusBadRequest)
		return
	}

	actor := GetActor(r)
	cr.AuthorID = actor.ID
	cr.AuthorEmail = actor.Email
	cr.AuthorName = actor.Name
	if cr.ResourceType == "" {
		cr.ResourceType = "flag"
	}

	created, err := fm.store.CreateChangeRequest(r.Context(), cr)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), actor, "change_request.created", "change_request", created.ID, created.Title, created.Project, nil, nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (fm *FlagManager) reviewChangeRequestHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	// Verify CR exists and is pending
	cr, err := fm.store.GetChangeRequest(r.Context(), id)
	if err != nil {
		http.Error(w, "Change request not found", http.StatusNotFound)
		return
	}
	if cr.Status != "pending" {
		http.Error(w, "Change request is not pending", http.StatusBadRequest)
		return
	}

	var body struct {
		Decision string `json:"decision"`
		Comment  string `json:"comment,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.Decision != "approved" && body.Decision != "rejected" && body.Decision != "commented" {
		http.Error(w, "Decision must be approved, rejected, or commented", http.StatusBadRequest)
		return
	}

	actor := GetActor(r)
	review, err := fm.store.AddChangeRequestReview(r.Context(), db.ChangeRequestReview{
		ChangeRequestID: id,
		ReviewerID:      actor.ID,
		ReviewerEmail:   actor.Email,
		ReviewerName:    actor.Name,
		Decision:        body.Decision,
		Comment:         body.Comment,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Update status based on decision
	if body.Decision == "approved" {
		fm.store.UpdateChangeRequestStatus(r.Context(), id, "approved", "")
	} else if body.Decision == "rejected" {
		fm.store.UpdateChangeRequestStatus(r.Context(), id, "rejected", "")
	}

	fm.audit.Log(r.Context(), actor, "change_request.reviewed", "change_request", id, cr.Title, cr.Project,
		map[string]interface{}{"decision": body.Decision}, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(review)
}

func (fm *FlagManager) applyChangeRequestHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	cr, err := fm.store.GetChangeRequest(r.Context(), id)
	if err != nil {
		http.Error(w, "Change request not found", http.StatusNotFound)
		return
	}

	if cr.Status != "approved" && cr.Status != "pending" {
		http.Error(w, "Change request must be approved or pending to apply", http.StatusBadRequest)
		return
	}

	actor := GetActor(r)

	// Apply the proposed config to the flag
	if cr.FlagKey != "" && cr.Project != "" && cr.ProposedConfig != nil {
		// Parse proposed config
		var flagConfig FlagConfig
		if err := json.Unmarshal(cr.ProposedConfig, &flagConfig); err != nil {
			http.Error(w, "Failed to parse proposed config", http.StatusInternalServerError)
			return
		}

		configJSON, _ := json.Marshal(flagConfig)
		disabled := false
		if flagConfig.Disable != nil {
			disabled = *flagConfig.Disable
		}

		_, err := fm.store.UpdateFlag(r.Context(), cr.Project, cr.FlagKey, configJSON, disabled, flagConfig.Version, "")
		if err != nil {
			http.Error(w, "Failed to apply flag change: "+err.Error(), http.StatusInternalServerError)
			return
		}

		go fm.refreshRelayProxy()
	}

	// Mark as applied
	if err := fm.store.UpdateChangeRequestStatus(r.Context(), id, "applied", actor.ID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), actor, "change_request.applied", "change_request", id, cr.Title, cr.Project, nil, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "applied",
		"message": "Change request applied successfully",
	})
}

func (fm *FlagManager) cancelChangeRequestHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for change requests", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	cr, err := fm.store.GetChangeRequest(r.Context(), id)
	if err != nil {
		http.Error(w, "Change request not found", http.StatusNotFound)
		return
	}

	if cr.Status == "applied" || cr.Status == "cancelled" {
		http.Error(w, "Cannot cancel a change request that is already "+cr.Status, http.StatusBadRequest)
		return
	}

	if err := fm.store.UpdateChangeRequestStatus(r.Context(), id, "cancelled", ""); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "change_request.cancelled", "change_request", id, cr.Title, cr.Project, nil, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  "cancelled",
		"message": "Change request cancelled",
	})
}

func (fm *FlagManager) countChangeRequestsHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"count": 0})
		return
	}

	count, err := fm.store.CountPendingChangeRequests(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"count": count})
}
