package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/mux"
	"gopkg.in/yaml.v3"
)

// FlagSet represents a collection of related feature flags
type FlagSet struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Description string              `json:"description,omitempty"`
	APIKeys     []string            `json:"apiKeys"`
	Retriever   FlagSetRetriever    `json:"retriever"`
	Exporter    *FlagSetExporter    `json:"exporter,omitempty"`
	Notifier    *FlagSetNotifier    `json:"notifier,omitempty"`
	IsDefault   bool                `json:"isDefault"`
	CreatedAt   time.Time           `json:"createdAt"`
	UpdatedAt   time.Time           `json:"updatedAt"`
}

// FlagSetRetriever defines how flags are loaded for this set
type FlagSetRetriever struct {
	Kind string `json:"kind"` // file, http, git, s3, etc.
	// File retriever
	Path string `json:"path,omitempty"`
	// HTTP retriever
	URL     string            `json:"url,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`
	// Git retriever
	RepositorySlug string `json:"repositorySlug,omitempty"`
	Branch         string `json:"branch,omitempty"`
	FilePath       string `json:"filePath,omitempty"`
	// Common
	PollingInterval int    `json:"pollingInterval,omitempty"` // in milliseconds
	FileFormat      string `json:"fileFormat,omitempty"`      // yaml, json, toml
}

// FlagSetExporter defines where evaluation data is sent
type FlagSetExporter struct {
	Kind string `json:"kind"` // log, webhook, file, s3, googlecloud, kafka
	// Common fields
	FlushInterval    int  `json:"flushInterval,omitempty"`
	MaxEventInMemory int  `json:"maxEventInMemory,omitempty"`
	Bulk             bool `json:"bulk,omitempty"`
	// Webhook exporter
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	// File exporter
	OutputDir string `json:"outputDir,omitempty"`
	Filename  string `json:"filename,omitempty"`
	Format    string `json:"format,omitempty"`
}

// FlagSetNotifier defines how flag changes are notified
type FlagSetNotifier struct {
	Kind string `json:"kind"` // slack, webhook
	// Slack
	SlackWebhookURL string `json:"slackWebhookUrl,omitempty"`
	// Webhook
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
}

// FlagSetsStore manages flag set persistence
type FlagSetsStore struct {
	mu       sync.RWMutex
	flagSets []FlagSet
	filePath string
}

// NewFlagSetsStore creates a new flag sets store
func NewFlagSetsStore(flagsDir string) *FlagSetsStore {
	store := &FlagSetsStore{
		filePath: filepath.Join(flagsDir, "flagsets.json"),
		flagSets: []FlagSet{},
	}
	store.load()
	return store
}

func (s *FlagSetsStore) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			s.flagSets = []FlagSet{}
			return
		}
		fmt.Printf("Error loading flag sets: %v\n", err)
		return
	}

	if err := json.Unmarshal(data, &s.flagSets); err != nil {
		fmt.Printf("Error parsing flag sets: %v\n", err)
		s.flagSets = []FlagSet{}
	}
}

func (s *FlagSetsStore) save() error {
	data, err := json.MarshalIndent(s.flagSets, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}

// List returns all flag sets
func (s *FlagSetsStore) List() []FlagSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]FlagSet, len(s.flagSets))
	copy(result, s.flagSets)
	return result
}

// Get returns a flag set by ID
func (s *FlagSetsStore) Get(id string) *FlagSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, fs := range s.flagSets {
		if fs.ID == id {
			fsCopy := fs
			return &fsCopy
		}
	}
	return nil
}

// GetByName returns a flag set by name
func (s *FlagSetsStore) GetByName(name string) *FlagSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, fs := range s.flagSets {
		if fs.Name == name {
			fsCopy := fs
			return &fsCopy
		}
	}
	return nil
}

// GetDefault returns the default flag set
func (s *FlagSetsStore) GetDefault() *FlagSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, fs := range s.flagSets {
		if fs.IsDefault {
			fsCopy := fs
			return &fsCopy
		}
	}
	return nil
}

// Create adds a new flag set
func (s *FlagSetsStore) Create(fs FlagSet) (*FlagSet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Check for duplicate name
	for _, existing := range s.flagSets {
		if existing.Name == fs.Name {
			return nil, fmt.Errorf("flag set with name '%s' already exists", fs.Name)
		}
	}

	// Generate ID and timestamps
	fs.ID = uuid.New().String()
	fs.CreatedAt = time.Now()
	fs.UpdatedAt = time.Now()

	// If this is the first flag set or marked as default, handle default flag
	if fs.IsDefault || len(s.flagSets) == 0 {
		fs.IsDefault = true
		for i := range s.flagSets {
			s.flagSets[i].IsDefault = false
		}
	}

	s.flagSets = append(s.flagSets, fs)

	if err := s.save(); err != nil {
		return nil, err
	}

	return &fs, nil
}

// Update modifies an existing flag set
func (s *FlagSetsStore) Update(id string, updates FlagSet) (*FlagSet, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := -1
	for i, fs := range s.flagSets {
		if fs.ID == id {
			idx = i
			break
		}
	}

	if idx == -1 {
		return nil, fmt.Errorf("flag set not found")
	}

	// Check for duplicate name (excluding current)
	for i, existing := range s.flagSets {
		if i != idx && existing.Name == updates.Name {
			return nil, fmt.Errorf("flag set with name '%s' already exists", updates.Name)
		}
	}

	// Preserve ID and created timestamp
	updates.ID = s.flagSets[idx].ID
	updates.CreatedAt = s.flagSets[idx].CreatedAt
	updates.UpdatedAt = time.Now()

	// Handle default flag
	if updates.IsDefault {
		for i := range s.flagSets {
			if i != idx {
				s.flagSets[i].IsDefault = false
			}
		}
	}

	s.flagSets[idx] = updates

	if err := s.save(); err != nil {
		return nil, err
	}

	return &updates, nil
}

// Delete removes a flag set
func (s *FlagSetsStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	idx := -1
	for i, fs := range s.flagSets {
		if fs.ID == id {
			idx = i
			break
		}
	}

	if idx == -1 {
		return nil
	}

	wasDefault := s.flagSets[idx].IsDefault
	s.flagSets = append(s.flagSets[:idx], s.flagSets[idx+1:]...)

	// If deleted flag set was default and there are others, make first one default
	if wasDefault && len(s.flagSets) > 0 {
		s.flagSets[0].IsDefault = true
	}

	return s.save()
}

// GenerateAPIKey generates a new API key for a flag set
func (s *FlagSetsStore) GenerateAPIKey(id string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, fs := range s.flagSets {
		if fs.ID == id {
			newKey := uuid.New().String()
			s.flagSets[i].APIKeys = append(s.flagSets[i].APIKeys, newKey)
			s.flagSets[i].UpdatedAt = time.Now()
			if err := s.save(); err != nil {
				return "", err
			}
			return newKey, nil
		}
	}
	return "", fmt.Errorf("flag set not found")
}

// RemoveAPIKey removes an API key from a flag set
func (s *FlagSetsStore) RemoveAPIKey(id string, apiKey string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	for i, fs := range s.flagSets {
		if fs.ID == id {
			newKeys := make([]string, 0, len(fs.APIKeys))
			for _, key := range fs.APIKeys {
				if key != apiKey {
					newKeys = append(newKeys, key)
				}
			}
			if len(newKeys) == 0 {
				return fmt.Errorf("cannot remove last API key")
			}
			s.flagSets[i].APIKeys = newKeys
			s.flagSets[i].UpdatedAt = time.Now()
			return s.save()
		}
	}
	return fmt.Errorf("flag set not found")
}

// HTTP Handlers

func (fm *FlagManager) listFlagSetsHandler(w http.ResponseWriter, r *http.Request) {
	flagSets := fm.flagSets.List()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"flagSets": flagSets,
	})
}

func (fm *FlagManager) getFlagSetHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flagSet)
}

func (fm *FlagManager) createFlagSetHandler(w http.ResponseWriter, r *http.Request) {
	var flagSet FlagSet
	if err := json.NewDecoder(r.Body).Decode(&flagSet); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate required fields
	if flagSet.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	// Generate initial API key if none provided
	if len(flagSet.APIKeys) == 0 {
		flagSet.APIKeys = []string{uuid.New().String()}
	}

	// Default retriever to file if not specified
	if flagSet.Retriever.Kind == "" {
		flagSet.Retriever.Kind = "file"
	}

	created, err := fm.flagSets.Create(flagSet)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	// Create flags file for the flag set if using file retriever
	if flagSet.Retriever.Kind == "file" {
		flagSetFlagsPath := filepath.Join(fm.config.FlagsDir, fmt.Sprintf("flagset-%s.yaml", created.ID))
		if _, err := os.Stat(flagSetFlagsPath); os.IsNotExist(err) {
			// Create empty flags file
			os.WriteFile(flagSetFlagsPath, []byte("# Flags for "+created.Name+"\n"), 0644)
		}
		// Update retriever path
		created.Retriever.Path = flagSetFlagsPath
		fm.flagSets.Update(created.ID, *created)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (fm *FlagManager) updateFlagSetHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var updates FlagSet
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	updated, err := fm.flagSets.Update(id, updates)
	if err != nil {
		if err.Error() == "flag set not found" {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusConflict)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (fm *FlagManager) deleteFlagSetHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.flagSets.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

func (fm *FlagManager) generateFlagSetAPIKeyHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	newKey, err := fm.flagSets.GenerateAPIKey(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"apiKey": newKey})
}

func (fm *FlagManager) removeFlagSetAPIKeyHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var body struct {
		APIKey string `json:"apiKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := fm.flagSets.RemoveAPIKey(id, body.APIKey); err != nil {
		if err.Error() == "flag set not found" {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusBadRequest)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// GenerateRelayProxyConfig generates the relay proxy configuration for all flag sets
func (fm *FlagManager) generateRelayProxyConfigHandler(w http.ResponseWriter, r *http.Request) {
	flagSets := fm.flagSets.List()

	if len(flagSets) == 0 {
		http.Error(w, "No flag sets configured", http.StatusNotFound)
		return
	}

	// Generate relay proxy compatible config
	config := map[string]interface{}{
		"server": map[string]interface{}{
			"mode": "http",
			"port": 1031,
		},
		"flagSets": make([]map[string]interface{}, 0, len(flagSets)),
	}

	// Add global notifiers if configured
	if fm.notifiers != nil {
		notifierConfigs := fm.notifiers.BuildNotifierConfig()
		if len(notifierConfigs) > 0 {
			config["notifier"] = notifierConfigs
		}
	}

	// Add global exporters if configured
	if fm.exporters != nil {
		exporterConfigs := fm.exporters.BuildExporterConfig()
		if len(exporterConfigs) > 0 {
			config["exporter"] = exporterConfigs
		}
	}

	// Add global retrievers if configured
	if fm.retrievers != nil {
		retrieverConfigs := fm.retrievers.BuildRetrieverConfig()
		if len(retrieverConfigs) > 0 {
			config["retrievers"] = retrieverConfigs
		}
	}

	for _, fs := range flagSets {
		fsConfig := map[string]interface{}{
			"name":    fs.Name,
			"apiKeys": fs.APIKeys,
		}

		// Build retriever config
		retriever := map[string]interface{}{
			"kind": fs.Retriever.Kind,
		}
		switch fs.Retriever.Kind {
		case "file":
			retriever["path"] = fs.Retriever.Path
		case "http":
			retriever["url"] = fs.Retriever.URL
			if len(fs.Retriever.Headers) > 0 {
				retriever["headers"] = fs.Retriever.Headers
			}
		}
		if fs.Retriever.PollingInterval > 0 {
			retriever["pollingInterval"] = fs.Retriever.PollingInterval
		}
		if fs.Retriever.FileFormat != "" {
			retriever["fileFormat"] = fs.Retriever.FileFormat
		}
		fsConfig["retrievers"] = []map[string]interface{}{retriever}

		// Build exporter config if present
		if fs.Exporter != nil {
			exporter := map[string]interface{}{
				"kind": fs.Exporter.Kind,
			}
			if fs.Exporter.EndpointURL != "" {
				exporter["endpointUrl"] = fs.Exporter.EndpointURL
			}
			if fs.Exporter.FlushInterval > 0 {
				exporter["flushInterval"] = fs.Exporter.FlushInterval
			}
			fsConfig["exporters"] = []map[string]interface{}{exporter}
		}

		// Build notifier config if present
		if fs.Notifier != nil {
			notifier := map[string]interface{}{
				"kind": fs.Notifier.Kind,
			}
			if fs.Notifier.SlackWebhookURL != "" {
				notifier["slackWebhookUrl"] = fs.Notifier.SlackWebhookURL
			}
			if fs.Notifier.EndpointURL != "" {
				notifier["endpointUrl"] = fs.Notifier.EndpointURL
			}
			fsConfig["notifiers"] = []map[string]interface{}{notifier}
		}

		config["flagSets"] = append(config["flagSets"].([]map[string]interface{}), fsConfig)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// getFlagSetFilePath returns the path to a flagset's flags file
func (fm *FlagManager) getFlagSetFilePath(flagSetID string) string {
	return filepath.Join(fm.config.FlagsDir, fmt.Sprintf("flagset-%s.yaml", flagSetID))
}

// readFlagSetFlags reads flags from a flagset's file
func (fm *FlagManager) readFlagSetFlags(flagSetID string) (map[string]interface{}, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	filePath := fm.getFlagSetFilePath(flagSetID)
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return make(map[string]interface{}), nil
		}
		return nil, err
	}

	var flags map[string]interface{}
	if err := yaml.Unmarshal(data, &flags); err != nil {
		return nil, err
	}

	if flags == nil {
		flags = make(map[string]interface{})
	}

	return flags, nil
}

// writeFlagSetFlags writes flags to a flagset's file
func (fm *FlagManager) writeFlagSetFlags(flagSetID string, flags map[string]interface{}) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	filePath := fm.getFlagSetFilePath(flagSetID)
	data, err := yaml.Marshal(flags)
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

// listFlagSetFlagsHandler returns all flags in a flagset
func (fm *FlagManager) listFlagSetFlagsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	// Verify flagset exists
	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	flags, err := fm.readFlagSetFlags(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"flags":   flags,
		"flagSet": flagSet,
	})
}

// getFlagSetFlagHandler returns a single flag from a flagset
func (fm *FlagManager) getFlagSetFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	flagKey := vars["flagKey"]

	// Verify flagset exists
	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	flags, err := fm.readFlagSetFlags(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	flag, exists := flags[flagKey]
	if !exists {
		http.Error(w, "Flag not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":    flagKey,
		"config": flag,
	})
}

// createFlagSetFlagHandler creates a new flag in a flagset
func (fm *FlagManager) createFlagSetFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	flagKey := vars["flagKey"]

	// Verify flagset exists
	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	var flagConfig interface{}
	if err := json.NewDecoder(r.Body).Decode(&flagConfig); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	flags, err := fm.readFlagSetFlags(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, exists := flags[flagKey]; exists {
		http.Error(w, "Flag already exists", http.StatusConflict)
		return
	}

	flags[flagKey] = flagConfig

	if err := fm.writeFlagSetFlags(id, flags); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Refresh relay proxy
	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":    flagKey,
		"config": flagConfig,
	})
}

// updateFlagSetFlagHandler updates a flag in a flagset
func (fm *FlagManager) updateFlagSetFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	flagKey := vars["flagKey"]

	// Verify flagset exists
	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	var requestBody struct {
		Config interface{} `json:"config"`
		NewKey string      `json:"newKey,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	flags, err := fm.readFlagSetFlags(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, exists := flags[flagKey]; !exists {
		http.Error(w, "Flag not found", http.StatusNotFound)
		return
	}

	// Handle rename
	effectiveKey := flagKey
	if requestBody.NewKey != "" && requestBody.NewKey != flagKey {
		if _, exists := flags[requestBody.NewKey]; exists {
			http.Error(w, "Flag with new key already exists", http.StatusConflict)
			return
		}
		delete(flags, flagKey)
		effectiveKey = requestBody.NewKey
	}

	flags[effectiveKey] = requestBody.Config

	if err := fm.writeFlagSetFlags(id, flags); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Refresh relay proxy
	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":    effectiveKey,
		"config": requestBody.Config,
	})
}

// deleteFlagSetFlagHandler deletes a flag from a flagset
func (fm *FlagManager) deleteFlagSetFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]
	flagKey := vars["flagKey"]

	// Verify flagset exists
	flagSet := fm.flagSets.Get(id)
	if flagSet == nil {
		http.Error(w, "Flag set not found", http.StatusNotFound)
		return
	}

	flags, err := fm.readFlagSetFlags(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, exists := flags[flagKey]; !exists {
		http.Error(w, "Flag not found", http.StatusNotFound)
		return
	}

	delete(flags, flagKey)

	if err := fm.writeFlagSetFlags(id, flags); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Refresh relay proxy
	go fm.refreshRelayProxy()

	w.WriteHeader(http.StatusNoContent)
}
