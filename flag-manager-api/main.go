package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"gopkg.in/yaml.v3"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// Config holds the application configuration
type Config struct {
	Namespace        string
	ConfigMapName    string
	RelayProxyURL    string
	Port             string
	AdminAPIKey      string
}

// FlagManager handles flag CRUD operations via ConfigMap
type FlagManager struct {
	clientset *kubernetes.Clientset
	config    Config
	mu        sync.RWMutex
}

// FlagConfig represents a feature flag configuration
type FlagConfig struct {
	Variations    map[string]interface{}   `yaml:"variations,omitempty" json:"variations,omitempty"`
	Targeting     []TargetingRule          `yaml:"targeting,omitempty" json:"targeting,omitempty"`
	DefaultRule   *DefaultRule             `yaml:"defaultRule,omitempty" json:"defaultRule,omitempty"`
	TrackEvents   *bool                    `yaml:"trackEvents,omitempty" json:"trackEvents,omitempty"`
	Disable       *bool                    `yaml:"disable,omitempty" json:"disable,omitempty"`
	Version       string                   `yaml:"version,omitempty" json:"version,omitempty"`
	Metadata      map[string]interface{}   `yaml:"metadata,omitempty" json:"metadata,omitempty"`
}

// TargetingRule represents a targeting rule
type TargetingRule struct {
	Name       string             `yaml:"name,omitempty" json:"name,omitempty"`
	Query      string             `yaml:"query,omitempty" json:"query,omitempty"`
	Variation  string             `yaml:"variation,omitempty" json:"variation,omitempty"`
	Percentage map[string]float64 `yaml:"percentage,omitempty" json:"percentage,omitempty"`
	Disable    *bool              `yaml:"disable,omitempty" json:"disable,omitempty"`
}

// DefaultRule represents the default rule
type DefaultRule struct {
	Variation  string             `yaml:"variation,omitempty" json:"variation,omitempty"`
	Percentage map[string]float64 `yaml:"percentage,omitempty" json:"percentage,omitempty"`
}

// ProjectFlags represents all flags for a project
type ProjectFlags map[string]FlagConfig

func main() {
	config := Config{
		Namespace:     getEnv("NAMESPACE", "default"),
		ConfigMapName: getEnv("CONFIGMAP_NAME", "feature-flags"),
		RelayProxyURL: getEnv("RELAY_PROXY_URL", "http://go-feature-flag:1031"),
		Port:          getEnv("PORT", "8080"),
		AdminAPIKey:   getEnv("ADMIN_API_KEY", ""),
	}

	// Create Kubernetes client
	k8sConfig, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("Failed to create in-cluster config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(k8sConfig)
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}

	fm := &FlagManager{
		clientset: clientset,
		config:    config,
	}

	// Setup routes
	r := mux.NewRouter()

	// Health check
	r.HandleFunc("/health", fm.healthHandler).Methods("GET")

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

	// Admin endpoints
	r.HandleFunc("/api/admin/refresh", fm.refreshRelayProxyHandler).Methods("POST")

	// CORS middleware
	handler := corsMiddleware(r)

	log.Printf("Flag Manager API starting on port %s", config.Port)
	log.Printf("ConfigMap: %s/%s", config.Namespace, config.ConfigMapName)
	log.Printf("Relay Proxy URL: %s", config.RelayProxyURL)

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

// getConfigMap retrieves the ConfigMap from Kubernetes
func (fm *FlagManager) getConfigMap(ctx context.Context) (map[string]string, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	cm, err := fm.clientset.CoreV1().ConfigMaps(fm.config.Namespace).Get(
		ctx, fm.config.ConfigMapName, metav1.GetOptions{},
	)
	if err != nil {
		return nil, fmt.Errorf("failed to get ConfigMap: %w", err)
	}

	return cm.Data, nil
}

// updateConfigMap updates the ConfigMap in Kubernetes
func (fm *FlagManager) updateConfigMap(ctx context.Context, data map[string]string) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	cm, err := fm.clientset.CoreV1().ConfigMaps(fm.config.Namespace).Get(
		ctx, fm.config.ConfigMapName, metav1.GetOptions{},
	)
	if err != nil {
		return fmt.Errorf("failed to get ConfigMap: %w", err)
	}

	cm.Data = data

	_, err = fm.clientset.CoreV1().ConfigMaps(fm.config.Namespace).Update(
		ctx, cm, metav1.UpdateOptions{},
	)
	if err != nil {
		return fmt.Errorf("failed to update ConfigMap: %w", err)
	}

	return nil
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
		log.Printf("Warning: Relay proxy refresh returned status %d", resp.StatusCode)
	}

	return nil
}

// parseProjectFlags parses YAML content into ProjectFlags
func parseProjectFlags(content string) (ProjectFlags, error) {
	var flags ProjectFlags
	if err := yaml.Unmarshal([]byte(content), &flags); err != nil {
		return nil, err
	}
	if flags == nil {
		flags = make(ProjectFlags)
	}
	return flags, nil
}

// serializeProjectFlags converts ProjectFlags to YAML
func serializeProjectFlags(flags ProjectFlags) (string, error) {
	data, err := yaml.Marshal(flags)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// getProjectKey returns the ConfigMap key for a project
func getProjectKey(project string) string {
	return project + ".yaml"
}

// Handler implementations

func (fm *FlagManager) healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"healthy": true})
}

func (fm *FlagManager) getRawFlagsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Combine all project flags into a single map
	allFlags := make(map[string]FlagConfig)
	for key, content := range data {
		if !strings.HasSuffix(key, ".yaml") {
			continue
		}
		flags, err := parseProjectFlags(content)
		if err != nil {
			log.Printf("Warning: Failed to parse %s: %v", key, err)
			continue
		}
		project := strings.TrimSuffix(key, ".yaml")
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	w.Write([]byte(content))
}

func (fm *FlagManager) listProjectsHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	projects := []string{}
	for key := range data {
		if strings.HasSuffix(key, ".yaml") {
			projects = append(projects, strings.TrimSuffix(key, ".yaml"))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string][]string{"projects": projects})
}

func (fm *FlagManager) getProjectHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	flags, err := parseProjectFlags(content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	if _, exists := data[key]; exists {
		http.Error(w, "Project already exists", http.StatusConflict)
		return
	}

	// Initialize with empty flags
	data[key] = "{}"

	if err := fm.updateConfigMap(ctx, data); err != nil {
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	if _, exists := data[key]; !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	delete(data, key)

	if err := fm.updateConfigMap(ctx, data); err != nil {
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	flags, err := parseProjectFlags(content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"flags": flags})
}

func (fm *FlagManager) getFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	flags, err := parseProjectFlags(content)
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

func (fm *FlagManager) createFlagHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	project := vars["project"]
	flagKey := vars["flagKey"]

	var flagConfig FlagConfig
	if err := json.NewDecoder(r.Body).Decode(&flagConfig); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		// Auto-create project if it doesn't exist
		content = "{}"
	}

	flags, err := parseProjectFlags(content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, exists := flags[flagKey]; exists {
		http.Error(w, "Flag already exists", http.StatusConflict)
		return
	}

	flags[flagKey] = flagConfig

	newContent, err := serializeProjectFlags(flags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data[key] = newContent

	if err := fm.updateConfigMap(ctx, data); err != nil {
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	flags, err := parseProjectFlags(content)
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

	newContent, err := serializeProjectFlags(flags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data[key] = newContent

	if err := fm.updateConfigMap(ctx, data); err != nil {
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

	ctx := r.Context()
	data, err := fm.getConfigMap(ctx)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	key := getProjectKey(project)
	content, exists := data[key]
	if !exists {
		http.Error(w, "Project not found", http.StatusNotFound)
		return
	}

	flags, err := parseProjectFlags(content)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if _, exists := flags[flagKey]; !exists {
		http.Error(w, "Flag not found", http.StatusNotFound)
		return
	}

	delete(flags, flagKey)

	newContent, err := serializeProjectFlags(flags)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data[key] = newContent

	if err := fm.updateConfigMap(ctx, data); err != nil {
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
