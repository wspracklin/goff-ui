package com.gofeatureflag.intellij.startup

import com.gofeatureflag.intellij.services.FlagCacheService
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.startup.StartupActivity
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

/**
 * Startup activity that initializes the flag cache and sets up background sync.
 */
class FlagSyncStartupActivity : StartupActivity.Background {

    private val logger = Logger.getInstance(FlagSyncStartupActivity::class.java)

    companion object {
        private const val SYNC_INTERVAL_SECONDS = 30L
        private var scheduler: ScheduledExecutorService? = null
    }

    override fun runActivity(project: Project) {
        logger.info("GO Feature Flag plugin starting...")

        val cacheService = FlagCacheService.getInstance()
        val settings = GoffSettings.getInstance()

        // Initialize from settings cache first (for immediate availability)
        try {
            cacheService.initializeFromSettings()
        } catch (e: Exception) {
            logger.warn("Failed to initialize from settings: ${e.message}")
        }

        // Check if API is configured
        if (settings.apiUrl.isBlank()) {
            logger.info("API URL not configured, skipping initial sync")
            showConfigurationReminder(project)
            return
        }

        // Perform initial sync
        cacheService.syncFlags { success ->
            if (success) {
                logger.info("Initial flag sync successful")
                if (settings.showNotifications) {
                    showNotification(
                        project,
                        "GO Feature Flag connected",
                        "Loaded ${cacheService.getAllFlags().size} flags",
                        NotificationType.INFORMATION
                    )
                }
            } else {
                logger.warn("Initial flag sync failed")
                if (settings.showNotifications) {
                    showNotification(
                        project,
                        "GO Feature Flag sync failed",
                        "Could not connect to ${settings.apiUrl}",
                        NotificationType.WARNING
                    )
                }
            }
        }

        // Set up periodic background sync
        setupBackgroundSync(project)
    }

    private fun setupBackgroundSync(project: Project) {
        // Shutdown existing scheduler if any
        scheduler?.shutdownNow()

        // Create new scheduler
        scheduler = Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r, "GO-Feature-Flag-Sync").apply { isDaemon = true }
        }

        scheduler?.scheduleWithFixedDelay(
            {
                try {
                    val cacheService = FlagCacheService.getInstance()
                    cacheService.syncFlags { success ->
                        if (success) {
                            logger.debug("Background flag sync completed")
                        } else {
                            logger.debug("Background flag sync failed")
                        }
                    }
                } catch (e: Exception) {
                    logger.warn("Background sync error: ${e.message}")
                }
            },
            SYNC_INTERVAL_SECONDS,
            SYNC_INTERVAL_SECONDS,
            TimeUnit.SECONDS
        )

        logger.info("Background sync scheduled every $SYNC_INTERVAL_SECONDS seconds")
    }

    private fun showConfigurationReminder(project: Project) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(
                "GO Feature Flag",
                "Configure the API URL in Settings > Tools > GO Feature Flag to enable flag features.",
                NotificationType.INFORMATION
            )
            .notify(project)
    }

    private fun showNotification(
        project: Project,
        title: String,
        content: String,
        type: NotificationType
    ) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(title, content, type)
            .notify(project)
    }
}
