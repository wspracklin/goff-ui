package main

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"
)

// =============================================================================
// ROLLOUT STRATEGY TESTS
// Tests for all rollout strategies: single variation, percentage split,
// progressive rollout, scheduled rollout, experimentation
// =============================================================================

func TestRolloutStrategies(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project for rollout tests
	req := httptest.NewRequest("POST", "/api/projects/rollout-tests", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	// ==========================================================================
	// SINGLE VARIATION ROLLOUT
	// ==========================================================================

	t.Run("single variation - boolean true", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			DefaultRule: &DefaultRule{
				Variation: "enabled",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/single-bool-true", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify the default rule returns correct variation
		req = httptest.NewRequest("GET", "/api/projects/rollout-tests/flags/single-bool-true", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.DefaultRule.Variation != "enabled" {
			t.Errorf("Expected variation 'enabled', got %s", response.Config.DefaultRule.Variation)
		}
	})

	t.Run("single variation - string value", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"dark":  "dark-theme",
				"light": "light-theme",
				"auto":  "auto-theme",
			},
			DefaultRule: &DefaultRule{
				Variation: "auto",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/single-string", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("single variation - JSON object value", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"configA": map[string]interface{}{
					"maxItems": 10,
					"timeout":  30,
					"features": []string{"search", "filter"},
				},
				"configB": map[string]interface{}{
					"maxItems": 50,
					"timeout":  60,
					"features": []string{"search", "filter", "export"},
				},
			},
			DefaultRule: &DefaultRule{
				Variation: "configA",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/single-json", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	// ==========================================================================
	// PERCENTAGE SPLIT ROLLOUT
	// ==========================================================================

	t.Run("percentage split - 50/50", func(t *testing.T) {
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
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/percentage-50-50", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify percentages
		req = httptest.NewRequest("GET", "/api/projects/rollout-tests/flags/percentage-50-50", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.DefaultRule.Percentage["control"] != 50 {
			t.Errorf("Expected control 50%%, got %v", response.Config.DefaultRule.Percentage["control"])
		}
		if response.Config.DefaultRule.Percentage["treatment"] != 50 {
			t.Errorf("Expected treatment 50%%, got %v", response.Config.DefaultRule.Percentage["treatment"])
		}
	})

	t.Run("percentage split - 90/10", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"stable": true,
				"canary": false,
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"stable": 90,
					"canary": 10,
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/percentage-90-10", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("percentage split - three-way", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"v1": "version-1",
				"v2": "version-2",
				"v3": "version-3",
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"v1": 33.33,
					"v2": 33.33,
					"v3": 33.34,
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/percentage-three-way", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("percentage split - decimal precision", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"a": 1,
				"b": 2,
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"a": 99.99,
					"b": 0.01,
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/percentage-decimal", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	// ==========================================================================
	// PROGRESSIVE ROLLOUT
	// ==========================================================================

	t.Run("progressive rollout - basic", func(t *testing.T) {
		startDate := time.Now().Add(-7 * 24 * time.Hour)
		endDate := time.Now().Add(7 * 24 * time.Hour)

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
						Date:       startDate.Format(time.RFC3339),
					},
					End: &ProgressiveRolloutStep{
						Variation:  "enabled",
						Percentage: 100,
						Date:       endDate.Format(time.RFC3339),
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/progressive-basic", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("progressive rollout - same variation", func(t *testing.T) {
		startDate := time.Now().Add(-7 * 24 * time.Hour)
		endDate := time.Now().Add(7 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			DefaultRule: &DefaultRule{
				ProgressiveRollout: &ProgressiveRollout{
					Initial: &ProgressiveRolloutStep{
						Variation:  "enabled",
						Percentage: 10,
						Date:       startDate.Format(time.RFC3339),
					},
					End: &ProgressiveRolloutStep{
						Variation:  "enabled",
						Percentage: 100,
						Date:       endDate.Format(time.RFC3339),
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/progressive-same-var", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("progressive rollout - with string variations", func(t *testing.T) {
		startDate := time.Now().Add(-1 * 24 * time.Hour)
		endDate := time.Now().Add(30 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"oldUI": "classic",
				"newUI": "modern",
			},
			DefaultRule: &DefaultRule{
				ProgressiveRollout: &ProgressiveRollout{
					Initial: &ProgressiveRolloutStep{
						Variation:  "oldUI",
						Percentage: 0,
						Date:       startDate.Format(time.RFC3339),
					},
					End: &ProgressiveRolloutStep{
						Variation:  "newUI",
						Percentage: 100,
						Date:       endDate.Format(time.RFC3339),
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/progressive-string", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	// ==========================================================================
	// SCHEDULED ROLLOUT
	// ==========================================================================

	t.Run("scheduled rollout - single step", func(t *testing.T) {
		futureDate := time.Now().Add(24 * time.Hour)

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
					Date: futureDate.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/scheduled-single", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("scheduled rollout - multi-step gradual", func(t *testing.T) {
		step1 := time.Now().Add(1 * 24 * time.Hour)
		step2 := time.Now().Add(3 * 24 * time.Hour)
		step3 := time.Now().Add(7 * 24 * time.Hour)
		step4 := time.Now().Add(14 * 24 * time.Hour)

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
					Date: step1.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Percentage: map[string]float64{
							"enabled":  10,
							"disabled": 90,
						},
					},
				},
				{
					Date: step2.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Percentage: map[string]float64{
							"enabled":  25,
							"disabled": 75,
						},
					},
				},
				{
					Date: step3.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Percentage: map[string]float64{
							"enabled":  50,
							"disabled": 50,
						},
					},
				},
				{
					Date: step4.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/scheduled-gradual", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify all steps were saved
		req = httptest.NewRequest("GET", "/api/projects/rollout-tests/flags/scheduled-gradual", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if len(response.Config.ScheduledRollout) != 4 {
			t.Errorf("Expected 4 scheduled steps, got %d", len(response.Config.ScheduledRollout))
		}
	})

	t.Run("scheduled rollout - with targeting changes", func(t *testing.T) {
		step1 := time.Now().Add(1 * 24 * time.Hour)
		step2 := time.Now().Add(7 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			Targeting: []TargetingRule{
				{
					Name:      "internal-users",
					Query:     `email ew "@company.com"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{
				Variation: "disabled",
			},
			ScheduledRollout: []ScheduledStep{
				{
					Date: step1.Format(time.RFC3339),
					Targeting: []TargetingRule{
						{
							Name:      "beta-users",
							Query:     `plan eq "beta"`,
							Variation: "enabled",
						},
					},
					DefaultRule: &DefaultRule{
						Variation: "disabled",
					},
				},
				{
					Date: step2.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled", // Full rollout
					},
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/scheduled-targeting", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// ==========================================================================
	// EXPERIMENTATION
	// ==========================================================================

	t.Run("experimentation - basic A/B test", func(t *testing.T) {
		startDate := time.Now().Add(-7 * 24 * time.Hour)
		endDate := time.Now().Add(21 * 24 * time.Hour)

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
				Start: startDate.Format(time.RFC3339),
				End:   endDate.Format(time.RFC3339),
			},
			TrackEvents: boolPtr(true),
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/experiment-ab", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify experimentation config
		req = httptest.NewRequest("GET", "/api/projects/rollout-tests/flags/experiment-ab", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.Experimentation == nil {
			t.Error("Expected experimentation config")
		}
		if response.Config.TrackEvents == nil || !*response.Config.TrackEvents {
			t.Error("Expected trackEvents to be true")
		}
	})

	t.Run("experimentation - multi-variant", func(t *testing.T) {
		startDate := time.Now()
		endDate := time.Now().Add(30 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"control":    map[string]interface{}{"color": "blue", "size": "small"},
				"variant_a":  map[string]interface{}{"color": "green", "size": "small"},
				"variant_b":  map[string]interface{}{"color": "blue", "size": "large"},
				"variant_ab": map[string]interface{}{"color": "green", "size": "large"},
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"control":    25,
					"variant_a":  25,
					"variant_b":  25,
					"variant_ab": 25,
				},
			},
			Experimentation: &Experimentation{
				Start: startDate.Format(time.RFC3339),
				End:   endDate.Format(time.RFC3339),
			},
			TrackEvents: boolPtr(true),
			Metadata: map[string]interface{}{
				"experimentName": "button-optimization",
				"hypothesis":     "Green buttons increase click rate",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/experiment-multivar", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	t.Run("experimentation - with targeting", func(t *testing.T) {
		startDate := time.Now()
		endDate := time.Now().Add(14 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"control":   "old-checkout",
				"treatment": "new-checkout",
			},
			Targeting: []TargetingRule{
				{
					Name:      "enterprise-excluded",
					Query:     `plan eq "enterprise"`,
					Variation: "control", // Enterprise users always get control
				},
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"control":   50,
					"treatment": 50,
				},
			},
			Experimentation: &Experimentation{
				Start: startDate.Format(time.RFC3339),
				End:   endDate.Format(time.RFC3339),
			},
			TrackEvents: boolPtr(true),
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/rollout-tests/flags/experiment-targeted", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}
	})
}

// =============================================================================
// TARGETING RULE TESTS
// =============================================================================

func TestTargetingRules(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/targeting-tests", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	t.Run("targeting - equals operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "admin-users",
					Query:     `role eq "admin"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/eq-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - not equals operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "non-guest",
					Query:     `role ne "guest"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/ne-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - contains operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "internal-email",
					Query:     `email co "@company"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/co-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - starts with operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "test-account",
					Query:     `accountId sw "test-"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/sw-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - ends with operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "company-email",
					Query:     `email ew "@company.com"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/ew-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - in operator (list)", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "us-canada",
					Query:     `country in ["US", "CA", "MX"]`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/in-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - less than operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "new-users",
					Query:     `accountAge lt 30`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/lt-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - greater than operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "power-users",
					Query:     `loginCount gt 100`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/gt-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - AND operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "premium-us-users",
					Query:     `plan eq "premium" and country eq "US"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/and-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - OR operator", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "admin-or-beta",
					Query:     `role eq "admin" or beta eq true`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/or-operator", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - complex nested", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "complex-rule",
					Query:     `(role eq "admin" or role eq "manager") and country in ["US", "CA"] and accountAge gt 30`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/complex-nested", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - multiple rules ordered", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"enterprise": "enterprise-features",
				"premium":    "premium-features",
				"basic":      "basic-features",
			},
			Targeting: []TargetingRule{
				{
					Name:      "enterprise-users",
					Query:     `plan eq "enterprise"`,
					Variation: "enterprise",
				},
				{
					Name:      "premium-users",
					Query:     `plan eq "premium"`,
					Variation: "premium",
				},
			},
			DefaultRule: &DefaultRule{Variation: "basic"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/multiple-rules", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}

		// Verify rule order is preserved
		req = httptest.NewRequest("GET", "/api/projects/targeting-tests/flags/multiple-rules", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if len(response.Config.Targeting) != 2 {
			t.Errorf("Expected 2 rules, got %d", len(response.Config.Targeting))
		}
		if response.Config.Targeting[0].Name != "enterprise-users" {
			t.Error("Expected first rule to be enterprise-users")
		}
		if response.Config.Targeting[1].Name != "premium-users" {
			t.Error("Expected second rule to be premium-users")
		}
	})

	t.Run("targeting - rule with percentage", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:  "gradual-enterprise",
					Query: `plan eq "enterprise"`,
					Percentage: map[string]float64{
						"enabled":  25,
						"disabled": 75,
					},
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/rule-percentage", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - disabled rule", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:      "disabled-rule",
					Query:     `email ew "@company.com"`,
					Variation: "enabled",
					Disable:   boolPtr(true),
				},
				{
					Name:      "active-rule",
					Query:     `role eq "admin"`,
					Variation: "enabled",
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/disabled-rule", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("targeting - rule with progressive rollout", func(t *testing.T) {
		startDate := time.Now().Add(-7 * 24 * time.Hour)
		endDate := time.Now().Add(7 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			Targeting: []TargetingRule{
				{
					Name:  "progressive-for-beta",
					Query: `plan eq "beta"`,
					ProgressiveRollout: &ProgressiveRollout{
						Initial: &ProgressiveRolloutStep{
							Variation:  "disabled",
							Percentage: 0,
							Date:       startDate.Format(time.RFC3339),
						},
						End: &ProgressiveRolloutStep{
							Variation:  "enabled",
							Percentage: 100,
							Date:       endDate.Format(time.RFC3339),
						},
					},
				},
			},
			DefaultRule: &DefaultRule{Variation: "disabled"},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/targeting-tests/flags/rule-progressive", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})
}

// =============================================================================
// ADVANCED SETTINGS TESTS
// =============================================================================

func TestAdvancedSettings(t *testing.T) {
	fm, _, cleanup := setupTestFlagManager(t)
	defer cleanup()

	router := setupTestRouter(fm)

	// Create project
	req := httptest.NewRequest("POST", "/api/projects/settings-tests", nil)
	rr := httptest.NewRecorder()
	router.ServeHTTP(rr, req)

	t.Run("disable flag", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			Disable: boolPtr(true),
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/disabled-flag", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}

		// Verify disable is set
		req = httptest.NewRequest("GET", "/api/projects/settings-tests/flags/disabled-flag", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.Disable == nil || !*response.Config.Disable {
			t.Error("Expected disable to be true")
		}
	})

	t.Run("track events enabled", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			TrackEvents: boolPtr(true),
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/track-enabled", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("track events disabled", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			TrackEvents: boolPtr(false),
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/track-disabled", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("version string", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			Version: "2.1.0",
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/versioned", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}

		// Verify version
		req = httptest.NewRequest("GET", "/api/projects/settings-tests/flags/versioned", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.Version != "2.1.0" {
			t.Errorf("Expected version '2.1.0', got %s", response.Config.Version)
		}
	})

	t.Run("bucketing key", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled": 50,
					"disabled": 50,
				},
			},
			BucketingKey: "companyId",
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/bucketing", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}

		// Verify bucketing key
		req = httptest.NewRequest("GET", "/api/projects/settings-tests/flags/bucketing", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.BucketingKey != "companyId" {
			t.Errorf("Expected bucketingKey 'companyId', got %s", response.Config.BucketingKey)
		}
	})

	t.Run("metadata - simple", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			Metadata: map[string]interface{}{
				"description": "Feature flag for new checkout flow",
				"owner":       "checkout-team",
				"jiraIssue":   "CHECKOUT-456",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/metadata-simple", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("metadata - complex", func(t *testing.T) {
		flagConfig := FlagConfig{
			Variations: map[string]interface{}{"enabled": true, "disabled": false},
			DefaultRule: &DefaultRule{Variation: "enabled"},
			Metadata: map[string]interface{}{
				"description": "Multi-region rollout",
				"owner":       "platform-team",
				"createdAt":   "2024-01-01T00:00:00Z",
				"tags":        []string{"feature", "rollout", "multi-region"},
				"priority":    1,
				"regions":     []string{"us-east-1", "eu-west-1", "ap-southeast-1"},
				"config": map[string]interface{}{
					"maxRetries": 3,
					"timeout":    30,
				},
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/metadata-complex", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d", rr.Code)
		}
	})

	t.Run("all settings combined", func(t *testing.T) {
		startDate := time.Now()
		endDate := time.Now().Add(30 * 24 * time.Hour)

		flagConfig := FlagConfig{
			Variations: map[string]interface{}{
				"control":   map[string]interface{}{"theme": "light"},
				"treatment": map[string]interface{}{"theme": "dark"},
			},
			Targeting: []TargetingRule{
				{
					Name:      "internal-users",
					Query:     `email ew "@company.com"`,
					Variation: "treatment",
				},
			},
			DefaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"control":   50,
					"treatment": 50,
				},
			},
			Experimentation: &Experimentation{
				Start: startDate.Format(time.RFC3339),
				End:   endDate.Format(time.RFC3339),
			},
			TrackEvents:  boolPtr(true),
			Disable:      boolPtr(false),
			Version:      "3.0.0",
			BucketingKey: "userId",
			Metadata: map[string]interface{}{
				"description": "Dark mode experiment",
				"owner":       "design-team",
				"hypothesis":  "Dark mode improves engagement",
			},
		}

		body, _ := json.Marshal(flagConfig)
		req := httptest.NewRequest("POST", "/api/projects/settings-tests/flags/all-settings", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		if rr.Code != 201 {
			t.Errorf("Expected 201, got %d: %s", rr.Code, rr.Body.String())
		}

		// Verify all settings
		req = httptest.NewRequest("GET", "/api/projects/settings-tests/flags/all-settings", nil)
		rr = httptest.NewRecorder()
		router.ServeHTTP(rr, req)

		var response struct {
			Config FlagConfig `json:"config"`
		}
		json.Unmarshal(rr.Body.Bytes(), &response)

		if response.Config.Version != "3.0.0" {
			t.Errorf("Version mismatch")
		}
		if response.Config.BucketingKey != "userId" {
			t.Errorf("BucketingKey mismatch")
		}
		if response.Config.Experimentation == nil {
			t.Error("Experimentation config missing")
		}
		if len(response.Config.Targeting) != 1 {
			t.Error("Targeting rules missing")
		}
		if response.Config.Metadata["owner"] != "design-team" {
			t.Error("Metadata mismatch")
		}
	})
}
