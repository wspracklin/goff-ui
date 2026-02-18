package main

import (
	"encoding/json"
	"net/http"
	"time"
)

// ImportRequest represents the request body for POST /api/flags/import.
type ImportRequest struct {
	Project  string              `json:"project"`
	Flags    []ImportFlag        `json:"flags"`
	Metadata *ImportMetadata     `json:"metadata,omitempty"`
}

// ImportFlag represents a single discovered flag to import.
type ImportFlag struct {
	Key    string `json:"key"`
	Type   string `json:"type"`
	Source string `json:"source,omitempty"`
}

// ImportMetadata holds optional metadata about the scan that produced the manifest.
type ImportMetadata struct {
	App         string `json:"app,omitempty"`
	Version     string `json:"version,omitempty"`
	GeneratedAt string `json:"generatedAt,omitempty"`
}

// ImportResponse is the response from the import endpoint.
type ImportResponse struct {
	Created int      `json:"created"`
	Skipped int      `json:"skipped"`
	Errors  []string `json:"errors"`
}

// importFlagsHandler handles POST /api/flags/import — idempotent bulk flag creation.
func (fm *FlagManager) importFlagsHandler(w http.ResponseWriter, r *http.Request) {
	var req ImportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Project == "" {
		http.Error(w, "project is required", http.StatusBadRequest)
		return
	}

	if err := ValidateProjectName(req.Project); err != nil {
		writeValidationError(w, "INVALID_PROJECT_NAME", err.Error())
		return
	}

	if len(req.Flags) == 0 {
		http.Error(w, "at least one flag is required", http.StatusBadRequest)
		return
	}

	resp := ImportResponse{Errors: []string{}}
	actor := GetActor(r)
	now := time.Now().UTC().Format(time.RFC3339)

	if fm.store != nil {
		fm.importFlagsDB(r, req, actor, now, &resp)
	} else {
		fm.importFlagsFileBased(req, actor, now, &resp)
	}

	if resp.Created > 0 {
		go fm.refreshRelayProxy()
	}

	w.Header().Set("Content-Type", "application/json")
	if resp.Created > 0 {
		w.WriteHeader(http.StatusCreated)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	json.NewEncoder(w).Encode(resp)
}

// importFlagsDB handles import when using the database backend.
func (fm *FlagManager) importFlagsDB(r *http.Request, req ImportRequest, actor Actor, now string, resp *ImportResponse) {
	for _, f := range req.Flags {
		if err := ValidateFlagKey(f.Key); err != nil {
			resp.Errors = append(resp.Errors, f.Key+": "+err.Error())
			continue
		}

		exists, _ := fm.store.FlagExists(r.Context(), req.Project, f.Key)
		if exists {
			resp.Skipped++
			continue
		}

		flagConfig := buildImportFlagConfig(f, req.Metadata, now)
		configJSON, _ := json.Marshal(flagConfig)

		flag, err := fm.store.CreateFlag(r.Context(), req.Project, f.Key, configJSON, false, "")
		if err != nil {
			resp.Errors = append(resp.Errors, f.Key+": "+err.Error())
			continue
		}

		fm.audit.Log(r.Context(), actor, "flag.imported", "flag", flag.ID, f.Key, req.Project,
			map[string]interface{}{"after": flagConfig}, nil)

		resp.Created++
	}
}

// importFlagsFileBased handles import when using file-based storage.
func (fm *FlagManager) importFlagsFileBased(req ImportRequest, actor Actor, now string, resp *ImportResponse) {
	flags, err := fm.readProjectFlags(req.Project)
	if err != nil && flags == nil {
		// Project doesn't exist yet — create empty
		flags = make(ProjectFlags)
	}
	if flags == nil {
		flags = make(ProjectFlags)
	}

	changed := false
	for _, f := range req.Flags {
		if err := ValidateFlagKey(f.Key); err != nil {
			resp.Errors = append(resp.Errors, f.Key+": "+err.Error())
			continue
		}

		if _, exists := flags[f.Key]; exists {
			resp.Skipped++
			continue
		}

		flagConfig := buildImportFlagConfig(f, req.Metadata, now)
		flags[f.Key] = flagConfig
		changed = true
		resp.Created++
	}

	if changed {
		if err := fm.writeProjectFlags(req.Project, flags); err != nil {
			resp.Errors = append(resp.Errors, "failed to write project flags: "+err.Error())
		}
	}
}

// buildImportFlagConfig creates a FlagConfig with type-appropriate defaults for an imported flag.
func buildImportFlagConfig(f ImportFlag, meta *ImportMetadata, now string) FlagConfig {
	var variations map[string]interface{}
	var defaultVariation string

	switch f.Type {
	case "boolean":
		variations = map[string]interface{}{
			"True":  true,
			"False": false,
		}
		defaultVariation = "False"
	case "string":
		variations = map[string]interface{}{
			"enabled":  "on",
			"disabled": "off",
		}
		defaultVariation = "disabled"
	case "number":
		variations = map[string]interface{}{
			"Default": float64(0),
		}
		defaultVariation = "Default"
	case "object":
		variations = map[string]interface{}{
			"Default": map[string]interface{}{},
		}
		defaultVariation = "Default"
	default:
		// Fall back to boolean
		variations = map[string]interface{}{
			"True":  true,
			"False": false,
		}
		defaultVariation = "False"
	}

	metadata := map[string]interface{}{
		"description":  "Discovered by goff-scan",
		"discoveredAt": now,
	}
	if f.Source != "" {
		metadata["source"] = f.Source
	}
	if meta != nil {
		if meta.App != "" {
			metadata["app"] = meta.App
		}
		if meta.Version != "" {
			metadata["appVersion"] = meta.Version
		}
	}

	return FlagConfig{
		Variations: variations,
		DefaultRule: &DefaultRule{
			Variation: defaultVariation,
		},
		Metadata: metadata,
	}
}
