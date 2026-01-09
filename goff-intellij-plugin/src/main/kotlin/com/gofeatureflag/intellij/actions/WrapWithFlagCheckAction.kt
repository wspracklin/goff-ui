package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.codegen.CodeGenerator
import com.gofeatureflag.intellij.dialogs.SelectFlagDialog
import com.gofeatureflag.intellij.model.CodeGenerationOptions
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile

/**
 * Action to wrap selected code with a feature flag check.
 */
class WrapWithFlagCheckAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: return

        // Require selection
        if (!editor.selectionModel.hasSelection()) {
            showNotification(project, "Please select code to wrap", NotificationType.WARNING)
            return
        }

        // Determine the language
        val language = detectLanguage(psiFile) ?: run {
            showNotification(project, "Unsupported file type", NotificationType.WARNING)
            return
        }

        val selectedText = editor.selectionModel.selectedText ?: return

        // Show flag selection dialog
        val dialog = SelectFlagDialog(project, language, hasSelection = true)
        if (!dialog.showAndGet()) {
            return
        }

        val flag = dialog.selectedFlag ?: return

        // Generate code with wrapped selection
        val settings = GoffSettings.getInstance()
        val options = CodeGenerationOptions(
            flagKey = flag.key,
            language = language,
            variationType = flag.getVariationType(),
            variations = flag.getVariationNames(),
            variationValues = flag.variations,
            includeElse = dialog.includeElse,
            includeElseIf = dialog.includeElseIf,
            wrapSelection = true,
            selectedCode = selectedText,
            addImport = dialog.addImport,
            relayProxyUrl = settings.relayProxyUrl,
            rolloutStrategy = flag.getRolloutStrategy(),
            hasTargetingRules = flag.getTargetingRuleCount() > 0,
            targetingRuleCount = flag.getTargetingRuleCount()
        )

        val generated = CodeGenerator.generate(options)

        // Replace selection with wrapped code
        WriteCommandAction.runWriteCommandAction(project) {
            replaceSelection(editor, psiFile, generated.code, generated.importStatement, dialog.addImport)
        }

        if (GoffSettings.getInstance().showNotifications) {
            showNotification(project, "Wrapped code with flag check for '${flag.key}'", NotificationType.INFORMATION)
        }
    }

    override fun update(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val editor = e.getData(CommonDataKeys.EDITOR)

        // Only enable if there's a selection and language is supported
        e.presentation.isEnabledAndVisible = psiFile != null &&
                editor != null &&
                editor.selectionModel.hasSelection() &&
                detectLanguage(psiFile) != null
    }

    private fun detectLanguage(psiFile: PsiFile): SupportedLanguage? {
        return SupportedLanguage.fromFileName(psiFile.name)
    }

    private fun replaceSelection(
        editor: Editor,
        psiFile: PsiFile,
        code: String,
        importStatement: String?,
        addImport: Boolean
    ) {
        val document = editor.document
        val project = editor.project ?: return

        val start = editor.selectionModel.selectionStart
        val end = editor.selectionModel.selectionEnd

        // Get indentation of the first selected line
        val lineNumber = document.getLineNumber(start)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineText = document.getText(com.intellij.openapi.util.TextRange(lineStart, start))
        val indent = lineText.takeWhile { it.isWhitespace() }

        // Indent the generated code
        val indentedCode = code.lines().joinToString("\n") { line ->
            if (line.isBlank()) line else "$indent$line"
        }

        // Replace selection
        document.replaceString(start, end, indentedCode)

        // Add import if needed
        if (addImport && importStatement != null) {
            addImportStatement(psiFile, importStatement)
        }

        // Commit changes
        PsiDocumentManager.getInstance(project).commitDocument(document)
    }

    private fun addImportStatement(psiFile: PsiFile, importStatement: String) {
        val document = PsiDocumentManager.getInstance(psiFile.project).getDocument(psiFile) ?: return
        val text = document.text

        if (text.contains(importStatement)) {
            return
        }

        // Simple insertion at beginning for now (can be improved)
        val insertOffset = findImportInsertOffset(text, psiFile)
        document.insertString(insertOffset, "$importStatement\n")
    }

    private fun findImportInsertOffset(text: String, psiFile: PsiFile): Int {
        val language = SupportedLanguage.fromFileName(psiFile.name) ?: return 0
        val lines = text.lines()

        for ((index, line) in lines.withIndex()) {
            val trimmed = line.trim()
            when (language) {
                SupportedLanguage.JAVASCRIPT, SupportedLanguage.TYPESCRIPT -> {
                    if (trimmed.startsWith("import ")) {
                        // Find the last import
                        var lastImportIdx = index
                        for (i in index until lines.size) {
                            if (lines[i].trim().startsWith("import ")) lastImportIdx = i
                            else if (lines[i].isNotBlank() && !lines[i].trim().startsWith("import ")) break
                        }
                        return lines.take(lastImportIdx + 1).sumOf { it.length + 1 }
                    }
                }
                else -> {
                    // Similar logic for other languages
                }
            }
        }

        return 0
    }

    private fun showNotification(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(message, type)
            .notify(project)
    }
}
