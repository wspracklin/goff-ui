package com.gofeatureflag.intellij.model

/**
 * Represents a feature flag.
 */
data class FeatureFlag(
    val key: String,
    val variations: Map<String, Any?>,
    val defaultRule: DefaultRule?,
    val targeting: List<TargetingRule>? = null,
    val disable: Boolean = false,
    val trackEvents: Boolean = false,
    val version: String? = null,
    val metadata: Map<String, Any?>? = null,
    val scheduledRollout: List<ScheduledStep>? = null,
    val experimentation: Experimentation? = null,
    val progressiveRollout: ProgressiveRollout? = null
) {
    /**
     * Determines the type of flag based on variations.
     */
    fun getVariationType(): VariationType {
        if (variations.isEmpty()) return VariationType.BOOLEAN

        val firstValue = variations.values.firstOrNull()
        return when (firstValue) {
            is Boolean -> VariationType.BOOLEAN
            is Number -> VariationType.NUMBER
            is String -> VariationType.STRING
            else -> VariationType.JSON
        }
    }

    /**
     * Gets variation names for code generation.
     */
    fun getVariationNames(): List<String> = variations.keys.toList()

    /**
     * Gets the flag description from metadata.
     */
    fun getDescription(): String? = metadata?.get("description") as? String

    /**
     * Gets a formatted summary of the default rule.
     */
    fun getDefaultRuleSummary(): String {
        val rule = defaultRule ?: return "No default rule"
        return when {
            rule.percentage != null && rule.percentage.isNotEmpty() -> {
                rule.percentage.entries.joinToString(", ") { (variation, pct) ->
                    "$variation: ${pct.toInt()}%"
                }
            }
            rule.variation != null -> "100% ${rule.variation}"
            else -> "No default rule"
        }
    }

    /**
     * Checks if this flag uses percentage rollout.
     */
    fun hasPercentageRollout(): Boolean {
        if (defaultRule?.percentage?.isNotEmpty() == true) return true
        return targeting?.any { it.percentage?.isNotEmpty() == true } == true
    }

    /**
     * Gets the number of targeting rules.
     */
    fun getTargetingRuleCount(): Int = targeting?.size ?: 0

    /**
     * Checks if this flag has a valid scheduled rollout (with steps that have dates).
     */
    fun hasScheduledRollout(): Boolean {
        val steps = scheduledRollout ?: return false
        return steps.isNotEmpty() && steps.any { it.date != null }
    }

    /**
     * Checks if this flag is an experiment (has start or end date configured).
     */
    fun isExperiment(): Boolean {
        val exp = experimentation ?: return false
        return exp.start != null || exp.end != null
    }

    /**
     * Checks if this flag has a valid progressive rollout (with dates configured).
     */
    fun hasProgressiveRollout(): Boolean {
        val pr = progressiveRollout ?: return false
        // Progressive rollout is valid if it has initial or end dates set
        return pr.initial?.date != null || pr.end?.date != null
    }

    /**
     * Gets the rollout strategy for this flag.
     */
    fun getRolloutStrategy(): RolloutStrategy {
        return when {
            disable -> RolloutStrategy.DISABLED
            isExperiment() -> RolloutStrategy.EXPERIMENT
            hasScheduledRollout() -> RolloutStrategy.SCHEDULED
            hasProgressiveRollout() -> RolloutStrategy.PROGRESSIVE
            getTargetingRuleCount() > 0 && hasPercentageRollout() -> RolloutStrategy.TARGETED_PERCENTAGE
            getTargetingRuleCount() > 0 -> RolloutStrategy.TARGETED
            hasPercentageRollout() -> RolloutStrategy.PERCENTAGE
            else -> RolloutStrategy.STATIC
        }
    }
}

/**
 * Default rule for a flag.
 */
data class DefaultRule(
    val variation: String? = null,
    val percentage: Map<String, Double>? = null
)

/**
 * Targeting rule for a flag.
 */
data class TargetingRule(
    val name: String? = null,
    val query: String? = null,
    val variation: String? = null,
    val percentage: Map<String, Double>? = null,
    val disable: Boolean = false
) {
    /**
     * Gets a formatted summary of this targeting rule.
     */
    fun getSummary(): String {
        val ruleName = name ?: "Unnamed rule"
        val outcome = when {
            disable -> "disabled"
            percentage != null && percentage.isNotEmpty() -> {
                percentage.entries.joinToString(", ") { (v, pct) -> "$v: ${pct.toInt()}%" }
            }
            variation != null -> "100% $variation"
            else -> "no outcome"
        }
        return "$ruleName -> $outcome"
    }

    /**
     * Gets the query condition or a default message.
     */
    fun getQueryDisplay(): String = query ?: "No condition"
}

/**
 * Scheduled rollout step.
 */
data class ScheduledStep(
    val date: String? = null,
    val defaultRule: DefaultRule? = null,
    val targeting: List<TargetingRule>? = null
) {
    fun getSummary(): String {
        val dateStr = date ?: "Unknown date"
        val outcome = when {
            defaultRule?.percentage != null && defaultRule.percentage.isNotEmpty() -> {
                defaultRule.percentage.entries.joinToString(", ") { (v, pct) -> "$v: ${pct.toInt()}%" }
            }
            defaultRule?.variation != null -> "100% ${defaultRule.variation}"
            targeting?.isNotEmpty() == true -> "${targeting.size} targeting rule(s)"
            else -> "no change"
        }
        return "$dateStr -> $outcome"
    }
}

/**
 * Experimentation configuration.
 */
data class Experimentation(
    val start: String? = null,
    val end: String? = null,
    val variations: Map<String, Double>? = null
) {
    fun getSummary(): String {
        val parts = mutableListOf<String>()
        if (start != null) parts.add("Start: $start")
        if (end != null) parts.add("End: $end")
        if (variations != null && variations.isNotEmpty()) {
            val varStr = variations.entries.joinToString(", ") { (v, pct) -> "$v: ${pct.toInt()}%" }
            parts.add("Distribution: $varStr")
        }
        return if (parts.isEmpty()) "Experiment configured" else parts.joinToString("\n")
    }
}

/**
 * Progressive rollout configuration.
 */
data class ProgressiveRollout(
    val initial: ProgressiveStep? = null,
    val end: ProgressiveStep? = null,
    val steps: List<ProgressiveStep>? = null,
    val rampDuration: String? = null,
    val releaseRamp: ReleaseRamp? = null
) {
    fun getSummary(): String {
        val parts = mutableListOf<String>()
        if (initial != null) parts.add("Initial: ${initial.variation ?: "?"} at ${initial.percentage?.toInt() ?: 0}%")
        if (end != null) parts.add("End: ${end.variation ?: "?"} at ${end.percentage?.toInt() ?: 100}%")
        if (rampDuration != null) parts.add("Duration: $rampDuration")
        if (releaseRamp != null) {
            parts.add("Ramp: ${releaseRamp.start ?: "?"} to ${releaseRamp.end ?: "?"}")
        }
        return if (parts.isEmpty()) "Progressive rollout configured" else parts.joinToString("\n")
    }
}

/**
 * Progressive rollout step.
 */
data class ProgressiveStep(
    val variation: String? = null,
    val percentage: Double? = null,
    val date: String? = null
)

/**
 * Release ramp configuration.
 */
data class ReleaseRamp(
    val start: String? = null,
    val end: String? = null
)

/**
 * Rollout strategy types.
 */
enum class RolloutStrategy(
    val displayName: String,
    val icon: String,
    val description: String
) {
    DISABLED("Disabled", "🚫", "Flag is disabled"),
    STATIC("Static", "✓", "100% fixed rollout"),
    PERCENTAGE("Percentage", "📊", "Percentage-based distribution"),
    TARGETED("Targeted", "🎯", "Rule-based targeting"),
    TARGETED_PERCENTAGE("Targeted %", "🎯📊", "Targeting with percentage"),
    SCHEDULED("Scheduled", "📅", "Time-based rollout"),
    EXPERIMENT("Experiment", "🧪", "A/B test or experiment"),
    PROGRESSIVE("Progressive", "📈", "Gradual rollout over time")
}

/**
 * Represents a flag set.
 */
data class FlagSet(
    val id: String,
    val name: String,
    val description: String? = null,
    val isDefault: Boolean = false
)

/**
 * Types of flag variations.
 */
enum class VariationType {
    BOOLEAN,
    STRING,
    NUMBER,
    JSON;

    fun getDisplayName(): String = when (this) {
        BOOLEAN -> "Boolean"
        STRING -> "String"
        NUMBER -> "Number"
        JSON -> "JSON"
    }

    fun getDefaultVariations(): Map<String, Any?> = when (this) {
        BOOLEAN -> mapOf("enabled" to true, "disabled" to false)
        STRING -> mapOf("variant-a" to "A", "variant-b" to "B")
        NUMBER -> mapOf("control" to 0, "treatment" to 1)
        JSON -> mapOf("default" to mapOf("feature" to "enabled"))
    }
}

/**
 * Supported programming languages for code generation.
 */
enum class SupportedLanguage(
    val displayName: String,
    val fileExtensions: List<String>,
    val sdkPackage: String,
    val importStatement: String
) {
    GO(
        "Go",
        listOf("go"),
        "github.com/open-feature/go-sdk/openfeature",
        "import \"github.com/open-feature/go-sdk/openfeature\""
    ),
    JAVASCRIPT(
        "JavaScript",
        listOf("js", "jsx", "mjs"),
        "@openfeature/web-sdk",
        "import { OpenFeature } from '@openfeature/web-sdk';"
    ),
    TYPESCRIPT(
        "TypeScript",
        listOf("ts", "tsx"),
        "@openfeature/web-sdk",
        "import { OpenFeature } from '@openfeature/web-sdk';"
    ),
    PYTHON(
        "Python",
        listOf("py"),
        "openfeature-sdk",
        "from openfeature import api as openfeature"
    ),
    JAVA(
        "Java",
        listOf("java"),
        "dev.openfeature.sdk",
        "import dev.openfeature.sdk.OpenFeatureAPI;"
    ),
    KOTLIN(
        "Kotlin",
        listOf("kt", "kts"),
        "dev.openfeature.sdk",
        "import dev.openfeature.sdk.OpenFeatureAPI"
    ),
    CSHARP(
        "C#",
        listOf("cs"),
        "OpenFeature",
        "using OpenFeature;"
    ),
    RUST(
        "Rust",
        listOf("rs"),
        "open-feature",
        "use open_feature::OpenFeature;"
    ),
    PHP(
        "PHP",
        listOf("php"),
        "open-feature/sdk",
        "use OpenFeature\\OpenFeatureAPI;"
    ),
    RUBY(
        "Ruby",
        listOf("rb"),
        "openfeature-sdk",
        "require 'openfeature'"
    ),
    SWIFT(
        "Swift",
        listOf("swift"),
        "OpenFeature",
        "import OpenFeature"
    ),
    DART(
        "Dart/Flutter",
        listOf("dart"),
        "openfeature",
        "import 'package:openfeature/openfeature.dart';"
    );

    companion object {
        fun fromFileExtension(extension: String): SupportedLanguage? {
            return values().find { it.fileExtensions.contains(extension.lowercase()) }
        }

        fun fromFileName(fileName: String): SupportedLanguage? {
            val extension = fileName.substringAfterLast('.', "")
            return fromFileExtension(extension)
        }
    }
}

/**
 * Code generation options.
 */
data class CodeGenerationOptions(
    val flagKey: String,
    val language: SupportedLanguage,
    val variationType: VariationType,
    val variations: List<String>,
    val variationValues: Map<String, Any?> = emptyMap(),
    val includeElse: Boolean = true,
    val includeElseIf: Boolean = false,
    val wrapSelection: Boolean = false,
    val selectedCode: String? = null,
    val evaluationContext: String? = null,
    val addImport: Boolean = true,
    val relayProxyUrl: String = "http://localhost:1031",
    val rolloutStrategy: RolloutStrategy = RolloutStrategy.STATIC,
    val hasTargetingRules: Boolean = false,
    val targetingRuleCount: Int = 0
) {
    /**
     * Gets the list of actual values to compare against in switch/case statements.
     * For BOOLEAN, returns empty (handled specially).
     * For NUMBER, returns the numeric values.
     * For STRING, returns the string values.
     * For JSON, returns variation names (complex objects can't be compared easily).
     */
    fun getComparisonValues(): List<Pair<String, String>> {
        return variations.map { name ->
            val value = variationValues[name]
            val comparisonValue = when (variationType) {
                VariationType.BOOLEAN -> name // Not used in comparisons
                VariationType.NUMBER -> {
                    when (value) {
                        is Int -> value.toString()
                        is Long -> value.toString()
                        is Double -> {
                            // Format without trailing .0 for whole numbers
                            if (value == value.toLong().toDouble()) value.toLong().toString()
                            else value.toString()
                        }
                        is Number -> value.toString()
                        else -> "0"
                    }
                }
                VariationType.STRING -> {
                    (value as? String) ?: name
                }
                VariationType.JSON -> name // Use name as identifier for JSON objects
            }
            Pair(name, comparisonValue)
        }
    }

    /**
     * Gets a comment describing the rollout strategy for this flag.
     */
    fun getRolloutComment(): String? {
        return when (rolloutStrategy) {
            RolloutStrategy.DISABLED -> "Note: This flag is currently disabled"
            RolloutStrategy.PERCENTAGE -> "Note: This flag uses percentage-based rollout"
            RolloutStrategy.TARGETED -> {
                if (targetingRuleCount > 0) {
                    "Note: This flag has $targetingRuleCount targeting rule(s) - ensure evaluation context includes required attributes"
                } else {
                    "Note: This flag uses targeting rules - ensure evaluation context includes required attributes"
                }
            }
            RolloutStrategy.TARGETED_PERCENTAGE -> {
                "Note: This flag has $targetingRuleCount targeting rule(s) with percentage rollout"
            }
            RolloutStrategy.SCHEDULED -> "Note: This flag uses scheduled rollout - value changes at configured dates"
            RolloutStrategy.EXPERIMENT -> "Note: This flag is part of an experiment - events are being tracked"
            RolloutStrategy.PROGRESSIVE -> "Note: This flag uses progressive rollout - value changes gradually over time"
            RolloutStrategy.STATIC -> null // No special comment for static flags
        }
    }

    /**
     * Returns true if this flag requires evaluation context for proper evaluation.
     */
    fun requiresEvaluationContext(): Boolean {
        return hasTargetingRules ||
            rolloutStrategy == RolloutStrategy.TARGETED ||
            rolloutStrategy == RolloutStrategy.TARGETED_PERCENTAGE ||
            rolloutStrategy == RolloutStrategy.PERCENTAGE ||
            rolloutStrategy == RolloutStrategy.EXPERIMENT
    }
}
