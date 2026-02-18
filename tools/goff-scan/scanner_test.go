package main

import (
	"testing"
)

func TestScanTestdata(t *testing.T) {
	scanner := NewScanner([]string{"node_modules", "vendor", ".git"})
	flags, err := scanner.Scan("testdata")
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	if len(flags) == 0 {
		t.Fatal("expected flags to be discovered from testdata/")
	}

	// Build a lookup for easy assertions
	found := make(map[string]DiscoveredFlag)
	for _, f := range flags {
		found[f.Key] = f
	}

	// Verify a subset of expected flags from our test fixtures
	expected := []struct {
		key  string
		typ  FlagType
	}{
		// From sample.go
		{"dark-mode", FlagTypeBoolean},
		{"welcome-message", FlagTypeString},
		{"max-items", FlagTypeNumber},
		{"sample-rate", FlagTypeNumber},
		{"config-data", FlagTypeObject},
		{"new-checkout", FlagTypeBoolean},
		{"banner-text", FlagTypeString},

		// From sample.tsx
		{"theme-name", FlagTypeString},
		{"ui-config", FlagTypeObject},
		{"feature-x", FlagTypeBoolean},
		{"button-label", FlagTypeString},

		// From sample.py
		{"welcome-msg", FlagTypeString},
		{"app-config", FlagTypeObject},

		// From sample.cs
		{"dotnet-flag", FlagTypeBoolean},
		{"app-name", FlagTypeString},
		{"score-threshold", FlagTypeNumber},

		// From sample.rb
		{"ruby-feature", FlagTypeBoolean},
		{"label-text", FlagTypeString},
		{"ruby-config", FlagTypeObject},
	}

	for _, e := range expected {
		f, ok := found[e.key]
		if !ok {
			t.Errorf("expected flag %q to be discovered", e.key)
			continue
		}
		if f.Type != e.typ {
			t.Errorf("flag %q: got type %q, want %q", e.key, f.Type, e.typ)
		}
		if f.Source == "" {
			t.Errorf("flag %q: expected non-empty source", e.key)
		}
	}
}

func TestScanDeduplication(t *testing.T) {
	scanner := NewScanner([]string{})
	flags, err := scanner.Scan("testdata")
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	// Check that "dark-mode" only appears once even though it's in multiple files
	count := 0
	for _, f := range flags {
		if f.Key == "dark-mode" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("expected dark-mode to appear exactly once, got %d", count)
	}
}

func TestScanExcludes(t *testing.T) {
	// Exclude all go files via their directory
	scanner := NewScanner([]string{"*.go"})
	flags, err := scanner.Scan("testdata")
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}

	for _, f := range flags {
		// Should not find Go-only flags like "item-list" (from JSONArrayVariation)
		if f.Key == "item-list" {
			t.Errorf("expected 'item-list' to be excluded when .go files are excluded")
		}
	}
}

func TestScanEmptyDir(t *testing.T) {
	// Create a temp dir with nothing scannable
	dir := t.TempDir()
	scanner := NewScanner([]string{})
	flags, err := scanner.Scan(dir)
	if err != nil {
		t.Fatalf("Scan failed: %v", err)
	}
	if len(flags) != 0 {
		t.Errorf("expected 0 flags from empty dir, got %d", len(flags))
	}
}

func TestManifestSerialization(t *testing.T) {
	flags := []DiscoveredFlag{
		{Key: "test-flag", Type: FlagTypeBoolean, Source: "main.go:10"},
	}
	m := NewManifest("test-project", "test-app", "1.0.0", flags)

	jsonData, err := m.ToJSON()
	if err != nil {
		t.Fatalf("ToJSON failed: %v", err)
	}
	if len(jsonData) == 0 {
		t.Error("expected non-empty JSON output")
	}

	yamlData, err := m.ToYAML()
	if err != nil {
		t.Fatalf("ToYAML failed: %v", err)
	}
	if len(yamlData) == 0 {
		t.Error("expected non-empty YAML output")
	}
}
