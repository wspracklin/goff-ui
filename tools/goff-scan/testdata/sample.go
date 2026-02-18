package main

import (
	"context"
	ffclient "github.com/thomaspoignant/go-feature-flag"
)

func example() {
	// ffclient style
	enabled, _ := ffclient.BoolVariation("dark-mode", nil, false)
	name, _ := ffclient.StringVariation("welcome-message", nil, "hello")
	count, _ := ffclient.IntVariation("max-items", nil, 10)
	rate, _ := ffclient.Float64Variation("sample-rate", nil, 0.5)
	data, _ := ffclient.JSONVariation("config-data", nil, nil)
	items, _ := ffclient.JSONArrayVariation("item-list", nil, nil)

	// OpenFeature Go SDK style
	ctx := context.Background()
	client.BooleanValue(ctx, "new-checkout", false, nil)
	client.StringValue(ctx, "banner-text", "default", nil)
	client.FloatValue(ctx, "timeout-seconds", 30.0, nil)
	client.IntValue(ctx, "retry-count", 3, nil)
	client.ObjectValue(ctx, "user-config", nil, nil)

	_ = enabled
	_ = name
	_ = count
	_ = rate
	_ = data
	_ = items
}
