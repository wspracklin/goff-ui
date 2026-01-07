package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"flag-manager-api/git"

	"github.com/gorilla/mux"
	"gopkg.in/yaml.v3"
)

// Config holds the application configuration
type Config struct {
	FlagsDir      string
	RelayProxyURL string
	Port          string
	AdminAPIKey   string
	GitConfig     *git.Config
}

// FlagManager handles flag CRUD operations via file storage
type FlagManager struct {
	config       Config
	mu           sync.RWMutex
	gitProvider  git.Provider
	integrations *IntegrationsStore
	flagSets     *FlagSetsStore
	notifiers    *NotifiersStore
	exporters    *ExportersStore
	retrievers   *RetrieversStore
}

// ProgressiveRolloutStep represents a step in progressive rollout
type ProgressiveRolloutStep struct {
	Variation  string  `yaml:"variation,omitempty" json:"variation,omitempty"`
	Percentage float64 `yaml:"percentage,omitempty" json:"percentage,omitempty"`
	Date       string  `yaml:"date,omitempty" json:"date,omitempty"`
}

// ProgressiveRollout represents a progressive rollout configuration
type ProgressiveRollout struct {
	Initial *ProgressiveRolloutStep `yaml:"initial,omitempty" json:"initial,omitempty"`
	End     *ProgressiveRolloutStep `yaml:"end,omitempty" json:"end,omitempty"`
}

// ScheduledStep represents a step in scheduled rollout
type ScheduledStep struct {
	Date        string       `yaml:"date,omitempty" json:"date,omitempty"`
	Targeting   []TargetingRule `yaml:"targeting,omitempty" json:"targeting,omitempty"`
	DefaultRule *DefaultRule `yaml:"defaultRule,omitempty" json:"defaultRule,omitempty"`
}

// Experimentation represents an experimentation configuration
type Experimentation struct {
	Start string `yaml:"start,omitempty" json:"start,omitempty"`
	End   string `yaml:"end,omitempty" json:"end,omitempty"`
}

// FlagConfig represents a feature flag configuration
type FlagConfig struct {
	Variations       map[string]interface{} `yaml:"variations,omitempty" json:"variations,omitempty"`
	Targeting        []TargetingRule        `yaml:"targeting,omitempty" json:"targeting,omitempty"`
	DefaultRule      *DefaultRule           `yaml:"defaultRule,omitempty" json:"defaultRule,omitempty"`
	TrackEvents      *bool                  `yaml:"trackEvents,omitempty" json:"trackEvents,omitempty"`
	Disable          *bool                  `yaml:"disable,omitempty" json:"disable,omitempty"`
	Version          string                 `yaml:"version,omitempty" json:"version,omitempty"`
	Metadata         map[string]interface{} `yaml:"metadata,omitempty" json:"metadata,omitempty"`
	ScheduledRollout []ScheduledStep        `yaml:"scheduledRollout,omitempty" json:"scheduledRollout,omitempty"`
	Experimentation  *Experimentation       `yaml:"experimentation,omitempty" json:"experimentation,omitempty"`
	BucketingKey     string                 `yaml:"bucketingKey,omitempty" json:"bucketingKey,omitempty"`
}

// TargetingRule represents a targeting rule
type TargetingRule struct {
	Name               string              `yaml:"name,omitempty" json:"name,omitempty"`
	Query              string              `yaml:"query,omitempty" json:"query,omitempty"`
	Variation          string              `yaml:"variation,omitempty" json:"variation,omitempty"`
	Percentage         map[string]float64  `yaml:"percentage,omitempty" json:"percentage,omitempty"`
	ProgressiveRollout *ProgressiveRollout `yaml:"progressiveRollout,omitempty" json:"progressiveRollout,omitempty"`
	Disable            *bool               `yaml:"disable,omitempty" json:"disable,omitempty"`
}

// DefaultRule represents the default rule
type DefaultRule struct {
	Name               string              `yaml:"name,omitempty" json:"name,omitempty"`
	Variation          string              `yaml:"variation,omitempty" json:"variation,omitempty"`
	Percentage         map[string]float64  `yaml:"percentage,omitempty" json:"percentage,omitempty"`
	ProgressiveRollout *ProgressiveRollout `yaml:"progressiveRollout,omitempty" json:"progressiveRollout,omitempty"`
}

// ProjectFlags represents all flags for a project
type ProjectFlags map[string]FlagConfig

func main() {
	gitConfig := git.LoadConfigFromEnv()

	config := Config{
		FlagsDir:      getEnv("FLAGS_DIR", "./flags"),
		RelayProxyURL: getEnv("RELAY_PROXY_URL", "http://localhost:1031"),
		Port:          getEnv("PORT", "8080"),
		AdminAPIKey:   getEnv("ADMIN_API_KEY", ""),
		GitConfig:     gitConfig,
	}

	// Ensure flags directory exists
	if err := os.MkdirAll(config.FlagsDir, 0755); err != nil {
		log.Fatalf("Failed to create flags directory: %v", err)
	}

	// Initialize integrations store
	integrationsStore := NewIntegrationsStore(config.FlagsDir)

	// Initialize flag sets store
	flagSetsStore := NewFlagSetsStore(config.FlagsDir)

	// Initialize notifiers store
	notifiersStore := NewNotifiersStore(config.FlagsDir)

	// Initialize exporters store
	exportersStore := NewExportersStore(config.FlagsDir)

	// Initialize retrievers store
	retrieversStore := NewRetrieversStore(config.FlagsDir)

	fm := &FlagManager{
		config:       config,
		integrations: integrationsStore,
		flagSets:     flagSetsStore,
		notifiers:    notifiersStore,
		exporters:    exportersStore,
		retrievers:   retrieversStore,
	}

	// Initialize git provider if configured via environment
	if gitConfig.IsConfigured() {
		provider, err := git.NewProvider(gitConfig)
		if err != nil {
			log.Printf("Warning: Git provider initialization failed: %v", err)
		} else {
			fm.gitProvider = provider
			log.Printf("Git provider configured: %s", gitConfig.Provider)
		}
	}

	// Setup routes
	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", fm.healthHandler).Methods("GET")

	// Configuration endpoint
	r.HandleFunc("/api/config", fm.getConfigHandler).Methods("GET")

	// Raw flags endpoint for relay proxy HTTP retriever
	r.HandleFunc("/api/flags/raw", fm.getRawFlagsHandler).Methods("GET")
	r.HandleFunc("/api/flags/raw/{project}", fm.getRawProjectFlagsHandler).Methods("GET")

	// Project management
	r.HandleFunc("/api/projects", fm.listProjectsHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}", fm.getProjectHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}", fm.createProjectHandler).Methods("POST")
	r.HandleFunc("/api/projects/{project}", fm.deleteProjectHandler).Methods("DELETE")

	// Flag management
	r.HandleFunc("/api/projects/{project}/flags", fm.listFlagsHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.getFlagHandler).Methods("GET")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.createFlagHandler).Methods("POST")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.updateFlagHandler).Methods("PUT")
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}", fm.deleteFlagHandler).Methods("DELETE")

	// PR/MR endpoints for git-backed changes
	r.HandleFunc("/api/projects/{project}/flags/{flagKey}/propose", fm.proposeFlagChangeHandler).Methods("POST")

	// Git integrations management
	r.HandleFunc("/api/integrations", fm.listIntegrationsHandler).Methods("GET")
	r.HandleFunc("/api/integrations", fm.createIntegrationHandler).Methods("POST")
	r.HandleFunc("/api/integrations/{id}", fm.getIntegrationHandler).Methods("GET")
	r.HandleFunc("/api/integrations/{id}", fm.updateIntegrationHandler).Methods("PUT")
	r.HandleFunc("/api/integrations/{id}", fm.deleteIntegrationHandler).Methods("DELETE")
	r.HandleFunc("/api/integrations/{id}/test", fm.testIntegrationHandler).Methods("POST")

	// Flag sets management
	r.HandleFunc("/api/flagsets", fm.listFlagSetsHandler).Methods("GET")
	r.HandleFunc("/api/flagsets", fm.createFlagSetHandler).Methods("POST")
	r.HandleFunc("/api/flagsets/{id}", fm.getFlagSetHandler).Methods("GET")
	r.HandleFunc("/api/flagsets/{id}", fm.updateFlagSetHandler).Methods("PUT")
	r.HandleFunc("/api/flagsets/{id}", fm.deleteFlagSetHandler).Methods("DELETE")
	r.HandleFunc("/api/flagsets/{id}/apikey", fm.generateFlagSetAPIKeyHandler).Methods("POST")
	r.HandleFunc("/api/flagsets/{id}/apikey", fm.removeFlagSetAPIKeyHandler).Methods("DELETE")
	r.HandleFunc("/api/flagsets/config/relay-proxy", fm.generateRelayProxyConfigHandler).Methods("GET")

	// Notifiers management
	r.HandleFunc("/api/notifiers", fm.listNotifiersHandler).Methods("GET")
	r.HandleFunc("/api/notifiers", fm.createNotifierHandler).Methods("POST")
	r.HandleFunc("/api/notifiers/{id}", fm.getNotifierHandler).Methods("GET")
	r.HandleFunc("/api/notifiers/{id}", fm.updateNotifierHandler).Methods("PUT")
	r.HandleFunc("/api/notifiers/{id}", fm.deleteNotifierHandler).Methods("DELETE")
	r.HandleFunc("/api/notifiers/{id}/test", fm.testNotifierHandler).Methods("POST")

	// Exporters management
	r.HandleFunc("/api/exporters", fm.listExportersHandler).Methods("GET")
	r.HandleFunc("/api/exporters", fm.createExporterHandler).Methods("POST")
	r.HandleFunc("/api/exporters/{id}", fm.getExporterHandler).Methods("GET")
	r.HandleFunc("/api/exporters/{id}", fm.updateExporterHandler).Methods("PUT")
	r.HandleFunc("/api/exporters/{id}", fm.deleteExporterHandler).Methods("DELETE")

	// Retrievers management
	r.HandleFunc("/api/retrievers", fm.listRetrieversHandler).Methods("GET")
	r.HandleFunc("/api/retrievers", fm.createRetrieverHandler).Methods("POST")
	r.HandleFunc("/api/retrievers/{id}", fm.getRetrieverHandler).Methods("GET")
	r.HandleFunc("/api/retrievers/{id}", fm.updateRetrieverHandler).Methods("PUT")
	r.HandleFunc("/api/retrievers/{id}", fm.deleteRetrieverHandler).Methods("DELETE")

	// Admin endpoints
	r.HandleFunc("/api/admin/refresh", fm.refreshRelayProxyHandler).Methods("POST")

	// CORS middleware
	handler := corsMiddleware(r)

	log.Printf("Flag Manager API starting on port %s", config.Port)
	log.Printf("Flags directory: %s", config.FlagsDir)
	log.Printf("Relay Proxy URL: %s", config.RelayProxyURL)
	if gitConfig.IsConfigured() {
		log.Printf("Git Provider: %s", gitConfig.Provider)
	} else {
		log.Printf("Git Provider: none (file-based storage)")
	}

	if err := http.ListenAndServe(":"+config.Port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getProjectFilePath returns the file path for a project
func (fm *FlagManager) getProjectFilePath(project string) string {
	return filepath.Join(fm.config.FlagsDir, project+".yaml")
}

// readProjectFlags reads flags from a project file
func (fm *FlagManager) readProjectFlags(project string) (ProjectFlags, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	filePath := fm.getProjectFilePath(project)
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var flags ProjectFlags
	if err := yaml.Unmarshal(data, &flags); err != nil {
		return nil, err
	}

	if flags == nil {
		flags = make(ProjectFlags)
	}

	return flags, nil
}

// writeProjectFlags writes flags to a project file
func (fm *FlagManager) writeProjectFlags(project string, flags ProjectFlags) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	filePath := fm.getProjectFilePath(project)
	data, err := yaml.Marshal(flags)
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

// listProjects returns all project names
func (fm *FlagManager) listProjects() ([]string, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	entries, err := os.ReadDir(fm.config.FlagsDir)
	if err != nil {
		return nil, err
	}

	var projects []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".yaml") {
			projects = append(projects, strings.TrimSuffix(entry.Name(), ".yaml"))
		}
	}

	return projects, nil
}

// refreshRelayProxy triggers the relay proxy to refresh its flags
func (fm *FlagManager) refreshRelayProxy() error {
	if fm.config.RelayProxyURL == "" {
		return nil
	}

	url := fm.config.RelayProxyURL + "/admin/v1/retriever/refresh"

	req, err := http.NewRequest("POST", url, nil)
	if err != nil {
		return err
	}

	if fm.config.AdminAPIKey != "" {
		req.Header.Set("Authorization", "Bearer "+fm.config.AdminAPIKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Warning: Failed to refresh relay proxy: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("Warning: Relay proxy refresh returned status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// Handler implementations

func (fm *FlagManager) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"healthy": true})
}

func (fm *FlagManager) getRawFlagsHandler(w http.ResponseWriter, r *http.Request) {
	projects, err := fm.listProjects()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Combine all project flags into a single map
	allFlags := make(map[string]FlagConfig)
	for _, project := range projects {
		flags, err := fm.readProjectFlags(project)
		if err != nil {
			log.Printf("Warning: Failed to read %s: %v", project, err)
			continue
		}
		for flagKey, flagConfig := range flags {
			// Prefix flag key with project name for uniqueness
			fullKey := project + "/" + flagKey
			allFlags[fullKey] = flagConfig
		}
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	yaml.NewEncoder(w).Encode(allFlags)
}

func (fm *FlagManager) getRawProjectFlagsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	yaml.NewEncoder(w).Encode(flags)
}

func (fm *FlagManager) listProjectsHandler(w http.ResponseWriter, r *http.Request) {
	projects, err := fm.listProjects()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if projects == nil {
		projects = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"projects": projects})
}

func (fm *FlagManager) getProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project": project,
		"flags":   flags,
	})
}

func (fm *FlagManager) createProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags != nil {
		http.Error(w, "Project already exists", http.StatusConflict)
		return
	}

	// Initialize with empty flags
	if err := fm.writeProjectFlags(project, make(ProjectFlags)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"project": project, "status": "created"})
}

func (fm *FlagManager) deleteProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	filePath := fm.getProjectFilePath(project)
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	if err := os.Remove(filePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Refresh relay proxy
	go fm.refreshRelayProxy()

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) listFlagsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"flags": flags})
}

func (fm *FlagManager) getFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
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

func (fm *FlagManager) createFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var flagConfig FlagConfig
	if err := json.NewDecoder(r.Body).Decode(&flagConfig); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		// Auto-create project if it doesn't exist
		flags = make(ProjectFlags)
	}

	if _, exists := flags[flagKey]; exists {
		http.Error(w, "Flag already exists", http.StatusConflict)
		return
	}

	flags[flagKey] = flagConfig

	if err := fm.writeProjectFlags(project, flags); err != nil {
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

func (fm *FlagManager) updateFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var requestBody struct {
		Config FlagConfig `json:"config"`
		NewKey string     `json:"newKey,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
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

	if err := fm.writeProjectFlags(project, flags); err != nil {
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

func (fm *FlagManager) deleteFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	if _, exists := flags[flagKey]; !exists {
		http.Error(w, "Flag not found", http.StatusNotFound)
		return
	}

	delete(flags, flagKey)

	if err := fm.writeProjectFlags(project, flags); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Refresh relay proxy
	go fm.refreshRelayProxy()

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) refreshRelayProxyHandler(w http.ResponseWriter, r *http.Request) {
	if err := fm.refreshRelayProxy(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "refreshed"})
}

// getConfigHandler returns the current configuration (for frontend)
func (fm *FlagManager) getConfigHandler(w http.ResponseWriter, r *http.Request) {
	gitProvider := ""
	if fm.config.GitConfig != nil {
		gitProvider = string(fm.config.GitConfig.Provider)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gitProvider":    gitProvider,
		"gitConfigured":  fm.gitProvider != nil,
		"flagsDir":       fm.config.FlagsDir,
		"relayProxyURL":  fm.config.RelayProxyURL,
	})
}

// proposeFlagChangeHandler creates a PR/MR for a flag change
func (fm *FlagManager) proposeFlagChangeHandler(w http.ResponseWriter, r *http.Request) {
	// Get integration ID from query param or use default
	integrationID := r.URL.Query().Get("integration")

	var provider git.Provider
	var integration *GitIntegration

	if integrationID != "" {
		provider = fm.integrations.GetProvider(integrationID)
		integration = fm.integrations.Get(integrationID)
	} else {
		// Try stored integrations first, then fall back to env config
		provider, integration = fm.integrations.GetDefaultProvider()
		if provider == nil {
			provider = fm.gitProvider
		}
	}

	if provider == nil {
		http.Error(w, "Git provider not configured. Add an integration in Settings.", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var requestBody struct {
		Config      FlagConfig `json:"config"`
		Title       string     `json:"title"`
		Description string     `json:"description"`
		Action      string     `json:"action"` // "create", "update", "delete"
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Read current flags
	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
		flags = make(ProjectFlags)
	}

	// Apply the change
	switch requestBody.Action {
	case "create", "update":
		flags[flagKey] = requestBody.Config
	case "delete":
		delete(flags, flagKey)
	default:
		http.Error(w, "Invalid action: must be create, update, or delete", http.StatusBadRequest)
		return
	}

	// Serialize to YAML
	flagsYAML, err := yaml.Marshal(flags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Generate branch name
	branchName := fmt.Sprintf("flag/%s/%s-%d", project, flagKey, time.Now().Unix())

	// Generate title if not provided
	title := requestBody.Title
	if title == "" {
		title = fmt.Sprintf("[Feature Flag] %s flag: %s", requestBody.Action, flagKey)
	}

	// Generate description if not provided
	description := requestBody.Description
	if description == "" {
		description = fmt.Sprintf("Automated flag change via GOFF UI\n\n- Project: %s\n- Flag: %s\n- Action: %s",
			project, flagKey, requestBody.Action)
	}

	// Determine flags path
	var flagsPath string
	var baseBranch string

	if integration != nil {
		flagsPath = integration.FlagsPath
		baseBranch = integration.BaseBranch
	} else if fm.config.GitConfig != nil {
		flagsPath = fm.config.GitConfig.FlagsPath
		baseBranch = fm.config.GitConfig.BaseBranch
	}

	if flagsPath == "" {
		flagsPath = fmt.Sprintf("/%s.yaml", project)
	}
	if baseBranch == "" {
		baseBranch = "main"
	}

	changes := map[string][]byte{
		flagsPath: flagsYAML,
	}

	prURL, err := provider.CreatePR(
		title,
		description,
		branchName,
		baseBranch,
		changes,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to create PR: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"prURL":   prURL,
		"branch":  branchName,
		"message": "Pull request created successfully",
	})
}
