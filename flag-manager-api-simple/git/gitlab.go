package git

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// GitLabClient handles GitLab Git operations
type GitLabClient struct {
	BaseURL    string
	ProjectID  string // Can be numeric ID or URL-encoded path (group/project)
	Token      string
	Branch     string
	httpClient *http.Client
}

// NewGitLabClient creates a new GitLab client
func NewGitLabClient(baseURL, projectID, token, branch string) *GitLabClient {
	if branch == "" {
		branch = "main"
	}
	// Remove trailing slash from baseURL
	if len(baseURL) > 0 && baseURL[len(baseURL)-1] == '/' {
		baseURL = baseURL[:len(baseURL)-1]
	}
	return &GitLabClient{
		BaseURL:    baseURL,
		ProjectID:  url.PathEscape(projectID),
		Token:      token,
		Branch:     branch,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// GetFile retrieves a file from the repository
func (c *GitLabClient) GetFile(path string) ([]byte, error) {
	apiURL := fmt.Sprintf("%s/api/v4/projects/%s/repository/files/%s/raw?ref=%s",
		c.BaseURL, c.ProjectID, url.PathEscape(path), c.Branch)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("GitLab API error %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

// CreateMergeRequest creates a MR with the given changes
func (c *GitLabClient) CreateMergeRequest(title, description, sourceBranch, targetBranch string, changes map[string][]byte) (string, error) {
	// 1. Create the source branch
	if err := c.createBranch(sourceBranch, targetBranch); err != nil {
		return "", fmt.Errorf("failed to create branch: %w", err)
	}

	// 2. Commit changes to the source branch
	if err := c.commitChanges(sourceBranch, "Update feature flags via GOFF UI", changes); err != nil {
		return "", fmt.Errorf("failed to commit changes: %w", err)
	}

	// 3. Create the merge request
	mrURL, err := c.createMR(title, description, sourceBranch, targetBranch)
	if err != nil {
		return "", fmt.Errorf("failed to create MR: %w", err)
	}

	return mrURL, nil
}

func (c *GitLabClient) createBranch(branchName, ref string) error {
	apiURL := fmt.Sprintf("%s/api/v4/projects/%s/repository/branches",
		c.BaseURL, c.ProjectID)

	payload := map[string]string{
		"branch": branchName,
		"ref":    ref,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	c.setAuth(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 400 with "already exists" is fine
	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		if resp.StatusCode == http.StatusBadRequest && bytes.Contains(respBody, []byte("already exists")) {
			return nil
		}
		return fmt.Errorf("failed to create branch: %d - %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *GitLabClient) commitChanges(branch, message string, changes map[string][]byte) error {
	apiURL := fmt.Sprintf("%s/api/v4/projects/%s/repository/commits",
		c.BaseURL, c.ProjectID)

	// Build the actions array
	actions := make([]map[string]interface{}, 0, len(changes))
	for path, content := range changes {
		actions = append(actions, map[string]interface{}{
			"action":   "update",
			"file_path": path,
			"content":  base64.StdEncoding.EncodeToString(content),
			"encoding": "base64",
		})
	}

	payload := map[string]interface{}{
		"branch":         branch,
		"commit_message": message,
		"actions":        actions,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	c.setAuth(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to commit: %d - %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *GitLabClient) createMR(title, description, sourceBranch, targetBranch string) (string, error) {
	apiURL := fmt.Sprintf("%s/api/v4/projects/%s/merge_requests",
		c.BaseURL, c.ProjectID)

	payload := map[string]interface{}{
		"source_branch": sourceBranch,
		"target_branch": targetBranch,
		"title":         title,
		"description":   description,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	c.setAuth(req)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("failed to create MR: %d - %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		WebURL string `json:"web_url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.WebURL, nil
}

func (c *GitLabClient) setAuth(req *http.Request) {
	req.Header.Set("PRIVATE-TOKEN", c.Token)
}
