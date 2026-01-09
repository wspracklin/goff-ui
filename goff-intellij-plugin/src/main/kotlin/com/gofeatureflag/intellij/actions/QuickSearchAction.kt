package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.codegen.CodeGenerator
import com.gofeatureflag.intellij.model.CodeGenerationOptions
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.services.FlagCacheService
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.ide.actions.searcheverywhere.SearchEverywhereContributor
import com.intellij.ide.actions.searcheverywhere.SearchEverywhereContributorFactory
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.util.ProgressIndicatorBase
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.Processor
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.*
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener

/**
 * Quick search popup for fast flag insertion.
 * Accessible via Ctrl+Shift+G.
 */
class QuickSearchAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: return

        val language = SupportedLanguage.fromFileName(psiFile.name) ?: run {
            showNotification(project, "Unsupported file type", NotificationType.WARNING)
            return
        }

        // Ensure cache is synced
        FlagCacheService.getInstance().syncIfNeeded()

        // Show quick search popup
        val popup = QuickSearchPopup(project, editor, psiFile, language)
        popup.show()
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
 * Quick search popup UI.
 */
class QuickSearchPopup(
    private val project: Project,
    private val editor: Editor,
    private val psiFile: PsiFile,
    private val language: SupportedLanguage
) {
    private var popup: JBPopup? = null
    private val searchField = SearchTextField(true)
    private val flagListModel = DefaultListModel<FeatureFlag>()
    private val flagList = JBList(flagListModel)
    private val cacheService = FlagCacheService.getInstance()

    init {
        setupUI()
        loadFlags("")
    }

    private fun setupUI() {
        // Search field
        searchField.textEditor.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent?) = onSearchChanged()
            override fun removeUpdate(e: DocumentEvent?) = onSearchChanged()
            override fun changedUpdate(e: DocumentEvent?) = onSearchChanged()
        })

        // Flag list
        flagList.cellRenderer = FlagListRenderer()
        flagList.selectionMode = ListSelectionModel.SINGLE_SELECTION

        // Double-click to insert
        flagList.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(e: MouseEvent) {
                if (e.clickCount == 2) {
                    insertSelectedFlag()
                }
            }
        })

        // Keyboard navigation
        searchField.textEditor.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                when (e.keyCode) {
                    KeyEvent.VK_DOWN -> {
                        flagList.requestFocus()
                        if (flagList.selectedIndex < 0 && flagListModel.size > 0) {
                            flagList.selectedIndex = 0
                        }
                    }
                    KeyEvent.VK_ENTER -> insertSelectedFlag()
                    KeyEvent.VK_ESCAPE -> popup?.cancel()
                }
            }
        })

        flagList.addKeyListener(object : KeyAdapter() {
            override fun keyPressed(e: KeyEvent) {
                when (e.keyCode) {
                    KeyEvent.VK_ENTER -> insertSelectedFlag()
                    KeyEvent.VK_ESCAPE -> popup?.cancel()
                    KeyEvent.VK_UP -> {
                        if (flagList.selectedIndex == 0) {
                            searchField.textEditor.requestFocus()
                        }
                    }
                }
            }
        })
    }

    private fun onSearchChanged() {
        val query = searchField.text
        loadFlags(query)
    }

    private fun loadFlags(query: String) {
        flagListModel.clear()

        // Add recent flags first if query is empty
        if (query.isBlank()) {
            val recentFlags = cacheService.getRecentFlags()
            recentFlags.forEach { flagListModel.addElement(it) }
        }

        // Search and add matching flags
        val flags = cacheService.searchFlags(query)
        val recentKeys = cacheService.getRecentFlags().map { it.key }.toSet()

        for (flag in flags) {
            // Skip if already added as recent
            if (query.isBlank() && flag.key in recentKeys) continue
            flagListModel.addElement(flag)
        }

        // Select first item
        if (flagListModel.size > 0) {
            flagList.selectedIndex = 0
        }
    }

    private fun insertSelectedFlag() {
        val selectedFlag = flagList.selectedValue ?: return

        // Mark as used
        cacheService.markFlagUsed(selectedFlag.key)

        // Generate code
        val settings = GoffSettings.getInstance()
        val options = CodeGenerationOptions(
            flagKey = selectedFlag.key,
            language = language,
            variationType = selectedFlag.getVariationType(),
            variations = selectedFlag.getVariationNames(),
            variationValues = selectedFlag.variations,
            includeElse = true,
            includeElseIf = false,
            wrapSelection = false,
            addImport = settings.autoImportEnabled,
            relayProxyUrl = settings.relayProxyUrl,
            rolloutStrategy = selectedFlag.getRolloutStrategy(),
            hasTargetingRules = selectedFlag.getTargetingRuleCount() > 0,
            targetingRuleCount = selectedFlag.getTargetingRuleCount()
        )

        val generated = CodeGenerator.generate(options)

        // Insert code
        WriteCommandAction.runWriteCommandAction(project) {
            insertCode(generated.code, generated.importStatement)
        }

        // Close popup
        popup?.cancel()

        // Show notification
        if (GoffSettings.getInstance().showNotifications) {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("GO Feature Flag")
                .createNotification("Inserted flag check for '${selectedFlag.key}'", NotificationType.INFORMATION)
                .notify(project)
        }
    }

    private fun insertCode(code: String, importStatement: String?) {
        val document = editor.document

        // Get indentation
        val caretOffset = editor.caretModel.offset
        val lineNumber = document.getLineNumber(caretOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineText = document.getText(com.intellij.openapi.util.TextRange(lineStart, caretOffset))
        val indent = lineText.takeWhile { it.isWhitespace() }

        // Indent code
        val indentedCode = code.lines().joinToString("\n") { line ->
            if (line.isBlank()) line else "$indent$line"
        }

        // Insert
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

    fun show() {
        val panel = JPanel(BorderLayout()).apply {
            preferredSize = Dimension(400, 300)
            border = JBUI.Borders.empty(8)

            add(JPanel(BorderLayout()).apply {
                add(JBLabel("Search flags:"), BorderLayout.WEST)
                add(searchField, BorderLayout.CENTER)
            }, BorderLayout.NORTH)

            add(JBScrollPane(flagList).apply {
                border = JBUI.Borders.emptyTop(8)
            }, BorderLayout.CENTER)

            add(JBLabel("Enter to insert, Esc to cancel").apply {
                foreground = JBUI.CurrentTheme.ContextHelp.FOREGROUND
                border = JBUI.Borders.emptyTop(4)
            }, BorderLayout.SOUTH)
        }

        popup = JBPopupFactory.getInstance()
            .createComponentPopupBuilder(panel, searchField.textEditor)
            .setTitle("Quick Insert Flag")
            .setMovable(true)
            .setResizable(true)
            .setRequestFocus(true)
            .createPopup()

        popup?.showInBestPositionFor(editor)
    }
}

/**
 * Renderer for flag list items.
 */
class FlagListRenderer : DefaultListCellRenderer() {
    override fun getListCellRendererComponent(
        list: JList<*>?,
        value: Any?,
        index: Int,
        isSelected: Boolean,
        cellHasFocus: Boolean
    ): Component {
        super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)

        if (value is FeatureFlag) {
            val typeIcon = when (value.getVariationType()) {
                VariationType.BOOLEAN -> "🔘"
                VariationType.STRING -> "📝"
                VariationType.NUMBER -> "🔢"
                VariationType.JSON -> "📦"
            }

            val recentFlags = FlagCacheService.getInstance().getRecentFlags()
            val isRecent = recentFlags.any { it.key == value.key }
            val recentMarker = if (isRecent) " ★" else ""

            text = "$typeIcon ${value.key}$recentMarker"
            toolTipText = "Type: ${value.getVariationType().getDisplayName()}, Variations: ${value.getVariationNames().joinToString(", ")}"
        }

        return this
    }
}
