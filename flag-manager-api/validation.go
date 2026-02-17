package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
)

var (
	flagKeyRegex   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)
	projectRegex   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
	segmentRegex   = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$`)
)

// ValidationError represents a structured validation error.
type ValidationError struct {
	Error   string   `json:"error"`
	Code    string   `json:"code"`
	Details []string `json:"details,omitempty"`
}

// writeValidationError sends a validation error response.
func writeValidationError(w http.ResponseWriter, code string, message string, details ...string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(ValidationError{
		Error:   message,
		Code:    code,
		Details: details,
	})
}

// ValidateFlagKey validates a flag key format.
func ValidateFlagKey(key string) error {
	if key == "" {
		return fmt.Errorf("flag key is required")
	}
	if !flagKeyRegex.MatchString(key) {
		return fmt.Errorf("flag key must match pattern: starts with alphanumeric, then alphanumeric/._- (max 128 chars)")
	}
	return nil
}

// ValidateProjectName validates a project name format.
func ValidateProjectName(name string) error {
	if name == "" {
		return fmt.Errorf("project name is required")
	}
	if !projectRegex.MatchString(name) {
		return fmt.Errorf("project name must match pattern: starts with alphanumeric, then alphanumeric/._- (max 64 chars)")
	}
	return nil
}

// ValidateSegmentName validates a segment name format.
func ValidateSegmentName(name string) error {
	if name == "" {
		return fmt.Errorf("segment name is required")
	}
	if !segmentRegex.MatchString(name) {
		return fmt.Errorf("segment name must match pattern: starts with alphanumeric, then alphanumeric/._- (max 64 chars)")
	}
	return nil
}

// ValidateFlagConfig validates a flag configuration.
func ValidateFlagConfig(config FlagConfig) []string {
	var errors []string

	// Must have at least one variation
	if len(config.Variations) == 0 {
		errors = append(errors, "at least one variation is required")
	}

	// Must have a default rule
	if config.DefaultRule == nil {
		errors = append(errors, "defaultRule is required")
	} else {
		// Default rule must reference a valid variation
		if config.DefaultRule.Variation != "" {
			if _, exists := config.Variations[config.DefaultRule.Variation]; !exists {
				errors = append(errors, fmt.Sprintf("defaultRule variation '%s' not found in variations", config.DefaultRule.Variation))
			}
		}

		// Validate percentage splits sum to 100
		if len(config.DefaultRule.Percentage) > 0 {
			var total float64
			for varName, pct := range config.DefaultRule.Percentage {
				if _, exists := config.Variations[varName]; !exists {
					errors = append(errors, fmt.Sprintf("percentage references unknown variation '%s'", varName))
				}
				if pct < 0 {
					errors = append(errors, fmt.Sprintf("percentage for '%s' cannot be negative", varName))
				}
				total += pct
			}
			if total < 99.9 || total > 100.1 { // Allow small float imprecision
				errors = append(errors, fmt.Sprintf("percentage splits must sum to 100 (got %.2f)", total))
			}
		}
	}

	// Validate targeting rules
	for i, rule := range config.Targeting {
		if rule.Query == "" {
			errors = append(errors, fmt.Sprintf("targeting rule #%d must have a query", i+1))
		}

		// Validate variation reference
		if rule.Variation != "" {
			if _, exists := config.Variations[rule.Variation]; !exists {
				errors = append(errors, fmt.Sprintf("targeting rule #%d references unknown variation '%s'", i+1, rule.Variation))
			}
		}

		// Validate percentage splits
		if len(rule.Percentage) > 0 {
			var total float64
			for varName, pct := range rule.Percentage {
				if _, exists := config.Variations[varName]; !exists {
					errors = append(errors, fmt.Sprintf("targeting rule #%d percentage references unknown variation '%s'", i+1, varName))
				}
				total += pct
				_ = pct
			}
			if total < 99.9 || total > 100.1 {
				errors = append(errors, fmt.Sprintf("targeting rule #%d percentage splits must sum to 100 (got %.2f)", i+1, total))
			}
		}
	}

	// Validate progressive rollout date ordering
	if config.DefaultRule != nil && config.DefaultRule.ProgressiveRollout != nil {
		pr := config.DefaultRule.ProgressiveRollout
		if pr.Initial != nil && pr.End != nil && pr.Initial.Date != "" && pr.End.Date != "" {
			if strings.Compare(pr.Initial.Date, pr.End.Date) >= 0 {
				errors = append(errors, "progressive rollout initial date must be before end date")
			}
		}
	}

	// Validate scheduled rollout date ordering
	if len(config.ScheduledRollout) > 1 {
		for i := 1; i < len(config.ScheduledRollout); i++ {
			prev := config.ScheduledRollout[i-1].Date
			curr := config.ScheduledRollout[i].Date
			if prev != "" && curr != "" && strings.Compare(prev, curr) >= 0 {
				errors = append(errors, fmt.Sprintf("scheduled rollout step #%d date must be after step #%d date", i+1, i))
			}
		}
	}

	// Validate experimentation dates
	if config.Experimentation != nil {
		if config.Experimentation.Start != "" && config.Experimentation.End != "" {
			if strings.Compare(config.Experimentation.Start, config.Experimentation.End) >= 0 {
				errors = append(errors, "experimentation start date must be before end date")
			}
		}
	}

	return errors
}
