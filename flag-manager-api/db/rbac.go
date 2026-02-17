package db

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Permission represents a resource permission.
type Permission struct {
	Resource string   `json:"resource"`
	Actions  []string `json:"actions"`
}

// Role represents a role in the system.
type Role struct {
	ID          string       `json:"id"`
	Name        string       `json:"name"`
	Description string       `json:"description,omitempty"`
	Permissions []Permission `json:"permissions"`
	IsBuiltin   bool         `json:"isBuiltin"`
	CreatedAt   time.Time    `json:"createdAt"`
	UpdatedAt   time.Time    `json:"updatedAt"`
}

// UserWithRoles represents a user with their assigned roles.
type UserWithRoles struct {
	UserID     string    `json:"userId"`
	Email      string    `json:"email,omitempty"`
	Name       string    `json:"name,omitempty"`
	Roles      []Role    `json:"roles"`
	LastActive time.Time `json:"lastActive,omitempty"`
}

// ListRoles returns all roles.
func (s *Store) ListRoles(ctx context.Context) ([]Role, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, COALESCE(description, ''), permissions, is_builtin, created_at, updated_at
		 FROM roles ORDER BY is_builtin DESC, name ASC`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var r Role
		var permsJSON []byte
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &permsJSON, &r.IsBuiltin, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(permsJSON, &r.Permissions)
		roles = append(roles, r)
	}
	if roles == nil {
		roles = []Role{}
	}
	return roles, nil
}

// GetRole returns a role by ID.
func (s *Store) GetRole(ctx context.Context, id string) (*Role, error) {
	var r Role
	var permsJSON []byte
	err := s.pool.QueryRow(ctx,
		`SELECT id, name, COALESCE(description, ''), permissions, is_builtin, created_at, updated_at
		 FROM roles WHERE id = $1`, id,
	).Scan(&r.ID, &r.Name, &r.Description, &permsJSON, &r.IsBuiltin, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	json.Unmarshal(permsJSON, &r.Permissions)
	return &r, nil
}

// CreateRole creates a new custom role.
func (s *Store) CreateRole(ctx context.Context, r Role) (*Role, error) {
	permsJSON, err := json.Marshal(r.Permissions)
	if err != nil {
		return nil, fmt.Errorf("marshal permissions: %w", err)
	}

	var created Role
	var createdPermsJSON []byte
	err = s.pool.QueryRow(ctx,
		`INSERT INTO roles (name, description, permissions, is_builtin)
		 VALUES ($1, $2, $3, false)
		 RETURNING id, name, COALESCE(description, ''), permissions, is_builtin, created_at, updated_at`,
		r.Name, nullStr(r.Description), permsJSON,
	).Scan(&created.ID, &created.Name, &created.Description, &createdPermsJSON, &created.IsBuiltin, &created.CreatedAt, &created.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create role: %w", err)
	}
	json.Unmarshal(createdPermsJSON, &created.Permissions)
	return &created, nil
}

// UpdateRole updates an existing role.
func (s *Store) UpdateRole(ctx context.Context, id string, r Role) (*Role, error) {
	// Check if role is builtin
	var isBuiltin bool
	err := s.pool.QueryRow(ctx, "SELECT is_builtin FROM roles WHERE id = $1", id).Scan(&isBuiltin)
	if err != nil {
		return nil, err
	}
	if isBuiltin {
		return nil, fmt.Errorf("cannot modify built-in role")
	}

	permsJSON, err := json.Marshal(r.Permissions)
	if err != nil {
		return nil, fmt.Errorf("marshal permissions: %w", err)
	}

	var updated Role
	var updatedPermsJSON []byte
	err = s.pool.QueryRow(ctx,
		`UPDATE roles SET name = $1, description = $2, permissions = $3, updated_at = now()
		 WHERE id = $4
		 RETURNING id, name, COALESCE(description, ''), permissions, is_builtin, created_at, updated_at`,
		r.Name, nullStr(r.Description), permsJSON, id,
	).Scan(&updated.ID, &updated.Name, &updated.Description, &updatedPermsJSON, &updated.IsBuiltin, &updated.CreatedAt, &updated.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("update role: %w", err)
	}
	json.Unmarshal(updatedPermsJSON, &updated.Permissions)
	return &updated, nil
}

// DeleteRole deletes a custom role. Built-in roles cannot be deleted.
func (s *Store) DeleteRole(ctx context.Context, id string) error {
	var isBuiltin bool
	err := s.pool.QueryRow(ctx, "SELECT is_builtin FROM roles WHERE id = $1", id).Scan(&isBuiltin)
	if err != nil {
		if err == pgx.ErrNoRows {
			return fmt.Errorf("role not found")
		}
		return err
	}
	if isBuiltin {
		return fmt.Errorf("cannot delete built-in role")
	}

	_, err = s.pool.Exec(ctx, "DELETE FROM roles WHERE id = $1", id)
	return err
}

// ListUsers returns users derived from user_roles + audit_events actor data.
func (s *Store) ListUsers(ctx context.Context) ([]UserWithRoles, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT ur.user_id,
		        COALESCE((SELECT actor_email FROM audit_events WHERE actor_id = ur.user_id AND actor_email IS NOT NULL ORDER BY timestamp DESC LIMIT 1), ''),
		        COALESCE((SELECT actor_name FROM audit_events WHERE actor_id = ur.user_id AND actor_name IS NOT NULL ORDER BY timestamp DESC LIMIT 1), ''),
		        COALESCE((SELECT timestamp FROM audit_events WHERE actor_id = ur.user_id ORDER BY timestamp DESC LIMIT 1), ur.assigned_at)
		 FROM user_roles ur
		 ORDER BY ur.user_id`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []UserWithRoles
	for rows.Next() {
		var u UserWithRoles
		if err := rows.Scan(&u.UserID, &u.Email, &u.Name, &u.LastActive); err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	// Fetch roles for each user
	for i, u := range users {
		roles, err := s.GetUserRoles(ctx, u.UserID)
		if err != nil {
			return nil, err
		}
		users[i].Roles = roles
	}

	if users == nil {
		users = []UserWithRoles{}
	}
	return users, nil
}

// GetUserRoles returns roles assigned to a user.
func (s *Store) GetUserRoles(ctx context.Context, userID string) ([]Role, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT r.id, r.name, COALESCE(r.description, ''), r.permissions, r.is_builtin, r.created_at, r.updated_at
		 FROM roles r
		 INNER JOIN user_roles ur ON r.id = ur.role_id
		 WHERE ur.user_id = $1
		 ORDER BY r.name`, userID)
	if err != nil {
		return nil, fmt.Errorf("get user roles: %w", err)
	}
	defer rows.Close()

	var roles []Role
	for rows.Next() {
		var r Role
		var permsJSON []byte
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &permsJSON, &r.IsBuiltin, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		json.Unmarshal(permsJSON, &r.Permissions)
		roles = append(roles, r)
	}
	if roles == nil {
		roles = []Role{}
	}
	return roles, nil
}

// SetUserRoles replaces all roles for a user.
func (s *Store) SetUserRoles(ctx context.Context, userID string, roleIDs []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Delete existing roles
	_, err = tx.Exec(ctx, "DELETE FROM user_roles WHERE user_id = $1", userID)
	if err != nil {
		return fmt.Errorf("delete existing roles: %w", err)
	}

	// Insert new roles
	for _, roleID := range roleIDs {
		_, err = tx.Exec(ctx, "INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)", userID, roleID)
		if err != nil {
			return fmt.Errorf("assign role %s: %w", roleID, err)
		}
	}

	return tx.Commit(ctx)
}

// HasPermission checks if a user has a specific permission.
func (s *Store) HasPermission(ctx context.Context, userID, resource, action string) (bool, error) {
	roles, err := s.GetUserRoles(ctx, userID)
	if err != nil {
		return false, err
	}

	for _, role := range roles {
		for _, perm := range role.Permissions {
			if perm.Resource == "*" || perm.Resource == resource {
				for _, a := range perm.Actions {
					if a == action || a == "*" {
						return true, nil
					}
				}
			}
		}
	}

	return false, nil
}
