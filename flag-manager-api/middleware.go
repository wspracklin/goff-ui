package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type contextKey string

const (
	ctxActor contextKey = "actor"
)

// Actor represents the authenticated user or API key making a request.
type Actor struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Type  string `json:"type"` // "user", "apikey", "system"
}

// GetActor extracts the actor from the request context.
func GetActor(r *http.Request) Actor {
	if actor, ok := r.Context().Value(ctxActor).(Actor); ok {
		return actor
	}
	return Actor{Type: "system", Name: "anonymous"}
}

// CORSMiddleware handles CORS with configurable allowed origins.
func CORSMiddleware(next http.Handler) http.Handler {
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigins == "" {
		allowedOrigins = "*"
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if allowedOrigins == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			origins := strings.Split(allowedOrigins, ",")
			for _, o := range origins {
				if strings.TrimSpace(o) == origin {
					w.Header().Set("Access-Control-Allow-Origin", origin)
					break
				}
			}
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RateLimitMiddleware applies per-IP rate limiting.
func RateLimitMiddleware(next http.Handler) http.Handler {
	type client struct {
		limiter  *rate.Limiter
		lastSeen time.Time
	}

	var (
		mu      sync.Mutex
		clients = make(map[string]*client)
	)

	// Cleanup stale entries every minute
	go func() {
		for {
			time.Sleep(time.Minute)
			mu.Lock()
			for ip, c := range clients {
				if time.Since(c.lastSeen) > 3*time.Minute {
					delete(clients, ip)
				}
			}
			mu.Unlock()
		}
	}()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := r.RemoteAddr
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			ip = strings.Split(forwarded, ",")[0]
		}

		mu.Lock()
		c, exists := clients[ip]
		if !exists {
			c = &client{
				limiter: rate.NewLimiter(rate.Every(time.Second), 100), // 100 req/s burst
			}
			clients[ip] = c
		}
		c.lastSeen = time.Now()
		mu.Unlock()

		if !c.limiter.Allow() {
			http.Error(w, `{"error":"rate limit exceeded","code":"RATE_LIMITED"}`, http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// AuthMiddleware validates JWT tokens or API keys when AUTH_ENABLED=true.
func (fm *FlagManager) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !fm.authEnabled {
			// Auth disabled - set anonymous actor
			ctx := context.WithValue(r.Context(), ctxActor, Actor{
				Type: "system",
				Name: "anonymous",
			})
			next.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		// Try JWT Bearer token first
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			actor, err := fm.validateJWT(token)
			if err == nil {
				ctx := context.WithValue(r.Context(), ctxActor, actor)
				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			log.Printf("JWT validation failed: %v", err)
		}

		// Try API key
		apiKey := r.Header.Get("X-API-Key")
		if apiKey != "" {
			if fm.store != nil {
				key, err := fm.store.ValidateAPIKey(r.Context(), apiKey)
				if err == nil {
					ctx := context.WithValue(r.Context(), ctxActor, Actor{
						ID:   key.ID,
						Name: key.Name,
						Type: "apikey",
					})
					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		http.Error(w, `{"error":"unauthorized","code":"UNAUTHORIZED"}`, http.StatusUnauthorized)
	})
}

// BodySizeLimitMiddleware limits request body size.
func BodySizeLimitMiddleware(maxBytes int64) func(http.Handler) http.Handler {
	if maxBytes <= 0 {
		maxBytes = 1 << 20 // 1MB default
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}

// LoggingMiddleware logs HTTP requests.
func LoggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}
