package main

import (
	"encoding/json"
	"time"

	"gopkg.in/yaml.v3"
)

// Manifest is the output produced by the scanner.
type Manifest struct {
	Project  string           `json:"project" yaml:"project"`
	Flags    []DiscoveredFlag `json:"flags" yaml:"flags"`
	Metadata ManifestMetadata `json:"metadata" yaml:"metadata"`
}

// DiscoveredFlag represents a flag found during scanning.
type DiscoveredFlag struct {
	Key    string   `json:"key" yaml:"key"`
	Type   FlagType `json:"type" yaml:"type"`
	Source string   `json:"source" yaml:"source"`
}

// ManifestMetadata holds metadata about the scan run.
type ManifestMetadata struct {
	App         string `json:"app,omitempty" yaml:"app,omitempty"`
	Version     string `json:"version,omitempty" yaml:"version,omitempty"`
	GeneratedAt string `json:"generatedAt" yaml:"generatedAt"`
}

// NewManifest creates a manifest with current timestamp.
func NewManifest(project, app, version string, flags []DiscoveredFlag) Manifest {
	return Manifest{
		Project: project,
		Flags:   flags,
		Metadata: ManifestMetadata{
			App:         app,
			Version:     version,
			GeneratedAt: time.Now().UTC().Format(time.RFC3339),
		},
	}
}

// ToJSON serializes the manifest to JSON.
func (m Manifest) ToJSON() ([]byte, error) {
	return json.MarshalIndent(m, "", "  ")
}

// ToYAML serializes the manifest to YAML.
func (m Manifest) ToYAML() ([]byte, error) {
	return yaml.Marshal(m)
}
