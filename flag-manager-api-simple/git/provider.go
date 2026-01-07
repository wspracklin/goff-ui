package git

import (
	"fmt"
	"os"
)

// Provider defines the interface for git operations
type Provider interface {
	// GetFile retrieves a file from the repository
	GetFile(path string) ([]byte, error)
	// CreatePR creates a pull/merge request with the given changes
	// Returns the URL of the created PR/MR
	CreatePR(title, description, sourceBranch, targetBranch string, changes map[string][]byte) (string, error)
}

// ProviderType represents the git provider type
type ProviderType string

const (
	ProviderNone   ProviderType = ""
	ProviderADO    ProviderType = "ado"
	ProviderGitLab ProviderType = "gitlab"
)

// Config holds the git provider configuration
type Config struct {
	Provider     ProviderType
	BaseBranch   string
	FlagsPath    string

	// ADO-specific
	ADOOrgURL     string
	ADOProject    string
	ADORepository string
	ADOPAT        string

	// GitLab-specific
	GitLabURL       string
	GitLabProjectID string
	GitLabToken     string
}

// LoadConfigFromEnv loads git configuration from environment variables
func LoadConfigFromEnv() *Config {
	provider := ProviderType(os.Getenv("GIT_PROVIDER"))

	config := &Config{
		Provider:   provider,
		BaseBranch: getEnvDefault("GIT_BASE_BRANCH", "main"),
		FlagsPath:  getEnvDefault("GIT_FLAGS_PATH", "/flags.yaml"),

		// ADO
		ADOOrgURL:     os.Getenv("ADO_ORG_URL"),
		ADOProject:    os.Getenv("ADO_PROJECT"),
		ADORepository: os.Getenv("ADO_REPOSITORY"),
		ADOPAT:        os.Getenv("ADO_PAT"),

		// GitLab
		GitLabURL:       os.Getenv("GITLAB_URL"),
		GitLabProjectID: os.Getenv("GITLAB_PROJECT_ID"),
		GitLabToken:     os.Getenv("GITLAB_TOKEN"),
	}

	return config
}

// NewProvider creates a git provider based on configuration
func NewProvider(config *Config) (Provider, error) {
	switch config.Provider {
	case ProviderADO:
		if config.ADOOrgURL == "" || config.ADOProject == "" || config.ADORepository == "" || config.ADOPAT == "" {
			return nil, fmt.Errorf("ADO configuration incomplete: need ADO_ORG_URL, ADO_PROJECT, ADO_REPOSITORY, ADO_PAT")
		}
		return NewADOClient(
			config.ADOOrgURL,
			config.ADOProject,
			config.ADORepository,
			config.ADOPAT,
			config.BaseBranch,
		), nil

	case ProviderGitLab:
		if config.GitLabURL == "" || config.GitLabProjectID == "" || config.GitLabToken == "" {
			return nil, fmt.Errorf("GitLab configuration incomplete: need GITLAB_URL, GITLAB_PROJECT_ID, GITLAB_TOKEN")
		}
		return NewGitLabClient(
			config.GitLabURL,
			config.GitLabProjectID,
			config.GitLabToken,
			config.BaseBranch,
		), nil

	case ProviderNone:
		return nil, nil

	default:
		return nil, fmt.Errorf("unknown git provider: %s", config.Provider)
	}
}

// IsConfigured returns true if a git provider is configured
func (c *Config) IsConfigured() bool {
	return c.Provider != ProviderNone
}

func getEnvDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Ensure ADOClient implements Provider
var _ Provider = (*ADOClient)(nil)

// CreatePR implements Provider for ADOClient
func (c *ADOClient) CreatePR(title, description, sourceBranch, targetBranch string, changes map[string][]byte) (string, error) {
	return c.CreatePullRequest(title, description, sourceBranch, targetBranch, changes)
}

// Ensure GitLabClient implements Provider
var _ Provider = (*GitLabClient)(nil)

// CreatePR implements Provider for GitLabClient
func (c *GitLabClient) CreatePR(title, description, sourceBranch, targetBranch string, changes map[string][]byte) (string, error) {
	return c.CreateMergeRequest(title, description, sourceBranch, targetBranch, changes)
}
