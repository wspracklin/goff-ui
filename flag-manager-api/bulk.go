package main

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

func (fm *FlagManager) bulkToggleHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for bulk operations", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	project := vars["project"]

	var body struct {
		Keys     []string `json:"keys"`
		Disabled bool     `json:"disabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Keys) == 0 {
		http.Error(w, "At least one key is required", http.StatusBadRequest)
		return
	}

	actor := GetActor(r)
	var results []map[string]interface{}
	var errors []string

	for _, key := range body.Keys {
		// Get existing flag
		existing, err := fm.store.GetFlag(r.Context(), project, key)
		if err != nil {
			errors = append(errors, "Flag not found: "+key)
			continue
		}

		// Parse existing config and update disable field
		var flagConfig FlagConfig
		json.Unmarshal(existing.Config, &flagConfig)
		flagConfig.Disable = &body.Disabled

		configJSON, _ := json.Marshal(flagConfig)
		flag, err := fm.store.UpdateFlag(r.Context(), project, key, configJSON, body.Disabled, flagConfig.Version, "")
		if err != nil {
			errors = append(errors, "Failed to update "+key+": "+err.Error())
			continue
		}

		action := "flag.enabled"
		if body.Disabled {
			action = "flag.disabled"
		}
		fm.audit.Log(r.Context(), actor, action, "flag", flag.ID, key, project,
			map[string]interface{}{"disabled": body.Disabled}, nil)

		results = append(results, map[string]interface{}{
			"key":    key,
			"status": "updated",
		})
	}

	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"errors":  errors,
		"total":   len(results),
	})
}

func (fm *FlagManager) bulkDeleteHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for bulk operations", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	project := vars["project"]

	var body struct {
		Keys []string `json:"keys"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(body.Keys) == 0 {
		http.Error(w, "At least one key is required", http.StatusBadRequest)
		return
	}

	actor := GetActor(r)
	var results []map[string]interface{}
	var errors []string

	for _, key := range body.Keys {
		existing, _ := fm.store.GetFlag(r.Context(), project, key)

		if err := fm.store.DeleteFlag(r.Context(), project, key); err != nil {
			errors = append(errors, "Failed to delete "+key+": "+err.Error())
			continue
		}

		if existing != nil {
			var config interface{}
			json.Unmarshal(existing.Config, &config)
			fm.audit.Log(r.Context(), actor, "flag.deleted", "flag", existing.ID, key, project,
				map[string]interface{}{"before": config}, nil)
		}

		results = append(results, map[string]interface{}{
			"key":    key,
			"status": "deleted",
		})
	}

	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"results": results,
		"errors":  errors,
		"total":   len(results),
	})
}

func (fm *FlagManager) cloneFlagHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for cloning", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var body struct {
		NewKey        string `json:"newKey"`
		TargetProject string `json:"targetProject,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.NewKey == "" {
		http.Error(w, "newKey is required", http.StatusBadRequest)
		return
	}

	if err := ValidateFlagKey(body.NewKey); err != nil {
		writeValidationError(w, "INVALID_FLAG_KEY", err.Error())
		return
	}

	targetProject := project
	if body.TargetProject != "" {
		targetProject = body.TargetProject
	}

	// Read source flag
	source, err := fm.store.GetFlag(r.Context(), project, flagKey)
	if err != nil {
		http.Error(w, "Source flag not found", http.StatusNotFound)
		return
	}

	// Check if target already exists
	exists, _ := fm.store.FlagExists(r.Context(), targetProject, body.NewKey)
	if exists {
		http.Error(w, "Flag with new key already exists in target project", http.StatusConflict)
		return
	}

	// Create the clone
	var flagConfig FlagConfig
	json.Unmarshal(source.Config, &flagConfig)
	disabled := false
	if flagConfig.Disable != nil {
		disabled = *flagConfig.Disable
	}

	cloned, err := fm.store.CreateFlag(r.Context(), targetProject, body.NewKey, source.Config, disabled, flagConfig.Version)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "flag.cloned", "flag", cloned.ID, body.NewKey, targetProject,
		map[string]interface{}{
			"sourceProject": project,
			"sourceKey":     flagKey,
			"targetProject": targetProject,
			"targetKey":     body.NewKey,
		}, nil)

	go fm.refreshRelayProxy()

	var config interface{}
	json.Unmarshal(cloned.Config, &config)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":     body.NewKey,
		"project": targetProject,
		"config":  config,
	})
}
