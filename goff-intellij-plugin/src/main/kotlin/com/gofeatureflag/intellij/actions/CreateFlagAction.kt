package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.codegen.CodeGenerator
import com.gofeatureflag.intellij.dialogs.CreateFlagDialog
import com.gofeatureflag.intellij.model.CodeGenerationOptions
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile

/**
 * Action to create a new feature flag and optionally insert a check.
 */
class CreateFlagAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR)
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)

        // Get suggested flag key from selection or context
        val suggestedKey = getSuggestedFlagKey(editor?.selectionModel?.selectedText)

        // Show create flag dialog
        val dialog = CreateFlagDialog(project, suggestedKey)
        if (!dialog.showAndGet()) {
            return
        }

        val flag = dialog.createdFlag ?: return

        if (GoffSettings.getInstance().showNotifications) {
            showNotification(project, "Created flag '${flag.key}'", NotificationType.INFORMATION)
        }

        // Insert flag check if requested and we have an editor
        if (dialog.insertAfterCreate && editor != null && psiFile != null) {
            val language = SupportedLanguage.fromFileName(psiFile.name)
            if (language != null) {
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
                    insertCode(editor, psiFile, generated.code, generated.importStatement)
                }
            }
        }
    }

    override fun update(e: AnActionEvent) {
        // Always available - can create flags without being in a code file
        e.presentation.isEnabledAndVisible = e.project != null
    }

    private fun getSuggestedFlagKey(selectedText: String?): String {
        if (selectedText.isNullOrBlank()) return ""

        // Convert selection to a valid flag key
        return selectedText
            .trim()
            .lowercase()
            .replace(Regex("[^a-z0-9]+"), "-")
            .replace(Regex("^-|-$"), "")
            .take(50)
    }

    private fun insertCode(
        editor: com.intellij.openapi.editor.Editor,
        psiFile: PsiFile,
        code: String,
        importStatement: String?
    ) {
        val document = editor.document
        val project = editor.project ?: return

        val caretOffset = editor.caretModel.offset
        val lineNumber = document.getLineNumber(caretOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineText = document.getText(com.intellij.openapi.util.TextRange(lineStart, caretOffset))
        val indent = lineText.takeWhile { it.isWhitespace() }

        val indentedCode = code.lines().joinToString("\n") { line ->
            if (line.isBlank()) line else "$indent$line"
        }

        document.insertString(caretOffset, indentedCode + "\n")

        // Add import
        if (GoffSettings.getInstance().autoImportEnabled && importStatement != null) {
            val text = document.text
            if (!text.contains(importStatement)) {
                document.insertString(0, "$importStatement\n")
            }
        }

        PsiDocumentManager.getInstance(project).commitDocument(document)
    }

    private fun showNotification(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(message, type)
            .notify(project)
    }
}
