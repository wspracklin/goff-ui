package com.gofeatureflag.intellij.services

import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.FlagSet
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.Service
import com.intellij.openapi.diagnostic.Logger
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Service for caching feature flags to improve performance and enable offline access.
 */
@Service
class FlagCacheService {

    private val logger = Logger.getInstance(FlagCacheService::class.java)

    // Cache storage
    private val flagsByFlagSet = ConcurrentHashMap<String, List<FeatureFlag>>()
    private val allFlags = ConcurrentHashMap<String, FeatureFlag>()
    private val flagSets = ConcurrentHashMap<String, FlagSet>()

    // Recent flags (ordered by usage time)
    private val recentFlags = LinkedHashMap<String, Long>(MAX_RECENT_FLAGS, 0.75f, true)

    // Cache metadata
    private val lastSyncTime = AtomicLong(0)
    private val isSyncing = AtomicBoolean(false)

    companion object {
        private const val CACHE_TTL_MS = 5 * 60 * 1000L // 5 minutes
        private const val MAX_RECENT_FLAGS = 10

        fun getInstance(): FlagCacheService {
            return ApplicationManager.getApplication().getService(FlagCacheService::class.java)
        }
    }

    /**
     * Get all cached flags.
     */
    fun getAllFlags(): List<FeatureFlag> = allFlags.values.toList()

    /**
     * Get flags for a specific flag set.
     */
    fun getFlagsForFlagSet(flagSetId: String): List<FeatureFlag> {
        return flagsByFlagSet[flagSetId] ?: emptyList()
    }

    /**
     * Get a specific flag by key.
     */
    fun getFlag(key: String): FeatureFlag? = allFlags[key]

    /**
     * Get all cached flag sets.
     */
    fun getFlagSets(): List<FlagSet> = flagSets.values.toList()

    /**
     * Get recent flags ordered by most recently used.
     */
    fun getRecentFlags(): List<FeatureFlag> {
        synchronized(recentFlags) {
            return recentFlags.keys
                .reversed()
                .take(MAX_RECENT_FLAGS)
                .mapNotNull { allFlags[it] }
        }
    }

    /**
     * Mark a flag as recently used.
     */
    fun markFlagUsed(flagKey: String) {
        synchronized(recentFlags) {
            recentFlags[flagKey] = System.currentTimeMillis()
            // Trim to max size
            while (recentFlags.size > MAX_RECENT_FLAGS) {
                val oldest = recentFlags.entries.minByOrNull { it.value }?.key
                oldest?.let { recentFlags.remove(it) }
            }
        }
        // Persist to settings
        saveRecentFlagsToSettings()
    }

    /**
     * Check if cache is stale and needs refresh.
     */
    fun isCacheStale(): Boolean {
        val elapsed = System.currentTimeMillis() - lastSyncTime.get()
        return elapsed > CACHE_TTL_MS || allFlags.isEmpty()
    }

    /**
     * Sync flags from the server.
     */
    fun syncFlags(onComplete: ((Boolean) -> Unit)? = null) {
        if (isSyncing.getAndSet(true)) {
            logger.info("Sync already in progress, skipping")
            onComplete?.invoke(false)
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                logger.info("Starting flag sync...")
                val client = GoffApiClient()

                // Fetch flag sets
                val fetchedFlagSets = client.getFlagSets()
                flagSets.clear()
                fetchedFlagSets.forEach { flagSets[it.id] = it }

                // Fetch flags from each flag set
                val newAllFlags = ConcurrentHashMap<String, FeatureFlag>()
                flagsByFlagSet.clear()

                for (flagSet in fetchedFlagSets) {
                    try {
                        val flags = client.getFlags(flagSet.id)
                        flagsByFlagSet[flagSet.id] = flags
                        flags.forEach { newAllFlags[it.key] = it }
                    } catch (e: Exception) {
                        logger.warn("Failed to fetch flags for flag set ${flagSet.id}: ${e.message}")
                    }
                }

                allFlags.clear()
                allFlags.putAll(newAllFlags)

                lastSyncTime.set(System.currentTimeMillis())
                logger.info("Flag sync complete: ${allFlags.size} flags from ${flagSets.size} flag sets")

                // Update settings cache
                updateSettingsCache()

                ApplicationManager.getApplication().invokeLater {
                    onComplete?.invoke(true)
                }
            } catch (e: Exception) {
                logger.error("Flag sync failed: ${e.message}", e)
                ApplicationManager.getApplication().invokeLater {
                    onComplete?.invoke(false)
                }
            } finally {
                isSyncing.set(false)
            }
        }
    }

    /**
     * Sync flags if cache is stale.
     */
    fun syncIfNeeded(onComplete: ((Boolean) -> Unit)? = null) {
        if (isCacheStale()) {
            syncFlags(onComplete)
        } else {
            onComplete?.invoke(true)
        }
    }

    /**
     * Search flags by key (fuzzy match).
     */
    fun searchFlags(query: String): List<FeatureFlag> {
        if (query.isBlank()) return getAllFlags()

        val lowerQuery = query.lowercase()
        return allFlags.values
            .filter { flag ->
                flag.key.lowercase().contains(lowerQuery) ||
                        fuzzyMatch(flag.key.lowercase(), lowerQuery)
            }
            .sortedBy { flag ->
                // Prioritize exact prefix matches
                when {
                    flag.key.lowercase().startsWith(lowerQuery) -> 0
                    flag.key.lowercase().contains(lowerQuery) -> 1
                    else -> 2
                }
            }
    }

    /**
     * Simple fuzzy matching.
     */
    private fun fuzzyMatch(text: String, pattern: String): Boolean {
        var patternIdx = 0
        for (char in text) {
            if (patternIdx < pattern.length && char == pattern[patternIdx]) {
                patternIdx++
            }
        }
        return patternIdx == pattern.length
    }

    /**
     * Initialize cache from settings on startup.
     */
    fun initializeFromSettings() {
        try {
            val settings = GoffSettings.getInstance()
            val cached = settings.cachedFlags ?: return
            cached.forEach { cachedFlag ->
                if (cachedFlag.key.isNotBlank()) {
                    val variations = cachedFlag.variations ?: mutableListOf()
                    val flag = FeatureFlag(
                        key = cachedFlag.key,
                        variations = variations.associateWith { it },
                        defaultRule = null
                    )
                    allFlags[cachedFlag.key] = flag
                }
            }
            loadRecentFlagsFromSettings()
            logger.info("Initialized cache from settings: ${allFlags.size} flags")
        } catch (e: Exception) {
            logger.warn("Error initializing from settings: ${e.message}")
        }
    }

    private fun updateSettingsCache() {
        val settings = GoffSettings.getInstance()
        settings.cachedFlags = allFlags.values.map { flag ->
            GoffSettings.CachedFlag(
                key = flag.key,
                variationType = flag.getVariationType().name.lowercase(),
                variations = flag.getVariationNames().toMutableList()
            )
        }.toMutableList()
    }

    private fun saveRecentFlagsToSettings() {
        // Could persist recent flags to settings if needed
    }

    private fun loadRecentFlagsFromSettings() {
        // Could load recent flags from settings if needed
    }
}
