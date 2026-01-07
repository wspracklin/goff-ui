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

// ADOClient handles Azure DevOps Git operations
type ADOClient struct {
	OrgURL     string
	Project    string
	Repository string
	PAT        string
	Branch     string
	httpClient *http.Client
}

// NewADOClient creates a new Azure DevOps client
func NewADOClient(orgURL, project, repository, pat, branch string) *ADOClient {
	if branch == "" {
		branch = "main"
	}
	return &ADOClient{
		OrgURL:     orgURL,
		Project:    project,
		Repository: repository,
		PAT:        pat,
		Branch:     branch,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// GetFile retrieves a file from the repository
func (c *ADOClient) GetFile(path string) ([]byte, error) {
	url := fmt.Sprintf("%s/%s/_apis/git/repositories/%s/items?path=%s&api-version=7.0",
		c.OrgURL, c.Project, c.Repository, url.QueryEscape(path))

	req, err := http.NewRequest("GET", url, nil)
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
		return nil, fmt.Errorf("ADO API error %d: %s", resp.StatusCode, string(body))
	}

	return io.ReadAll(resp.Body)
}

// CreatePullRequest creates a PR with the given changes
func (c *ADOClient) CreatePullRequest(title, description, sourceBranch, targetBranch string, changes map[string][]byte) (string, error) {
	// 1. Get the latest commit on target branch
	latestCommit, err := c.getLatestCommit(targetBranch)
	if err != nil {
		return "", fmt.Errorf("failed to get latest commit: %w", err)
	}

	// 2. Create a new branch from target
	branchName := fmt.Sprintf("refs/heads/%s", sourceBranch)
	if err := c.createBranch(branchName, latestCommit); err != nil {
		return "", fmt.Errorf("failed to create branch: %w", err)
	}

	// 3. Push changes to the new branch
	if err := c.pushChanges(sourceBranch, latestCommit, changes); err != nil {
		return "", fmt.Errorf("failed to push changes: %w", err)
	}

	// 4. Create the pull request
	prURL, err := c.createPR(title, description, sourceBranch, targetBranch)
	if err != nil {
		return "", fmt.Errorf("failed to create PR: %w", err)
	}

	return prURL, nil
}

func (c *ADOClient) getLatestCommit(branch string) (string, error) {
	url := fmt.Sprintf("%s/%s/_apis/git/repositories/%s/refs?filter=heads/%s&api-version=7.0",
		c.OrgURL, c.Project, c.Repository, branch)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	c.setAuth(req)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Value []struct {
			ObjectID string `json:"objectId"`
		} `json:"value"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	if len(result.Value) == 0 {
		return "", fmt.Errorf("branch %s not found", branch)
	}

	return result.Value[0].ObjectID, nil
}

func (c *ADOClient) createBranch(branchName, fromCommit string) error {
	url := fmt.Sprintf("%s/%s/_apis/git/repositories/%s/refs?api-version=7.0",
		c.OrgURL, c.Project, c.Repository)

	payload := []map[string]interface{}{
		{
			"name":        branchName,
			"oldObjectId": "0000000000000000000000000000000000000000",
			"newObjectId": fromCommit,
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
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

	// 409 means branch already exists, which is fine
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusConflict {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to create branch: %d - %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *ADOClient) pushChanges(branch, parentCommit string, changes map[string][]byte) error {
	url := fmt.Sprintf("%s/%s/_apis/git/repositories/%s/pushes?api-version=7.0",
		c.OrgURL, c.Project, c.Repository)

	// Build the changes array
	changeItems := make([]map[string]interface{}, 0, len(changes))
	for path, content := range changes {
		changeItems = append(changeItems, map[string]interface{}{
			"changeType": "edit",
			"item": map[string]string{
				"path": path,
			},
			"newContent": map[string]string{
				"content":     base64.StdEncoding.EncodeToString(content),
				"contentType": "base64encoded",
			},
		})
	}

	payload := map[string]interface{}{
		"refUpdates": []map[string]string{
			{
				"name":        fmt.Sprintf("refs/heads/%s", branch),
				"oldObjectId": parentCommit,
			},
		},
		"commits": []map[string]interface{}{
			{
				"comment": "Update feature flags via GOFF UI",
				"changes": changeItems,
			},
		},
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
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
		return fmt.Errorf("failed to push: %d - %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func (c *ADOClient) createPR(title, description, sourceBranch, targetBranch string) (string, error) {
	url := fmt.Sprintf("%s/%s/_apis/git/repositories/%s/pullrequests?api-version=7.0",
		c.OrgURL, c.Project, c.Repository)

	payload := map[string]interface{}{
		"sourceRefName": fmt.Sprintf("refs/heads/%s", sourceBranch),
		"targetRefName": fmt.Sprintf("refs/heads/%s", targetBranch),
		"title":         title,
		"description":   description,
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
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
		return "", fmt.Errorf("failed to create PR: %d - %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		PullRequestID int    `json:"pullRequestId"`
		URL           string `json:"url"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	// Construct web URL
	webURL := fmt.Sprintf("%s/%s/_git/%s/pullrequest/%d",
		c.OrgURL, c.Project, c.Repository, result.PullRequestID)

	return webURL, nil
}

func (c *ADOClient) setAuth(req *http.Request) {
	auth := base64.StdEncoding.EncodeToString([]byte(":" + c.PAT))
	req.Header.Set("Authorization", "Basic "+auth)
}
