package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gorilla/mux"
)

// =============================================================================
// TEST SETUP HELPERS
// =============================================================================

func setupTestFlagManager(t *testing.T) (*FlagManager, string, func()) {
	// Create temp directory for test flags
	tempDir, err := os.MkdirTemp("", "flag-manager-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	config := Config{
		FlagsDir:      tempDir,
		RelayProxyURL: "",
		Port:          "8080",
	}

	fm := &FlagManager{
		config:       config,
		integrations: NewIntegrationsStore(tempDir),
		flagSets:     NewFlagSetsStore(tempDir),
		notifiers:    NewNotifiersStore(tempDir),
		exporters:    NewExportersStore(tempDir),
		retrievers:   NewRetrieversStore(tempDir),
	}

	cleanup := func() {
		os.RemoveAll(tempDir)
	}

	return fm, tempDir, cleanup
}

func setupTestRouter(fm *FlagManager) *mux.Router {
	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", fm.healthHandler).Methods("GET")

	// Configuration
	r.HandleFunc("/api/config", fm.getConfigHandler).Methods("GET")

	// Raw flags
	r.HandleFunc("/api/flags/raw", fm.getRawFlagsHandler).Methods("GET")
	r.HandleFunc("/api/flags/raw/{project}", fm.getRawProjectFlagsHandler).Methods("GET")

	// Projects
	r.HandleFunc("/api/projects", fm.listProjectsHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}", fm.getProjectHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}", fm.createProjectHandler).Methods("POST")
	r.HandleFunc("/api/projects/{project}", fm.deleteProjectHandler).Methods("DELETE")

	// Flags
	r.HandleFunc("/api/projects/{project}/flags", fm.listFlagsHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.getFlagHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.createFlagHandler).Methods("POST")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.updateFlagHandler).Methods("PUT")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.deleteFlagHandler).Methods("DELETE")

	// Integrations
	r.HandleFunc("/api/integrations", fm.listIntegrationsHandler).Methods("GET")
	r.HandleFunc("/api/integrations", fm.createIntegrationHandler).Methods("POST")
	r.HandleFunc("/api/integrations/{id}", fm.getIntegrationHandler).Methods("GET")
	r.HandleFunc("/api/integrations/{id}", fm.updateIntegrationHandler).Methods("PUT")
	r.HandleFunc("/api/integrations/{id}", fm.deleteIntegrationHandler).Methods("DELETE")

	// Flag sets
	r.HandleFunc("/api/flagsets", fm.listFlagSetsHandler).Methods("GET")
	r.HandleFunc("/api/flagsets", fm.createFlagSetHandler).Methods("POST")
	r.HandleFunc("/api/flagsets/{id}", fm.getFlagSetHandler).Methods("GET")
	r.HandleFunc("/api/flagsets/{id}", fm.updateFlagSetHandler).Methods("PUT")
	r.HandleFunc("/api/flagsets/{id}", fm.deleteFlagSetHandler).Methods("DELETE")

	// Notifiers
	r.HandleFunc("/api/notifiers", fm.listNotifiersHandler).Methods("GET")
	r.HandleFunc("/api/notifiers", fm.createNotifierHandler).Methods("POST")
	r.HandleFunc("/api/notifiers/{id}", fm.getNotifierHandler).Methods("GET")
	r.HandleFunc("/api/notifiers/{id}", fm.updateNotifierHandler).Methods("PUT")
	r.HandleFunc("/api/notifiers/{id}", fm.deleteNotifierHandler).Methods("DELETE")

	// Exporters
	r.HandleFunc("/api/exporters", fm.listExportersHandler).Methods("GET")
	r.HandleFunc("/api/exporters", fm.createExporterHandler).Methods("POST")
	r.HandleFunc("/api/exporters/{id}", fm.getExporterHandler).Methods("GET")
	r.HandleFunc("/api/exporters/{id}", fm.updateExporterHandler).Methods("PUT")
	r.HandleFunc("/api/exporters/{id}", fm.deleteExporterHandler).Methods("DELETE")

	// Retrievers
	r.HandleFunc("/api/retrievers", fm.listRetrieversHandler).Methods("GET")
	r.HandleFunc("/api/retrievers", fm.createRetrieverHandler).Methods("POST")
	r.HandleFunc("/api/retrievers/{id}", fm.getRetrieverHandler).Methods("GET")
	r.HandleFunc("/api/retrievers/{id}", fm.updateRetrieverHandler).Methods("PUT")
	r.HandleFunc("/api/retrievers/{id}", fm.deleteRetrieverHandler).Methods("DELETE")

	return r
}

// =============================================================================
// HEALTH CHECK TESTS
// =============================================================================

func TestHealthHandler(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	req := httptest.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
	}

	var response map[string]bool
	if err := json.Unmarshal(rr.Body.Bytes(), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	if !response["healthy"] {
		t.Error("Expected healthy to be true")
	}
}

// =============================================================================
// PROJECT API TESTS
// =============================================================================

func TestProjectCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	t.Run("list empty projects", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}

		var response map[string][]string
		json.Unmarshal(rr.Body.Bytes(), &response)
		if len(response["projects"]) != 0 {
			t.Errorf("Expected empty projects list, got %v", response["projects"])
		}
	})

	t.Run("create project", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d", http.StatusCreated, rr.Code)
		}
	})

	t.Run("create duplicate project", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusConflict {
			t.Errorf("Expected status %d, got %d", http.StatusConflict, rr.Code)
		}
	})

	t.Run("get project", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects/test-project", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get nonexistent project", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects/nonexistent", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
		}
	})

	t.Run("list projects after creation", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response map[string][]string
		json.Unmarshal(rr.Body.Bytes(), &response)
		if len(response["projects"]) != 1 || response["projects"][0] != "test-project" {
			t.Errorf("Expected [test-project], got %v", response["projects"])
		}
	})

	t.Run("delete project", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/projects/test-project", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Errorf("Expected status %d, got %d", http.StatusNoContent, rr.Code)
		}
	})

	t.Run("delete nonexistent project", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/projects/nonexistent", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
		}
	})
}

// =============================================================================
// FLAG API TESTS
// =============================================================================

func TestFlagCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// First create a project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	t.Run("list empty flags", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects/test-project/flags", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("create flag with boolean variations", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			DefaultRule: &DefaultRule{
				Variation: "disabled",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/test-project/flags/my-flag", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}
	})

	t.Run("create duplicate flag", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/test-project/flags/my-flag", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusConflict {
			t.Errorf("Expected status %d, got %d", http.StatusConflict, rr.Code)
		}
	})

	t.Run("get flag", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects/test-project/flags/my-flag", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		if response["key"] != "my-flag" {
			t.Errorf("Expected flag key 'my-flag', got %v", response["key"])
		}
	})

	t.Run("get nonexistent flag", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/projects/test-project/flags/nonexistent", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
		}
	})

	t.Run("update flag", func(t *testing.T) {
		updateBody := struct {
			Config FlagConfig `json:"config"`
		}{
			Config: FlagConfig{
				Variations: map[string]interface{}{
					"enabled":  true,
					"disabled": false,
				},
				DefaultRule: &DefaultRule{
					Variation: "enabled", // Changed from disabled to enabled
				},
			},
		}

		body, _ := json.Marshal(updateBody)
		req := httptest.NewRequest("PUT", "/api/projects/test-project/flags/my-flag", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("update flag with rename", func(t *testing.T) {
		updateBody := struct {
			Config FlagConfig `json:"config"`
			NewKey string     `json:"newKey"`
		}{
			Config: FlagConfig{
				Variations: map[string]interface{}{"enabled": true},
				DefaultRule: &DefaultRule{
					Variation: "enabled",
				},
			},
			NewKey: "renamed-flag",
		}

		body, _ := json.Marshal(updateBody)
		req := httptest.NewRequest("PUT", "/api/projects/test-project/flags/my-flag", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}

		// Verify old key doesn't exist
		req = httptest.NewRequest("GET", "/api/projects/test-project/flags/my-flag", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusNotFound {
			t.Error("Old flag key should not exist after rename")
		}

		// Verify new key exists
		req = httptest.NewRequest("GET", "/api/projects/test-project/flags/renamed-flag", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		if rr.Code != http.StatusOK {
			t.Error("New flag key should exist after rename")
		}
	})

	t.Run("delete flag", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/projects/test-project/flags/renamed-flag", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNoContent {
			t.Errorf("Expected status %d, got %d", http.StatusNoContent, rr.Code)
		}
	})

	t.Run("delete nonexistent flag", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/projects/test-project/flags/nonexistent", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
		}
	})
}

// =============================================================================
// FLAG CONFIGURATION TESTS (Complex Flags)
// =============================================================================

func TestFlagWithPercentageRollout(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"control":   "a",
			"treatment": "b",
		},
		DefaultRule: &DefaultRule{
			Percentage: map[string]float64{
				"control":   50,
				"treatment": 50,
			},
		},
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/ab-test", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Verify flag was created correctly
	req = httptest.NewRequest("GET", "/api/projects/test-project/flags/ab-test", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var response struct {
		Key    string     `json:"key"`
		Config FlagConfig `json:"config"`
	}
	json.Unmarshal(rr.Body.Bytes(), &response)

	if response.Config.DefaultRule.Percentage["control"] != 50 {
		t.Errorf("Expected control percentage 50, got %v", response.Config.DefaultRule.Percentage["control"])
	}
}

func TestFlagWithTargetingRules(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"enabled":  true,
			"disabled": false,
		},
		Targeting: []TargetingRule{
			{
				Name:      "beta-users",
				Query:     `email ew "@company.com"`,
				Variation: "enabled",
			},
			{
				Name:  "gradual-rollout",
				Query: `plan eq "enterprise"`,
				Percentage: map[string]float64{
					"enabled":  25,
					"disabled": 75,
				},
			},
		},
		DefaultRule: &DefaultRule{
			Variation: "disabled",
		},
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/targeted-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Verify targeting rules
	req = httptest.NewRequest("GET", "/api/projects/test-project/flags/targeted-flag", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var response struct {
		Config FlagConfig `json:"config"`
	}
	json.Unmarshal(rr.Body.Bytes(), &response)

	if len(response.Config.Targeting) != 2 {
		t.Errorf("Expected 2 targeting rules, got %d", len(response.Config.Targeting))
	}

	if response.Config.Targeting[0].Name != "beta-users" {
		t.Errorf("Expected first rule name 'beta-users', got %s", response.Config.Targeting[0].Name)
	}
}

func TestFlagWithProgressiveRollout(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"enabled":  true,
			"disabled": false,
		},
		DefaultRule: &DefaultRule{
			ProgressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       "2024-01-01T00:00:00Z",
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       "2024-01-31T23:59:59Z",
				},
			},
		},
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/progressive-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}
}

func TestFlagWithScheduledRollout(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"enabled":  true,
			"disabled": false,
		},
		DefaultRule: &DefaultRule{
			Variation: "disabled",
		},
		ScheduledRollout: []ScheduledStep{
			{
				Date: "2024-01-15T00:00:00Z",
				DefaultRule: &DefaultRule{
					Percentage: map[string]float64{
						"enabled":  10,
						"disabled": 90,
					},
				},
			},
			{
				Date: "2024-01-22T00:00:00Z",
				DefaultRule: &DefaultRule{
					Percentage: map[string]float64{
						"enabled":  50,
						"disabled": 50,
					},
				},
			},
			{
				Date: "2024-01-29T00:00:00Z",
				DefaultRule: &DefaultRule{
					Variation: "enabled",
				},
			},
		},
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/scheduled-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Verify scheduled rollout
	req = httptest.NewRequest("GET", "/api/projects/test-project/flags/scheduled-flag", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var response struct {
		Config FlagConfig `json:"config"`
	}
	json.Unmarshal(rr.Body.Bytes(), &response)

	if len(response.Config.ScheduledRollout) != 3 {
		t.Errorf("Expected 3 scheduled steps, got %d", len(response.Config.ScheduledRollout))
	}
}

func TestFlagWithExperimentation(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"control":   "baseline",
			"treatment": "experiment",
		},
		DefaultRule: &DefaultRule{
			Percentage: map[string]float64{
				"control":   50,
				"treatment": 50,
			},
		},
		Experimentation: &Experimentation{
			Start: "2024-01-01T00:00:00Z",
			End:   "2024-01-31T23:59:59Z",
		},
		TrackEvents: boolPtr(true),
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/experiment-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Verify experimentation config
	req = httptest.NewRequest("GET", "/api/projects/test-project/flags/experiment-flag", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var response struct {
		Config FlagConfig `json:"config"`
	}
	json.Unmarshal(rr.Body.Bytes(), &response)

	if response.Config.Experimentation == nil {
		t.Error("Expected experimentation config to be present")
	}
	if response.Config.Experimentation.Start != "2024-01-01T00:00:00Z" {
		t.Errorf("Expected start date '2024-01-01T00:00:00Z', got %s", response.Config.Experimentation.Start)
	}
}

func TestFlagWithAdvancedSettings(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/test-project", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations: map[string]interface{}{
			"enabled":  true,
			"disabled": false,
		},
		DefaultRule: &DefaultRule{
			Variation: "disabled",
		},
		Disable:      boolPtr(false),
		TrackEvents:  boolPtr(true),
		Version:      "1.0.0",
		BucketingKey: "companyId",
		Metadata: map[string]interface{}{
			"description": "Test flag with all settings",
			"owner":       "platform-team",
			"jiraIssue":   "PLAT-123",
		},
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/test-project/flags/advanced-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
	}

	// Verify all settings
	req = httptest.NewRequest("GET", "/api/projects/test-project/flags/advanced-flag", nil)
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	var response struct {
		Config FlagConfig `json:"config"`
	}
	json.Unmarshal(rr.Body.Bytes(), &response)

	if response.Config.Version != "1.0.0" {
		t.Errorf("Expected version '1.0.0', got %s", response.Config.Version)
	}
	if response.Config.BucketingKey != "companyId" {
		t.Errorf("Expected bucketingKey 'companyId', got %s", response.Config.BucketingKey)
	}
	if response.Config.Metadata["owner"] != "platform-team" {
		t.Errorf("Expected owner 'platform-team', got %v", response.Config.Metadata["owner"])
	}
}

// =============================================================================
// RAW FLAGS ENDPOINT TESTS
// =============================================================================

func TestRawFlagsEndpoint(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project and flags
	req := httptest.NewRequest("POST", "/api/projects/project-a", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations:  map[string]interface{}{"enabled": true, "disabled": false},
		DefaultRule: &DefaultRule{Variation: "enabled"},
	}
	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/project-a/flags/flag-1", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	t.Run("get raw flags for project", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/flags/raw/project-a", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}

		// Should be YAML content type
		contentType := rr.Header().Get("Content-Type")
		if contentType != "application/x-yaml" {
			t.Errorf("Expected Content-Type 'application/x-yaml', got %s", contentType)
		}
	})

	t.Run("get all raw flags", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/flags/raw", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get raw flags for nonexistent project", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/flags/raw/nonexistent", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusNotFound {
			t.Errorf("Expected status %d, got %d", http.StatusNotFound, rr.Code)
		}
	})
}

// =============================================================================
// NOTIFIERS API TESTS
// =============================================================================

func TestNotifiersCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	t.Run("list empty notifiers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/notifiers", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	var createdID string

	t.Run("create slack notifier", func(t *testing.T) {
		notifier := map[string]interface{}{
			"id":         "test-slack-notifier",
			"name":       "slack-alerts",
			"kind":       "slack",
			"enabled":    true,
			"webhookUrl": "https://hooks.slack.com/services/xxx",
		}

		body, _ := json.Marshal(notifier)
		req := httptest.NewRequest("POST", "/api/notifiers", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		createdID = response["id"].(string)
	})

	t.Run("get notifier", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/notifiers/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("update notifier", func(t *testing.T) {
		notifier := map[string]interface{}{
			"id":         createdID,
			"name":       "slack-alerts-updated",
			"kind":       "slack",
			"enabled":    false,
			"webhookUrl": "https://hooks.slack.com/services/yyy",
		}

		body, _ := json.Marshal(notifier)
		req := httptest.NewRequest("PUT", "/api/notifiers/"+createdID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("delete notifier", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/notifiers/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK && rr.Code != http.StatusNoContent {
			t.Errorf("Expected status 200 or 204, got %d", rr.Code)
		}
	})
}

func TestAllNotifierTypes(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	testCases := []struct {
		name     string
		notifier map[string]interface{}
	}{
		{
			name: "slack notifier",
			notifier: map[string]interface{}{
				"id":         "test-slack",
				"name":       "slack",
				"kind":       "slack",
				"enabled":    true,
				"webhookUrl": "https://hooks.slack.com/xxx",
			},
		},
		{
			name: "discord notifier",
			notifier: map[string]interface{}{
				"id":         "test-discord",
				"name":       "discord",
				"kind":       "discord",
				"enabled":    true,
				"webhookUrl": "https://discord.com/api/webhooks/xxx",
			},
		},
		{
			name: "microsoft teams notifier",
			notifier: map[string]interface{}{
				"id":         "test-teams",
				"name":       "teams",
				"kind":       "microsoftteams",
				"enabled":    true,
				"webhookUrl": "https://outlook.office.com/webhook/xxx",
			},
		},
		{
			name: "webhook notifier",
			notifier: map[string]interface{}{
				"id":          "test-webhook",
				"name":        "webhook",
				"kind":        "webhook",
				"enabled":     true,
				"endpointUrl": "https://example.com/webhook",
				"secret":      "my-secret",
				"headers":     map[string]string{"Authorization": "Bearer token"},
			},
		},
		{
			name: "log notifier",
			notifier: map[string]interface{}{
				"id":        "test-log",
				"name":      "log",
				"kind":      "log",
				"enabled":   true,
				"logFormat": "json",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.notifier)
			req := httptest.NewRequest("POST", "/api/notifiers", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
			}
		})
	}
}

// =============================================================================
// EXPORTERS API TESTS
// =============================================================================

func TestExportersCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	var createdID string

	t.Run("create file exporter", func(t *testing.T) {
		exporter := map[string]interface{}{
			"id":         "test-file-exporter",
			"name":       "file-exporter",
			"kind":       "file",
			"enabled":    true,
			"outputDir":  "/var/log/goff",
			"fileFormat": "json",
		}

		body, _ := json.Marshal(exporter)
		req := httptest.NewRequest("POST", "/api/exporters", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		createdID = response["id"].(string)
	})

	t.Run("list exporters", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/exporters", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get exporter", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/exporters/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("update exporter", func(t *testing.T) {
		exporter := map[string]interface{}{
			"id":         createdID,
			"name":       "file-exporter-updated",
			"kind":       "file",
			"enabled":    false,
			"outputDir":  "/var/log/goff-new",
			"fileFormat": "csv",
		}

		body, _ := json.Marshal(exporter)
		req := httptest.NewRequest("PUT", "/api/exporters/"+createdID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("delete exporter", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/exporters/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK && rr.Code != http.StatusNoContent {
			t.Errorf("Expected status 200 or 204, got %d", rr.Code)
		}
	})
}

func TestAllExporterTypes(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	testCases := []struct {
		name     string
		exporter map[string]interface{}
	}{
		{
			name: "file exporter",
			exporter: map[string]interface{}{
				"id":        "test-file",
				"name":      "file",
				"kind":      "file",
				"enabled":   true,
				"outputDir": "/var/log/goff",
			},
		},
		{
			name: "webhook exporter",
			exporter: map[string]interface{}{
				"id":          "test-webhook",
				"name":        "webhook",
				"kind":        "webhook",
				"enabled":     true,
				"endpointUrl": "https://example.com/export",
			},
		},
		{
			name: "log exporter",
			exporter: map[string]interface{}{
				"id":      "test-log",
				"name":    "log",
				"kind":    "log",
				"enabled": true,
			},
		},
		{
			name: "s3 exporter",
			exporter: map[string]interface{}{
				"id":       "test-s3",
				"name":     "s3",
				"kind":     "s3",
				"enabled":  true,
				"s3Bucket": "my-bucket",
			},
		},
		{
			name: "google storage exporter",
			exporter: map[string]interface{}{
				"id":        "test-gcs",
				"name":      "gcs",
				"kind":      "googleStorage",
				"enabled":   true,
				"gcsBucket": "my-bucket",
			},
		},
		{
			name: "kafka exporter",
			exporter: map[string]interface{}{
				"id":          "test-kafka",
				"name":        "kafka",
				"kind":        "kafka",
				"enabled":     true,
				"kafkaTopic":  "feature-flags",
				"kafkaBroker": "localhost:9092",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.exporter)
			req := httptest.NewRequest("POST", "/api/exporters", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
			}
		})
	}
}

// =============================================================================
// RETRIEVERS API TESTS
// =============================================================================

func TestRetrieversCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	var createdID string

	t.Run("create file retriever", func(t *testing.T) {
		retriever := map[string]interface{}{
			"id":      "test-file-retriever",
			"name":    "file-retriever",
			"kind":    "file",
			"enabled": true,
			"path":    "/etc/goff/flags.yaml",
		}

		body, _ := json.Marshal(retriever)
		req := httptest.NewRequest("POST", "/api/retrievers", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		createdID = response["id"].(string)
	})

	t.Run("list retrievers", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/retrievers", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get retriever", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/retrievers/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("update retriever", func(t *testing.T) {
		retriever := map[string]interface{}{
			"id":      createdID,
			"name":    "file-retriever-updated",
			"kind":    "file",
			"enabled": false,
			"path":    "/etc/goff/flags-new.yaml",
		}

		body, _ := json.Marshal(retriever)
		req := httptest.NewRequest("PUT", "/api/retrievers/"+createdID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("delete retriever", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/retrievers/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK && rr.Code != http.StatusNoContent {
			t.Errorf("Expected status 200 or 204, got %d", rr.Code)
		}
	})
}

func TestAllRetrieverTypes(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	testCases := []struct {
		name      string
		retriever map[string]interface{}
	}{
		{
			name: "file retriever",
			retriever: map[string]interface{}{
				"id":      "test-file",
				"name":    "file",
				"kind":    "file",
				"enabled": true,
				"path":    "/flags.yaml",
			},
		},
		{
			name: "http retriever",
			retriever: map[string]interface{}{
				"id":      "test-http",
				"name":    "http",
				"kind":    "http",
				"enabled": true,
				"url":     "https://example.com/flags.yaml",
			},
		},
		{
			name: "s3 retriever",
			retriever: map[string]interface{}{
				"id":       "test-s3",
				"name":     "s3",
				"kind":     "s3",
				"enabled":  true,
				"s3Bucket": "my-bucket",
				"s3Item":   "flags.yaml",
			},
		},
		{
			name: "github retriever",
			retriever: map[string]interface{}{
				"id":                   "test-github",
				"name":                 "github",
				"kind":                 "github",
				"enabled":              true,
				"githubRepositorySlug": "org/repo",
				"githubPath":           "flags.yaml",
				"githubBranch":         "main",
			},
		},
		{
			name: "gitlab retriever",
			retriever: map[string]interface{}{
				"id":                   "test-gitlab",
				"name":                 "gitlab",
				"kind":                 "gitlab",
				"enabled":              true,
				"gitlabRepositorySlug": "org/repo",
				"gitlabPath":           "flags.yaml",
				"gitlabBranch":         "main",
			},
		},
		{
			name: "mongodb retriever",
			retriever: map[string]interface{}{
				"id":                "test-mongodb",
				"name":              "mongodb",
				"kind":              "mongodb",
				"enabled":           true,
				"mongodbUri":        "mongodb://localhost:27017",
				"mongodbDatabase":   "goff",
				"mongodbCollection": "flags",
			},
		},
		{
			name: "redis retriever",
			retriever: map[string]interface{}{
				"id":          "test-redis",
				"name":        "redis",
				"kind":        "redis",
				"enabled":     true,
				"redisAddr":   "localhost:6379",
				"redisPrefix": "goff:",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.retriever)
			req := httptest.NewRequest("POST", "/api/retrievers", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rr := httptest.NewRecorder()
			router.ServeHTTP(rr, req)

			if rr.Code != http.StatusCreated {
				t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
			}
		})
	}
}

// =============================================================================
// FLAG SETS API TESTS
// =============================================================================

func TestFlagSetsCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	var createdID string

	t.Run("create flag set", func(t *testing.T) {
		flagSet := map[string]interface{}{
			"id":          "test-production",
			"name":        "production",
			"description": "Production flag set",
			"projects":    []string{"project-a", "project-b"},
		}

		body, _ := json.Marshal(flagSet)
		req := httptest.NewRequest("POST", "/api/flagsets", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		createdID = response["id"].(string)
	})

	t.Run("list flag sets", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/flagsets", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get flag set", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/flagsets/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("update flag set", func(t *testing.T) {
		flagSet := map[string]interface{}{
			"id":          createdID,
			"name":        "production-updated",
			"description": "Updated production flag set",
			"projects":    []string{"project-a", "project-b", "project-c"},
		}

		body, _ := json.Marshal(flagSet)
		req := httptest.NewRequest("PUT", "/api/flagsets/"+createdID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("delete flag set", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/flagsets/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})
}

// =============================================================================
// INTEGRATIONS API TESTS
// =============================================================================

func TestIntegrationsCRUD(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	var createdID string

	t.Run("create integration", func(t *testing.T) {
		integration := map[string]interface{}{
			"id":         "test-gitlab-main",
			"name":       "gitlab-main",
			"provider":   "gitlab",
			"enabled":    true,
			"repository": "org/repo",
			"baseBranch": "main",
			"flagsPath":  "/flags",
			"token":      "glpat-xxxx",
		}

		body, _ := json.Marshal(integration)
		req := httptest.NewRequest("POST", "/api/integrations", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusCreated {
			t.Errorf("Expected status %d, got %d: %s", http.StatusCreated, rr.Code, rr.Body.String())
		}

		var response map[string]interface{}
		json.Unmarshal(rr.Body.Bytes(), &response)
		createdID = response["id"].(string)
	})

	t.Run("list integrations", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/integrations", nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("get integration", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/integrations/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d", http.StatusOK, rr.Code)
		}
	})

	t.Run("update integration", func(t *testing.T) {
		integration := map[string]interface{}{
			"id":         createdID,
			"name":       "gitlab-main-updated",
			"provider":   "gitlab",
			"enabled":    false,
			"repository": "org/repo-new",
			"baseBranch": "develop",
			"flagsPath":  "/flags-new",
			"token":      "glpat-yyyy",
		}

		body, _ := json.Marshal(integration)
		req := httptest.NewRequest("PUT", "/api/integrations/"+createdID, bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK {
			t.Errorf("Expected status %d, got %d: %s", http.StatusOK, rr.Code, rr.Body.String())
		}
	})

	t.Run("delete integration", func(t *testing.T) {
		req := httptest.NewRequest("DELETE", "/api/integrations/"+createdID, nil)
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != http.StatusOK && rr.Code != http.StatusNoContent {
			t.Errorf("Expected status 200 or 204, got %d", rr.Code)
		}
	})
}

// =============================================================================
// FILE PERSISTENCE TESTS
// =============================================================================

func TestFlagFilePersistence(t *testing.T) {
	fm, tempDir, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project and flag
	req := httptest.NewRequest("POST", "/api/projects/persistence-test", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	flagConfig := FlagConfig{
		Variations:  map[string]interface{}{"enabled": true, "disabled": false},
		DefaultRule: &DefaultRule{Variation: "disabled"},
		Version:     "1.0.0",
	}

	body, _ := json.Marshal(flagConfig)
	req = httptest.NewRequest("POST", "/api/projects/persistence-test/flags/test-flag", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr = httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// Verify file was created
	filePath := filepath.Join(tempDir, "persistence-test.yaml")
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		t.Error("Expected project file to be created")
	}

	// Read file contents
	fileData, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("Failed to read file: %v", err)
	}

	// Verify YAML contains expected content
	if !bytes.Contains(fileData, []byte("test-flag")) {
		t.Error("Expected file to contain flag key")
	}
	if !bytes.Contains(fileData, []byte("version: 1.0.0")) {
		t.Error("Expected file to contain version")
	}
}
