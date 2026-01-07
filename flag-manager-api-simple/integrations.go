package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"flag-manager-api/git"

	"github.com/gorilla/mux"
)

// GitIntegration represents a configured git repository integration
type GitIntegration struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Provider    string    `json:"provider"` // "ado" or "gitlab"
	Description string    `json:"description,omitempty"`
	IsDefault   bool      `json:"isDefault"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	// ADO-specific fields
	ADOOrgURL     string `json:"adoOrgUrl,omitempty"`
	ADOProject    string `json:"adoProject,omitempty"`
	ADORepository string `json:"adoRepository,omitempty"`
	ADOPAT        string `json:"adoPat,omitempty"`

	// GitLab-specific fields
	GitLabURL       string `json:"gitlabUrl,omitempty"`
	GitLabProjectID string `json:"gitlabProjectId,omitempty"`
	GitLabToken     string `json:"gitlabToken,omitempty"`

	// Common fields
	BaseBranch string `json:"baseBranch"`
	FlagsPath  string `json:"flagsPath"`
}

// IntegrationsStore manages git integrations
type IntegrationsStore struct {
	configPath   string
	integrations map[string]*GitIntegration
	providers    map[string]git.Provider
	mu           sync.RWMutex
}

// NewIntegrationsStore creates a new integrations store
func NewIntegrationsStore(configDir string) *IntegrationsStore {
	store := &IntegrationsStore{
		configPath:   filepath.Join(configDir, "integrations.json"),
		integrations: make(map[string]*GitIntegration),
		providers:    make(map[string]git.Provider),
	}
	store.load()
	return store
}

func (s *IntegrationsStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var integrations []*GitIntegration
	if err := json.Unmarshal(data, &integrations); err != nil {
		return err
	}

	for _, integration := range integrations {
		s.integrations[integration.ID] = integration
		s.initProvider(integration)
	}

	return nil
}

func (s *IntegrationsStore) save() error {
	integrations := make([]*GitIntegration, 0, len(s.integrations))
	for _, integration := range s.integrations {
		integrations = append(integrations, integration)
	}

	data, err := json.MarshalIndent(integrations, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, data, 0644)
}

func (s *IntegrationsStore) initProvider(integration *GitIntegration) {
	var provider git.Provider
	var err error

	switch integration.Provider {
	case "ado":
		if integration.ADOOrgURL != "" && integration.ADOProject != "" && integration.ADORepository != "" && integration.ADOPAT != "" {
			provider = git.NewADOClient(
				integration.ADOOrgURL,
				integration.ADOProject,
				integration.ADORepository,
				integration.ADOPAT,
				integration.BaseBranch,
			)
		}
	case "gitlab":
		if integration.GitLabURL != "" && integration.GitLabProjectID != "" && integration.GitLabToken != "" {
			provider = git.NewGitLabClient(
				integration.GitLabURL,
				integration.GitLabProjectID,
				integration.GitLabToken,
				integration.BaseBranch,
			)
		}
	}

	if err == nil && provider != nil {
		s.providers[integration.ID] = provider
	}
}

// List returns all integrations (with secrets masked)
func (s *IntegrationsStore) List() []*GitIntegration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*GitIntegration, 0, len(s.integrations))
	for _, integration := range s.integrations {
		masked := s.maskSecrets(integration)
		result = append(result, masked)
	}
	return result
}

// Get returns an integration by ID (with secrets masked)
func (s *IntegrationsStore) Get(id string) *GitIntegration {
	s.mu.RLock()
	defer s.mu.RUnlock()

	integration, exists := s.integrations[id]
	if !exists {
		return nil
	}
	return s.maskSecrets(integration)
}

// GetProvider returns the git provider for an integration
func (s *IntegrationsStore) GetProvider(id string) git.Provider {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.providers[id]
}

// GetDefaultProvider returns the default git provider
func (s *IntegrationsStore) GetDefaultProvider() (git.Provider, *GitIntegration) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for id, integration := range s.integrations {
		if integration.IsDefault {
			return s.providers[id], s.maskSecrets(integration)
		}
	}

	// Return first one if no default set
	for id, integration := range s.integrations {
		return s.providers[id], s.maskSecrets(integration)
	}

	return nil, nil
}

// Create adds a new integration
func (s *IntegrationsStore) Create(integration *GitIntegration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	integration.CreatedAt = time.Now()
	integration.UpdatedAt = time.Now()

	// If this is the first or marked as default, clear other defaults
	if integration.IsDefault || len(s.integrations) == 0 {
		integration.IsDefault = true
		for _, existing := range s.integrations {
			existing.IsDefault = false
		}
	}

	s.integrations[integration.ID] = integration
	s.initProvider(integration)

	return s.save()
}

// Update modifies an existing integration
func (s *IntegrationsStore) Update(id string, updates *GitIntegration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.integrations[id]
	if !exists {
		return nil
	}

	// Preserve secrets if not provided (masked values)
	if updates.ADOPAT == "********" || updates.ADOPAT == "" {
		updates.ADOPAT = existing.ADOPAT
	}
	if updates.GitLabToken == "********" || updates.GitLabToken == "" {
		updates.GitLabToken = existing.GitLabToken
	}

	updates.ID = id
	updates.CreatedAt = existing.CreatedAt
	updates.UpdatedAt = time.Now()

	// Handle default flag
	if updates.IsDefault {
		for _, other := range s.integrations {
			if other.ID != id {
				other.IsDefault = false
			}
		}
	}

	s.integrations[id] = updates
	s.initProvider(updates)

	return s.save()
}

// Delete removes an integration
func (s *IntegrationsStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	wasDefault := false
	if integration, exists := s.integrations[id]; exists {
		wasDefault = integration.IsDefault
	}

	delete(s.integrations, id)
	delete(s.providers, id)

	// If deleted was default, make another one default
	if wasDefault && len(s.integrations) > 0 {
		for _, integration := range s.integrations {
			integration.IsDefault = true
			break
		}
	}

	return s.save()
}

func (s *IntegrationsStore) maskSecrets(integration *GitIntegration) *GitIntegration {
	masked := *integration
	if masked.ADOPAT != "" {
		masked.ADOPAT = "********"
	}
	if masked.GitLabToken != "" {
		masked.GitLabToken = "********"
	}
	return &masked
}

// HTTP Handlers

func (fm *FlagManager) listIntegrationsHandler(w http.ResponseWriter, r *http.Request) {
	integrations := fm.integrations.List()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"integrations": integrations,
	})
}

func (fm *FlagManager) getIntegrationHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	integration := fm.integrations.Get(id)
	if integration == nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(integration)
}

func (fm *FlagManager) createIntegrationHandler(w http.ResponseWriter, r *http.Request) {
	var integration GitIntegration
	if err := json.NewDecoder(r.Body).Decode(&integration); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if integration.ID == "" {
		http.Error(w, "Integration ID is required", http.StatusBadRequest)
		return
	}

	if integration.Provider != "ado" && integration.Provider != "gitlab" {
		http.Error(w, "Provider must be 'ado' or 'gitlab'", http.StatusBadRequest)
		return
	}

	if integration.BaseBranch == "" {
		integration.BaseBranch = "main"
	}

	if err := fm.integrations.Create(&integration); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(fm.integrations.Get(integration.ID))
}

func (fm *FlagManager) updateIntegrationHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var integration GitIntegration
	if err := json.NewDecoder(r.Body).Decode(&integration); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := fm.integrations.Update(id, &integration); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	updated := fm.integrations.Get(id)
	if updated == nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (fm *FlagManager) deleteIntegrationHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.integrations.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) testIntegrationHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	provider := fm.integrations.GetProvider(id)
	if provider == nil {
		http.Error(w, "Integration not found or not configured", http.StatusNotFound)
		return
	}

	integration := fm.integrations.Get(id)
	if integration == nil {
		http.Error(w, "Integration not found", http.StatusNotFound)
		return
	}

	// Try to fetch the flags file
	_, err := provider.GetFile(integration.FlagsPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Successfully connected to repository",
	})
}
