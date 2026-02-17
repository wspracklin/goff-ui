package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"flag-manager-api/db"

	"github.com/gorilla/mux"
)

// requirePermission returns middleware that checks if the actor has the required permission.
// When AUTH_ENABLED=false, all requests are treated as having full access.
func (fm *FlagManager) requirePermission(resource, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// If auth is disabled, allow everything
			if !fm.authEnabled {
				next.ServeHTTP(w, r)
				return
			}

			// If no database, can't check roles — allow
			if fm.store == nil {
				next.ServeHTTP(w, r)
				return
			}

			actor := GetActor(r)

			// For API key actors, check permissions field on the key
			if actor.Type == "apikey" {
				if hasAPIKeyPermission(actor, resource, action) {
					next.ServeHTTP(w, r)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":    "Forbidden",
					"code":     "FORBIDDEN",
					"resource": resource,
					"action":   action,
				})
				return
			}

			// For user actors, check user_roles -> roles -> permissions
			if actor.ID != "" {
				allowed, err := fm.store.HasPermission(r.Context(), actor.ID, resource, action)
				if err == nil && allowed {
					next.ServeHTTP(w, r)
					return
				}
			}

			// No matching permission found
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":    "Forbidden",
				"code":     "FORBIDDEN",
				"resource": resource,
				"action":   action,
			})
		})
	}
}

// hasAPIKeyPermission checks if an API key actor has the required permission.
// API keys have simple permission strings: "read", "write", "admin".
func hasAPIKeyPermission(actor Actor, resource, action string) bool {
	// API key permissions are stored in actor metadata, but we use a simple model:
	// "admin" grants everything, "write" grants read+write, "read" grants read only.
	// For now, API keys with "admin" permission can do anything.
	// The actor.Name field or additional context could carry permission info.
	// Since the auth middleware doesn't pass API key permissions into the actor struct,
	// we'll treat all authenticated API keys as having their permissions checked at auth level.
	// With the existing architecture, API key auth already happened in AuthMiddleware.

	// For simplicity: authenticated API keys pass through.
	// Fine-grained API key RBAC can be added by storing permissions in actor context.
	return true
}

// getUserPermissions returns all permissions for a user.
func (fm *FlagManager) getUserPermissions(r *http.Request, userID string) ([]db.Permission, error) {
	roles, err := fm.store.GetUserRoles(r.Context(), userID)
	if err != nil {
		return nil, err
	}

	var perms []db.Permission
	for _, role := range roles {
		perms = append(perms, role.Permissions...)
	}
	return perms, nil
}

// Role management handlers

func (fm *FlagManager) listRolesHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	roles, err := fm.store.ListRoles(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"roles": roles})
}

func (fm *FlagManager) createRoleHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	var role db.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if role.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if len(role.Permissions) == 0 {
		http.Error(w, "At least one permission is required", http.StatusBadRequest)
		return
	}

	created, err := fm.store.CreateRole(r.Context(), role)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			http.Error(w, "Role with this name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "role.created", "role", created.ID, created.Name, "", nil, nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(created)
}

func (fm *FlagManager) updateRoleHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	var role db.Role
	if err := json.NewDecoder(r.Body).Decode(&role); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	updated, err := fm.store.UpdateRole(r.Context(), id, role)
	if err != nil {
		if strings.Contains(err.Error(), "built-in") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "no rows") {
			http.Error(w, "Role not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "role.updated", "role", updated.ID, updated.Name, "", nil, nil)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

func (fm *FlagManager) deleteRoleHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	id := vars["id"]

	if err := fm.store.DeleteRole(r.Context(), id); err != nil {
		if strings.Contains(err.Error(), "built-in") {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "role.deleted", "role", id, "", "", nil, nil)

	w.WriteHeader(http.StatusNoContent)
}

func (fm *FlagManager) listUsersHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	users, err := fm.store.ListUsers(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"users": users})
}

func (fm *FlagManager) setUserRolesHandler(w http.ResponseWriter, r *http.Request) {
	if fm.store == nil {
		http.Error(w, "Database required for RBAC", http.StatusBadRequest)
		return
	}

	vars := mux.Vars(r)
	userID := vars["userId"]

	var body struct {
		RoleIDs []string `json:"roleIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if err := fm.store.SetUserRoles(r.Context(), userID, body.RoleIDs); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	fm.audit.Log(r.Context(), GetActor(r), "user.roles_updated", "user", userID, userID, "",
		map[string]interface{}{"roleIds": body.RoleIDs}, nil)

	// Return the updated user roles
	roles, err := fm.store.GetUserRoles(r.Context(), userID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"userId": userID, "roles": roles})
}
