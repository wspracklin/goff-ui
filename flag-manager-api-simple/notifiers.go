package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

// Notifier represents a notification configuration
type Notifier struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Kind        string            `json:"kind"` // slack, discord, microsoftteams, webhook, log
	Description string            `json:"description,omitempty"`
	Enabled     bool              `json:"enabled"`
	CreatedAt   time.Time         `json:"createdAt"`
	UpdatedAt   time.Time         `json:"updatedAt"`

	// Slack/Discord/Teams - shared webhook field
	WebhookURL string `json:"webhookUrl,omitempty"`

	// Webhook-specific
	EndpointURL string            `json:"endpointUrl,omitempty"`
	Secret      string            `json:"secret,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Meta        map[string]string `json:"meta,omitempty"`

	// Log-specific
	LogFormat string `json:"logFormat,omitempty"` // json, text
}

// NotifiersStore manages notifier configurations
type NotifiersStore struct {
	configPath string
	notifiers  map[string]*Notifier
	mu         sync.RWMutex
}

// NewNotifiersStore creates a new notifiers store
func NewNotifiersStore(configDir string) *NotifiersStore {
	store := &NotifiersStore{
		configPath: filepath.Join(configDir, "notifiers.json"),
		notifiers:  make(map[string]*Notifier),
	}
	store.load()
	return store
}

// load reads notifiers from disk
func (s *NotifiersStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var notifiers []*Notifier
	if err := json.Unmarshal(data, &notifiers); err != nil {
		return err
	}

	for _, notifier := range notifiers {
		s.notifiers[notifier.ID] = notifier
	}

	return nil
}

// save writes notifiers to disk
func (s *NotifiersStore) save() error {
	notifiers := make([]*Notifier, 0, len(s.notifiers))
	for _, notifier := range s.notifiers {
		notifiers = append(notifiers, notifier)
	}

	data, err := json.MarshalIndent(notifiers, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.configPath, data, 0644)
}

// maskSecrets returns a copy with secrets masked
func (s *NotifiersStore) maskSecrets(notifier *Notifier) *Notifier {
	masked := *notifier
	if masked.Secret != "" {
		masked.Secret = "********"
	}
	// Don't mask webhook URLs as they're needed for display
	return &masked
}

// List returns all notifiers with secrets masked
func (s *NotifiersStore) List() []*Notifier {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Notifier, 0, len(s.notifiers))
	for _, notifier := range s.notifiers {
		result = append(result, s.maskSecrets(notifier))
	}
	return result
}

// Get returns a notifier by ID with secrets masked
func (s *NotifiersStore) Get(id string) *Notifier {
	s.mu.RLock()
	defer s.mu.RUnlock()

	notifier, exists := s.notifiers[id]
	if !exists {
		return nil
	}
	return s.maskSecrets(notifier)
}

// GetRaw returns a notifier by ID without masking (for internal use)
func (s *NotifiersStore) GetRaw(id string) *Notifier {
	s.mu.RLock()
	defer s.mu.RUnlock()

	notifier, exists := s.notifiers[id]
	if !exists {
		return nil
	}
	return notifier
}

// Create adds a new notifier
func (s *NotifiersStore) Create(notifier *Notifier) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.notifiers[notifier.ID]; exists {
		return fmt.Errorf("notifier with ID %s already exists", notifier.ID)
	}

	notifier.CreatedAt = time.Now()
	notifier.UpdatedAt = time.Now()

	s.notifiers[notifier.ID] = notifier
	return s.save()
}

// Update modifies an existing notifier
func (s *NotifiersStore) Update(id string, updates *Notifier) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, exists := s.notifiers[id]
	if !exists {
		return fmt.Errorf("notifier with ID %s not found", id)
	}

	// Preserve secrets if masked values provided
	if updates.Secret == "********" || updates.Secret == "" {
		updates.Secret = existing.Secret
	}

	updates.ID = id
	updates.CreatedAt = existing.CreatedAt
	updates.UpdatedAt = time.Now()

	s.notifiers[id] = updates
	return s.save()
}

// Delete removes a notifier
func (s *NotifiersStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.notifiers[id]; !exists {
		return fmt.Errorf("notifier with ID %s not found", id)
	}

	delete(s.notifiers, id)
	return s.save()
}

// GetEnabled returns all enabled notifiers (for config generation)
func (s *NotifiersStore) GetEnabled() []*Notifier {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*Notifier, 0)
	for _, notifier := range s.notifiers {
		if notifier.Enabled {
			result = append(result, notifier)
		}
	}
	return result
}

// HTTP Handlers

func (fm *FlagManager) listNotifiersHandler(w http.ResponseWriter, r *http.Request) {
	notifiers := fm.notifiers.List()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"notifiers": notifiers,
	})
}

func (fm *FlagManager) getNotifierHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	notifier := fm.notifiers.Get(id)
	if notifier == nil {
		http.Error(w, "Notifier not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notifier)
}

func (fm *FlagManager) createNotifierHandler(w http.ResponseWriter, r *http.Request) {
	var notifier Notifier
	if err := json.NewDecoder(r.Body).Decode(&notifier); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if notifier.ID == "" {
		http.Error(w, "ID is required", http.StatusBadRequest)
		return
	}

	if notifier.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if notifier.Kind == "" {
		http.Error(w, "Kind is required", http.StatusBadRequest)
		return
	}

	// Validate kind
	validKinds := map[string]bool{
		"slack":          true,
		"discord":        true,
		"microsoftteams": true,
		"webhook":        true,
		"log":            true,
	}
	if !validKinds[notifier.Kind] {
		http.Error(w, "Invalid kind. Must be one of: slack, discord, microsoftteams, webhook, log", http.StatusBadRequest)
		return
	}

	if err := fm.notifiers.Create(&notifier); err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(fm.notifiers.Get(notifier.ID))
}

func (fm *FlagManager) updateNotifierHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	var updates Notifier
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := fm.notifiers.Update(id, &updates); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(fm.notifiers.Get(id))
}

func (fm *FlagManager) deleteNotifierHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.notifiers.Delete(id); err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) testNotifierHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id := vars["id"]

	notifier := fm.notifiers.GetRaw(id)
	if notifier == nil {
		http.Error(w, "Notifier not found", http.StatusNotFound)
		return
	}

	var testErr error

	switch notifier.Kind {
	case "slack":
		testErr = testSlackNotifier(notifier)
	case "discord":
		testErr = testDiscordNotifier(notifier)
	case "microsoftteams":
		testErr = testTeamsNotifier(notifier)
	case "webhook":
		testErr = testWebhookNotifier(notifier)
	case "log":
		// Log notifier always succeeds
		testErr = nil
	default:
		http.Error(w, "Unknown notifier kind", http.StatusBadRequest)
		return
	}

	if testErr != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": false,
			"error":   testErr.Error(),
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Test notification sent successfully",
	})
}

// Test functions for each notifier type

func testSlackNotifier(n *Notifier) error {
	if n.WebhookURL == "" {
		return fmt.Errorf("webhook URL is required")
	}

	payload := map[string]interface{}{
		"text": ":white_check_mark: GO Feature Flag - Test notification from GOFF UI",
		"blocks": []map[string]interface{}{
			{
				"type": "section",
				"text": map[string]string{
					"type": "mrkdwn",
					"text": "*GO Feature Flag*\nThis is a test notification from GOFF UI. Your Slack notifier is configured correctly!",
				},
			},
		},
	}

	return sendWebhook(n.WebhookURL, payload, nil)
}

func testDiscordNotifier(n *Notifier) error {
	if n.WebhookURL == "" {
		return fmt.Errorf("webhook URL is required")
	}

	payload := map[string]interface{}{
		"content": "GO Feature Flag - Test notification from GOFF UI",
		"embeds": []map[string]interface{}{
			{
				"title":       "Test Notification",
				"description": "This is a test notification from GOFF UI. Your Discord notifier is configured correctly!",
				"color":       5763719, // Green
			},
		},
	}

	return sendWebhook(n.WebhookURL, payload, nil)
}

func testTeamsNotifier(n *Notifier) error {
	if n.WebhookURL == "" {
		return fmt.Errorf("webhook URL is required")
	}

	payload := map[string]interface{}{
		"@type":      "MessageCard",
		"@context":   "http://schema.org/extensions",
		"themeColor": "0076D7",
		"summary":    "GO Feature Flag - Test Notification",
		"sections": []map[string]interface{}{
			{
				"activityTitle": "GO Feature Flag",
				"facts": []map[string]string{
					{"name": "Status", "value": "Test notification sent successfully"},
					{"name": "Source", "value": "GOFF UI"},
				},
				"markdown": true,
			},
		},
	}

	return sendWebhook(n.WebhookURL, payload, nil)
}

func testWebhookNotifier(n *Notifier) error {
	if n.EndpointURL == "" {
		return fmt.Errorf("endpoint URL is required")
	}

	payload := map[string]interface{}{
		"type":    "test",
		"message": "Test notification from GOFF UI",
		"meta":    n.Meta,
	}

	return sendWebhook(n.EndpointURL, payload, n.Headers)
}

func sendWebhook(url string, payload interface{}, headers map[string]string) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(data))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("webhook returned status %d", resp.StatusCode)
	}

	return nil
}

// BuildNotifierConfig generates the notifier configuration for relay proxy
func (s *NotifiersStore) BuildNotifierConfig() []map[string]interface{} {
	enabled := s.GetEnabled()
	if len(enabled) == 0 {
		return nil
	}

	configs := make([]map[string]interface{}, 0, len(enabled))

	for _, n := range enabled {
		config := map[string]interface{}{
			"kind": n.Kind,
		}

		switch n.Kind {
		case "slack":
			if n.WebhookURL != "" {
				config["webhookUrl"] = n.WebhookURL
			}
		case "discord":
			if n.WebhookURL != "" {
				config["webhookUrl"] = n.WebhookURL
			}
		case "microsoftteams":
			if n.WebhookURL != "" {
				config["webhookUrl"] = n.WebhookURL
			}
		case "webhook":
			if n.EndpointURL != "" {
				config["endpointUrl"] = n.EndpointURL
			}
			if n.Secret != "" {
				config["secret"] = n.Secret
			}
			if len(n.Headers) > 0 {
				// Convert to array format expected by GO Feature Flag
				headers := make(map[string][]string)
				for k, v := range n.Headers {
					headers[k] = []string{v}
				}
				config["headers"] = headers
			}
			if len(n.Meta) > 0 {
				config["meta"] = n.Meta
			}
		case "log":
			if n.LogFormat != "" {
				config["format"] = n.LogFormat
			}
		}

		configs = append(configs, config)
	}

	return configs
}
