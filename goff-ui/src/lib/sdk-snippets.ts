// SDK Code Snippet Configuration

export type SDKLanguage =
  // Server SDKs
  | 'go'
  | 'java'
  | 'dotnet'
  | 'python'
  | 'node'
  | 'php'
  | 'ruby'
  // Client SDKs
  | 'javascript'
  | 'react'
  | 'swift'
  | 'kotlin';

export type SDKType = 'server' | 'client';

export interface SDKInfo {
  id: SDKLanguage;
  name: string;
  type: SDKType;
  icon: string;
  installCmd: string;
  fileExtension: string;
}

export const SDK_INFO: Record<SDKLanguage, SDKInfo> = {
  // Server SDKs
  go: {
    id: 'go',
    name: 'Go',
    type: 'server',
    icon: 'go',
    installCmd: 'go get github.com/open-feature/go-sdk github.com/open-feature/go-sdk-contrib/providers/go-feature-flag',
    fileExtension: 'go',
  },
  java: {
    id: 'java',
    name: 'Java',
    type: 'server',
    icon: 'java',
    installCmd: 'implementation "dev.openfeature.contrib.providers:go-feature-flag:0.4.3"',
    fileExtension: 'java',
  },
  dotnet: {
    id: 'dotnet',
    name: '.NET',
    type: 'server',
    icon: 'csharp',
    installCmd: 'dotnet add package OpenFeature.Contrib.GOFeatureFlag',
    fileExtension: 'cs',
  },
  python: {
    id: 'python',
    name: 'Python',
    type: 'server',
    icon: 'python',
    installCmd: 'pip install gofeatureflag-python-provider',
    fileExtension: 'py',
  },
  node: {
    id: 'node',
    name: 'Node.js',
    type: 'server',
    icon: 'nodejs',
    installCmd: 'npm install @openfeature/server-sdk @openfeature/go-feature-flag-provider',
    fileExtension: 'ts',
  },
  php: {
    id: 'php',
    name: 'PHP',
    type: 'server',
    icon: 'php',
    installCmd: 'composer require open-feature/go-feature-flag-provider',
    fileExtension: 'php',
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby',
    type: 'server',
    icon: 'ruby',
    installCmd: 'gem install openfeature-go-feature-flag-provider',
    fileExtension: 'rb',
  },
  // Client SDKs
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    type: 'client',
    icon: 'javascript',
    installCmd: 'npm install @openfeature/web-sdk @openfeature/go-feature-flag-web-provider',
    fileExtension: 'ts',
  },
  react: {
    id: 'react',
    name: 'React',
    type: 'client',
    icon: 'react',
    installCmd: 'npm install @openfeature/react-sdk @openfeature/go-feature-flag-web-provider',
    fileExtension: 'tsx',
  },
  swift: {
    id: 'swift',
    name: 'Swift',
    type: 'client',
    icon: 'swift',
    installCmd: '// Add via Swift Package Manager from GitHub releases',
    fileExtension: 'swift',
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin',
    type: 'client',
    icon: 'kotlin',
    installCmd: 'implementation "org.gofeatureflag.openfeature:gofeatureflag-kotlin-provider:latest"',
    fileExtension: 'kt',
  },
};

export interface GenerateSnippetOptions {
  flagKey: string;
  flagType: 'boolean' | 'string' | 'number' | 'json';
  defaultValue: string;
  relayProxyUrl: string;
}

export function generateCodeSnippet(
  language: SDKLanguage,
  options: GenerateSnippetOptions
): string {
  const { flagKey, flagType, defaultValue, relayProxyUrl } = options;

  switch (language) {
    case 'go':
      return generateGoSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'java':
      return generateJavaSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'dotnet':
      return generateDotNetSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'python':
      return generatePythonSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'node':
      return generateNodeSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'php':
      return generatePhpSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'ruby':
      return generateRubySnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'javascript':
      return generateJavaScriptSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'react':
      return generateReactSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'swift':
      return generateSwiftSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    case 'kotlin':
      return generateKotlinSnippet(flagKey, flagType, defaultValue, relayProxyUrl);
    default:
      return '// Code snippet not available';
  }
}

function generateGoSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'BoolValue',
    string: 'StringValue',
    number: 'Float64Value',
    json: 'ObjectValue',
  };
  const method = methodMap[flagType] || 'BoolValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `package main

import (
	"context"
	gofeatureflag "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag/pkg"
	of "github.com/open-feature/go-sdk/openfeature"
)

func main() {
	// Initialize the provider
	provider, _ := gofeatureflag.NewProvider(gofeatureflag.ProviderOptions{
		Endpoint: "${relayProxyUrl}",
	})
	of.SetProvider(provider)
	client := of.NewClient("my-app")

	// Create evaluation context
	ctx := of.NewEvaluationContext(
		"user-123",
		map[string]interface{}{
			"email": "user@example.com",
			"plan":  "premium",
		},
	)

	// Evaluate the flag
	value, _ := client.${method}(context.TODO(), "${flagKey}", ${defaultVal}, ctx)

	// Use the flag value
	if value {
		// Feature is enabled
	}
}`;
}

function generateJavaSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getDoubleValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `import dev.openfeature.contrib.providers.gofeatureflag.*;
import dev.openfeature.sdk.*;

public class FeatureFlags {
    public static void main(String[] args) {
        // Initialize the provider
        FeatureProvider provider = new GoFeatureFlagProvider(
            GoFeatureFlagProviderOptions.builder()
                .endpoint("${relayProxyUrl}")
                .build()
        );
        OpenFeatureAPI.getInstance().setProviderAndWait(provider);
        Client client = OpenFeatureAPI.getInstance().getClient("my-app");

        // Create evaluation context
        EvaluationContext ctx = new MutableContext("user-123")
            .add("email", "user@example.com")
            .add("plan", "premium");

        // Evaluate the flag
        ${flagType === 'boolean' ? 'Boolean' : flagType === 'string' ? 'String' : 'Double'} value = client.${method}(
            "${flagKey}",
            ${defaultVal},
            ctx
        );

        // Use the flag value
        if (value) {
            // Feature is enabled
        }
    }
}`;
}

function generateDotNetSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'GetBooleanValueAsync',
    string: 'GetStringValueAsync',
    number: 'GetDoubleValueAsync',
    json: 'GetObjectValueAsync',
  };
  const method = methodMap[flagType] || 'GetBooleanValueAsync';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `using OpenFeature;
using OpenFeature.Contrib.GOFeatureFlag;

// Initialize the provider
var provider = new GoFeatureFlagProvider(new GoFeatureFlagProviderOptions
{
    Endpoint = "${relayProxyUrl}"
});
await Api.Instance.SetProviderAsync(provider);
var client = Api.Instance.GetClient("my-app");

// Create evaluation context
var ctx = EvaluationContext.Builder()
    .Set("targetingKey", "user-123")
    .Set("email", "user@example.com")
    .Set("plan", "premium")
    .Build();

// Evaluate the flag
var value = await client.${method}("${flagKey}", ${defaultVal}, ctx);

// Use the flag value
if (value)
{
    // Feature is enabled
}`;
}

function generatePythonSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'get_boolean_value',
    string: 'get_string_value',
    number: 'get_float_value',
    json: 'get_object_value',
  };
  const method = methodMap[flagType] || 'get_boolean_value';
  const defaultVal = flagType === 'boolean' ? (defaultValue === 'true' ? 'True' : 'False') : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `from gofeatureflag_python_provider.provider import GoFeatureFlagProvider
from gofeatureflag_python_provider.options import GoFeatureFlagOptions
from openfeature import api
from openfeature.evaluation_context import EvaluationContext

# Initialize the provider
provider = GoFeatureFlagProvider(
    options=GoFeatureFlagOptions(endpoint="${relayProxyUrl}")
)
api.set_provider(provider)
client = api.get_client("my-app")

# Create evaluation context
ctx = EvaluationContext(
    targeting_key="user-123",
    attributes={
        "email": "user@example.com",
        "plan": "premium",
    },
)

# Evaluate the flag
value = client.${method}(
    flag_key="${flagKey}",
    default_value=${defaultVal},
    evaluation_context=ctx,
)

# Use the flag value
if value:
    # Feature is enabled
    pass`;
}

function generateNodeSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getNumberValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `'${defaultValue}'` : defaultValue;

  return `import { OpenFeature } from '@openfeature/server-sdk';
import { GoFeatureFlagProvider } from '@openfeature/go-feature-flag-provider';

// Initialize the provider
const provider = new GoFeatureFlagProvider({
  endpoint: '${relayProxyUrl}',
});
OpenFeature.setProvider(provider);
const client = OpenFeature.getClient('my-app');

// Create evaluation context
const ctx = {
  targetingKey: 'user-123',
  email: 'user@example.com',
  plan: 'premium',
};

// Evaluate the flag
const value = await client.${method}('${flagKey}', ${defaultVal}, ctx);

// Use the flag value
if (value) {
  // Feature is enabled
}`;
}

function generatePhpSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getFloatValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `'${defaultValue}'` : defaultValue;

  return `<?php
use OpenFeature\\OpenFeatureAPI;
use OpenFeature\\Providers\\GoFeatureFlag\\GoFeatureFlagProvider;
use OpenFeature\\implementation\\flags\\MutableEvaluationContext;

// Initialize the provider
$provider = new GoFeatureFlagProvider([
    'endpoint' => '${relayProxyUrl}',
]);
$api = OpenFeatureAPI::getInstance();
$api->setProvider($provider);
$client = $api->getClient('my-app');

// Create evaluation context
$ctx = new MutableEvaluationContext('user-123', [
    'email' => 'user@example.com',
    'plan' => 'premium',
]);

// Evaluate the flag
$value = $client->${method}('${flagKey}', ${defaultVal}, $ctx);

// Use the flag value
if ($value) {
    // Feature is enabled
}`;
}

function generateRubySnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'fetch_boolean_value',
    string: 'fetch_string_value',
    number: 'fetch_number_value',
    json: 'fetch_object_value',
  };
  const method = methodMap[flagType] || 'fetch_boolean_value';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `'${defaultValue}'` : defaultValue;

  return `require 'openfeature/sdk'
require 'openfeature/go-feature-flag-provider'

# Initialize the provider
provider = OpenFeature::GoFeatureFlag::Provider.new(
  endpoint: '${relayProxyUrl}'
)
OpenFeature::SDK.configure do |config|
  config.set_provider(provider)
end
client = OpenFeature::SDK.build_client(name: 'my-app')

# Create evaluation context
ctx = OpenFeature::SDK::EvaluationContext.new(
  targeting_key: 'user-123',
  email: 'user@example.com',
  plan: 'premium'
)

# Evaluate the flag
value = client.${method}(
  flag_key: '${flagKey}',
  default_value: ${defaultVal},
  evaluation_context: ctx
)

# Use the flag value
if value
  # Feature is enabled
end`;
}

function generateJavaScriptSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getNumberValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `'${defaultValue}'` : defaultValue;

  return `import { OpenFeature } from '@openfeature/web-sdk';
import { GoFeatureFlagWebProvider } from '@openfeature/go-feature-flag-web-provider';

// Initialize the provider
const provider = new GoFeatureFlagWebProvider({
  endpoint: '${relayProxyUrl}',
});

// Set evaluation context (user info)
await OpenFeature.setContext({
  targetingKey: 'user-123',
  email: 'user@example.com',
  plan: 'premium',
});

OpenFeature.setProvider(provider);
const client = OpenFeature.getClient('my-app');

// Evaluate the flag
const value = client.${method}('${flagKey}', ${defaultVal});

// Use the flag value
if (value) {
  // Feature is enabled
}`;
}

function generateReactSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const hookMap: Record<string, string> = {
    boolean: 'useBooleanFlagValue',
    string: 'useStringFlagValue',
    number: 'useNumberFlagValue',
    json: 'useObjectFlagValue',
  };
  const hook = hookMap[flagType] || 'useBooleanFlagValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `'${defaultValue}'` : defaultValue;

  return `import { OpenFeatureProvider, ${hook} } from '@openfeature/react-sdk';
import { GoFeatureFlagWebProvider } from '@openfeature/go-feature-flag-web-provider';

// Initialize the provider (do this once in your app)
const provider = new GoFeatureFlagWebProvider({
  endpoint: '${relayProxyUrl}',
});

// Wrap your app with OpenFeatureProvider
function App() {
  return (
    <OpenFeatureProvider
      provider={provider}
      context={{
        targetingKey: 'user-123',
        email: 'user@example.com',
        plan: 'premium',
      }}
    >
      <MyComponent />
    </OpenFeatureProvider>
  );
}

// Use the flag in your component
function MyComponent() {
  const { value, isLoading } = ${hook}('${flagKey}', ${defaultVal});

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {value ? (
        <div>Feature is enabled!</div>
      ) : (
        <div>Feature is disabled</div>
      )}
    </div>
  );
}`;
}

function generateSwiftSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getDoubleValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `import OpenFeature
import GOFeatureFlagProvider

// Initialize the provider
let provider = GoFeatureFlagProvider(
    options: GoFeatureFlagProviderOptions(endpoint: "${relayProxyUrl}")
)

// Set evaluation context
let ctx = MutableContext(targetingKey: "user-123")
ctx.add(key: "email", value: .string("user@example.com"))
ctx.add(key: "plan", value: .string("premium"))

await OpenFeatureAPI.shared.setProviderAndWait(provider: provider, initialContext: ctx)
let client = OpenFeatureAPI.shared.getClient()

// Evaluate the flag
let value = client.${method}(key: "${flagKey}", defaultValue: ${defaultVal})

// Use the flag value
if value {
    // Feature is enabled
}`;
}

function generateKotlinSnippet(flagKey: string, flagType: string, defaultValue: string, relayProxyUrl: string): string {
  const methodMap: Record<string, string> = {
    boolean: 'getBooleanValue',
    string: 'getStringValue',
    number: 'getDoubleValue',
    json: 'getObjectValue',
  };
  const method = methodMap[flagType] || 'getBooleanValue';
  const defaultVal = flagType === 'boolean' ? defaultValue : flagType === 'string' ? `"${defaultValue}"` : defaultValue;

  return `import org.gofeatureflag.openfeature.GoFeatureFlagProvider
import dev.openfeature.sdk.OpenFeatureAPI
import dev.openfeature.sdk.MutableContext

// Initialize the provider
val provider = GoFeatureFlagProvider(
    options = GoFeatureFlagOptions(endpoint = "${relayProxyUrl}")
)
OpenFeatureAPI.setProvider(provider)
val client = OpenFeatureAPI.getClient("my-app")

// Create evaluation context
val ctx = MutableContext("user-123").apply {
    add("email", "user@example.com")
    add("plan", "premium")
}

// Evaluate the flag
val value = client.${method}("${flagKey}", ${defaultVal}, ctx)

// Use the flag value
if (value) {
    // Feature is enabled
}`;
}

// Default enabled SDKs
export const DEFAULT_ENABLED_SDKS: SDKLanguage[] = [
  'node',
  'go',
  'python',
  'java',
  'javascript',
  'react',
];
