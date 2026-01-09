package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project

/**
 * Action to refresh the cached list of flags from the server.
 */
class RefreshFlagsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val settings = GoffSettings.getInstance()

        if (settings.apiUrl.isBlank()) {
            showNotification(
                project,
                "API URL not configured. Go to Settings > Tools > GO Feature Flag",
                NotificationType.WARNING
            )
            return
        }

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "Refreshing flags...", false) {
            override fun run(indicator: ProgressIndicator) {
                indicator.isIndeterminate = true

                try {
                    val client = GoffApiClient()

                    // Get all flag sets
                    val flagSets = client.getFlagSets()
                    indicator.text = "Found ${flagSets.size} flag sets"

                    // Cache flags from each flag set
                    val cachedFlags = mutableListOf<GoffSettings.CachedFlag>()

                    for ((index, flagSet) in flagSets.withIndex()) {
                        indicator.fraction = index.toDouble() / flagSets.size
                        indicator.text = "Loading flags from ${flagSet.name}..."

                        val flags = client.getFlags(flagSet.id)
                        for (flag in flags) {
                            cachedFlags.add(
                                GoffSettings.CachedFlag(
                                    key = flag.key,
                                    variationType = flag.getVariationType().name.lowercase(),
                                    variations = flag.getVariationNames().toMutableList()
                                )
                            )
                        }
                    }

                    // Update settings
                    ApplicationManager.getApplication().invokeLater {
                        settings.cachedFlags = cachedFlags
                        showNotification(
                            project,
                            "Refreshed ${cachedFlags.size} flags from ${flagSets.size} flag sets",
                            NotificationType.INFORMATION
                        )
                    }

                } catch (ex: Exception) {
                    ApplicationManager.getApplication().invokeLater {
                        showNotification(
                            project,
                            "Failed to refresh flags: ${ex.message}",
                            NotificationType.ERROR
                        )
                    }
                }
            }
        })
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    private fun showNotification(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(message, type)
            .notify(project)
    }
}
