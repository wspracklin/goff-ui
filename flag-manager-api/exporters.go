package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"flag-manager-api/db"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
)

// Exporter represents an exporter configuration
type Exporter struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"` // file, webhook, log, s3, googleStorage, azureBlobStorage, kafka, sqs, kinesis, pubsub
	Description string    `json:"description,omitempty"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	// Common fields for bulk exporters
	FlushInterval    int    `json:"flushInterval,omitempty"`    // Milliseconds between exports (default 60000)
	MaxEventInMemory int    `json:"maxEventInMemory,omitempty"` // Max events before triggering export (default 100000)
	Format           string `json:"format,omitempty"`           // JSON, CSV, or Parquet
	Filename         string `json:"filename,omitempty"`         // Template for filenames
	CsvTemplate      string `json:"csvTemplate,omitempty"`      // CSV format template
	ParquetCodec     string `json:"parquetCompressionCodec,omitempty"`

	// File exporter
	OutputDir string `json:"outputDir,omitempty"`

	// Webhook exporter
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Secret      string            `json:"secret,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Meta        map[string]string `json:"meta,omitempty"`

	// Log exporter
	LogFormat string `json:"logFormat,omitempty"` // Custom log format template

	// S3 exporter
	S3Bucket string `json:"s3Bucket,omitempty"`
	S3Path   string `json:"s3Path,omitempty"`

	// Google Cloud Storage exporter
	GCSBucket string `json:"gcsBucket,omitempty"`
	GCSPath   string `json:"gcsPath,omitempty"`

	// Azure Blob Storage exporter
	AzureContainer   string `json:"azureContainer,omitempty"`
	AzureAccountName string `json:"azureAccountName,omitempty"`
	AzureAccountKey  string `json:"azureAccountKey,omitempty"`
	AzurePath        string `json:"azurePath,omitempty"`

	// Kafka exporter
	KafkaTopic     string   `json:"kafkaTopic,omitempty"`
	KafkaAddresses []string `json:"kafkaAddresses,omitempty"`

	// SQS exporter
	SQSQueueURL string `json:"sqsQueueUrl,omitempty"`

	// Kinesis exporter
	KinesisStreamArn  string `json:"kinesisStreamArn,omitempty"`
	KinesisStreamName string `json:"kinesisStreamName,omitempty"`

	// PubSub exporter
	PubSubProjectID string `json:"pubsubProjectId,omitempty"`
	PubSubTopic     string `json:"pubsubTopic,omitempty"`
}

// ExportersStore manages exporter configurations
type ExportersStore struct {
	configPath string
	exporters  map[string]*Exporter
	mu         sync.RWMutex
}

// NewExportersStore creates a new exporters store
func NewExportersStore(configDir string) *ExportersStore {
	store := &ExportersStore{
		configPath: filepath.Join(configDir, "exporters.json"),
		exporters:  make(map[string]*Exporter),
	}
	store.load()
	return store
}

// load reads exporters from disk
func (s *ExportersStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var exporters []*Exporter
	if err := json.Unmarshal(data, &exporters); err != nil {
		return err
	}

	for _, exporter := range exporters {
		s.exporters[exporter.ID] = exporter
	}

	return nil
}

// save writes exporters to disk
func (s *ExportersStore) save() error {
	exporters := make([]*Exporter, 0, len(s.exporters))
	for _, exporter := range s.exporters {
		exporters = append(exporters, exporter)
	}

	data, err := json.MarshalIndent(exporters, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, data, 0644)
}

// maskSecrets returns a copy with secrets masked
func (s *ExportersStore) maskSecrets(exporter *Exporter) *Exporter {
	masked := *exporter
	if masked.Secret != "" {
		masked.Secret = "********"
	}
	if masked.AzureAccountKey != "" {
		masked.AzureAccountKey = "********"
	}
	return &masked
}

// List returns all exporters with secrets masked
func (s *ExportersStore) List() []*Exporter {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Exporter, 0, len(s.exporters))
	for _, exporter := range s.exporters {
		result = append(result, s.maskSecrets(exporter))
	}
	return result
}

// Get returns an exporter by ID with secrets masked
func (s *ExportersStore) Get(id string) *Exporter {
	s.mu.RLock()
	defer s.mu.RUnlock()

	exporter, exists := s.exporters[id]
	if !exists {
		return nil
	}
	return s.maskSecrets(exporter)
}

// GetRaw returns an exporter by ID without masking (for internal use)
func (s *ExportersStore) GetRaw(id string) *Exporter {
	s.mu.RLock()
	defer s.mu.RUnlock()

	exporter, exists := s.exporters[id]
	if !exists {
		return nil
	}
	return exporter
}

// Create adds a new exporter
func (s *ExportersStore) Create(exporter *Exporter) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.exporters[exporter.ID]; exists {
		return fmt.Errorf("exporter with ID %s already exists", exporter.ID)
	}

	exporter.CreatedAt = time.Now()
	exporter.UpdatedAt = time.Now()

	s.exporters[exporter.ID] = exporter
	return s.save()
}

// Update modifies an existing exporter
func (s *ExportersStore) Update(id string, updates *Exporter) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.exporters[id]
	if !exists {
		return fmt.Errorf("exporter with ID %s not found", id)
	}

	// Preserve secrets if masked values provided
	if updates.Secret == "********" || updates.Secret == "" {
		updates.Secret = existing.Secret
	}
	if updates.AzureAccountKey == "********" || updates.AzureAccountKey == "" {
		updates.AzureAccountKey = existing.AzureAccountKey
	}

	updates.ID = id
	updates.CreatedAt = existing.CreatedAt
	updates.UpdatedAt = time.Now()

	s.exporters[id] = updates
	return s.save()
}

// Delete removes an exporter
func (s *ExportersStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.exporters[id]; !exists {
		return fmt.Errorf("exporter with ID %s not found", id)
	}

	delete(s.exporters, id)
	return s.save()
}

// GetEnabled returns all enabled exporters (for config generation)
func (s *ExportersStore) GetEnabled() []*Exporter {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Exporter, 0)
	for _, exporter := range s.exporters {
		if exporter.Enabled {
			result = append(result, exporter)
		}
	}
	return result
}

// ---- Conversion helpers between Exporter and db.DBExporter ----

// exporterConfigJSON represents the kind-specific config stored as JSON in the DB.
type exporterConfigJSON struct {
	// Common bulk
	FlushInterval    int    `json:"flushInterval,omitempty"`
	MaxEventInMemory int    `json:"maxEventInMemory,omitempty"`
	Format           string `json:"format,omitempty"`
	Filename         string `json:"filename,omitempty"`
	CsvTemplate      string `json:"csvTemplate,omitempty"`
	ParquetCodec     string `json:"parquetCompressionCodec,omitempty"`

	// File
	OutputDir string `json:"outputDir,omitempty"`

	// Webhook
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Secret      string            `json:"secret,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Meta        map[string]string `json:"meta,omitempty"`

	// Log
	LogFormat string `json:"logFormat,omitempty"`

	// S3
	S3Bucket string `json:"s3Bucket,omitempty"`
	S3Path   string `json:"s3Path,omitempty"`

	// GCS
	GCSBucket string `json:"gcsBucket,omitempty"`
	GCSPath   string `json:"gcsPath,omitempty"`

	// Azure
	AzureContainer   string `json:"azureContainer,omitempty"`
	AzureAccountName string `json:"azureAccountName,omitempty"`
	AzureAccountKey  string `json:"azureAccountKey,omitempty"`
	AzurePath        string `json:"azurePath,omitempty"`

	// Kafka
	KafkaTopic     string   `json:"kafkaTopic,omitempty"`
	KafkaAddresses []string `json:"kafkaAddresses,omitempty"`

	// SQS
	SQSQueueURL string `json:"sqsQueueUrl,omitempty"`

	// Kinesis
	KinesisStreamArn  string `json:"kinesisStreamArn,omitempty"`
	KinesisStreamName string `json:"kinesisStreamName,omitempty"`

	// PubSub
	PubSubProjectID string `json:"pubsubProjectId,omitempty"`
	PubSubTopic     string `json:"pubsubTopic,omitempty"`
}

func dbExporterToExporter(dbe db.DBExporter) Exporter {
	e := Exporter{
		ID:          dbe.ID,
		Name:        dbe.Name,
		Kind:        dbe.Kind,
		Description: dbe.Description,
		Enabled:     dbe.Enabled,
		CreatedAt:   dbe.CreatedAt,
		UpdatedAt:   dbe.UpdatedAt,
	}

	if len(dbe.Config) > 0 && string(dbe.Config) != "null" {
		var cfg exporterConfigJSON
		if err := json.Unmarshal(dbe.Config, &cfg); err == nil {
			e.FlushInterval = cfg.FlushInterval
			e.MaxEventInMemory = cfg.MaxEventInMemory
			e.Format = cfg.Format
			e.Filename = cfg.Filename
			e.CsvTemplate = cfg.CsvTemplate
			e.ParquetCodec = cfg.ParquetCodec
			e.OutputDir = cfg.OutputDir
			e.EndpointURL = cfg.EndpointURL
			e.Secret = cfg.Secret
			e.Headers = cfg.Headers
			e.Meta = cfg.Meta
			e.LogFormat = cfg.LogFormat
			e.S3Bucket = cfg.S3Bucket
			e.S3Path = cfg.S3Path
			e.GCSBucket = cfg.GCSBucket
			e.GCSPath = cfg.GCSPath
			e.AzureContainer = cfg.AzureContainer
			e.AzureAccountName = cfg.AzureAccountName
			e.AzureAccountKey = cfg.AzureAccountKey
			e.AzurePath = cfg.AzurePath
			e.KafkaTopic = cfg.KafkaTopic
			e.KafkaAddresses = cfg.KafkaAddresses
			e.SQSQueueURL = cfg.SQSQueueURL
			e.KinesisStreamArn = cfg.KinesisStreamArn
			e.KinesisStreamName = cfg.KinesisStreamName
			e.PubSubProjectID = cfg.PubSubProjectID
			e.PubSubTopic = cfg.PubSubTopic
		}
	}

	return e
}

func exporterToDBExporter(e Exporter) db.DBExporter {
	dbe := db.DBExporter{
		ID:          e.ID,
		Name:        e.Name,
		Kind:        e.Kind,
		Description: e.Description,
		Enabled:     e.Enabled,
		CreatedAt:   e.CreatedAt,
		UpdatedAt:   e.UpdatedAt,
	}

	cfg := exporterConfigJSON{
		FlushInterval:    e.FlushInterval,
		MaxEventInMemory: e.MaxEventInMemory,
		Format:           e.Format,
		Filename:         e.Filename,
		CsvTemplate:      e.CsvTemplate,
		ParquetCodec:     e.ParquetCodec,
		OutputDir:        e.OutputDir,
		EndpointURL:      e.EndpointURL,
		Secret:           e.Secret,
		Headers:          e.Headers,
		Meta:             e.Meta,
		LogFormat:        e.LogFormat,
		S3Bucket:         e.S3Bucket,
		S3Path:           e.S3Path,
		GCSBucket:        e.GCSBucket,
		GCSPath:          e.GCSPath,
		AzureContainer:   e.AzureContainer,
		AzureAccountName: e.AzureAccountName,
		AzureAccountKey:  e.AzureAccountKey,
		AzurePath:        e.AzurePath,
		KafkaTopic:       e.KafkaTopic,
		KafkaAddresses:   e.KafkaAddresses,
		SQSQueueURL:      e.SQSQueueURL,
		KinesisStreamArn:  e.KinesisStreamArn,
		KinesisStreamName: e.KinesisStreamName,
		PubSubProjectID:  e.PubSubProjectID,
		PubSubTopic:      e.PubSubTopic,
	}
	configJSON, _ := json.Marshal(cfg)
	dbe.Config = configJSON

	return dbe
}

func maskExporterSecrets(e *Exporter) *Exporter {
	masked := *e
	if masked.Secret != "" {
		masked.Secret = "********"
	}
	if masked.AzureAccountKey != "" {
		masked.AzureAccountKey = "********"
	}
	return &masked
}

// HTTP Handlers

func (fm *FlagManager) listExportersHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store != nil {
		dbItems, err := fm.store.ListExporters(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		exporters := make([]*Exporter, 0, len(dbItems))
		for _, dbe := range dbItems {
			e := dbExporterToExporter(dbe)
			exporters = append(exporters, maskExporterSecrets(&e))
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"exporters": exporters,
		})
		return
	}

	exporters := fm.exporters.List()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"exporters": exporters,
	})
}

func (fm *FlagManager) getExporterHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if fm.store != nil {
		dbe, err := fm.store.GetExporter(r.Context(), id)
		if err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, "Exporter not found", http.StatusNotFound)
			} else {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		e := dbExporterToExporter(*dbe)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(maskExporterSecrets(&e))
		return
	}

	exporter := fm.exporters.Get(id)
	if exporter == nil {
		http.Error(w, "Exporter not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exporter)
}

func (fm *FlagManager) createExporterHandler(w http.ResponseWriter, r *http.Request) {
	var exporter Exporter
	if err := json.NewDecoder(r.Body).Decode(&exporter); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if exporter.ID == "" {
		http.Error(w, "ID is required", http.StatusBadRequest)
		return
	}

	if exporter.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if exporter.Kind == "" {
		http.Error(w, "Kind is required", http.StatusBadRequest)
		return
	}

	// Validate kind
	validKinds := map[string]bool{
		"file":             true,
		"webhook":          true,
		"log":              true,
		"s3":               true,
		"googleStorage":    true,
		"azureBlobStorage": true,
		"kafka":            true,
		"sqs":              true,
		"kinesis":          true,
		"pubsub":           true,
	}
	if !validKinds[exporter.Kind] {
		http.Error(w, "Invalid kind. Must be one of: file, webhook, log, s3, googleStorage, azureBlobStorage, kafka, sqs, kinesis, pubsub", http.StatusBadRequest)
		return
	}

	if fm.store != nil {
		dbe := exporterToDBExporter(exporter)
		created, err := fm.store.CreateExporter(r.Context(), dbe)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		e := dbExporterToExporter(*created)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(maskExporterSecrets(&e))
		return
	}

	if err := fm.exporters.Create(&exporter); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(fm.exporters.Get(exporter.ID))
}

func (fm *FlagManager) updateExporterHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var updates Exporter
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if fm.store != nil {
		// Preserve secrets if masked
		existing, err := fm.store.GetExporter(r.Context(), id)
		if err != nil {
			if err == pgx.ErrNoRows {
				http.Error(w, "Exporter not found", http.StatusNotFound)
			} else {
				http.Error(w, err.Error(), http.StatusInternalServerError)
			}
			return
		}
		existingE := dbExporterToExporter(*existing)
		if updates.Secret == "********" || updates.Secret == "" {
			updates.Secret = existingE.Secret
		}
		if updates.AzureAccountKey == "********" || updates.AzureAccountKey == "" {
			updates.AzureAccountKey = existingE.AzureAccountKey
		}

		dbe := exporterToDBExporter(updates)
		updated, err := fm.store.UpdateExporter(r.Context(), id, dbe)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		e := dbExporterToExporter(*updated)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(maskExporterSecrets(&e))
		return
	}

	if err := fm.exporters.Update(id, &updates); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fm.exporters.Get(id))
}

func (fm *FlagManager) deleteExporterHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if fm.store != nil {
		if err := fm.store.DeleteExporter(r.Context(), id); err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if err := fm.exporters.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// BuildExporterConfig generates the exporter configuration for relay proxy
func (s *ExportersStore) BuildExporterConfig() []map[string]interface{} {
	enabled := s.GetEnabled()
	if len(enabled) == 0 {
		return nil
	}

	configs := make([]map[string]interface{}, 0, len(enabled))

	for _, e := range enabled {
		config := map[string]interface{}{
			"kind": e.Kind,
		}

		// Add common bulk exporter fields
		if e.FlushInterval > 0 {
			config["flushInterval"] = e.FlushInterval
		}
		if e.MaxEventInMemory > 0 {
			config["maxEventInMemory"] = e.MaxEventInMemory
		}

		switch e.Kind {
		case "file":
			if e.OutputDir != "" {
				config["outputDir"] = e.OutputDir
			}
			addBulkExporterFields(config, e)

		case "webhook":
			if e.EndpointURL != "" {
				config["endpointUrl"] = e.EndpointURL
			}
			if e.Secret != "" {
				config["secret"] = e.Secret
			}
			if len(e.Headers) > 0 {
				// Convert to array format expected by GO Feature Flag
				headers := make(map[string][]string)
				for k, v := range e.Headers {
					headers[k] = []string{v}
				}
				config["headers"] = headers
			}
			if len(e.Meta) > 0 {
				config["meta"] = e.Meta
			}

		case "log":
			if e.LogFormat != "" {
				config["logFormat"] = e.LogFormat
			}

		case "s3":
			if e.S3Bucket != "" {
				config["bucket"] = e.S3Bucket
			}
			if e.S3Path != "" {
				config["path"] = e.S3Path
			}
			addBulkExporterFields(config, e)

		case "googleStorage":
			if e.GCSBucket != "" {
				config["bucket"] = e.GCSBucket
			}
			if e.GCSPath != "" {
				config["path"] = e.GCSPath
			}
			addBulkExporterFields(config, e)

		case "azureBlobStorage":
			if e.AzureContainer != "" {
				config["container"] = e.AzureContainer
			}
			if e.AzureAccountName != "" {
				config["accountName"] = e.AzureAccountName
			}
			if e.AzureAccountKey != "" {
				config["accountKey"] = e.AzureAccountKey
			}
			if e.AzurePath != "" {
				config["path"] = e.AzurePath
			}
			addBulkExporterFields(config, e)

		case "kafka":
			kafkaConfig := make(map[string]interface{})
			if e.KafkaTopic != "" {
				kafkaConfig["topic"] = e.KafkaTopic
			}
			if len(e.KafkaAddresses) > 0 {
				kafkaConfig["addresses"] = e.KafkaAddresses
			}
			config["kafka"] = kafkaConfig

		case "sqs":
			if e.SQSQueueURL != "" {
				config["queueUrl"] = e.SQSQueueURL
			}

		case "kinesis":
			if e.KinesisStreamArn != "" {
				config["streamArn"] = e.KinesisStreamArn
			}
			if e.KinesisStreamName != "" {
				config["streamName"] = e.KinesisStreamName
			}

		case "pubsub":
			if e.PubSubProjectID != "" {
				config["projectID"] = e.PubSubProjectID
			}
			if e.PubSubTopic != "" {
				config["topic"] = e.PubSubTopic
			}
		}

		configs = append(configs, config)
	}

	return configs
}

// addBulkExporterFields adds common bulk exporter fields to the config
func addBulkExporterFields(config map[string]interface{}, e *Exporter) {
	if e.Format != "" {
		config["format"] = e.Format
	}
	if e.Filename != "" {
		config["filename"] = e.Filename
	}
	if e.CsvTemplate != "" {
		config["csvTemplate"] = e.CsvTemplate
	}
	if e.ParquetCodec != "" {
		config["parquetCompressionCodec"] = e.ParquetCodec
	}
}
