package main

import (
	"testing"
)

func TestAllPatterns(t *testing.T) {
	patterns := allPatterns()
	if len(patterns) == 0 {
		t.Fatal("expected at least one pattern")
	}

	tests := []struct {
		name     string
		line     string
		wantKey  string
		wantType FlagType
	}{
		// Go ffclient
		{"go ffclient BoolVariation", `enabled, _ := ffclient.BoolVariation("dark-mode", user, false)`, "dark-mode", FlagTypeBoolean},
		{"go ffclient StringVariation", `val, _ := ffclient.StringVariation("welcome-msg", user, "hi")`, "welcome-msg", FlagTypeString},
		{"go ffclient IntVariation", `n, _ := ffclient.IntVariation("max-items", user, 10)`, "max-items", FlagTypeNumber},
		{"go ffclient Float64Variation", `f, _ := ffclient.Float64Variation("sample-rate", user, 0.5)`, "sample-rate", FlagTypeNumber},
		{"go ffclient JSONVariation", `j, _ := ffclient.JSONVariation("config", user, nil)`, "config", FlagTypeObject},
		{"go ffclient JSONArrayVariation", `a, _ := ffclient.JSONArrayVariation("items", user, nil)`, "items", FlagTypeObject},

		// Go OpenFeature
		{"go of BooleanValue", `client.BooleanValue(ctx, "new-checkout", false, nil)`, "new-checkout", FlagTypeBoolean},
		{"go of StringValue", `client.StringValue(ctx, "banner", "default", nil)`, "banner", FlagTypeString},
		{"go of FloatValue", `client.FloatValue(ctx, "timeout", 30.0, nil)`, "timeout", FlagTypeNumber},
		{"go of IntValue", `client.IntValue(ctx, "retries", 3, nil)`, "retries", FlagTypeNumber},
		{"go of ObjectValue", `client.ObjectValue(ctx, "cfg", nil, nil)`, "cfg", FlagTypeObject},

		// JS/TS double quotes
		{"js getBooleanValue dq", `const val = client.getBooleanValue("feature-x", false);`, "feature-x", FlagTypeBoolean},
		{"js getStringValue dq", `const val = client.getStringValue("label", "default");`, "label", FlagTypeString},
		{"js getNumberValue dq", `const val = client.getNumberValue("limit", 100);`, "limit", FlagTypeNumber},
		{"js getObjectValue dq", `const val = client.getObjectValue("settings", {});`, "settings", FlagTypeObject},

		// JS/TS single quotes
		{"js getBooleanValue sq", `const val = client.getBooleanValue('my-flag', false);`, "my-flag", FlagTypeBoolean},
		{"ts getStringValue sq", `const val = client.getStringValue('greeting', 'hi');`, "greeting", FlagTypeString},

		// React hooks
		{"react useBooleanFlagValue", `const dark = useBooleanFlagValue('dark-mode', false);`, "dark-mode", FlagTypeBoolean},
		{"react useStringFlagValue", `const t = useStringFlagValue("theme", "light");`, "theme", FlagTypeString},
		{"react useNumberFlagValue", `const n = useNumberFlagValue("max", 10);`, "max", FlagTypeNumber},
		{"react useObjectFlagValue", `const c = useObjectFlagValue("config", {});`, "config", FlagTypeObject},

		// Python
		{"python get_boolean_value", `val = client.get_boolean_value("py-flag", False)`, "py-flag", FlagTypeBoolean},
		{"python get_string_value", `val = client.get_string_value('py-str', 'default')`, "py-str", FlagTypeString},
		{"python get_float_value", `val = client.get_float_value("rate", 0.5)`, "rate", FlagTypeNumber},
		{"python get_integer_value", `val = client.get_integer_value("count", 0)`, "count", FlagTypeNumber},
		{"python get_object_value", `val = client.get_object_value("obj", {})`, "obj", FlagTypeObject},

		// .NET
		{"dotnet GetBooleanValueAsync", `var v = await client.GetBooleanValueAsync("net-flag", false);`, "net-flag", FlagTypeBoolean},
		{"dotnet GetStringValueAsync", `var v = await client.GetStringValueAsync("net-str", "");`, "net-str", FlagTypeString},
		{"dotnet GetDoubleValueAsync", `var v = await client.GetDoubleValueAsync("net-dbl", 0.0);`, "net-dbl", FlagTypeNumber},
		{"dotnet GetIntegerValueAsync", `var v = await client.GetIntegerValueAsync("net-int", 0);`, "net-int", FlagTypeNumber},
		{"dotnet GetObjectValueAsync", `var v = await client.GetObjectValueAsync("net-obj", null);`, "net-obj", FlagTypeObject},

		// Ruby
		{"ruby fetch_boolean_value", `val = client.fetch_boolean_value("rb-flag", false)`, "rb-flag", FlagTypeBoolean},
		{"ruby fetch_string_value", `val = client.fetch_string_value('rb-str', 'default')`, "rb-str", FlagTypeString},
		{"ruby fetch_number_value", `val = client.fetch_number_value("rb-num", 0)`, "rb-num", FlagTypeNumber},
		{"ruby fetch_object_value", `val = client.fetch_object_value("rb-obj", {})`, "rb-obj", FlagTypeObject},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			found := false
			for _, p := range patterns {
				matches := p.Regex.FindStringSubmatch(tt.line)
				if len(matches) >= 2 && matches[1] == tt.wantKey {
					if p.Type != tt.wantType {
						t.Errorf("matched key %q but got type %q, want %q", tt.wantKey, p.Type, tt.wantType)
					}
					found = true
					break
				}
			}
			if !found {
				t.Errorf("no pattern matched key %q in line: %s", tt.wantKey, tt.line)
			}
		})
	}
}

func TestNoFalsePositives(t *testing.T) {
	patterns := allPatterns()
	lines := []string{
		`// BoolVariation is a function`,
		`var flagKey = "my-flag"`,
		`fmt.Println("hello world")`,
		`const x = 42`,
	}

	for _, line := range lines {
		for _, p := range patterns {
			if matches := p.Regex.FindStringSubmatch(line); len(matches) >= 2 {
				t.Errorf("false positive: pattern %q matched %q in line: %s", p.Regex.String(), matches[1], line)
			}
		}
	}
}
