package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// oidcConfig caches the OIDC discovery document.
type oidcConfig struct {
	JwksURI string `json:"jwks_uri"`
}

// jwksKey represents a JWK key from the JWKS endpoint.
type jwksKey struct {
	Kid string `json:"kid"`
	Kty string `json:"kty"`
	N   string `json:"n"`
	E   string `json:"e"`
	Alg string `json:"alg"`
}

type jwksResponse struct {
	Keys []jwksKey `json:"keys"`
}

var (
	oidcCache    *oidcConfig
	oidcCacheMu  sync.RWMutex
	jwksCache    *jwksResponse
	jwksCacheAt  time.Time
	jwksCacheTTL = 5 * time.Minute
)

// validateJWT validates a JWT token against the configured OIDC issuer.
func (fm *FlagManager) validateJWT(tokenString string) (Actor, error) {
	if fm.jwtIssuerURL == "" {
		return Actor{}, fmt.Errorf("JWT issuer URL not configured")
	}

	// Parse without verification first to get claims
	parser := jwt.NewParser(
		jwt.WithIssuer(fm.jwtIssuerURL),
		jwt.WithExpirationRequired(),
	)

	token, _, err := parser.ParseUnverified(tokenString, jwt.MapClaims{})
	if err != nil {
		return Actor{}, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return Actor{}, fmt.Errorf("invalid claims")
	}

	// Validate issuer
	iss, _ := claims.GetIssuer()
	if !strings.HasPrefix(iss, fm.jwtIssuerURL) {
		return Actor{}, fmt.Errorf("invalid issuer: %s", iss)
	}

	// Validate expiration
	exp, err := claims.GetExpirationTime()
	if err != nil || exp == nil {
		return Actor{}, fmt.Errorf("missing expiration")
	}
	if exp.Before(time.Now()) {
		return Actor{}, fmt.Errorf("token expired")
	}

	// Extract actor info from claims
	actor := Actor{Type: "user"}

	if sub, _ := claims.GetSubject(); sub != "" {
		actor.ID = sub
	}
	if email, ok := claims["email"].(string); ok {
		actor.Email = email
	}
	if name, ok := claims["name"].(string); ok {
		actor.Name = name
	}
	if preferredUsername, ok := claims["preferred_username"].(string); ok && actor.Name == "" {
		actor.Name = preferredUsername
	}

	return actor, nil
}

// fetchOIDCConfig fetches and caches the OIDC discovery document.
func fetchOIDCConfig(issuerURL string) (*oidcConfig, error) {
	oidcCacheMu.RLock()
	if oidcCache != nil {
		oidcCacheMu.RUnlock()
		return oidcCache, nil
	}
	oidcCacheMu.RUnlock()

	oidcCacheMu.Lock()
	defer oidcCacheMu.Unlock()

	// Double-check after acquiring write lock
	if oidcCache != nil {
		return oidcCache, nil
	}

	wellKnownURL := strings.TrimSuffix(issuerURL, "/") + "/.well-known/openid-configuration"
	resp, err := http.Get(wellKnownURL)
	if err != nil {
		return nil, fmt.Errorf("fetch OIDC config: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read OIDC config: %w", err)
	}

	var config oidcConfig
	if err := json.Unmarshal(body, &config); err != nil {
		return nil, fmt.Errorf("parse OIDC config: %w", err)
	}

	oidcCache = &config
	log.Printf("OIDC config loaded from %s", wellKnownURL)
	return &config, nil
}
