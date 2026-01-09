package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.codegen.CodeGenerator
import com.gofeatureflag.intellij.dependencies.DependencyManager
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
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.openapi.util.TextRange

/**
 * Action to insert a feature flag check at the cursor position.
 */
class InsertFlagCheckAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: return

        // Determine the language
        val language = detectLanguage(psiFile) ?: run {
            showNotification(project, "Unsupported file type", NotificationType.WARNING)
            return
        }

        // Check if there's a selection
        val hasSelection = editor.selectionModel.hasSelection()
        val selectedText = if (hasSelection) editor.selectionModel.selectedText else null

        // Show flag selection dialog
        val dialog = SelectFlagDialog(project, language, hasSelection)
        if (!dialog.showAndGet()) {
            return
        }

        val flag = dialog.selectedFlag ?: return

        // Generate code
        val settings = GoffSettings.getInstance()
        val options = CodeGenerationOptions(
            flagKey = flag.key,
            language = language,
            variationType = flag.getVariationType(),
            variations = flag.getVariationNames(),
            variationValues = flag.variations,
            includeElse = dialog.includeElse,
            includeElseIf = dialog.includeElseIf,
            wrapSelection = dialog.wrapSelection,
            selectedCode = selectedText,
            addImport = dialog.addImport,
            relayProxyUrl = settings.relayProxyUrl,
            rolloutStrategy = flag.getRolloutStrategy(),
            hasTargetingRules = flag.getTargetingRuleCount() > 0,
            targetingRuleCount = flag.getTargetingRuleCount()
        )

        val generated = CodeGenerator.generate(options)

        // Insert code
        WriteCommandAction.runWriteCommandAction(project) {
            insertCode(editor, psiFile, generated.code, generated.importStatement, dialog.addImport)
        }

        // Check and install dependencies if needed
        DependencyManager.ensureDependencies(project, language, psiFile.virtualFile?.parent)

        if (GoffSettings.getInstance().showNotifications) {
            showNotification(project, "Inserted flag check for '${flag.key}'", NotificationType.INFORMATION)
        }
    }

    override fun update(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val editor = e.getData(CommonDataKeys.EDITOR)

        e.presentation.isEnabledAndVisible = psiFile != null &&
                editor != null &&
                detectLanguage(psiFile) != null
    }

    private fun detectLanguage(psiFile: PsiFile): SupportedLanguage? {
        val fileName = psiFile.name
        return SupportedLanguage.fromFileName(fileName)
    }

    private fun insertCode(
        editor: Editor,
        psiFile: PsiFile,
        code: String,
        importStatement: String?,
        addImport: Boolean
    ) {
        val document = editor.document
        val project = editor.project ?: return

        val caretOffset = editor.caretModel.offset

        // Get the indentation at the current cursor position
        val currentLineNumber = document.getLineNumber(caretOffset)
        val lineStartOffset = document.getLineStartOffset(currentLineNumber)
        val lineEndOffset = document.getLineEndOffset(currentLineNumber)
        val currentLine = document.getText(TextRange(lineStartOffset, lineEndOffset))

        // Extract indentation (spaces/tabs at the beginning of the line)
        val indentation = currentLine.takeWhile { it == ' ' || it == '\t' }

        // Apply indentation to each line of the generated code
        val indentedCode = applyIndentation(code, indentation)

        // Determine insert position - if cursor is at start of line, insert before; otherwise insert on new line
        val insertAtStartOfLine = caretOffset == lineStartOffset ||
            document.getText(TextRange(lineStartOffset, caretOffset)).isBlank()

        val insertStart: Int
        val insertEnd: Int
        val textToInsert: String

        if (editor.selectionModel.hasSelection()) {
            // Replace selection
            insertStart = editor.selectionModel.selectionStart
            val selectionEnd = editor.selectionModel.selectionEnd

            // Get indentation from selection start line
            val selStartLine = document.getLineNumber(insertStart)
            val selLineStart = document.getLineStartOffset(selStartLine)
            val selLine = document.getText(TextRange(selLineStart, document.getLineEndOffset(selStartLine)))
            val selIndent = selLine.takeWhile { it == ' ' || it == '\t' }

            textToInsert = applyIndentation(code, selIndent) + "\n"
            document.replaceString(insertStart, selectionEnd, textToInsert)
            insertEnd = insertStart + textToInsert.length
        } else if (insertAtStartOfLine) {
            // Insert at current position (start of line or empty line)
            insertStart = lineStartOffset
            textToInsert = indentedCode + "\n"
            document.insertString(insertStart, textToInsert)
            insertEnd = insertStart + textToInsert.length
        } else {
            // Insert on a new line below
            insertStart = lineEndOffset
            textToInsert = "\n" + indentedCode
            document.insertString(insertStart, textToInsert)
            insertEnd = insertStart + textToInsert.length
        }

        // Commit changes before formatting
        PsiDocumentManager.getInstance(project).commitDocument(document)

        // Add import if needed (do this after main code insertion)
        if (addImport && importStatement != null) {
            addImportStatement(psiFile, importStatement)
            PsiDocumentManager.getInstance(project).commitDocument(document)
        }

        // Format the inserted code according to project code style
        try {
            // Re-get the PSI file after document changes
            val updatedPsiFile = PsiDocumentManager.getInstance(project).getPsiFile(document)
            if (updatedPsiFile != null) {
                val codeStyleManager = CodeStyleManager.getInstance(project)

                // Calculate safe range (account for possible offset changes from import insertion)
                val safeStart = maxOf(0, minOf(insertStart, document.textLength - 1))
                val safeEnd = minOf(insertEnd, document.textLength)

                if (safeStart < safeEnd) {
                    codeStyleManager.reformatText(updatedPsiFile, safeStart, safeEnd)
                }
            }
        } catch (e: Exception) {
            // Formatting failed, but code was still inserted - that's okay
        }
    }

    /**
     * Apply base indentation to each line of code.
     */
    private fun applyIndentation(code: String, baseIndentation: String): String {
        if (baseIndentation.isEmpty()) return code

        val lines = code.lines()
        return lines.mapIndexed { index, line ->
            if (index == 0) {
                // First line gets base indentation
                baseIndentation + line.trimStart()
            } else if (line.isBlank()) {
                // Keep blank lines as-is
                line
            } else {
                // Other lines: add base indentation, preserving relative indentation
                val trimmedLine = line.trimStart()
                val originalIndent = line.length - trimmedLine.length
                val relativeIndent = " ".repeat(originalIndent)
                baseIndentation + relativeIndent + trimmedLine
            }
        }.joinToString("\n")
    }

    private fun addImportStatement(psiFile: PsiFile, importStatement: String) {
        val document = PsiDocumentManager.getInstance(psiFile.project).getDocument(psiFile) ?: return
        val text = document.text

        // Check if import already exists
        if (text.contains(importStatement)) {
            return
        }

        // Find the best place to insert the import
        val insertOffset = findImportInsertOffset(text, psiFile)

        document.insertString(insertOffset, "$importStatement\n")
    }

    private fun findImportInsertOffset(text: String, psiFile: PsiFile): Int {
        val language = SupportedLanguage.fromFileName(psiFile.name) ?: return 0

        // Find existing imports or package declaration
        val lines = text.lines()
        var lastImportLine = -1
        var packageLine = -1

        for ((index, line) in lines.withIndex()) {
            val trimmed = line.trim()
            when (language) {
                SupportedLanguage.GO -> {
                    if (trimmed.startsWith("package ")) packageLine = index
                    if (trimmed.startsWith("import ")) lastImportLine = index
                }
                SupportedLanguage.JAVA, SupportedLanguage.KOTLIN -> {
                    if (trimmed.startsWith("package ")) packageLine = index
                    if (trimmed.startsWith("import ")) lastImportLine = index
                }
                SupportedLanguage.PYTHON -> {
                    if (trimmed.startsWith("import ") || trimmed.startsWith("from ")) lastImportLine = index
                }
                SupportedLanguage.JAVASCRIPT, SupportedLanguage.TYPESCRIPT -> {
                    if (trimmed.startsWith("import ")) lastImportLine = index
                }
                SupportedLanguage.CSHARP -> {
                    if (trimmed.startsWith("using ")) lastImportLine = index
                    if (trimmed.startsWith("namespace ")) packageLine = index
                }
                SupportedLanguage.RUST -> {
                    if (trimmed.startsWith("use ")) lastImportLine = index
                }
                SupportedLanguage.PHP -> {
                    if (trimmed.startsWith("use ")) lastImportLine = index
                    if (trimmed.startsWith("namespace ")) packageLine = index
                }
                SupportedLanguage.RUBY -> {
                    if (trimmed.startsWith("require ")) lastImportLine = index
                }
                SupportedLanguage.SWIFT -> {
                    if (trimmed.startsWith("import ")) lastImportLine = index
                }
                SupportedLanguage.DART -> {
                    if (trimmed.startsWith("import ")) lastImportLine = index
                }
            }
        }

        // Calculate offset
        return when {
            lastImportLine >= 0 -> {
                // Insert after the last import
                lines.take(lastImportLine + 1).sumOf { it.length + 1 }
            }
            packageLine >= 0 -> {
                // Insert after package declaration with blank line
                lines.take(packageLine + 1).sumOf { it.length + 1 } + 1
            }
            else -> 0
        }
    }

    private fun showNotification(project: Project, message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("GO Feature Flag")
            .createNotification(message, type)
            .notify(project)
    }
}
