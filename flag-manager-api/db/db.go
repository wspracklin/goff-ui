package db

import (
	"context"
	"embed"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store provides access to all database operations.
type Store struct {
	pool *pgxpool.Pool
}

// PaginationParams holds common pagination parameters.
type PaginationParams struct {
	Page     int
	PageSize int
	Sort     string
	Order    string // "asc" or "desc"
	Search   string
}

// PaginatedResult wraps a paginated response.
type PaginatedResult[T any] struct {
	Data       []T `json:"data"`
	Total      int `json:"total"`
	Page       int `json:"page"`
	PageSize   int `json:"pageSize"`
	TotalPages int `json:"totalPages"`
}

// NewStore creates a new database store with connection pool.
func NewStore(databaseURL string) (*Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database URL: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 2
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	log.Println("Connected to PostgreSQL")

	store := &Store{pool: pool}
	if err := store.runMigrations(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return store, nil
}

// Close closes the database connection pool.
func (s *Store) Close() {
	s.pool.Close()
}

// Pool returns the underlying connection pool for advanced usage.
func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

// runMigrations executes all pending SQL migration files in order.
func (s *Store) runMigrations(ctx context.Context) error {
	// Ensure schema_migrations table exists
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version INT PRIMARY KEY,
			applied_at TIMESTAMPTZ DEFAULT now()
		)
	`)
	if err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	// Get already-applied versions
	rows, err := s.pool.Query(ctx, "SELECT version FROM schema_migrations ORDER BY version")
	if err != nil {
		return fmt.Errorf("query migrations: %w", err)
	}
	defer rows.Close()

	applied := make(map[int]bool)
	for rows.Next() {
		var v int
		if err := rows.Scan(&v); err != nil {
			return err
		}
		applied[v] = true
	}

	// Read migration files
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	type migration struct {
		version int
		name    string
	}

	var migrations []migration
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".sql") {
			continue
		}
		// Extract version number from filename like "001_initial_schema.sql"
		parts := strings.SplitN(entry.Name(), "_", 2)
		if len(parts) < 2 {
			continue
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			continue
		}
		migrations = append(migrations, migration{version: version, name: entry.Name()})
	}

	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].version < migrations[j].version
	})

	for _, m := range migrations {
		if applied[m.version] {
			continue
		}

		data, err := migrationsFS.ReadFile("migrations/" + m.name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", m.name, err)
		}

		log.Printf("Applying migration %03d: %s", m.version, m.name)
		if _, err := s.pool.Exec(ctx, string(data)); err != nil {
			return fmt.Errorf("apply migration %s: %w", m.name, err)
		}

		if _, err := s.pool.Exec(ctx, "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING", m.version); err != nil {
			return fmt.Errorf("record migration %s: %w", m.name, err)
		}
	}

	log.Println("Database migrations complete")
	return nil
}

// DefaultPagination returns sensible defaults for pagination.
func DefaultPagination() PaginationParams {
	return PaginationParams{
		Page:     1,
		PageSize: 50,
		Sort:     "created_at",
		Order:    "desc",
	}
}

// Offset returns the SQL OFFSET value.
func (p PaginationParams) Offset() int {
	if p.Page < 1 {
		p.Page = 1
	}
	return (p.Page - 1) * p.PageSize
}

// Limit returns the SQL LIMIT value.
func (p PaginationParams) Limit() int {
	if p.PageSize < 1 {
		return 50
	}
	if p.PageSize > 200 {
		return 200
	}
	return p.PageSize
}

// TotalPages calculates total pages from total count.
func TotalPages(total, pageSize int) int {
	if pageSize <= 0 {
		return 0
	}
	pages := total / pageSize
	if total%pageSize > 0 {
		pages++
	}
	return pages
}

// OrderDirection returns a safe SQL order direction.
func (p PaginationParams) OrderDirection() string {
	if strings.ToLower(p.Order) == "asc" {
		return "ASC"
	}
	return "DESC"
}
