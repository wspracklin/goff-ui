package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func main() {
	project := flag.String("project", "", "Project name for discovered flags (default: directory basename)")
	output := flag.String("output", "", "Output file path (default: stdout)")
	format := flag.String("format", "yaml", "Output format: yaml or json")
	excludeStr := flag.String("exclude", "node_modules,vendor,.git,dist,build", "Comma-separated exclude globs")
	version := flag.String("version", "", "App version to embed in manifest")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: goff-scan [flags] <directory>\n\nScans source code for feature flag evaluation calls and produces a manifest.\n\nFlags:\n")
		flag.PrintDefaults()
	}
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(1)
	}
	dir := args[0]

	// Resolve absolute path for reliable basename
	absDir, err := filepath.Abs(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	projectName := *project
	if projectName == "" {
		projectName = filepath.Base(absDir)
	}

	excludes := strings.Split(*excludeStr, ",")
	for i := range excludes {
		excludes[i] = strings.TrimSpace(excludes[i])
	}

	scanner := NewScanner(excludes)
	flags, err := scanner.Scan(dir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error scanning: %v\n", err)
		os.Exit(1)
	}

	manifest := NewManifest(projectName, projectName, *version, flags)

	var data []byte
	switch *format {
	case "json":
		data, err = manifest.ToJSON()
	case "yaml":
		data, err = manifest.ToYAML()
	default:
		fmt.Fprintf(os.Stderr, "Error: unsupported format %q (use yaml or json)\n", *format)
		os.Exit(1)
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error serializing: %v\n", err)
		os.Exit(1)
	}

	if *output != "" {
		if err := os.WriteFile(*output, data, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error writing %s: %v\n", *output, err)
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Wrote %d flags to %s\n", len(flags), *output)
	} else {
		os.Stdout.Write(data)
	}
}
