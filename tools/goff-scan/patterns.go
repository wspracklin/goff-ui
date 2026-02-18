package main

import "regexp"

// FlagType represents the type of a discovered flag.
type FlagType string

const (
	FlagTypeBoolean FlagType = "boolean"
	FlagTypeString  FlagType = "string"
	FlagTypeNumber  FlagType = "number"
	FlagTypeObject  FlagType = "object"
)

// FlagPattern maps a compiled regex to its flag type.
type FlagPattern struct {
	Regex *regexp.Regexp
	Type  FlagType
}

// allPatterns returns all compiled flag evaluation patterns across OpenFeature SDKs.
// Each regex captures the flag key in group 1.
func allPatterns() []FlagPattern {
	raw := []struct {
		pattern string
		typ     FlagType
	}{
		// =====================================================================
		// Go: go-feature-flag (ffclient)
		// =====================================================================
		{`BoolVariation\(\s*"([^"]+)"`, FlagTypeBoolean},
		{`StringVariation\(\s*"([^"]+)"`, FlagTypeString},
		{`IntVariation\(\s*"([^"]+)"`, FlagTypeNumber},
		{`Float64Variation\(\s*"([^"]+)"`, FlagTypeNumber},
		{`JSONVariation\(\s*"([^"]+)"`, FlagTypeObject},
		{`JSONArrayVariation\(\s*"([^"]+)"`, FlagTypeObject},

		// =====================================================================
		// Go: OpenFeature SDK
		// =====================================================================
		{`\.BooleanValue\([^,]*,\s*"([^"]+)"`, FlagTypeBoolean},
		{`\.StringValue\([^,]*,\s*"([^"]+)"`, FlagTypeString},
		{`\.FloatValue\([^,]*,\s*"([^"]+)"`, FlagTypeNumber},
		{`\.IntValue\([^,]*,\s*"([^"]+)"`, FlagTypeNumber},
		{`\.ObjectValue\([^,]*,\s*"([^"]+)"`, FlagTypeObject},

		// =====================================================================
		// JS/TS/Java/Kotlin/Swift: OpenFeature SDK
		// Matches both "double" and 'single' quoted keys
		// =====================================================================
		{`\.getBooleanValue\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`\.getStringValue\(\s*["']([^"']+)["']`, FlagTypeString},
		{`\.getNumberValue\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`\.getObjectValue\(\s*["']([^"']+)["']`, FlagTypeObject},

		// Also match Detail variants
		{`\.getBooleanDetails\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`\.getStringDetails\(\s*["']([^"']+)["']`, FlagTypeString},
		{`\.getNumberDetails\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`\.getObjectDetails\(\s*["']([^"']+)["']`, FlagTypeObject},

		// =====================================================================
		// React hooks (OpenFeature React SDK)
		// =====================================================================
		{`useBooleanFlagValue\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`useStringFlagValue\(\s*["']([^"']+)["']`, FlagTypeString},
		{`useNumberFlagValue\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`useObjectFlagValue\(\s*["']([^"']+)["']`, FlagTypeObject},
		{`useBooleanFlagDetails\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`useStringFlagDetails\(\s*["']([^"']+)["']`, FlagTypeString},
		{`useNumberFlagDetails\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`useObjectFlagDetails\(\s*["']([^"']+)["']`, FlagTypeObject},

		// =====================================================================
		// Python: OpenFeature SDK
		// =====================================================================
		{`\.get_boolean_value\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`\.get_string_value\(\s*["']([^"']+)["']`, FlagTypeString},
		{`\.get_float_value\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`\.get_integer_value\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`\.get_object_value\(\s*["']([^"']+)["']`, FlagTypeObject},

		// =====================================================================
		// .NET: OpenFeature SDK
		// =====================================================================
		{`\.GetBooleanValueAsync\(\s*"([^"]+)"`, FlagTypeBoolean},
		{`\.GetStringValueAsync\(\s*"([^"]+)"`, FlagTypeString},
		{`\.GetDoubleValueAsync\(\s*"([^"]+)"`, FlagTypeNumber},
		{`\.GetIntegerValueAsync\(\s*"([^"]+)"`, FlagTypeNumber},
		{`\.GetObjectValueAsync\(\s*"([^"]+)"`, FlagTypeObject},

		// =====================================================================
		// Ruby: OpenFeature SDK
		// =====================================================================
		{`\.fetch_boolean_value\(\s*["']([^"']+)["']`, FlagTypeBoolean},
		{`\.fetch_string_value\(\s*["']([^"']+)["']`, FlagTypeString},
		{`\.fetch_number_value\(\s*["']([^"']+)["']`, FlagTypeNumber},
		{`\.fetch_object_value\(\s*["']([^"']+)["']`, FlagTypeObject},
	}

	patterns := make([]FlagPattern, 0, len(raw))
	for _, r := range raw {
		patterns = append(patterns, FlagPattern{
			Regex: regexp.MustCompile(r.pattern),
			Type:  r.typ,
		})
	}
	return patterns
}
