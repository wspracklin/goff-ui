package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"flag-manager-api/db"

	"github.com/gorilla/mux"
)

func (fm *FlagManager) listSegmentsHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	params := parsePaginationParams(r)
	result, err := fm.store.ListSegments(r.Context(), params)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func (fm *FlagManager) getSegmentHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	segment, err := fm.store.GetSegment(r.Context(), id)
	if err != nil {
		http.Error(w, "Segment not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(segment)
}

func (fm *FlagManager) createSegmentHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	var seg db.Segment
	if err := json.NewDecoder(r.Body).Decode(&seg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if seg.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if err := ValidateSegmentName(seg.Name); err != nil {
		writeValidationError(w, "INVALID_SEGMENT_NAME", err.Error())
		return
	}

	if len(seg.Rules) == 0 {
		http.Error(w, "At least one rule is required", http.StatusBadRequest)
		return
	}

	created, err := fm.store.CreateSegment(r.Context(), seg)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "Segment with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "segment.created", "segment", created.ID, created.Name, "", nil, nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (fm *FlagManager) updateSegmentHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	var seg db.Segment
	if err := json.NewDecoder(r.Body).Decode(&seg); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if seg.Name != "" {
		if err := ValidateSegmentName(seg.Name); err != nil {
			writeValidationError(w, "INVALID_SEGMENT_NAME", err.Error())
			return
		}
	}

	updated, err := fm.store.UpdateSegment(r.Context(), id, seg)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Segment not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "segment.updated", "segment", updated.ID, updated.Name, "", nil, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (fm *FlagManager) deleteSegmentHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.store.DeleteSegment(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, "Segment not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "segment.deleted", "segment", id, "", "", nil, nil)

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) getSegmentUsageHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for segments", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	segment, err := fm.store.GetSegment(r.Context(), id)
	if err != nil {
		http.Error(w, "Segment not found", http.StatusNotFound)
		return
	}

	searchPattern := "segment:" + segment.Name
	allFlags, err := fm.store.GetAllFlags(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var usage []map[string]string
	for key, configJSON := range allFlags {
		configStr := string(configJSON)
		if strings.Contains(configStr, searchPattern) {
			usage = append(usage, map[string]string{"flagKey": key})
		}
	}
	if usage == nil {
		usage = []map[string]string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"segment": segment.Name,
		"usage":   usage,
		"count":   len(usage),
	})
}

// expandSegmentRules expands segment:<name> references in targeting rules.
func (fm *FlagManager) expandSegmentRules(ctx context.Context, flags map[string]json.RawMessage) map[string]json.RawMessage {
	if fm.store == nil {
		return flags
	}

	expanded := make(map[string]json.RawMessage, len(flags))
	for key, raw := range flags {
		configStr := string(raw)
		if !strings.Contains(configStr, "segment:") {
			expanded[key] = raw
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal(raw, &config); err != nil {
			expanded[key] = raw
			continue
		}

		modified := false
		if targeting, ok := config["targeting"].([]interface{}); ok {
			for i, rule := range targeting {
				if ruleMap, ok := rule.(map[string]interface{}); ok {
					if query, ok := ruleMap["query"].(string); ok && strings.HasPrefix(query, "segment:") {
						segmentName := strings.TrimPrefix(query, "segment:")
						seg, err := fm.store.GetSegmentByName(ctx, segmentName)
						if err == nil && len(seg.Rules) > 0 {
							ruleMap["query"] = strings.Join(seg.Rules, " or ")
							targeting[i] = ruleMap
							modified = true
						}
					}
				}
			}
			if modified {
				config["targeting"] = targeting
			}
		}

		if modified {
			if newRaw, err := json.Marshal(config); err == nil {
				expanded[key] = newRaw
			} else {
				expanded[key] = raw
			}
		} else {
			expanded[key] = raw
		}
	}
	return expanded
}
