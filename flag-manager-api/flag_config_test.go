package main

import (
	"encoding/json"
	"reflect"
	"testing"
	"time"

	"gopkg.in/yaml.v3"
)

// =============================================================================
// UNIT TESTS: Flag Configuration Validation
// =============================================================================

func TestFlagConfig_Variations(t *testing.T) {
	tests := []struct {
		name       string
		variations map[string]interface{}
		wantValid  bool
	}{
		{
			name: "boolean variations",
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "string variations",
			variations: map[string]interface{}{
				"v1": "control",
				"v2": "treatment",
			},
			wantValid: true,
		},
		{
			name: "integer variations",
			variations: map[string]interface{}{
				"low":    10,
				"medium": 50,
				"high":   100,
			},
			wantValid: true,
		},
		{
			name: "float variations",
			variations: map[string]interface{}{
				"slow": 0.5,
				"fast": 2.5,
			},
			wantValid: true,
		},
		{
			name: "JSON object variations",
			variations: map[string]interface{}{
				"configA": map[string]interface{}{"color": "red", "size": 10},
				"configB": map[string]interface{}{"color": "blue", "size": 20},
			},
			wantValid: true,
		},
		{
			name: "JSON array variations",
			variations: map[string]interface{}{
				"listA": []interface{}{"a", "b", "c"},
				"listB": []interface{}{"x", "y", "z"},
			},
			wantValid: true,
		},
		{
			name:       "empty variations",
			variations: map[string]interface{}{},
			wantValid:  false,
		},
		{
			name:       "nil variations",
			variations: nil,
			wantValid:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations: tt.variations,
			}

			// Check if variations exist
			valid := flag.Variations != nil && len(flag.Variations) > 0
			if valid != tt.wantValid {
				t.Errorf("Variations validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_DefaultRule_SingleVariation(t *testing.T) {
	tests := []struct {
		name        string
		defaultRule *DefaultRule
		variations  map[string]interface{}
		wantValid   bool
	}{
		{
			name: "valid single variation reference",
			defaultRule: &DefaultRule{
				Variation: "enabled",
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "invalid variation reference",
			defaultRule: &DefaultRule{
				Variation: "nonexistent",
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name:        "nil default rule",
			defaultRule: nil,
			variations: map[string]interface{}{
				"enabled": true,
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations:  tt.variations,
				DefaultRule: tt.defaultRule,
			}

			valid := validateDefaultRule(flag)
			if valid != tt.wantValid {
				t.Errorf("DefaultRule validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_DefaultRule_PercentageSplit(t *testing.T) {
	tests := []struct {
		name        string
		defaultRule *DefaultRule
		variations  map[string]interface{}
		wantValid   bool
	}{
		{
			name: "valid 50/50 split",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled":  50,
					"disabled": 50,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid 70/30 split",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"control":   70,
					"treatment": 30,
				},
			},
			variations: map[string]interface{}{
				"control":   "a",
				"treatment": "b",
			},
			wantValid: true,
		},
		{
			name: "valid three-way split",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"a": 33.33,
					"b": 33.33,
					"c": 33.34,
				},
			},
			variations: map[string]interface{}{
				"a": 1,
				"b": 2,
				"c": 3,
			},
			wantValid: true,
		},
		{
			name: "invalid - percentages exceed 100",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled":  60,
					"disabled": 50,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - percentages below 100",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled":  30,
					"disabled": 30,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - negative percentage",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled":  -10,
					"disabled": 110,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - references nonexistent variation",
			defaultRule: &DefaultRule{
				Percentage: map[string]float64{
					"enabled":     50,
					"nonexistent": 50,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations:  tt.variations,
				DefaultRule: tt.defaultRule,
			}

			valid := validatePercentageSplit(flag)
			if valid != tt.wantValid {
				t.Errorf("Percentage split validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_ProgressiveRollout(t *testing.T) {
	now := time.Now()
	past := now.Add(-24 * time.Hour)
	future := now.Add(24 * time.Hour)
	_ = now.Add(48 * time.Hour) // farFuture - available for additional tests

	tests := []struct {
		name               string
		progressiveRollout *ProgressiveRollout
		variations         map[string]interface{}
		wantValid          bool
	}{
		{
			name: "valid progressive rollout",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       past.Format(time.RFC3339),
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid - same variation progression",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 10,
					Date:       past.Format(time.RFC3339),
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "invalid - end date before start date",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       future.Format(time.RFC3339),
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       past.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - missing initial step",
			progressiveRollout: &ProgressiveRollout{
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - missing end step",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       past.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - nonexistent variation",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "nonexistent",
					Percentage: 0,
					Date:       past.Format(time.RFC3339),
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - percentage exceeds 100",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       past.Format(time.RFC3339),
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 150,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - invalid date format",
			progressiveRollout: &ProgressiveRollout{
				Initial: &ProgressiveRolloutStep{
					Variation:  "disabled",
					Percentage: 0,
					Date:       "not-a-date",
				},
				End: &ProgressiveRolloutStep{
					Variation:  "enabled",
					Percentage: 100,
					Date:       future.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations: tt.variations,
				DefaultRule: &DefaultRule{
					ProgressiveRollout: tt.progressiveRollout,
				},
			}

			valid := validateProgressiveRollout(flag)
			if valid != tt.wantValid {
				t.Errorf("Progressive rollout validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_ScheduledRollout(t *testing.T) {
	now := time.Now()
	step1 := now.Add(1 * time.Hour)
	step2 := now.Add(2 * time.Hour)
	step3 := now.Add(3 * time.Hour)

	tests := []struct {
		name             string
		scheduledRollout []ScheduledStep
		variations       map[string]interface{}
		wantValid        bool
	}{
		{
			name: "valid single step",
			scheduledRollout: []ScheduledStep{
				{
					Date: step1.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid multi-step rollout",
			scheduledRollout: []ScheduledStep{
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
							"enabled":  50,
							"disabled": 50,
						},
					},
				},
				{
					Date: step3.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid with targeting rules",
			scheduledRollout: []ScheduledStep{
				{
					Date: step1.Format(time.RFC3339),
					Targeting: []TargetingRule{
						{
							Name:      "beta-users",
							Query:     `email ew "@company.com"`,
							Variation: "enabled",
						},
					},
					DefaultRule: &DefaultRule{
						Variation: "disabled",
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "invalid - dates not in order",
			scheduledRollout: []ScheduledStep{
				{
					Date: step2.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
				{
					Date: step1.Format(time.RFC3339),
					DefaultRule: &DefaultRule{
						Variation: "disabled",
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - step without default rule",
			scheduledRollout: []ScheduledStep{
				{
					Date: step1.Format(time.RFC3339),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - invalid date format",
			scheduledRollout: []ScheduledStep{
				{
					Date: "invalid-date",
					DefaultRule: &DefaultRule{
						Variation: "enabled",
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations:       tt.variations,
				ScheduledRollout: tt.scheduledRollout,
			}

			valid := validateScheduledRollout(flag)
			if valid != tt.wantValid {
				t.Errorf("Scheduled rollout validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_Experimentation(t *testing.T) {
	now := time.Now()
	past := now.Add(-24 * time.Hour)
	future := now.Add(24 * time.Hour)

	tests := []struct {
		name            string
		experimentation *Experimentation
		wantValid       bool
	}{
		{
			name: "valid experimentation window",
			experimentation: &Experimentation{
				Start: past.Format(time.RFC3339),
				End:   future.Format(time.RFC3339),
			},
			wantValid: true,
		},
		{
			name: "valid - both future dates",
			experimentation: &Experimentation{
				Start: future.Format(time.RFC3339),
				End:   future.Add(24 * time.Hour).Format(time.RFC3339),
			},
			wantValid: true,
		},
		{
			name: "invalid - end before start",
			experimentation: &Experimentation{
				Start: future.Format(time.RFC3339),
				End:   past.Format(time.RFC3339),
			},
			wantValid: false,
		},
		{
			name: "invalid - missing start",
			experimentation: &Experimentation{
				End: future.Format(time.RFC3339),
			},
			wantValid: false,
		},
		{
			name: "invalid - missing end",
			experimentation: &Experimentation{
				Start: past.Format(time.RFC3339),
			},
			wantValid: false,
		},
		{
			name: "invalid - invalid date format",
			experimentation: &Experimentation{
				Start: "not-a-date",
				End:   future.Format(time.RFC3339),
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Experimentation: tt.experimentation,
			}

			valid := validateExperimentation(flag)
			if valid != tt.wantValid {
				t.Errorf("Experimentation validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_TargetingRules(t *testing.T) {
	tests := []struct {
		name       string
		targeting  []TargetingRule
		variations map[string]interface{}
		wantValid  bool
	}{
		{
			name: "valid single targeting rule with variation",
			targeting: []TargetingRule{
				{
					Name:      "beta-users",
					Query:     `email ew "@company.com"`,
					Variation: "enabled",
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid targeting rule with percentage",
			targeting: []TargetingRule{
				{
					Name:  "gradual-rollout",
					Query: `plan eq "enterprise"`,
					Percentage: map[string]float64{
						"enabled":  50,
						"disabled": 50,
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid multiple targeting rules",
			targeting: []TargetingRule{
				{
					Name:      "admin-users",
					Query:     `role eq "admin"`,
					Variation: "enabled",
				},
				{
					Name:      "beta-testers",
					Query:     `beta eq true`,
					Variation: "enabled",
				},
				{
					Name:  "gradual-rollout",
					Query: `country in ["US", "CA"]`,
					Percentage: map[string]float64{
						"enabled":  25,
						"disabled": 75,
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "valid disabled targeting rule",
			targeting: []TargetingRule{
				{
					Name:      "disabled-rule",
					Query:     `email ew "@company.com"`,
					Variation: "enabled",
					Disable:   boolPtr(true),
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: true,
		},
		{
			name: "invalid - missing query",
			targeting: []TargetingRule{
				{
					Name:      "no-query",
					Variation: "enabled",
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - missing variation and percentage",
			targeting: []TargetingRule{
				{
					Name:  "no-outcome",
					Query: `email ew "@company.com"`,
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid - nonexistent variation",
			targeting: []TargetingRule{
				{
					Name:      "bad-ref",
					Query:     `email ew "@company.com"`,
					Variation: "nonexistent",
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
		{
			name: "invalid percentage - doesn't sum to 100",
			targeting: []TargetingRule{
				{
					Name:  "bad-percentage",
					Query: `email ew "@company.com"`,
					Percentage: map[string]float64{
						"enabled":  30,
						"disabled": 30,
					},
				},
			},
			variations: map[string]interface{}{
				"enabled":  true,
				"disabled": false,
			},
			wantValid: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations: tt.variations,
				Targeting:  tt.targeting,
			}

			valid := validateTargetingRules(flag)
			if valid != tt.wantValid {
				t.Errorf("Targeting rules validation = %v, want %v", valid, tt.wantValid)
			}
		})
	}
}

func TestFlagConfig_AdvancedSettings(t *testing.T) {
	tests := []struct {
		name         string
		flag         FlagConfig
		wantDisable  bool
		wantTracking bool
		wantVersion  string
	}{
		{
			name: "default settings",
			flag: FlagConfig{
				Variations: map[string]interface{}{"enabled": true},
			},
			wantDisable:  false,
			wantTracking: true, // default is true
			wantVersion:  "",
		},
		{
			name: "disabled flag",
			flag: FlagConfig{
				Variations: map[string]interface{}{"enabled": true},
				Disable:    boolPtr(true),
			},
			wantDisable:  true,
			wantTracking: true,
			wantVersion:  "",
		},
		{
			name: "tracking disabled",
			flag: FlagConfig{
				Variations:  map[string]interface{}{"enabled": true},
				TrackEvents: boolPtr(false),
			},
			wantDisable:  false,
			wantTracking: false,
			wantVersion:  "",
		},
		{
			name: "with version",
			flag: FlagConfig{
				Variations: map[string]interface{}{"enabled": true},
				Version:    "1.2.3",
			},
			wantDisable:  false,
			wantTracking: true,
			wantVersion:  "1.2.3",
		},
		{
			name: "all settings combined",
			flag: FlagConfig{
				Variations:  map[string]interface{}{"enabled": true},
				Disable:     boolPtr(false),
				TrackEvents: boolPtr(true),
				Version:     "2.0.0",
			},
			wantDisable:  false,
			wantTracking: true,
			wantVersion:  "2.0.0",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Check disable
			isDisabled := tt.flag.Disable != nil && *tt.flag.Disable
			if isDisabled != tt.wantDisable {
				t.Errorf("Disable = %v, want %v", isDisabled, tt.wantDisable)
			}

			// Check tracking (default is true)
			isTracking := tt.flag.TrackEvents == nil || *tt.flag.TrackEvents
			if isTracking != tt.wantTracking {
				t.Errorf("TrackEvents = %v, want %v", isTracking, tt.wantTracking)
			}

			// Check version
			if tt.flag.Version != tt.wantVersion {
				t.Errorf("Version = %v, want %v", tt.flag.Version, tt.wantVersion)
			}
		})
	}
}

func TestFlagConfig_Metadata(t *testing.T) {
	tests := []struct {
		name     string
		metadata map[string]interface{}
		wantKeys []string
	}{
		{
			name:     "no metadata",
			metadata: nil,
			wantKeys: nil,
		},
		{
			name: "simple metadata",
			metadata: map[string]interface{}{
				"description": "Test flag",
				"owner":       "team-a",
			},
			wantKeys: []string{"description", "owner"},
		},
		{
			name: "complex metadata",
			metadata: map[string]interface{}{
				"description": "Feature flag for new checkout",
				"owner":       "payments-team",
				"jiraIssue":   "PAY-123",
				"tags":        []string{"payments", "checkout"},
				"priority":    1,
			},
			wantKeys: []string{"description", "owner", "jiraIssue", "tags", "priority"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations: map[string]interface{}{"enabled": true},
				Metadata:   tt.metadata,
			}

			if tt.wantKeys == nil {
				if flag.Metadata != nil && len(flag.Metadata) > 0 {
					t.Error("Expected no metadata")
				}
				return
			}

			for _, key := range tt.wantKeys {
				if _, exists := flag.Metadata[key]; !exists {
					t.Errorf("Expected metadata key %q to exist", key)
				}
			}
		})
	}
}

func TestFlagConfig_BucketingKey(t *testing.T) {
	tests := []struct {
		name         string
		bucketingKey string
		wantKey      string
	}{
		{
			name:         "no bucketing key",
			bucketingKey: "",
			wantKey:      "",
		},
		{
			name:         "custom bucketing key - company",
			bucketingKey: "companyId",
			wantKey:      "companyId",
		},
		{
			name:         "custom bucketing key - account",
			bucketingKey: "accountId",
			wantKey:      "accountId",
		},
		{
			name:         "custom bucketing key - session",
			bucketingKey: "sessionId",
			wantKey:      "sessionId",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			flag := FlagConfig{
				Variations:   map[string]interface{}{"enabled": true},
				BucketingKey: tt.bucketingKey,
			}

			if flag.BucketingKey != tt.wantKey {
				t.Errorf("BucketingKey = %v, want %v", flag.BucketingKey, tt.wantKey)
			}
		})
	}
}

// =============================================================================
// YAML SERIALIZATION TESTS
// =============================================================================

func TestFlagConfig_YAMLSerialization(t *testing.T) {
	tests := []struct {
		name string
		flag FlagConfig
	}{
		{
			name: "simple boolean flag",
			flag: FlagConfig{
				Variations: map[string]interface{}{
					"enabled":  true,
					"disabled": false,
				},
				DefaultRule: &DefaultRule{
					Variation: "disabled",
				},
			},
		},
		{
			name: "percentage split flag",
			flag: FlagConfig{
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
			},
		},
		{
			name: "full featured flag",
			flag: FlagConfig{
				Variations: map[string]interface{}{
					"v1": map[string]interface{}{"color": "red"},
					"v2": map[string]interface{}{"color": "blue"},
				},
				Targeting: []TargetingRule{
					{
						Name:      "beta",
						Query:     `email ew "@company.com"`,
						Variation: "v2",
					},
				},
				DefaultRule: &DefaultRule{
					Variation: "v1",
				},
				TrackEvents:  boolPtr(true),
				Disable:      boolPtr(false),
				Version:      "1.0.0",
				BucketingKey: "companyId",
				Metadata: map[string]interface{}{
					"description": "Test flag",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Serialize to YAML
			data, err := yaml.Marshal(tt.flag)
			if err != nil {
				t.Fatalf("Failed to marshal: %v", err)
			}

			// Deserialize from YAML
			var result FlagConfig
			if err := yaml.Unmarshal(data, &result); err != nil {
				t.Fatalf("Failed to unmarshal: %v", err)
			}

			// Compare variations
			if !reflect.DeepEqual(result.Variations, tt.flag.Variations) {
				t.Errorf("Variations mismatch after roundtrip")
			}

			// Compare default rule variation
			if tt.flag.DefaultRule != nil && result.DefaultRule != nil {
				if result.DefaultRule.Variation != tt.flag.DefaultRule.Variation {
					t.Errorf("DefaultRule.Variation = %v, want %v",
						result.DefaultRule.Variation, tt.flag.DefaultRule.Variation)
				}
			}
		})
	}
}

func TestFlagConfig_JSONSerialization(t *testing.T) {
	tests := []struct {
		name string
		flag FlagConfig
	}{
		{
			name: "simple flag",
			flag: FlagConfig{
				Variations: map[string]interface{}{
					"enabled":  true,
					"disabled": false,
				},
				DefaultRule: &DefaultRule{
					Variation: "disabled",
				},
			},
		},
		{
			name: "flag with all fields",
			flag: FlagConfig{
				Variations: map[string]interface{}{
					"on":  true,
					"off": false,
				},
				DefaultRule: &DefaultRule{
					Variation: "off",
				},
				TrackEvents:  boolPtr(true),
				Disable:      boolPtr(false),
				Version:      "2.0.0",
				BucketingKey: "userId",
				Metadata: map[string]interface{}{
					"owner": "platform",
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Serialize to JSON
			data, err := json.Marshal(tt.flag)
			if err != nil {
				t.Fatalf("Failed to marshal: %v", err)
			}

			// Deserialize from JSON
			var result FlagConfig
			if err := json.Unmarshal(data, &result); err != nil {
				t.Fatalf("Failed to unmarshal: %v", err)
			}

			// Verify key fields
			if result.Version != tt.flag.Version {
				t.Errorf("Version = %v, want %v", result.Version, tt.flag.Version)
			}
			if result.BucketingKey != tt.flag.BucketingKey {
				t.Errorf("BucketingKey = %v, want %v", result.BucketingKey, tt.flag.BucketingKey)
			}
		})
	}
}

// =============================================================================
// HELPER FUNCTIONS AND VALIDATION LOGIC
// =============================================================================

func boolPtr(b bool) *bool {
	return &b
}

func validateDefaultRule(flag FlagConfig) bool {
	if flag.DefaultRule == nil {
		return false
	}

	// If using single variation, check it exists
	if flag.DefaultRule.Variation != "" {
		_, exists := flag.Variations[flag.DefaultRule.Variation]
		return exists
	}

	return true
}

func validatePercentageSplit(flag FlagConfig) bool {
	if flag.DefaultRule == nil || flag.DefaultRule.Percentage == nil {
		return true // Not using percentage split
	}

	var total float64
	for variation, pct := range flag.DefaultRule.Percentage {
		// Check variation exists
		if _, exists := flag.Variations[variation]; !exists {
			return false
		}
		// Check percentage is valid
		if pct < 0 {
			return false
		}
		total += pct
	}

	// Allow small floating point tolerance
	return total >= 99.99 && total <= 100.01
}

func validateProgressiveRollout(flag FlagConfig) bool {
	if flag.DefaultRule == nil || flag.DefaultRule.ProgressiveRollout == nil {
		return true // Not using progressive rollout
	}

	pr := flag.DefaultRule.ProgressiveRollout

	// Check initial and end exist
	if pr.Initial == nil || pr.End == nil {
		return false
	}

	// Check variations exist
	if _, exists := flag.Variations[pr.Initial.Variation]; !exists {
		return false
	}
	if _, exists := flag.Variations[pr.End.Variation]; !exists {
		return false
	}

	// Check percentages are valid
	if pr.Initial.Percentage < 0 || pr.Initial.Percentage > 100 {
		return false
	}
	if pr.End.Percentage < 0 || pr.End.Percentage > 100 {
		return false
	}

	// Parse and validate dates
	initialDate, err := time.Parse(time.RFC3339, pr.Initial.Date)
	if err != nil {
		return false
	}
	endDate, err := time.Parse(time.RFC3339, pr.End.Date)
	if err != nil {
		return false
	}

	// End must be after initial
	return endDate.After(initialDate)
}

func validateScheduledRollout(flag FlagConfig) bool {
	if flag.ScheduledRollout == nil || len(flag.ScheduledRollout) == 0 {
		return true // Not using scheduled rollout
	}

	var prevDate time.Time
	for i, step := range flag.ScheduledRollout {
		// Parse date
		stepDate, err := time.Parse(time.RFC3339, step.Date)
		if err != nil {
			return false
		}

		// Check dates are in order
		if i > 0 && !stepDate.After(prevDate) {
			return false
		}
		prevDate = stepDate

		// Check step has a default rule or targeting
		if step.DefaultRule == nil && len(step.Targeting) == 0 {
			return false
		}

		// Validate default rule variation if present
		if step.DefaultRule != nil && step.DefaultRule.Variation != "" {
			if _, exists := flag.Variations[step.DefaultRule.Variation]; !exists {
				return false
			}
		}
	}

	return true
}

func validateExperimentation(flag FlagConfig) bool {
	if flag.Experimentation == nil {
		return true // Not using experimentation
	}

	exp := flag.Experimentation

	// Check both dates are present
	if exp.Start == "" || exp.End == "" {
		return false
	}

	// Parse dates
	startDate, err := time.Parse(time.RFC3339, exp.Start)
	if err != nil {
		return false
	}
	endDate, err := time.Parse(time.RFC3339, exp.End)
	if err != nil {
		return false
	}

	// End must be after start
	return endDate.After(startDate)
}

func validateTargetingRules(flag FlagConfig) bool {
	if flag.Targeting == nil || len(flag.Targeting) == 0 {
		return true // No targeting rules
	}

	for _, rule := range flag.Targeting {
		// Skip disabled rules
		if rule.Disable != nil && *rule.Disable {
			continue
		}

		// Must have a query
		if rule.Query == "" {
			return false
		}

		// Must have either variation or percentage
		hasVariation := rule.Variation != ""
		hasPercentage := rule.Percentage != nil && len(rule.Percentage) > 0

		if !hasVariation && !hasPercentage {
			return false
		}

		// Validate variation reference
		if hasVariation {
			if _, exists := flag.Variations[rule.Variation]; !exists {
				return false
			}
		}

		// Validate percentage split
		if hasPercentage {
			var total float64
			for variation, pct := range rule.Percentage {
				if _, exists := flag.Variations[variation]; !exists {
					return false
				}
				if pct < 0 {
					return false
				}
				total += pct
			}
			if total < 99.99 || total > 100.01 {
				return false
			}
		}
	}

	return true
}
