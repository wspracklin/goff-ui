package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.codegen.CodeGenerator
import com.gofeatureflag.intellij.model.CodeGenerationOptions
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.services.FlagCacheService
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.openapi.ui.popup.ListPopup
import com.intellij.openapi.ui.popup.PopupStep
import com.intellij.openapi.ui.popup.util.BaseListPopupStep
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.codeStyle.CodeStyleManager
import javax.swing.Icon

/**
 * Action to show and insert recently used flags.
 * Accessible via Alt+Shift+R.
 */
class RecentFlagsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: return

        val language = SupportedLanguage.fromFileName(psiFile.name) ?: run {
            showNotification(project, "Unsupported file type", NotificationType.WARNING)
            return
        }

        val cacheService = FlagCacheService.getInstance()
        val recentFlags = cacheService.getRecentFlags()

        if (recentFlags.isEmpty()) {
            showNotification(project, "No recent flags. Use 'Insert Flag Check' to add flags.", NotificationType.INFORMATION)
            return
        }

        // Create popup
        val popup = JBPopupFactory.getInstance().createListPopup(
            RecentFlagsPopupStep(project, editor, psiFile, language, recentFlags)
        )

        popup.showInBestPositionFor(editor)
    }

    override fun update(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val editor = e.getData(CommonDataKeys.EDITOR)
        e.presentation.isEnabledAndVisible = psiFile != null && editor != null
    }

    private fun showNotification(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(message, type)
            .notify(project)
    }
}

/**
 * Popup step for recent flags selection.
 */
class RecentFlagsPopupStep(
    private val project: Project,
    private val editor: com.intellij.openapi.editor.Editor,
    private val psiFile: com.intellij.psi.PsiFile,
    private val language: SupportedLanguage,
    flags: List<FeatureFlag>
) : BaseListPopupStep<FeatureFlag>("Recent Flags", flags) {

    override fun getTextFor(value: FeatureFlag): String {
        val typeIcon = when (value.getVariationType()) {
            VariationType.BOOLEAN -> "🔘"
            VariationType.STRING -> "📝"
            VariationType.NUMBER -> "🔢"
            VariationType.JSON -> "📦"
        }
        return "$typeIcon ${value.key}"
    }

    override fun onChosen(selectedValue: FeatureFlag, finalChoice: Boolean): PopupStep<*>? {
        if (finalChoice) {
            insertFlag(selectedValue)
        }
        return FINAL_CHOICE
    }

    override fun isSpeedSearchEnabled(): Boolean = true

    private fun insertFlag(flag: FeatureFlag) {
        val cacheService = FlagCacheService.getInstance()
        cacheService.markFlagUsed(flag.key)

        val settings = GoffSettings.getInstance()
        val options = CodeGenerationOptions(
            flagKey = flag.key,
            language = language,
            variationType = flag.getVariationType(),
            variations = flag.getVariationNames(),
            variationValues = flag.variations,
            includeElse = true,
            includeElseIf = false,
            wrapSelection = false,
            addImport = settings.autoImportEnabled,
            relayProxyUrl = settings.relayProxyUrl,
            rolloutStrategy = flag.getRolloutStrategy(),
            hasTargetingRules = flag.getTargetingRuleCount() > 0,
            targetingRuleCount = flag.getTargetingRuleCount()
        )

        val generated = CodeGenerator.generate(options)

        WriteCommandAction.runWriteCommandAction(project) {
            val document = editor.document
            val caretOffset = editor.caretModel.offset

            // Insert the code
            val insertStart = caretOffset
            document.insertString(caretOffset, generated.code + "\n")
            val insertEnd = caretOffset + generated.code.length + 1

            // Commit before adding imports
            PsiDocumentManager.getInstance(project).commitDocument(document)

            // Add import if needed
            if (settings.autoImportEnabled && generated.importStatement != null) {
                val text = document.text
                if (!text.contains(generated.importStatement)) {
                    document.insertString(0, "${generated.importStatement}\n")
                    PsiDocumentManager.getInstance(project).commitDocument(document)
                }
            }

            // Format the inserted code according to project code style
            try {
                val codeStyleManager = CodeStyleManager.getInstance(project)
                val safeEnd = minOf(insertEnd, document.textLength)
                if (insertStart < safeEnd) {
                    codeStyleManager.reformatText(psiFile, insertStart, safeEnd)
                }
            } catch (e: Exception) {
                // Formatting failed, but code was still inserted
            }
        }

        if (settings.showNotifications) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("GO Feature Flag")
                .createNotification("Inserted flag check for '${flag.key}'", NotificationType.INFORMATION)
                .notify(project)
        }
    }
}
