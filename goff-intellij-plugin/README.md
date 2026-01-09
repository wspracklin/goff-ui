# GO Feature Flag IntelliJ Plugin

A WebStorm/IntelliJ IDEA plugin for [GO Feature Flag](https://gofeatureflag.org) that allows developers to easily add and use feature flags directly from their IDE.

## Features

- **Insert Flag Checks**: Right-click in your code editor to insert feature flag checks with proper if/else or switch statements
- **Wrap Code with Flags**: Select code and wrap it with a feature flag check
- **Create New Flags**: Create new feature flags directly from the IDE
- **Auto-Import**: Automatically adds the required import statements for the OpenFeature SDK
- **Multi-Language Support**: Works with all languages supported by GO Feature Flag

## Supported Languages

| Language | SDK |
|----------|-----|
| Go | `github.com/open-feature/go-sdk` |
| JavaScript/TypeScript | `@openfeature/web-sdk` |
| Python | `openfeature-sdk` |
| Java | `dev.openfeature.sdk` |
| Kotlin | `dev.openfeature.sdk` |
| C# | `OpenFeature` |
| Rust | `open-feature` |
| PHP | `open-feature/sdk` |
| Ruby | `openfeature-sdk` |
| Swift | `OpenFeature` |
| Dart/Flutter | `openfeature` |

## Installation

### From JetBrains Marketplace

1. Open WebStorm/IntelliJ IDEA
2. Go to **Settings** > **Plugins** > **Marketplace**
3. Search for "GO Feature Flag"
4. Click **Install**

### Manual Installation

1. Download the plugin ZIP from the releases page
2. Go to **Settings** > **Plugins** > **⚙️** > **Install Plugin from Disk**
3. Select the downloaded ZIP file

## Configuration

1. Go to **Settings** > **Tools** > **GO Feature Flag**
2. Configure the following:
   - **API URL**: URL of your GO Feature Flag management API (e.g., `http://localhost:4000`)
   - **API Key**: Optional API key for authentication
   - **Default Flag Set**: Default flag set to use when creating flags
   - **Auto-import**: Enable/disable automatic import statement insertion
   - **Show Notifications**: Enable/disable balloon notifications

## Usage

### Insert a Flag Check

1. Place your cursor where you want to insert the flag check
2. Right-click and select **GO Feature Flag** > **Insert Flag Check**
3. Select a flag from the dialog
4. Choose your options (include else, add import, etc.)
5. Click **OK**

The plugin will insert code like this:

**JavaScript/TypeScript:**
```javascript
const myFeatureValue = await client.getBooleanValue('my-feature', false);

if (myFeatureValue) {
  // Flag is enabled
} else {
  // Flag is disabled
}
```

**Go:**
```go
myFeatureValue, err := client.BooleanValue(ctx, "my-feature", false, openfeature.EvaluationContext{})
if err != nil {
    log.Printf("Error evaluating flag my-feature: %v", err)
}

if myFeatureValue {
    // Flag is enabled
} else {
    // Flag is disabled
}
```

**Python:**
```python
my_feature_value = client.get_boolean_value('my-feature', False)

if my_feature_value:
    # Flag is enabled
    pass
else:
    # Flag is disabled
    pass
```

### Wrap Selected Code

1. Select the code you want to wrap with a flag check
2. Right-click and select **GO Feature Flag** > **Wrap Selection with Flag Check**
3. Select a flag and options
4. Click **OK**

### Create a New Flag

1. Right-click in the editor (or use **Tools** menu)
2. Select **GO Feature Flag** > **Create New Flag...**
3. Fill in the flag details:
   - Flag key
   - Variation type (Boolean, String, Number, JSON)
   - Description
   - Options (track events, start disabled)
4. Click **OK**

The flag will be created in your GO Feature Flag instance and optionally inserted at the cursor position.

### View All Flags

1. Go to **Tools** > **GO Feature Flag** > **View All Flags**
2. Select a flag set to see all available flags

## Code Generation Examples

### Boolean Flags

Generates simple if/else:

```typescript
if (flagValue) {
  // enabled
} else {
  // disabled
}
```

### String/Number Flags (Switch)

```typescript
switch (flagValue) {
  case 'variant-a':
    // Handle variant A
    break;
  case 'variant-b':
    // Handle variant B
    break;
  default:
    // Handle default
}
```

### String/Number Flags (If/Else If Chain)

```typescript
if (flagValue === 'variant-a') {
  // Handle variant A
} else if (flagValue === 'variant-b') {
  // Handle variant B
} else {
  // Handle default
}
```

## Building from Source

```bash
# Clone the repository
git clone https://github.com/your-org/goff-intellij-plugin.git
cd goff-intellij-plugin

# Build the plugin
./gradlew buildPlugin

# Run in a sandbox IDE for testing
./gradlew runIde
```

## Requirements

- IntelliJ IDEA 2023.3+ or WebStorm 2023.3+
- GO Feature Flag management API running

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.

## License

MIT License - see LICENSE file for details.

## Links

- [GO Feature Flag](https://gofeatureflag.org)
- [OpenFeature](https://openfeature.dev)
- [JetBrains Plugin Development](https://plugins.jetbrains.com/docs/intellij/welcome.html)
