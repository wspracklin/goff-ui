package com.gofeatureflag.intellij.api

import com.gofeatureflag.intellij.model.DefaultRule
import com.gofeatureflag.intellij.model.Experimentation
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.FlagSet
import com.gofeatureflag.intellij.model.ProgressiveRollout
import com.gofeatureflag.intellij.model.ProgressiveStep
import com.gofeatureflag.intellij.model.ReleaseRamp
import com.gofeatureflag.intellij.model.ScheduledStep
import com.gofeatureflag.intellij.model.TargetingRule
import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.settings.GoffSettings
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * API client for communicating with the GO Feature Flag management API.
 */
class GoffApiClient(
    private val baseUrl: String = GoffSettings.getInstance().apiUrl,
    private val apiKey: String = GoffSettings.getInstance().apiKey
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val gson = Gson()
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    /**
     * Get all flag sets.
     */
    fun getFlagSets(): List<FlagSet> {
        if (baseUrl.isBlank()) {
            throw GoffApiException("API URL not configured")
        }
        val request = buildRequest("$baseUrl/api/flagsets")
        return executeRequest(request) { body ->
            val response = gson.fromJson<FlagSetsResponse>(body, FlagSetsResponse::class.java)
            response?.flagSets ?: emptyList()
        }
    }

    /**
     * Get all flags from a flag set.
     */
    fun getFlags(flagSetId: String): List<FeatureFlag> {
        if (baseUrl.isBlank()) {
            throw GoffApiException("API URL not configured")
        }
        val request = buildRequest("$baseUrl/api/flagsets/$flagSetId/flags")
        return executeRequest(request) { body ->
            val type = object : TypeToken<FlagsResponse>() {}.type
            val response = gson.fromJson<FlagsResponse>(body, type)
            response?.flags?.mapNotNull { (key, config) ->
                if (config != null) parseFlag(key, config) else null
            } ?: emptyList()
        }
    }

    /**
     * Get a specific flag.
     */
    fun getFlag(flagSetId: String, flagKey: String): FeatureFlag? {
        val request = buildRequest("$baseUrl/api/flagsets/$flagSetId/flags")
        return executeRequest(request) { body ->
            val type = object : TypeToken<FlagsResponse>() {}.type
            val response = gson.fromJson<FlagsResponse>(body, type)
            response.flags?.get(flagKey)?.let { config ->
                parseFlag(flagKey, config)
            }
        }
    }

    /**
     * Create a new flag.
     */
    fun createFlag(flagSetId: String, flagKey: String, flag: FeatureFlag): FeatureFlag {
        val flagConfig = mapOf(
            "variations" to flag.variations,
            "defaultRule" to mapOf(
                "variation" to (flag.defaultRule?.variation ?: flag.variations.keys.firstOrNull())
            ),
            "trackEvents" to flag.trackEvents,
            "disable" to flag.disable
        )

        val requestBody = gson.toJson(flagConfig).toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url("$baseUrl/api/flagsets/$flagSetId/flags/$flagKey")
            .post(requestBody)
            .apply { addAuthHeader(this) }
            .build()

        return executeRequest(request) { flag }
    }

    /**
     * Update an existing flag.
     */
    fun updateFlag(flagSetId: String, flagKey: String, flag: FeatureFlag): FeatureFlag {
        val flagConfig = mapOf(
            "config" to mapOf(
                "variations" to flag.variations,
                "defaultRule" to mapOf(
                    "variation" to flag.defaultRule?.variation
                ),
                "trackEvents" to flag.trackEvents,
                "disable" to flag.disable
            )
        )

        val requestBody = gson.toJson(flagConfig).toRequestBody(jsonMediaType)
        val request = Request.Builder()
            .url("$baseUrl/api/flagsets/$flagSetId/flags/$flagKey")
            .put(requestBody)
            .apply { addAuthHeader(this) }
            .build()

        return executeRequest(request) { flag }
    }

    /**
     * Delete a flag.
     */
    fun deleteFlag(flagSetId: String, flagKey: String) {
        val request = Request.Builder()
            .url("$baseUrl/api/flagsets/$flagSetId/flags/$flagKey")
            .delete()
            .apply { addAuthHeader(this) }
            .build()

        executeRequest(request) { }
    }

    private fun buildRequest(url: String): Request {
        return Request.Builder()
            .url(url)
            .get()
            .apply { addAuthHeader(this) }
            .build()
    }

    private fun addAuthHeader(builder: Request.Builder) {
        if (apiKey.isNotBlank()) {
            builder.addHeader("Authorization", "Bearer $apiKey")
        }
    }

    private fun <T> executeRequest(request: Request, parser: (String) -> T): T {
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw GoffApiException("API request failed: ${response.code} ${response.message}")
            }
            val body = response.body?.string() ?: throw GoffApiException("Empty response body")
            return parser(body)
        }
    }

    private fun parseFlag(key: String, config: Map<String, Any?>): FeatureFlag {
        @Suppress("UNCHECKED_CAST")
        val variations = (config["variations"] as? Map<String, Any?>) ?: emptyMap()

        @Suppress("UNCHECKED_CAST")
        val defaultRuleMap = config["defaultRule"] as? Map<String, Any?>

        // Check for progressive rollout inside defaultRule (GO Feature Flag format)
        @Suppress("UNCHECKED_CAST")
        val defaultRuleProgressiveMap = defaultRuleMap?.get("progressiveRollout") as? Map<String, Any?>

        val defaultRule = defaultRuleMap?.let {
            DefaultRule(
                variation = it["variation"] as? String,
                percentage = (it["percentage"] as? Map<String, Number>)?.mapValues { e -> e.value.toDouble() }
            )
        }

        // Parse targeting rules
        @Suppress("UNCHECKED_CAST")
        val targetingList = config["targeting"] as? List<Map<String, Any?>>
        val targeting = targetingList?.map { rule ->
            TargetingRule(
                name = rule["name"] as? String,
                query = rule["query"] as? String,
                variation = rule["variation"] as? String,
                percentage = (rule["percentage"] as? Map<String, Number>)?.mapValues { e -> e.value.toDouble() },
                disable = rule["disable"] as? Boolean ?: false
            )
        }

        // Parse metadata (may contain description)
        @Suppress("UNCHECKED_CAST")
        val metadata = config["metadata"] as? Map<String, Any?>

        // Parse scheduled rollout
        @Suppress("UNCHECKED_CAST")
        val scheduledList = config["scheduledRollout"] as? List<Map<String, Any?>>
        val scheduledRollout = scheduledList?.map { step ->
            @Suppress("UNCHECKED_CAST")
            val stepDefaultRuleMap = step["defaultRule"] as? Map<String, Any?>
            val stepDefaultRule = stepDefaultRuleMap?.let {
                DefaultRule(
                    variation = it["variation"] as? String,
                    percentage = (it["percentage"] as? Map<String, Number>)?.mapValues { e -> e.value.toDouble() }
                )
            }

            @Suppress("UNCHECKED_CAST")
            val stepTargetingList = step["targeting"] as? List<Map<String, Any?>>
            val stepTargeting = stepTargetingList?.map { rule ->
                TargetingRule(
                    name = rule["name"] as? String,
                    query = rule["query"] as? String,
                    variation = rule["variation"] as? String,
                    percentage = (rule["percentage"] as? Map<String, Number>)?.mapValues { e -> e.value.toDouble() },
                    disable = rule["disable"] as? Boolean ?: false
                )
            }

            ScheduledStep(
                date = step["date"] as? String,
                defaultRule = stepDefaultRule,
                targeting = stepTargeting
            )
        }

        // Parse experimentation
        @Suppress("UNCHECKED_CAST")
        val experimentMap = config["experimentation"] as? Map<String, Any?>
        val experimentation = experimentMap?.let {
            Experimentation(
                start = it["start"] as? String,
                end = it["end"] as? String,
                variations = (it["variations"] as? Map<String, Number>)?.mapValues { e -> e.value.toDouble() }
            )
        }

        // Parse progressive rollout - check both top-level and inside defaultRule
        @Suppress("UNCHECKED_CAST")
        val topLevelProgressiveMap = config["progressiveRollout"] as? Map<String, Any?>
        val progressiveRollout = when {
            topLevelProgressiveMap != null -> parseProgressiveRollout(topLevelProgressiveMap)
            defaultRuleProgressiveMap != null -> parseProgressiveRollout(defaultRuleProgressiveMap)
            else -> null
        }

        return FeatureFlag(
            key = key,
            variations = variations,
            defaultRule = defaultRule,
            targeting = targeting,
            disable = config["disable"] as? Boolean ?: false,
            trackEvents = config["trackEvents"] as? Boolean ?: false,
            version = config["version"] as? String,
            metadata = metadata,
            scheduledRollout = scheduledRollout,
            experimentation = experimentation,
            progressiveRollout = progressiveRollout
        )
    }

    @Suppress("UNCHECKED_CAST")
    private fun parseProgressiveRollout(map: Map<String, Any?>): ProgressiveRollout {
        val initialMap = map["initial"] as? Map<String, Any?>
        val endMap = map["end"] as? Map<String, Any?>
        val releaseRampMap = map["releaseRamp"] as? Map<String, Any?>

        return ProgressiveRollout(
            initial = initialMap?.let { parseProgressiveStep(it) },
            end = endMap?.let { parseProgressiveStep(it) },
            rampDuration = map["rampDuration"] as? String,
            releaseRamp = releaseRampMap?.let {
                ReleaseRamp(
                    start = it["start"] as? String,
                    end = it["end"] as? String
                )
            }
        )
    }

    private fun parseProgressiveStep(map: Map<String, Any?>): ProgressiveStep {
        return ProgressiveStep(
            variation = map["variation"] as? String,
            percentage = (map["percentage"] as? Number)?.toDouble(),
            date = map["date"] as? String
        )
    }

    // Response classes
    private data class FlagSetsResponse(val flagSets: List<FlagSet>?)
    private data class FlagsResponse(val flags: Map<String, Map<String, Any?>>?)
}

/**
 * Exception for API errors.
 */
class GoffApiException(message: String, cause: Throwable? = null) : Exception(message, cause)

/**
 * Utility to create default flags.
 */
object FlagFactory {
    fun createDefaultFlag(key: String, type: VariationType): FeatureFlag {
        val variations = type.getDefaultVariations()
        return FeatureFlag(
            key = key,
            variations = variations,
            defaultRule = DefaultRule(variation = variations.keys.first()),
            trackEvents = true
        )
    }
}
