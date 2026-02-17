package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/gorilla/mux"
	"gopkg.in/yaml.v3"
)

// File-based storage methods - used when DATABASE_URL is not set.
// These preserve the original file-based behavior for simple deployments.

var fileMu sync.RWMutex

// getProjectFilePath returns the file path for a project
func (fm *FlagManager) getProjectFilePath(project string) string {
	return filepath.Join(fm.config.FlagsDir, project+".yaml")
}

// readProjectFlags reads flags from a project file
func (fm *FlagManager) readProjectFlags(project string) (ProjectFlags, error) {
	fileMu.RLock()
	defer fileMu.RUnlock()

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
	fileMu.Lock()
	defer fileMu.Unlock()

	filePath := fm.getProjectFilePath(project)
	data, err := yaml.Marshal(flags)
	if err != nil {
		return err
	}

	return os.WriteFile(filePath, data, 0644)
}

// listProjectsFile returns all project names from file system
func (fm *FlagManager) listProjectsFile() ([]string, error) {
	fileMu.RLock()
	defer fileMu.RUnlock()

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

// File-based handler fallbacks

func (fm *FlagManager) getRawFlagsFileBased(w http.ResponseWriter, r *http.Request) {
	projects, err := fm.listProjectsFile()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	allFlags := make(map[string]FlagConfig)
	for _, project := range projects {
		flags, err := fm.readProjectFlags(project)
		if err != nil {
			log.Printf("Warning: Failed to read %s: %v", project, err)
			continue
		}
		for flagKey, flagConfig := range flags {
			fullKey := project + "/" + flagKey
			allFlags[fullKey] = flagConfig
		}
	}

	w.Header().Set("Content-Type", "application/x-yaml")
	yaml.NewEncoder(w).Encode(allFlags)
}

func (fm *FlagManager) getRawProjectFlagsFileBased(w http.ResponseWriter, r *http.Request) {
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

func (fm *FlagManager) listProjectsFileBased(w http.ResponseWriter, r *http.Request) {
	projects, err := fm.listProjectsFile()
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

func (fm *FlagManager) getProjectFileBased(w http.ResponseWriter, r *http.Request) {
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

func (fm *FlagManager) createProjectFileBased(w http.ResponseWriter, r *http.Request) {
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

	if err := fm.writeProjectFlags(project, make(ProjectFlags)); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"project": project, "status": "created"})
}

func (fm *FlagManager) deleteProjectFileBased(w http.ResponseWriter, r *http.Request) {
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

	go fm.refreshRelayProxy()
	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) listFlagsFileBased(w http.ResponseWriter, r *http.Request) {
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

func (fm *FlagManager) getFlagFileBased(w http.ResponseWriter, r *http.Request) {
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

func (fm *FlagManager) createFlagFileBased(w http.ResponseWriter, r *http.Request, project, flagKey string, flagConfig FlagConfig) {
	flags, err := fm.readProjectFlags(project)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if flags == nil {
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

	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":    flagKey,
		"config": flagConfig,
	})
}

func (fm *FlagManager) updateFlagFileBased(w http.ResponseWriter, r *http.Request, project, flagKey string, flagConfig FlagConfig, newKey string) {
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

	effectiveKey := flagKey
	if newKey != "" && newKey != flagKey {
		if _, exists := flags[newKey]; exists {
			http.Error(w, "Flag with new key already exists", http.StatusConflict)
			return
		}
		delete(flags, flagKey)
		effectiveKey = newKey
	}

	flags[effectiveKey] = flagConfig

	if err := fm.writeProjectFlags(project, flags); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	go fm.refreshRelayProxy()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"key":    effectiveKey,
		"config": flagConfig,
	})
}

func (fm *FlagManager) deleteFlagFileBased(w http.ResponseWriter, r *http.Request, project, flagKey string) {
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

	go fm.refreshRelayProxy()
	w.WriteHeader(http.StatusNoContent)
}
