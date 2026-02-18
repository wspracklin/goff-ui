package main

import (
	"bufio"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

// scannableExtensions lists file extensions that should be scanned.
var scannableExtensions = map[string]bool{
	".go":    true,
	".js":    true,
	".jsx":   true,
	".ts":    true,
	".tsx":   true,
	".py":    true,
	".java":  true,
	".kt":    true,
	".swift": true,
	".cs":    true,
	".rb":    true,
	".php":   true,
}

// Scanner walks a directory tree looking for feature flag evaluation calls.
type Scanner struct {
	patterns []FlagPattern
	excludes []string
}

// NewScanner creates a Scanner with the given exclude globs.
func NewScanner(excludes []string) *Scanner {
	return &Scanner{
		patterns: allPatterns(),
		excludes: excludes,
	}
}

// Scan walks the directory and returns all discovered flags, deduplicated by key.
func (s *Scanner) Scan(root string) ([]DiscoveredFlag, error) {
	seen := make(map[string]DiscoveredFlag)

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Get the path relative to root for readable source references
		relPath, _ := filepath.Rel(root, path)
		relPath = filepath.ToSlash(relPath)

		if d.IsDir() {
			if s.shouldExclude(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		if !scannableExtensions[ext] {
			return nil
		}

		if s.shouldExclude(d.Name()) {
			return nil
		}

		return s.scanFile(path, relPath, seen)
	})
	if err != nil {
		return nil, err
	}

	// Convert map to sorted slice (order by key for stable output)
	flags := make([]DiscoveredFlag, 0, len(seen))
	for _, f := range seen {
		flags = append(flags, f)
	}
	sortFlags(flags)
	return flags, nil
}

// shouldExclude checks if a name matches any exclude glob.
func (s *Scanner) shouldExclude(name string) bool {
	for _, pattern := range s.excludes {
		if matched, _ := filepath.Match(pattern, name); matched {
			return true
		}
	}
	return false
}

// scanFile reads a file line-by-line and tests every pattern against each line.
func (s *Scanner) scanFile(path, relPath string, seen map[string]DiscoveredFlag) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		for _, p := range s.patterns {
			matches := p.Regex.FindAllStringSubmatch(line, -1)
			for _, m := range matches {
				if len(m) < 2 {
					continue
				}
				key := m[1]
				if _, exists := seen[key]; !exists {
					seen[key] = DiscoveredFlag{
						Key:    key,
						Type:   p.Type,
						Source: fmt.Sprintf("%s:%d", relPath, lineNum),
					}
				}
			}
		}
	}
	return scanner.Err()
}

// sortFlags sorts flags by key alphabetically.
func sortFlags(flags []DiscoveredFlag) {
	for i := 1; i < len(flags); i++ {
		for j := i; j > 0 && flags[j].Key < flags[j-1].Key; j-- {
			flags[j], flags[j-1] = flags[j-1], flags[j]
		}
	}
}
