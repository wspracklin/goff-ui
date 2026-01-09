package com.gofeatureflag.intellij.codegen

import com.gofeatureflag.intellij.model.CodeGenerationOptions
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.model.VariationType

/**
 * Generates feature flag code for different programming languages.
 */
object CodeGenerator {

    /**
     * Generate the flag check code based on options.
     */
    fun generate(options: CodeGenerationOptions): GeneratedCode {
        val generator = getLanguageGenerator(options.language)
        return generator.generate(options)
    }

    /**
     * Get the import statement for a language.
     */
    fun getImportStatement(language: SupportedLanguage): String {
        return language.importStatement
    }

    private fun getLanguageGenerator(language: SupportedLanguage): LanguageCodeGenerator {
        return when (language) {
            SupportedLanguage.GO -> GoCodeGenerator()
            SupportedLanguage.JAVASCRIPT, SupportedLanguage.TYPESCRIPT -> JavaScriptCodeGenerator()
            SupportedLanguage.PYTHON -> PythonCodeGenerator()
            SupportedLanguage.JAVA -> JavaCodeGenerator()
            SupportedLanguage.KOTLIN -> KotlinCodeGenerator()
            SupportedLanguage.CSHARP -> CSharpCodeGenerator()
            SupportedLanguage.RUST -> RustCodeGenerator()
            SupportedLanguage.PHP -> PhpCodeGenerator()
            SupportedLanguage.RUBY -> RubyCodeGenerator()
            SupportedLanguage.SWIFT -> SwiftCodeGenerator()
            SupportedLanguage.DART -> DartCodeGenerator()
        }
    }
}

/**
 * Result of code generation.
 */
data class GeneratedCode(
    val code: String,
    val importStatement: String?,
    val cursorOffset: Int = 0 // Offset from start where cursor should be placed
)

/**
 * Interface for language-specific code generators.
 */
interface LanguageCodeGenerator {
    fun generate(options: CodeGenerationOptions): GeneratedCode
    fun getClientVariableName(): String = "client"
    fun getContextVariableName(): String = "ctx"
}

/**
 * Go code generator.
 */
class GoCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "\t"
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("provider, err := gofeatureflag.NewProvider(gofeatureflag.ProviderOptions{")
            appendLine("${indent}Endpoint: \"${options.relayProxyUrl}\",")
            appendLine("})")
            appendLine("if err != nil {")
            appendLine("${indent}log.Fatal(err)")
            appendLine("}")
            appendLine("openfeature.SetProvider(provider)")
            appendLine("client := openfeature.NewClient(\"my-app\")")
            appendLine("ctx := context.Background()")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("evalCtx := openfeature.NewEvaluationContext(")
                appendLine("${indent}\"user-123\", // targetingKey - unique identifier for the user")
                appendLine("${indent}map[string]interface{}{")
                appendLine("${indent}${indent}\"email\": \"user@example.com\",")
                appendLine("${indent}${indent}\"plan\": \"premium\",")
                appendLine("${indent}${indent}// Add attributes used in your targeting rules")
                appendLine("${indent}},")
                appendLine(")")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("${varName}Value, err := client.$evalMethod(ctx, \"$flagKey\", $defaultValue, evalCtx)")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("${varName}Value, err := client.$evalMethod(ctx, \"$flagKey\", $defaultValue, openfeature.EvaluationContext{})")
            }
            appendLine("if err != nil {")
            appendLine("${indent}log.Printf(\"Error evaluating flag $flagKey: %v\", err)")
            appendLine("}")
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if ${varName}Value {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                appendLine("} else {")
                appendLine("$indent// Flag is disabled")
                appendLine("}")
            } else {
                appendLine("switch ${varName}Value {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("case $caseValue:")
                    appendLine("$indent// Handle $name")
                }
                appendLine("default:")
                appendLine("$indent// Handle default case")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = """import (
${indent}"context"
${indent}"log"
${indent}"github.com/open-feature/go-sdk/openfeature"
${indent}gofeatureflag "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag/pkg"
)"""
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "BooleanValue"
        VariationType.STRING -> "StringValue"
        VariationType.NUMBER -> "FloatValue"
        VariationType.JSON -> "ObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "nil"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "\"$value\""
        else -> "\"$value\""
    }
}

/**
 * JavaScript/TypeScript code generator.
 */
class JavaScriptCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "  "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("const goFeatureFlagProvider = new GoFeatureFlagProvider({")
            appendLine("${indent}endpoint: '${options.relayProxyUrl}',")
            appendLine("});")
            appendLine("await OpenFeature.setProviderAndWait(goFeatureFlagProvider);")
            appendLine("const client = OpenFeature.getClient();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("const evaluationContext = {")
                appendLine("${indent}targetingKey: 'user-123', // Unique identifier for the user")
                appendLine("${indent}email: 'user@example.com',")
                appendLine("${indent}plan: 'premium',")
                appendLine("${indent}// Add attributes used in your targeting rules")
                appendLine("};")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("const ${flagKey.toCamelCase()}Value = await client.$evalMethod('$flagKey', $defaultValue, evaluationContext);")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("const ${flagKey.toCamelCase()}Value = await client.$evalMethod('$flagKey', $defaultValue);")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (${flagKey.toCamelCase()}Value) {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else {
                appendLine("switch (${flagKey.toCamelCase()}Value) {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("${indent}case $caseValue:")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent${indent}break;")
                }
                appendLine("${indent}default:")
                appendLine("$indent$indent// Handle default case")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = "import { OpenFeature } from '@openfeature/web-sdk';\nimport { GoFeatureFlagProvider } from '@openfeature/go-feature-flag-provider';"
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getNumberValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "''"
        VariationType.NUMBER -> "0"
        VariationType.JSON -> "{}"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "'$value'"
        else -> "'$value'"
    }
}

/**
 * Python code generator.
 */
class PythonCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toSnakeCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("# Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("from gofeatureflag_python_provider import GoFeatureFlagProvider")
            appendLine("from openfeature import api as openfeature")
            appendLine("from openfeature.evaluation_context import EvaluationContext")
            appendLine()
            appendLine("provider = GoFeatureFlagProvider(")
            appendLine("${indent}endpoint=\"${options.relayProxyUrl}\"")
            appendLine(")")
            appendLine("openfeature.set_provider(provider)")
            appendLine("client = openfeature.get_client()")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("# $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("# Evaluation context - customize with your user's attributes for targeting")
                appendLine("evaluation_context = EvaluationContext(")
                appendLine("${indent}targeting_key=\"user-123\",  # Unique identifier for the user")
                appendLine("${indent}attributes={")
                appendLine("${indent}${indent}\"email\": \"user@example.com\",")
                appendLine("${indent}${indent}\"plan\": \"premium\",")
                appendLine("${indent}${indent}# Add attributes used in your targeting rules")
                appendLine("${indent}}")
                appendLine(")")
                appendLine()
                appendLine("# Feature flag evaluation")
                appendLine("${varName}_value = client.$evalMethod('$flagKey', $defaultValue, evaluation_context)")
            } else {
                appendLine("# Feature flag evaluation")
                appendLine("${varName}_value = client.$evalMethod('$flagKey', $defaultValue)")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if ${varName}_value:")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("${indent}# Flag is enabled")
                    appendLine("${indent}pass")
                }
                if (options.includeElse) {
                    appendLine("else:")
                    appendLine("${indent}# Flag is disabled")
                    appendLine("${indent}pass")
                }
            } else {
                appendLine("match ${varName}_value:")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("${indent}case $caseValue:")
                    appendLine("$indent${indent}# Handle $name")
                    appendLine("$indent${indent}pass")
                }
                appendLine("${indent}case _:")
                appendLine("$indent${indent}# Handle default case")
                appendLine("$indent${indent}pass")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "get_boolean_value"
        VariationType.STRING -> "get_string_value"
        VariationType.NUMBER -> "get_number_value"
        VariationType.JSON -> "get_object_value"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "False"
        VariationType.STRING -> "''"
        VariationType.NUMBER -> "0"
        VariationType.JSON -> "{}"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "'$value'"
        else -> "'$value'"
    }
}

/**
 * Java code generator.
 */
class JavaCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val valueType = getValueType(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("GoFeatureFlagProviderOptions options = GoFeatureFlagProviderOptions.builder()")
            appendLine("${indent}.endpoint(\"${options.relayProxyUrl}\")")
            appendLine("${indent}.build();")
            appendLine("GoFeatureFlagProvider provider = new GoFeatureFlagProvider(options);")
            appendLine("OpenFeatureAPI.getInstance().setProvider(provider);")
            appendLine("Client client = OpenFeatureAPI.getInstance().getClient();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("MutableContext evaluationContext = new MutableContext();")
                appendLine("evaluationContext.setTargetingKey(\"user-123\"); // Unique identifier for the user")
                appendLine("evaluationContext.add(\"email\", \"user@example.com\");")
                appendLine("evaluationContext.add(\"plan\", \"premium\");")
                appendLine("// Add attributes used in your targeting rules")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("$valueType ${varName}Value = client.$evalMethod(\"$flagKey\", $defaultValue, evaluationContext);")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("$valueType ${varName}Value = client.$evalMethod(\"$flagKey\", $defaultValue);")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (${varName}Value) {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else if (options.variationType == VariationType.NUMBER) {
                // For numbers, use if/else chain since switch on double is not supported in Java
                options.getComparisonValues().forEachIndexed { index, (name, value) ->
                    when (index) {
                        0 -> appendLine("if (${varName}Value == $value) {")
                        else -> appendLine("} else if (${varName}Value == $value) {")
                    }
                    appendLine("$indent// Handle $name")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Handle default case")
                }
                appendLine("}")
            } else {
                appendLine("switch (${varName}Value) {")
                options.getComparisonValues().forEach { (name, value) ->
                    appendLine("${indent}case \"$value\":")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent${indent}break;")
                }
                appendLine("${indent}default:")
                appendLine("$indent$indent// Handle default case")
                appendLine("$indent${indent}break;")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = "import dev.openfeature.sdk.OpenFeatureAPI;\nimport dev.openfeature.sdk.Client;\nimport dev.openfeature.sdk.MutableContext;\nimport dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProvider;\nimport dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProviderOptions;"
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getDoubleValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "null"
    }

    private fun getValueType(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "boolean"
        VariationType.STRING -> "String"
        VariationType.NUMBER -> "double"
        VariationType.JSON -> "Object"
    }
}

/**
 * Kotlin code generator.
 */
class KotlinCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("val options = GoFeatureFlagProviderOptions.builder()")
            appendLine("${indent}.endpoint(\"${options.relayProxyUrl}\")")
            appendLine("${indent}.build()")
            appendLine("val provider = GoFeatureFlagProvider(options)")
            appendLine("OpenFeatureAPI.getInstance().setProvider(provider)")
            appendLine("val client = OpenFeatureAPI.getInstance().client")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("val evaluationContext = MutableContext().apply {")
                appendLine("${indent}targetingKey = \"user-123\" // Unique identifier for the user")
                appendLine("${indent}add(\"email\", \"user@example.com\")")
                appendLine("${indent}add(\"plan\", \"premium\")")
                appendLine("${indent}// Add attributes used in your targeting rules")
                appendLine("}")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("val ${varName}Value = client.$evalMethod(\"$flagKey\", $defaultValue, evaluationContext)")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("val ${varName}Value = client.$evalMethod(\"$flagKey\", $defaultValue)")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (${varName}Value) {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else {
                appendLine("when (${varName}Value) {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("${indent}$caseValue -> {")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent}")
                }
                appendLine("${indent}else -> {")
                appendLine("$indent$indent// Handle default case")
                appendLine("$indent}")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = "import dev.openfeature.sdk.OpenFeatureAPI\nimport dev.openfeature.sdk.MutableContext\nimport dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProvider\nimport dev.openfeature.contrib.providers.gofeatureflag.GoFeatureFlagProviderOptions"
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getDoubleValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "null"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "\"$value\""
        else -> "\"$value\""
    }
}

/**
 * C# code generator.
 */
class CSharpCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val valueType = getValueType(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("var goFeatureFlagProvider = new GoFeatureFlagProvider(new GoFeatureFlagProviderOptions")
            appendLine("{")
            appendLine("${indent}Endpoint = \"${options.relayProxyUrl}\"")
            appendLine("});")
            appendLine("await Api.Instance.SetProviderAsync(goFeatureFlagProvider);")
            appendLine("var client = Api.Instance.GetClient();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("var evaluationContext = EvaluationContext.Builder()")
                appendLine("${indent}.SetTargetingKey(\"user-123\") // Unique identifier for the user")
                appendLine("${indent}.Set(\"email\", \"user@example.com\")")
                appendLine("${indent}.Set(\"plan\", \"premium\")")
                appendLine("${indent}// Add attributes used in your targeting rules")
                appendLine("${indent}.Build();")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("$valueType ${varName}Value = await client.$evalMethod(\"$flagKey\", $defaultValue, evaluationContext);")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("$valueType ${varName}Value = await client.$evalMethod(\"$flagKey\", $defaultValue);")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (${varName}Value)")
                appendLine("{")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("}")
                    appendLine("else")
                    appendLine("{")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else if (options.variationType == VariationType.NUMBER) {
                // For numbers, use if/else chain since switch on double requires pattern matching
                options.getComparisonValues().forEachIndexed { index, (name, value) ->
                    when (index) {
                        0 -> appendLine("if (${varName}Value == $value)")
                        else -> appendLine("else if (${varName}Value == $value)")
                    }
                    appendLine("{")
                    appendLine("$indent// Handle $name")
                    appendLine("}")
                }
                if (options.includeElse) {
                    appendLine("else")
                    appendLine("{")
                    appendLine("$indent// Handle default case")
                    appendLine("}")
                }
            } else {
                appendLine("switch (${varName}Value)")
                appendLine("{")
                options.getComparisonValues().forEach { (name, value) ->
                    appendLine("${indent}case \"$value\":")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent${indent}break;")
                }
                appendLine("${indent}default:")
                appendLine("$indent$indent// Handle default case")
                appendLine("$indent${indent}break;")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = "using OpenFeature;\nusing OpenFeature.Model;\nusing OpenFeature.Contrib.Providers.GOFeatureFlag;"
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "GetBooleanValueAsync"
        VariationType.STRING -> "GetStringValueAsync"
        VariationType.NUMBER -> "GetDoubleValueAsync"
        VariationType.JSON -> "GetObjectValueAsync"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "null"
    }

    private fun getValueType(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "bool"
        VariationType.STRING -> "string"
        VariationType.NUMBER -> "double"
        VariationType.JSON -> "object"
    }
}

/**
 * Rust code generator.
 */
class RustCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toSnakeCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("use open_feature::OpenFeature;")
            appendLine("use open_feature::EvaluationContext;")
            appendLine("use go_feature_flag_provider::GoFeatureFlagProvider;")
            appendLine()
            appendLine("let provider = GoFeatureFlagProvider::new(\"${options.relayProxyUrl}\");")
            appendLine("OpenFeature::set_provider(provider).await?;")
            appendLine("let client = OpenFeature::get_client();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("let evaluation_context = EvaluationContext::builder()")
                appendLine("${indent}.targeting_key(\"user-123\") // Unique identifier for the user")
                appendLine("${indent}.custom(\"email\", \"user@example.com\")")
                appendLine("${indent}.custom(\"plan\", \"premium\")")
                appendLine("${indent}// Add attributes used in your targeting rules")
                appendLine("${indent}.build();")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("let ${varName}_value = client.$evalMethod(\"$flagKey\", $defaultValue, Some(&evaluation_context)).await?;")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("let ${varName}_value = client.$evalMethod(\"$flagKey\", $defaultValue, None).await?;")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if ${varName}_value {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else if (options.variationType == VariationType.NUMBER) {
                // For numbers, compare directly
                options.getComparisonValues().forEachIndexed { index, (name, value) ->
                    when (index) {
                        0 -> appendLine("if ${varName}_value == $value {")
                        else -> appendLine("} else if ${varName}_value == $value {")
                    }
                    appendLine("$indent// Handle $name")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Handle default case")
                }
                appendLine("}")
            } else {
                appendLine("match ${varName}_value.as_str() {")
                options.getComparisonValues().forEach { (name, value) ->
                    appendLine("${indent}\"$value\" => {")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent}")
                }
                appendLine("${indent}_ => {")
                appendLine("$indent$indent// Handle default case")
                appendLine("$indent}")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "get_boolean_value"
        VariationType.STRING -> "get_string_value"
        VariationType.NUMBER -> "get_number_value"
        VariationType.JSON -> "get_object_value"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "None"
    }
}

/**
 * PHP code generator.
 */
class PhpCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("use OpenFeature\\OpenFeatureAPI;")
            appendLine("use OpenFeature\\Providers\\GoFeatureFlag\\GoFeatureFlagProvider;")
            appendLine("use OpenFeature\\Implementation\\Flags\\EvaluationContext;")
            appendLine()
            appendLine("\$provider = new GoFeatureFlagProvider([")
            appendLine("${indent}'endpoint' => '${options.relayProxyUrl}'")
            appendLine("]);")
            appendLine("OpenFeatureAPI::getInstance()->setProvider(\$provider);")
            appendLine("\$client = OpenFeatureAPI::getInstance()->getClient();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("\$evaluationContext = new EvaluationContext(")
                appendLine("${indent}'user-123', // targetingKey - Unique identifier for the user")
                appendLine("${indent}[")
                appendLine("${indent}${indent}'email' => 'user@example.com',")
                appendLine("${indent}${indent}'plan' => 'premium',")
                appendLine("${indent}${indent}// Add attributes used in your targeting rules")
                appendLine("${indent}]")
                appendLine(");")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("\$${varName}Value = \$client->$evalMethod('$flagKey', $defaultValue, \$evaluationContext);")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("\$${varName}Value = \$client->$evalMethod('$flagKey', $defaultValue);")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (\$${varName}Value) {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else {
                appendLine("switch (\$${varName}Value) {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("${indent}case $caseValue:")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent${indent}break;")
                }
                appendLine("${indent}default:")
                appendLine("$indent$indent// Handle default case")
                appendLine("$indent${indent}break;")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getNumberValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "''"
        VariationType.NUMBER -> "0"
        VariationType.JSON -> "null"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "'$value'"
        else -> "'$value'"
    }
}

/**
 * Ruby code generator.
 */
class RubyCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "  "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toSnakeCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("# Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("require 'openfeature/sdk'")
            appendLine("require 'openfeature/go-feature-flag-provider'")
            appendLine()
            appendLine("provider = OpenFeature::GoFeatureFlag::Provider.new(")
            appendLine("${indent}endpoint: '${options.relayProxyUrl}'")
            appendLine(")")
            appendLine("OpenFeature::SDK.configure do |config|")
            appendLine("${indent}config.set_provider(provider)")
            appendLine("end")
            appendLine("client = OpenFeature::SDK.build_client")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("# $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("# Evaluation context - customize with your user's attributes for targeting")
                appendLine("evaluation_context = OpenFeature::SDK::EvaluationContext.new(")
                appendLine("${indent}targeting_key: 'user-123', # Unique identifier for the user")
                appendLine("${indent}email: 'user@example.com',")
                appendLine("${indent}plan: 'premium'")
                appendLine("${indent}# Add attributes used in your targeting rules")
                appendLine(")")
                appendLine()
                appendLine("# Feature flag evaluation")
                appendLine("${varName}_value = client.$evalMethod('$flagKey', $defaultValue, evaluation_context)")
            } else {
                appendLine("# Feature flag evaluation")
                appendLine("${varName}_value = client.$evalMethod('$flagKey', $defaultValue)")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if ${varName}_value")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent# Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("else")
                    appendLine("$indent# Flag is disabled")
                }
                appendLine("end")
            } else {
                appendLine("case ${varName}_value")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("when $caseValue")
                    appendLine("$indent# Handle $name")
                }
                appendLine("else")
                appendLine("$indent# Handle default case")
                appendLine("end")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "get_boolean_value"
        VariationType.STRING -> "get_string_value"
        VariationType.NUMBER -> "get_number_value"
        VariationType.JSON -> "get_object_value"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "''"
        VariationType.NUMBER -> "0"
        VariationType.JSON -> "nil"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "'$value'"
        else -> "'$value'"
    }
}

/**
 * Swift code generator.
 */
class SwiftCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "    "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("import OpenFeature")
            appendLine("import GOFeatureFlagProvider")
            appendLine()
            appendLine("let provider = GoFeatureFlagProvider(")
            appendLine("${indent}endpoint: \"${options.relayProxyUrl}\"")
            appendLine(")")
            appendLine("await OpenFeatureAPI.shared.setProviderAndWait(provider: provider)")
            appendLine("let client = OpenFeatureAPI.shared.getClient()")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("let evaluationContext = MutableContext(")
                appendLine("${indent}targetingKey: \"user-123\", // Unique identifier for the user")
                appendLine("${indent}structure: MutableStructure()")
                appendLine("${indent}${indent}.add(key: \"email\", value: .string(\"user@example.com\"))")
                appendLine("${indent}${indent}.add(key: \"plan\", value: .string(\"premium\"))")
                appendLine("${indent}${indent}// Add attributes used in your targeting rules")
                appendLine(")")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("let ${varName}Value = try await client.$evalMethod(flagKey: \"$flagKey\", defaultValue: $defaultValue, context: evaluationContext)")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("let ${varName}Value = try await client.$evalMethod(flagKey: \"$flagKey\", defaultValue: $defaultValue)")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if ${varName}Value {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else {
                appendLine("switch ${varName}Value {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("case $caseValue:")
                    appendLine("$indent// Handle $name")
                }
                appendLine("default:")
                appendLine("$indent// Handle default case")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getDoubleValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "\"\""
        VariationType.NUMBER -> "0.0"
        VariationType.JSON -> "nil"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "\"$value\""
        else -> "\"$value\""
    }
}

/**
 * Dart/Flutter code generator.
 */
class DartCodeGenerator : LanguageCodeGenerator {
    override fun generate(options: CodeGenerationOptions): GeneratedCode {
        val flagKey = options.flagKey
        val indent = "  "
        val evalMethod = getEvalMethod(options.variationType)
        val defaultValue = getDefaultValue(options.variationType)
        val varName = flagKey.toCamelCase()

        val code = buildString {
            // Client initialization boilerplate
            appendLine("// Initialize GO Feature Flag provider (do this once at app startup)")
            appendLine("import 'package:openfeature/openfeature.dart';")
            appendLine("import 'package:go_feature_flag_provider/go_feature_flag_provider.dart';")
            appendLine()
            appendLine("final provider = GoFeatureFlagProvider(")
            appendLine("${indent}endpoint: '${options.relayProxyUrl}',")
            appendLine(");")
            appendLine("await OpenFeature.instance.setProviderAndWait(provider);")
            appendLine("final client = OpenFeature.instance.getClient();")
            appendLine()

            // Add rollout strategy comment if applicable
            options.getRolloutComment()?.let {
                appendLine("// $it")
            }

            // Generate evaluation context
            if (options.requiresEvaluationContext()) {
                appendLine("// Evaluation context - customize with your user's attributes for targeting")
                appendLine("final evaluationContext = EvaluationContext(")
                appendLine("${indent}targetingKey: 'user-123', // Unique identifier for the user")
                appendLine("${indent}attributes: {")
                appendLine("${indent}${indent}'email': 'user@example.com',")
                appendLine("${indent}${indent}'plan': 'premium',")
                appendLine("${indent}${indent}// Add attributes used in your targeting rules")
                appendLine("${indent}},")
                appendLine(");")
                appendLine()
                appendLine("// Feature flag evaluation")
                appendLine("final ${varName}Value = await client.$evalMethod('$flagKey', $defaultValue, context: evaluationContext);")
            } else {
                appendLine("// Feature flag evaluation")
                appendLine("final ${varName}Value = await client.$evalMethod('$flagKey', $defaultValue);")
            }
            appendLine()

            if (options.variationType == VariationType.BOOLEAN) {
                appendLine("if (${varName}Value) {")
                if (options.wrapSelection && options.selectedCode != null) {
                    options.selectedCode.lines().forEach { line ->
                        appendLine("$indent$line")
                    }
                } else {
                    appendLine("$indent// Flag is enabled")
                }
                if (options.includeElse) {
                    appendLine("} else {")
                    appendLine("$indent// Flag is disabled")
                }
                appendLine("}")
            } else {
                appendLine("switch (${varName}Value) {")
                options.getComparisonValues().forEach { (name, value) ->
                    val caseValue = formatCaseValue(value, options.variationType)
                    appendLine("${indent}case $caseValue:")
                    appendLine("$indent$indent// Handle $name")
                    appendLine("$indent${indent}break;")
                }
                appendLine("${indent}default:")
                appendLine("$indent$indent// Handle default case")
                appendLine("}")
            }
        }

        return GeneratedCode(
            code = code.trimEnd(),
            importStatement = null // Already included in code
        )
    }

    private fun getEvalMethod(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "getBooleanValue"
        VariationType.STRING -> "getStringValue"
        VariationType.NUMBER -> "getNumberValue"
        VariationType.JSON -> "getObjectValue"
    }

    private fun getDefaultValue(type: VariationType): String = when (type) {
        VariationType.BOOLEAN -> "false"
        VariationType.STRING -> "''"
        VariationType.NUMBER -> "0"
        VariationType.JSON -> "{}"
    }

    private fun formatCaseValue(value: String, type: VariationType): String = when (type) {
        VariationType.NUMBER -> value
        VariationType.STRING -> "'$value'"
        else -> "'$value'"
    }
}

// Extension functions for string case conversion
fun String.toCamelCase(): String {
    return this.split("-", "_", " ")
        .mapIndexed { index, word ->
            if (index == 0) word.lowercase()
            else word.replaceFirstChar { it.uppercase() }
        }
        .joinToString("")
}

fun String.toSnakeCase(): String {
    return this.replace("-", "_")
        .replace(Regex("([a-z])([A-Z])")) { "${it.groupValues[1]}_${it.groupValues[2]}" }
        .lowercase()
}
