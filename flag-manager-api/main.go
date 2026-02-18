package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"flag-manager-api/db"
	"flag-manager-api/git"

	"github.com/gorilla/mux"
	"gopkg.in/yaml.v3"
)

// Config holds the application configuration
type Config struct {
	FlagsDir           string
	RelayProxyURL      string
	Port               string
	AdminAPIKey        string
	GitConfig          *git.Config
	DatabaseURL        string
	AuthEnabled        bool
	JWTIssuerURL       string
	RequireApprovals   bool
	RequireChangeNotes bool
}

// FlagManager handles flag CRUD operations
type FlagManager struct {
	config             Config
	store              *db.Store
	audit              *AuditLogger
	gitProvider        git.Provider
	integrations       *IntegrationsStore
	flagSets           *FlagSetsStore
	notifiers          *NotifiersStore
	exporters          *ExportersStore
	retrievers         *RetrieversStore
	authEnabled        bool
	jwtIssuerURL       string
	requireApprovals   bool
	requireChangeNotes bool
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
	Date        string          `yaml:"date,omitempty" json:"date,omitempty"`
	Targeting   []TargetingRule `yaml:"targeting,omitempty" json:"targeting,omitempty"`
	DefaultRule *DefaultRule    `yaml:"defaultRule,omitempty" json:"defaultRule,omitempty"`
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
		DatabaseURL:   getEnv("DATABASE_URL", ""),
		AuthEnabled:        getEnv("AUTH_ENABLED", "false") == "true",
		JWTIssuerURL:       getEnv("JWT_ISSUER_URL", ""),
		RequireApprovals:   getEnv("REQUIRE_APPROVALS", "false") == "true",
		RequireChangeNotes: getEnv("REQUIRE_CHANGE_NOTES", "false") == "true",
	}

	fm := &FlagManager{
		config:             config,
		authEnabled:        config.AuthEnabled,
		jwtIssuerURL:       config.JWTIssuerURL,
		requireApprovals:   config.RequireApprovals,
		requireChangeNotes: config.RequireChangeNotes,
	}

	// Initialize database if DATABASE_URL is set
	if config.DatabaseURL != "" {
		store, err := db.NewStore(config.DatabaseURL)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		defer store.Close()
		fm.store = store
		fm.audit = NewAuditLogger(store)
		log.Println("Using PostgreSQL storage backend")
	} else {
		// Fall back to file-based storage
		log.Println("Using file-based storage backend (set DATABASE_URL for PostgreSQL)")
		if err := os.MkdirAll(config.FlagsDir, 0755); err != nil {
			log.Fatalf("Failed to create flags directory: %v", err)
		}

		fm.integrations = NewIntegrationsStore(config.FlagsDir)
		fm.flagSets = NewFlagSetsStore(config.FlagsDir)
		fm.notifiers = NewNotifiersStore(config.FlagsDir)
		fm.exporters = NewExportersStore(config.FlagsDir)
		fm.retrievers = NewRetrieversStore(config.FlagsDir)
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

	// Health check (no auth)
	r.HandleFunc("/health", fm.healthHandler).Methods("GET")

	// API subrouter with middleware chain
	api := r.PathPrefix("/api").Subrouter()

	// Configuration endpoint
	api.HandleFunc("/config", fm.getConfigHandler).Methods("GET")

	// Raw flags endpoint for relay proxy HTTP retriever (no auth required)
	api.HandleFunc("/flags/raw", fm.getRawFlagsHandler).Methods("GET")
	api.HandleFunc("/flags/raw/{project}", fm.getRawProjectFlagsHandler).Methods("GET")

	// Project management
	api.HandleFunc("/projects", fm.listProjectsHandler).Methods("GET")
	api.HandleFunc("/projects/{project}", fm.getProjectHandler).Methods("GET")
	api.HandleFunc("/projects/{project}", fm.createProjectHandler).Methods("POST")
	api.HandleFunc("/projects/{project}", fm.deleteProjectHandler).Methods("DELETE")

	// Flag management
	api.HandleFunc("/projects/{project}/flags", fm.listFlagsHandler).Methods("GET")
	api.HandleFunc("/projects/{project}/flags/{flagKey}", fm.getFlagHandler).Methods("GET")
	api.HandleFunc("/projects/{project}/flags/{flagKey}", fm.createFlagHandler).Methods("POST")
	api.HandleFunc("/projects/{project}/flags/{flagKey}", fm.updateFlagHandler).Methods("PUT")
	api.HandleFunc("/projects/{project}/flags/{flagKey}", fm.deleteFlagHandler).Methods("DELETE")

	// Flag audit history
	api.HandleFunc("/projects/{project}/flags/{flagKey}/audit", fm.getFlagAuditHandler).Methods("GET")

	// PR/MR endpoints for git-backed changes
	api.HandleFunc("/projects/{project}/flags/{flagKey}/propose", fm.proposeFlagChangeHandler).Methods("POST")

	// Git integrations management
	api.HandleFunc("/integrations", fm.listIntegrationsHandler).Methods("GET")
	api.HandleFunc("/integrations", fm.createIntegrationHandler).Methods("POST")
	api.HandleFunc("/integrations/{id}", fm.getIntegrationHandler).Methods("GET")
	api.HandleFunc("/integrations/{id}", fm.updateIntegrationHandler).Methods("PUT")
	api.HandleFunc("/integrations/{id}", fm.deleteIntegrationHandler).Methods("DELETE")
	api.HandleFunc("/integrations/{id}/test", fm.testIntegrationHandler).Methods("POST")

	// Flag sets management
	api.HandleFunc("/flagsets", fm.listFlagSetsHandler).Methods("GET")
	api.HandleFunc("/flagsets", fm.createFlagSetHandler).Methods("POST")
	api.HandleFunc("/flagsets/{id}", fm.getFlagSetHandler).Methods("GET")
	api.HandleFunc("/flagsets/{id}", fm.updateFlagSetHandler).Methods("PUT")
	api.HandleFunc("/flagsets/{id}", fm.deleteFlagSetHandler).Methods("DELETE")
	api.HandleFunc("/flagsets/{id}/apikey", fm.generateFlagSetAPIKeyHandler).Methods("POST")
	api.HandleFunc("/flagsets/{id}/apikey", fm.removeFlagSetAPIKeyHandler).Methods("DELETE")
	api.HandleFunc("/flagsets/{id}/flags", fm.listFlagSetFlagsHandler).Methods("GET")
	api.HandleFunc("/flagsets/{id}/flags/{flagKey}", fm.getFlagSetFlagHandler).Methods("GET")
	api.HandleFunc("/flagsets/{id}/flags/{flagKey}", fm.createFlagSetFlagHandler).Methods("POST")
	api.HandleFunc("/flagsets/{id}/flags/{flagKey}", fm.updateFlagSetFlagHandler).Methods("PUT")
	api.HandleFunc("/flagsets/{id}/flags/{flagKey}", fm.deleteFlagSetFlagHandler).Methods("DELETE")
	api.HandleFunc("/flagsets/config/relay-proxy", fm.generateRelayProxyConfigHandler).Methods("GET")

	// Notifiers management
	api.HandleFunc("/notifiers", fm.listNotifiersHandler).Methods("GET")
	api.HandleFunc("/notifiers", fm.createNotifierHandler).Methods("POST")
	api.HandleFunc("/notifiers/{id}", fm.getNotifierHandler).Methods("GET")
	api.HandleFunc("/notifiers/{id}", fm.updateNotifierHandler).Methods("PUT")
	api.HandleFunc("/notifiers/{id}", fm.deleteNotifierHandler).Methods("DELETE")
	api.HandleFunc("/notifiers/{id}/test", fm.testNotifierHandler).Methods("POST")

	// Exporters management
	api.HandleFunc("/exporters", fm.listExportersHandler).Methods("GET")
	api.HandleFunc("/exporters", fm.createExporterHandler).Methods("POST")
	api.HandleFunc("/exporters/{id}", fm.getExporterHandler).Methods("GET")
	api.HandleFunc("/exporters/{id}", fm.updateExporterHandler).Methods("PUT")
	api.HandleFunc("/exporters/{id}", fm.deleteExporterHandler).Methods("DELETE")

	// Retrievers management
	api.HandleFunc("/retrievers", fm.listRetrieversHandler).Methods("GET")
	api.HandleFunc("/retrievers", fm.createRetrieverHandler).Methods("POST")
	api.HandleFunc("/retrievers/{id}", fm.getRetrieverHandler).Methods("GET")
	api.HandleFunc("/retrievers/{id}", fm.updateRetrieverHandler).Methods("PUT")
	api.HandleFunc("/retrievers/{id}", fm.deleteRetrieverHandler).Methods("DELETE")

	// Admin endpoints
	api.HandleFunc("/admin/refresh", fm.refreshRelayProxyHandler).Methods("POST")

	// Audit endpoints (DB mode only)
	api.HandleFunc("/audit", fm.listAuditEventsHandler).Methods("GET")
	api.HandleFunc("/audit/export", fm.exportAuditEventsHandler).Methods("GET")

	// API Key management endpoints (DB mode only)
	api.HandleFunc("/api-keys", fm.listAPIKeysHandler).Methods("GET")
	api.HandleFunc("/api-keys", fm.createAPIKeyHandler).Methods("POST")
	api.HandleFunc("/api-keys/{id}", fm.deleteAPIKeyHandler).Methods("DELETE")

	// RBAC: Role management
	api.HandleFunc("/roles", fm.listRolesHandler).Methods("GET")
	api.HandleFunc("/roles", fm.createRoleHandler).Methods("POST")
	api.HandleFunc("/roles/{id}", fm.updateRoleHandler).Methods("PUT")
	api.HandleFunc("/roles/{id}", fm.deleteRoleHandler).Methods("DELETE")

	// RBAC: User management
	api.HandleFunc("/users", fm.listUsersHandler).Methods("GET")
	api.HandleFunc("/users/{userId}/roles", fm.setUserRolesHandler).Methods("PUT")

	// Segments management
	api.HandleFunc("/segments", fm.listSegmentsHandler).Methods("GET")
	api.HandleFunc("/segments", fm.createSegmentHandler).Methods("POST")
	api.HandleFunc("/segments/{id}", fm.getSegmentHandler).Methods("GET")
	api.HandleFunc("/segments/{id}", fm.updateSegmentHandler).Methods("PUT")
	api.HandleFunc("/segments/{id}", fm.deleteSegmentHandler).Methods("DELETE")
	api.HandleFunc("/segments/{id}/usage", fm.getSegmentUsageHandler).Methods("GET")

	// Change requests (approval workflow)
	api.HandleFunc("/change-requests", fm.listChangeRequestsHandler).Methods("GET")
	api.HandleFunc("/change-requests", fm.createChangeRequestHandler).Methods("POST")
	api.HandleFunc("/change-requests/count", fm.countChangeRequestsHandler).Methods("GET")
	api.HandleFunc("/change-requests/{id}", fm.getChangeRequestHandler).Methods("GET")
	api.HandleFunc("/change-requests/{id}/review", fm.reviewChangeRequestHandler).Methods("POST")
	api.HandleFunc("/change-requests/{id}/apply", fm.applyChangeRequestHandler).Methods("POST")
	api.HandleFunc("/change-requests/{id}/cancel", fm.cancelChangeRequestHandler).Methods("POST")

	// Bulk operations
	api.HandleFunc("/projects/{project}/flags/bulk-toggle", fm.bulkToggleHandler).Methods("POST")
	api.HandleFunc("/projects/{project}/flags/bulk-delete", fm.bulkDeleteHandler).Methods("POST")
	api.HandleFunc("/projects/{project}/flags/{flagKey}/clone", fm.cloneFlagHandler).Methods("POST")

	// Flag discovery import
	api.HandleFunc("/flags/import", fm.importFlagsHandler).Methods("POST")

	// Build middleware chain
	var handler http.Handler = r
	handler = BodySizeLimitMiddleware(1 << 20)(handler) // 1MB
	handler = fm.AuthMiddleware(handler)
	handler = RateLimitMiddleware(handler)
	handler = CORSMiddleware(handler)
	handler = LoggingMiddleware(handler)

	log.Printf("Flag Manager API starting on port %s", config.Port)
	if config.DatabaseURL != "" {
		log.Printf("Database: PostgreSQL")
	} else {
		log.Printf("Flags directory: %s", config.FlagsDir)
	}
	log.Printf("Relay Proxy URL: %s", config.RelayProxyURL)
	if config.AuthEnabled {
		log.Printf("Auth: enabled (JWT issuer: %s)", config.JWTIssuerURL)
	} else {
		log.Printf("Auth: disabled")
	}
	if config.RequireApprovals {
		log.Printf("Approval workflow: enabled")
	}
	if config.RequireChangeNotes {
		log.Printf("Change notes: required")
	}
	if gitConfig.IsConfigured() {
		log.Printf("Git Provider: %s", gitConfig.Provider)
	} else {
		log.Printf("Git Provider: none (file-based storage)")
	}

	if err := http.ListenAndServe(":"+config.Port, handler); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
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

func (fm *FlagManager) getConfigHandler(w http.ResponseWriter, r *http.Request) {
	gitProvider := ""
	if fm.config.GitConfig != nil {
		gitProvider = string(fm.config.GitConfig.Provider)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"gitProvider":        gitProvider,
		"gitConfigured":      fm.gitProvider != nil,
		"flagsDir":           fm.config.FlagsDir,
		"relayProxyURL":      fm.config.RelayProxyURL,
		"authEnabled":        fm.authEnabled,
		"dbEnabled":          fm.store != nil,
		"requireApprovals":   fm.requireApprovals,
		"requireChangeNotes": fm.requireChangeNotes,
	})
}

func (fm *FlagManager) getRawFlagsHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store != nil {
		allFlags, err := fm.store.GetAllFlags(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Expand segment references in targeting rules
		allFlags = fm.expandSegmentRules(r.Context(), allFlags)
		// Convert json.RawMessage values to interface{} for yaml serialization
		yamlFlags := make(map[string]interface{})
		for k, v := range allFlags {
			var parsed interface{}
			json.Unmarshal(v, &parsed)
			yamlFlags[k] = parsed
		}
		w.Header().Set("Content-Type", "application/x-yaml")
		yaml.NewEncoder(w).Encode(yamlFlags)
		return
	}

	// File-based fallback
	fm.getRawFlagsFileBased(w, r)
}

func (fm *FlagManager) getRawProjectFlagsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	if fm.store != nil {
		flags, err := fm.store.GetProjectFlags(r.Context(), project)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if len(flags) == 0 {
			// Check if project exists
			exists, _ := fm.store.ProjectExists(r.Context(), project)
			if !exists {
				http.Error(w, "Project not found", http.StatusNotFound)
				return
			}
		}
		// Expand segment references
		flags = fm.expandSegmentRules(r.Context(), flags)
		yamlFlags := make(map[string]interface{})
		for k, v := range flags {
			var parsed interface{}
			json.Unmarshal(v, &parsed)
			yamlFlags[k] = parsed
		}
		w.Header().Set("Content-Type", "application/x-yaml")
		yaml.NewEncoder(w).Encode(yamlFlags)
		return
	}

	fm.getRawProjectFlagsFileBased(w, r)
}

func (fm *FlagManager) listProjectsHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store != nil {
		projects, err := fm.store.ListProjects(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if projects == nil {
			projects = []string{}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{"projects": projects})
		return
	}

	fm.listProjectsFileBased(w, r)
}

func (fm *FlagManager) getProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	if fm.store != nil {
		flags, err := fm.store.ListFlags(r.Context(), project)
		if err != nil {
			exists, _ := fm.store.ProjectExists(r.Context(), project)
			if !exists {
				http.Error(w, "Project not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Convert to FlagConfig map for backward compat
		flagMap := make(map[string]interface{})
		for k, v := range flags {
			var parsed interface{}
			json.Unmarshal(v, &parsed)
			flagMap[k] = parsed
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"project": project,
			"flags":   flagMap,
		})
		return
	}

	fm.getProjectFileBased(w, r)
}

func (fm *FlagManager) createProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	if err := ValidateProjectName(project); err != nil {
		writeValidationError(w, "INVALID_PROJECT_NAME", err.Error())
		return
	}

	if fm.store != nil {
		exists, _ := fm.store.ProjectExists(r.Context(), project)
		if exists {
			http.Error(w, "Project already exists", http.StatusConflict)
			return
		}
		if _, err := fm.store.CreateProject(r.Context(), project, ""); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		fm.audit.Log(r.Context(), GetActor(r), "project.created", "project", "", project, project, nil, nil)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]string{"project": project, "status": "created"})
		return
	}

	fm.createProjectFileBased(w, r)
}

func (fm *FlagManager) deleteProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	if fm.store != nil {
		if err := fm.store.DeleteProject(r.Context(), project); err != nil {
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "Project not found", http.StatusNotFound)
			} else {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		fm.audit.Log(r.Context(), GetActor(r), "project.deleted", "project", "", project, project, nil, nil)
		go fm.refreshRelayProxy()
		w.WriteHeader(http.StatusNoContent)
		return
	}

	fm.deleteProjectFileBased(w, r)
}

func (fm *FlagManager) listFlagsHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	if fm.store != nil {
		// Check for pagination params
		if r.URL.Query().Get("page") != "" {
			params := parsePaginationParams(r)
			result, err := fm.store.ListFlagsPaginated(r.Context(), project, params)
			if err != nil {
				if strings.Contains(err.Error(), "not found") {
					http.Error(w, "Project not found", http.StatusNotFound)
				} else {
					http.Error(w, err.Error(), http.StatusInternalServerError)
				}
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(result)
			return
		}

		// Non-paginated (backward compat)
		flags, err := fm.store.ListFlags(r.Context(), project)
		if err != nil {
			exists, _ := fm.store.ProjectExists(r.Context(), project)
			if !exists {
				http.Error(w, "Project not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		// Convert to interface map
		flagMap := make(map[string]interface{})
		for k, v := range flags {
			var parsed interface{}
			json.Unmarshal(v, &parsed)
			flagMap[k] = parsed
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"flags": flagMap})
		return
	}

	fm.listFlagsFileBased(w, r)
}

func (fm *FlagManager) getFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	if fm.store != nil {
		flag, err := fm.store.GetFlag(r.Context(), project, flagKey)
		if err != nil {
			http.Error(w, "Flag not found", http.StatusNotFound)
			return
		}
		var config interface{}
		json.Unmarshal(flag.Config, &config)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"key":    flag.Key,
			"config": config,
		})
		return
	}

	fm.getFlagFileBased(w, r)
}

func (fm *FlagManager) createFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	if err := ValidateFlagKey(flagKey); err != nil {
		writeValidationError(w, "INVALID_FLAG_KEY", err.Error())
		return
	}

	var flagConfig FlagConfig
	if err := json.NewDecoder(r.Body).Decode(&flagConfig); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate flag config
	if errs := ValidateFlagConfig(flagConfig); len(errs) > 0 {
		writeValidationError(w, "INVALID_FLAG_CONFIG", "Flag configuration is invalid", errs...)
		return
	}

	if fm.store != nil {
		configJSON, _ := json.Marshal(flagConfig)
		disabled := false
		if flagConfig.Disable != nil {
			disabled = *flagConfig.Disable
		}

		exists, _ := fm.store.FlagExists(r.Context(), project, flagKey)
		if exists {
			http.Error(w, "Flag already exists", http.StatusConflict)
			return
		}

		flag, err := fm.store.CreateFlag(r.Context(), project, flagKey, configJSON, disabled, flagConfig.Version)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		fm.audit.Log(r.Context(), GetActor(r), "flag.created", "flag", flag.ID, flagKey, project,
			map[string]interface{}{"after": flagConfig}, nil)

		go fm.refreshRelayProxy()

		var config interface{}
		json.Unmarshal(flag.Config, &config)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"key":    flag.Key,
			"config": config,
		})
		return
	}

	fm.createFlagFileBased(w, r, project, flagKey, flagConfig)
}

func (fm *FlagManager) updateFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var requestBody struct {
		Config     FlagConfig `json:"config"`
		NewKey     string     `json:"newKey,omitempty"`
		ChangeNote string     `json:"changeNote,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate change note if required
	if fm.requireChangeNotes && requestBody.ChangeNote == "" {
		writeValidationError(w, "CHANGE_NOTE_REQUIRED", "Change note is required")
		return
	}

	if requestBody.NewKey != "" {
		if err := ValidateFlagKey(requestBody.NewKey); err != nil {
			writeValidationError(w, "INVALID_FLAG_KEY", err.Error())
			return
		}
	}

	if fm.store != nil {
		// Get existing flag for audit before/after
		existing, err := fm.store.GetFlag(r.Context(), project, flagKey)
		if err != nil {
			http.Error(w, "Flag not found", http.StatusNotFound)
			return
		}

		// If approvals required and actor is not admin, create a change request
		if fm.requireApprovals {
			actor := GetActor(r)
			isAdmin := false
			if actor.ID != "" {
				isAdmin, _ = fm.store.HasPermission(r.Context(), actor.ID, "*", "admin")
			}
			if !isAdmin && actor.Type != "apikey" {
				// Create a change request instead of direct save
				var currentConfig interface{}
				json.Unmarshal(existing.Config, &currentConfig)
				proposedJSON, _ := json.Marshal(requestBody.Config)

				cr, err := fm.store.CreateChangeRequest(r.Context(), db.ChangeRequest{
					Title:          "Update flag: " + flagKey,
					Description:    requestBody.ChangeNote,
					AuthorID:       actor.ID,
					AuthorEmail:    actor.Email,
					AuthorName:     actor.Name,
					Project:        project,
					FlagKey:        flagKey,
					ResourceType:   "flag",
					CurrentConfig:  existing.Config,
					ProposedConfig: proposedJSON,
				})
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}

				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{
					"requiresApproval": true,
					"changeRequestId":  cr.ID,
				})
				return
			}
		}

		configJSON, _ := json.Marshal(requestBody.Config)
		disabled := false
		if requestBody.Config.Disable != nil {
			disabled = *requestBody.Config.Disable
		}

		if requestBody.NewKey != "" && requestBody.NewKey != flagKey {
			exists, _ := fm.store.FlagExists(r.Context(), project, requestBody.NewKey)
			if exists {
				http.Error(w, "Flag with new key already exists", http.StatusConflict)
				return
			}
		}

		flag, err := fm.store.UpdateFlag(r.Context(), project, flagKey, configJSON, disabled, requestBody.Config.Version, requestBody.NewKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		var beforeConfig interface{}
		json.Unmarshal(existing.Config, &beforeConfig)

		auditMetadata := map[string]interface{}{}
		if requestBody.ChangeNote != "" {
			auditMetadata["changeNote"] = requestBody.ChangeNote
		}
		var metadataArg interface{}
		if len(auditMetadata) > 0 {
			metadataArg = auditMetadata
		}

		fm.audit.Log(r.Context(), GetActor(r), "flag.updated", "flag", flag.ID, flag.Key, project,
			map[string]interface{}{"before": beforeConfig, "after": requestBody.Config}, metadataArg)

		go fm.refreshRelayProxy()

		var config interface{}
		json.Unmarshal(flag.Config, &config)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"key":    flag.Key,
			"config": config,
		})
		return
	}

	fm.updateFlagFileBased(w, r, project, flagKey, requestBody.Config, requestBody.NewKey)
}

func (fm *FlagManager) deleteFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	if fm.store != nil {
		// Get flag for audit
		existing, _ := fm.store.GetFlag(r.Context(), project, flagKey)

		if err := fm.store.DeleteFlag(r.Context(), project, flagKey); err != nil {
			if strings.Contains(err.Error(), "not found") {
				http.Error(w, "Flag not found", http.StatusNotFound)
			} else {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}

		if existing != nil {
			var config interface{}
			json.Unmarshal(existing.Config, &config)
			fm.audit.Log(r.Context(), GetActor(r), "flag.deleted", "flag", existing.ID, flagKey, project,
				map[string]interface{}{"before": config}, nil)
		}

		go fm.refreshRelayProxy()
		w.WriteHeader(http.StatusNoContent)
		return
	}

	fm.deleteFlagFileBased(w, r, project, flagKey)
}

func (fm *FlagManager) refreshRelayProxyHandler(w http.ResponseWriter, r *http.Request) {
	if err := fm.refreshRelayProxy(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "refreshed"})
}

// proposeFlagChangeHandler creates a PR/MR for a flag change
func (fm *FlagManager) proposeFlagChangeHandler(w http.ResponseWriter, r *http.Request) {
	// Get integration ID from query param or use default
	integrationID := r.URL.Query().Get("integration")

	var provider git.Provider
	var integration *GitIntegration

	if fm.store != nil {
		// DB mode - load integration from DB
		if integrationID != "" {
			dbInt, err := fm.store.GetIntegration(r.Context(), integrationID)
			if err == nil {
				gi := dbIntegrationToGitIntegration(*dbInt)
				integration = &gi
				provider = initGitProviderFromIntegration(integration)
			}
		} else {
			dbInt, err := fm.store.GetDefaultIntegration(r.Context())
			if err == nil {
				gi := dbIntegrationToGitIntegration(*dbInt)
				integration = &gi
				provider = initGitProviderFromIntegration(integration)
			}
		}
	} else {
		// File mode
		if integrationID != "" {
			provider = fm.integrations.GetProvider(integrationID)
			integration = fm.integrations.Get(integrationID)
		} else {
			provider, integration = fm.integrations.GetDefaultProvider()
		}
	}

	if provider == nil {
		provider = fm.gitProvider
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
		Action      string     `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&requestBody); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Build flags map
	var flags ProjectFlags

	if fm.store != nil {
		rawFlags, err := fm.store.ListFlags(r.Context(), project)
		if err != nil {
			flags = make(ProjectFlags)
		} else {
			flags = make(ProjectFlags)
			for k, v := range rawFlags {
				var fc FlagConfig
				json.Unmarshal(v, &fc)
				flags[k] = fc
			}
		}
	} else {
		var err error
		flags, err = fm.readProjectFlags(project)
		if err != nil || flags == nil {
			flags = make(ProjectFlags)
		}
	}

	switch requestBody.Action {
	case "create", "update":
		flags[flagKey] = requestBody.Config
	case "delete":
		delete(flags, flagKey)
	default:
		http.Error(w, "Invalid action: must be create, update, or delete", http.StatusBadRequest)
		return
	}

	flagsYAML, err := yaml.Marshal(flags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	branchName := fmt.Sprintf("flag/%s/%s-%d", project, flagKey, time.Now().Unix())

	title := requestBody.Title
	if title == "" {
		title = fmt.Sprintf("[Feature Flag] %s flag: %s", requestBody.Action, flagKey)
	}

	description := requestBody.Description
	if description == "" {
		description = fmt.Sprintf("Automated flag change via GOFF UI\n\n- Project: %s\n- Flag: %s\n- Action: %s",
			project, flagKey, requestBody.Action)
	}

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

	prURL, err := provider.CreatePR(title, description, branchName, baseBranch, changes)
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


// initGitProviderFromIntegration initializes a git provider from an integration.
func initGitProviderFromIntegration(gi *GitIntegration) git.Provider {
	if gi == nil {
		return nil
	}
	switch gi.Provider {
	case "ado":
		if gi.ADOOrgURL != "" && gi.ADOProject != "" && gi.ADORepository != "" && gi.ADOPAT != "" {
			return git.NewADOClient(gi.ADOOrgURL, gi.ADOProject, gi.ADORepository, gi.ADOPAT, gi.BaseBranch)
		}
	case "gitlab":
		if gi.GitLabURL != "" && gi.GitLabProjectID != "" && gi.GitLabToken != "" {
			return git.NewGitLabClient(gi.GitLabURL, gi.GitLabProjectID, gi.GitLabToken, gi.BaseBranch)
		}
	}
	return nil
}
