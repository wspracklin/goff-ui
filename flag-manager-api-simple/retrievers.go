package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// Retriever represents a retriever configuration for fetching flag configurations
type Retriever struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"` // file, http, s3, googleStorage, azureBlobStorage, github, gitlab, bitbucket, mongodb, redis, configmap
	Description string    `json:"description,omitempty"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	// Common fields
	PollingInterval int    `json:"pollingInterval,omitempty"` // Milliseconds between polls
	Timeout         int    `json:"timeout,omitempty"`         // Request timeout in milliseconds
	FileFormat      string `json:"fileFormat,omitempty"`      // yaml, json, toml

	// File retriever
	Path string `json:"path,omitempty"`

	// HTTP retriever
	URL     string            `json:"url,omitempty"`
	Method  string            `json:"method,omitempty"` // GET, POST, etc.
	Body    string            `json:"body,omitempty"`
	Headers map[string]string `json:"headers,omitempty"`

	// S3 retriever
	S3Bucket string `json:"s3Bucket,omitempty"`
	S3Item   string `json:"s3Item,omitempty"`

	// Google Cloud Storage retriever
	GCSBucket string `json:"gcsBucket,omitempty"`
	GCSObject string `json:"gcsObject,omitempty"`

	// Azure Blob Storage retriever
	AzureContainer   string `json:"azureContainer,omitempty"`
	AzureAccountName string `json:"azureAccountName,omitempty"`
	AzureAccountKey  string `json:"azureAccountKey,omitempty"`
	AzureObject      string `json:"azureObject,omitempty"`

	// GitHub retriever
	GitHubRepositorySlug string `json:"githubRepositorySlug,omitempty"`
	GitHubPath           string `json:"githubPath,omitempty"`
	GitHubBranch         string `json:"githubBranch,omitempty"`
	GitHubToken          string `json:"githubToken,omitempty"`

	// GitLab retriever
	GitLabRepositorySlug string `json:"gitlabRepositorySlug,omitempty"`
	GitLabPath           string `json:"gitlabPath,omitempty"`
	GitLabBranch         string `json:"gitlabBranch,omitempty"`
	GitLabToken          string `json:"gitlabToken,omitempty"`
	GitLabBaseURL        string `json:"gitlabBaseUrl,omitempty"`

	// Bitbucket retriever
	BitbucketRepositorySlug string `json:"bitbucketRepositorySlug,omitempty"`
	BitbucketPath           string `json:"bitbucketPath,omitempty"`
	BitbucketBranch         string `json:"bitbucketBranch,omitempty"`
	BitbucketToken          string `json:"bitbucketToken,omitempty"`
	BitbucketBaseURL        string `json:"bitbucketBaseUrl,omitempty"`

	// MongoDB retriever
	MongoDBURI        string `json:"mongodbUri,omitempty"`
	MongoDBDatabase   string `json:"mongodbDatabase,omitempty"`
	MongoDBCollection string `json:"mongodbCollection,omitempty"`

	// Redis retriever
	RedisAddr     string `json:"redisAddr,omitempty"`
	RedisPassword string `json:"redisPassword,omitempty"`
	RedisDB       int    `json:"redisDb,omitempty"`
	RedisPrefix   string `json:"redisPrefix,omitempty"`

	// Kubernetes ConfigMap retriever
	ConfigMapNamespace string `json:"configmapNamespace,omitempty"`
	ConfigMapName      string `json:"configmapName,omitempty"`
	ConfigMapKey       string `json:"configmapKey,omitempty"`
}

// RetrieversStore manages retriever configurations
type RetrieversStore struct {
	configPath string
	retrievers map[string]*Retriever
	mu         sync.RWMutex
}

// NewRetrieversStore creates a new retrievers store
func NewRetrieversStore(configDir string) *RetrieversStore {
	store := &RetrieversStore{
		configPath: filepath.Join(configDir, "retrievers.json"),
		retrievers: make(map[string]*Retriever),
	}
	store.load()
	return store
}

// load reads retrievers from disk
func (s *RetrieversStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var retrievers []*Retriever
	if err := json.Unmarshal(data, &retrievers); err != nil {
		return err
	}

	for _, retriever := range retrievers {
		s.retrievers[retriever.ID] = retriever
	}

	return nil
}

// save writes retrievers to disk
func (s *RetrieversStore) save() error {
	retrievers := make([]*Retriever, 0, len(s.retrievers))
	for _, retriever := range s.retrievers {
		retrievers = append(retrievers, retriever)
	}

	data, err := json.MarshalIndent(retrievers, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, data, 0644)
}

// maskSecrets returns a copy with secrets masked
func (s *RetrieversStore) maskSecrets(retriever *Retriever) *Retriever {
	masked := *retriever
	if masked.AzureAccountKey != "" {
		masked.AzureAccountKey = "********"
	}
	if masked.GitHubToken != "" {
		masked.GitHubToken = "********"
	}
	if masked.GitLabToken != "" {
		masked.GitLabToken = "********"
	}
	if masked.BitbucketToken != "" {
		masked.BitbucketToken = "********"
	}
	if masked.RedisPassword != "" {
		masked.RedisPassword = "********"
	}
	// Mask MongoDB URI if it contains credentials
	if masked.MongoDBURI != "" && (containsCredentials(masked.MongoDBURI)) {
		masked.MongoDBURI = "mongodb://****:****@..."
	}
	return &masked
}

// containsCredentials checks if a MongoDB URI contains credentials
func containsCredentials(uri string) bool {
	return len(uri) > 10 && (uri[10:] != "localhost" && uri[10:] != "127.0.0.1")
}

// List returns all retrievers with secrets masked
func (s *RetrieversStore) List() []*Retriever {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Retriever, 0, len(s.retrievers))
	for _, retriever := range s.retrievers {
		result = append(result, s.maskSecrets(retriever))
	}
	return result
}

// Get returns a retriever by ID with secrets masked
func (s *RetrieversStore) Get(id string) *Retriever {
	s.mu.RLock()
	defer s.mu.RUnlock()

	retriever, exists := s.retrievers[id]
	if !exists {
		return nil
	}
	return s.maskSecrets(retriever)
}

// GetRaw returns a retriever by ID without masking (for internal use)
func (s *RetrieversStore) GetRaw(id string) *Retriever {
	s.mu.RLock()
	defer s.mu.RUnlock()

	retriever, exists := s.retrievers[id]
	if !exists {
		return nil
	}
	return retriever
}

// Create adds a new retriever
func (s *RetrieversStore) Create(retriever *Retriever) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.retrievers[retriever.ID]; exists {
		return fmt.Errorf("retriever with ID %s already exists", retriever.ID)
	}

	retriever.CreatedAt = time.Now()
	retriever.UpdatedAt = time.Now()

	s.retrievers[retriever.ID] = retriever
	return s.save()
}

// Update modifies an existing retriever
func (s *RetrieversStore) Update(id string, updates *Retriever) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.retrievers[id]
	if !exists {
		return fmt.Errorf("retriever with ID %s not found", id)
	}

	// Preserve secrets if masked values provided
	if updates.AzureAccountKey == "********" || updates.AzureAccountKey == "" {
		updates.AzureAccountKey = existing.AzureAccountKey
	}
	if updates.GitHubToken == "********" || updates.GitHubToken == "" {
		updates.GitHubToken = existing.GitHubToken
	}
	if updates.GitLabToken == "********" || updates.GitLabToken == "" {
		updates.GitLabToken = existing.GitLabToken
	}
	if updates.BitbucketToken == "********" || updates.BitbucketToken == "" {
		updates.BitbucketToken = existing.BitbucketToken
	}
	if updates.RedisPassword == "********" || updates.RedisPassword == "" {
		updates.RedisPassword = existing.RedisPassword
	}
	if updates.MongoDBURI == "mongodb://****:****@..." || updates.MongoDBURI == "" {
		updates.MongoDBURI = existing.MongoDBURI
	}

	updates.ID = id
	updates.CreatedAt = existing.CreatedAt
	updates.UpdatedAt = time.Now()

	s.retrievers[id] = updates
	return s.save()
}

// Delete removes a retriever
func (s *RetrieversStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.retrievers[id]; !exists {
		return fmt.Errorf("retriever with ID %s not found", id)
	}

	delete(s.retrievers, id)
	return s.save()
}

// GetEnabled returns all enabled retrievers (for config generation)
func (s *RetrieversStore) GetEnabled() []*Retriever {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Retriever, 0)
	for _, retriever := range s.retrievers {
		if retriever.Enabled {
			result = append(result, retriever)
		}
	}
	return result
}

// HTTP Handlers

func (fm *FlagManager) listRetrieversHandler(w http.ResponseWriter, r *http.Request) {
	retrievers := fm.retrievers.List()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"retrievers": retrievers,
	})
}

func (fm *FlagManager) getRetrieverHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	retriever := fm.retrievers.Get(id)
	if retriever == nil {
		http.Error(w, "Retriever not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(retriever)
}

func (fm *FlagManager) createRetrieverHandler(w http.ResponseWriter, r *http.Request) {
	var retriever Retriever
	if err := json.NewDecoder(r.Body).Decode(&retriever); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if retriever.ID == "" {
		http.Error(w, "ID is required", http.StatusBadRequest)
		return
	}

	if retriever.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if retriever.Kind == "" {
		http.Error(w, "Kind is required", http.StatusBadRequest)
		return
	}

	// Validate kind
	validKinds := map[string]bool{
		"file":             true,
		"http":             true,
		"s3":               true,
		"googleStorage":    true,
		"azureBlobStorage": true,
		"github":           true,
		"gitlab":           true,
		"bitbucket":        true,
		"mongodb":          true,
		"redis":            true,
		"configmap":        true,
	}
	if !validKinds[retriever.Kind] {
		http.Error(w, "Invalid kind. Must be one of: file, http, s3, googleStorage, azureBlobStorage, github, gitlab, bitbucket, mongodb, redis, configmap", http.StatusBadRequest)
		return
	}

	if err := fm.retrievers.Create(&retriever); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(fm.retrievers.Get(retriever.ID))
}

func (fm *FlagManager) updateRetrieverHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var updates Retriever
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := fm.retrievers.Update(id, &updates); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fm.retrievers.Get(id))
}

func (fm *FlagManager) deleteRetrieverHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.retrievers.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// BuildRetrieverConfig generates the retriever configuration for relay proxy
func (s *RetrieversStore) BuildRetrieverConfig() []map[string]interface{} {
	enabled := s.GetEnabled()
	if len(enabled) == 0 {
		return nil
	}

	configs := make([]map[string]interface{}, 0, len(enabled))

	for _, r := range enabled {
		config := map[string]interface{}{
			"kind": r.Kind,
		}

		// Add common fields
		if r.Timeout > 0 {
			config["timeout"] = r.Timeout
		}

		switch r.Kind {
		case "file":
			if r.Path != "" {
				config["path"] = r.Path
			}

		case "http":
			if r.URL != "" {
				config["url"] = r.URL
			}
			if r.Method != "" {
				config["method"] = r.Method
			}
			if r.Body != "" {
				config["body"] = r.Body
			}
			if len(r.Headers) > 0 {
				config["headers"] = r.Headers
			}

		case "s3":
			if r.S3Bucket != "" {
				config["bucket"] = r.S3Bucket
			}
			if r.S3Item != "" {
				config["item"] = r.S3Item
			}

		case "googleStorage":
			if r.GCSBucket != "" {
				config["bucket"] = r.GCSBucket
			}
			if r.GCSObject != "" {
				config["object"] = r.GCSObject
			}

		case "azureBlobStorage":
			if r.AzureContainer != "" {
				config["container"] = r.AzureContainer
			}
			if r.AzureAccountName != "" {
				config["accountName"] = r.AzureAccountName
			}
			if r.AzureAccountKey != "" {
				config["accountKey"] = r.AzureAccountKey
			}
			if r.AzureObject != "" {
				config["object"] = r.AzureObject
			}

		case "github":
			if r.GitHubRepositorySlug != "" {
				config["repositorySlug"] = r.GitHubRepositorySlug
			}
			if r.GitHubPath != "" {
				config["path"] = r.GitHubPath
			}
			if r.GitHubBranch != "" {
				config["branch"] = r.GitHubBranch
			}
			if r.GitHubToken != "" {
				config["token"] = r.GitHubToken
			}

		case "gitlab":
			if r.GitLabRepositorySlug != "" {
				config["repositorySlug"] = r.GitLabRepositorySlug
			}
			if r.GitLabPath != "" {
				config["path"] = r.GitLabPath
			}
			if r.GitLabBranch != "" {
				config["branch"] = r.GitLabBranch
			}
			if r.GitLabToken != "" {
				config["token"] = r.GitLabToken
			}
			if r.GitLabBaseURL != "" {
				config["baseUrl"] = r.GitLabBaseURL
			}

		case "bitbucket":
			if r.BitbucketRepositorySlug != "" {
				config["repositorySlug"] = r.BitbucketRepositorySlug
			}
			if r.BitbucketPath != "" {
				config["path"] = r.BitbucketPath
			}
			if r.BitbucketBranch != "" {
				config["branch"] = r.BitbucketBranch
			}
			if r.BitbucketToken != "" {
				config["token"] = r.BitbucketToken
			}
			if r.BitbucketBaseURL != "" {
				config["baseUrl"] = r.BitbucketBaseURL
			}

		case "mongodb":
			if r.MongoDBURI != "" {
				config["uri"] = r.MongoDBURI
			}
			if r.MongoDBDatabase != "" {
				config["database"] = r.MongoDBDatabase
			}
			if r.MongoDBCollection != "" {
				config["collection"] = r.MongoDBCollection
			}

		case "redis":
			if r.RedisAddr != "" {
				config["addr"] = r.RedisAddr
			}
			if r.RedisPassword != "" {
				config["password"] = r.RedisPassword
			}
			if r.RedisDB > 0 {
				config["db"] = r.RedisDB
			}
			if r.RedisPrefix != "" {
				config["prefix"] = r.RedisPrefix
			}

		case "configmap":
			if r.ConfigMapNamespace != "" {
				config["namespace"] = r.ConfigMapNamespace
			}
			if r.ConfigMapName != "" {
				config["configmap"] = r.ConfigMapName
			}
			if r.ConfigMapKey != "" {
				config["key"] = r.ConfigMapKey
			}
		}

		configs = append(configs, config)
	}

	return configs
}
