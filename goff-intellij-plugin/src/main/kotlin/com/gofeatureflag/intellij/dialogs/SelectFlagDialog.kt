package com.gofeatureflag.intellij.dialogs

import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.FlagSet
import com.gofeatureflag.intellij.model.RolloutStrategy
import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Component
import java.awt.Dimension
import java.awt.Font
import javax.swing.*
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.table.AbstractTableModel
import javax.swing.table.DefaultTableCellRenderer

/**
 * Dialog for selecting a feature flag to insert.
 */
class SelectFlagDialog(
    private val project: Project,
    private val language: SupportedLanguage,
    private val hasSelection: Boolean = false
) : DialogWrapper(project) {

    private val flagTableModel = FlagTableModel()
    private val flagTable = JBTable(flagTableModel)
    private val searchField = JBTextField()
    private val flagSetCombo = ComboBox<FlagSet>()
    private val includeElseCheckbox = JBCheckBox("Include else branch", true)
    private val includeElseIfCheckbox = JBCheckBox("Use if/else if chain (for multi-variant flags)", false)
    private val addImportCheckbox = JBCheckBox("Add import statement", true)
    private val wrapSelectionCheckbox = JBCheckBox("Wrap selected code", hasSelection)

    // Details panel components
    private val detailsPanel = JPanel(BorderLayout())
    private val flagNameLabel = JBLabel()
    private val flagTypeLabel = JBLabel()
    private val rolloutTypeLabel = JBLabel()
    private val flagStatusLabel = JBLabel()
    private val descriptionArea = JBTextArea(3, 30)
    private val variationsArea = JBTextArea(3, 30)
    private val defaultRuleArea = JBTextArea(2, 30)
    private val targetingArea = JBTextArea(5, 30)
    private val rolloutDetailsArea = JBTextArea(3, 30)

    private var allFlags: List<FeatureFlag> = emptyList()
    private var filteredFlags: List<FeatureFlag> = emptyList()
    private var flagSets: List<FlagSet> = emptyList()

    var selectedFlag: FeatureFlag? = null
        private set
    var includeElse: Boolean = true
        private set
    var includeElseIf: Boolean = false
        private set
    var addImport: Boolean = true
        private set
    var wrapSelection: Boolean = hasSelection
        private set

    init {
        title = "Select Feature Flag"
        init()
        loadFlagSets()
    }

    override fun createCenterPanel(): JComponent {
        // Search field
        searchField.toolTipText = "Search flags by name"
        searchField.document.addDocumentListener(object : DocumentListener {
            override fun insertUpdate(e: DocumentEvent?) = filterFlags()
            override fun removeUpdate(e: DocumentEvent?) = filterFlags()
            override fun changedUpdate(e: DocumentEvent?) = filterFlags()
        })

        // Flag set combo - show only the name
        flagSetCombo.renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(
                list: JList<*>?,
                value: Any?,
                index: Int,
                isSelected: Boolean,
                cellHasFocus: Boolean
            ): Component {
                super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
                if (value is FlagSet) {
                    text = value.name
                    toolTipText = value.description ?: value.id
                }
                return this
            }
        }
        flagSetCombo.addActionListener {
            loadFlags()
        }

        // Configure table
        flagTable.selectionModel.selectionMode = ListSelectionModel.SINGLE_SELECTION
        flagTable.setShowGrid(false)
        flagTable.intercellSpacing = Dimension(0, 0)
        flagTable.rowHeight = 24
        flagTable.tableHeader.reorderingAllowed = false

        // Set column widths
        flagTable.columnModel.getColumn(0).preferredWidth = 200  // Flag Name
        flagTable.columnModel.getColumn(1).preferredWidth = 80   // Type
        flagTable.columnModel.getColumn(2).preferredWidth = 120  // Strategy

        // Set custom renderers
        flagTable.columnModel.getColumn(0).cellRenderer = FlagNameCellRenderer()
        flagTable.columnModel.getColumn(1).cellRenderer = TypeCellRenderer()
        flagTable.columnModel.getColumn(2).cellRenderer = StrategyCellRenderer()

        flagTable.selectionModel.addListSelectionListener {
            updateOkButton()
            updateDetailsPanel()
        }

        val tableScrollPane = JBScrollPane(flagTable).apply {
            preferredSize = Dimension(420, 350)
        }

        // Options panel
        wrapSelectionCheckbox.isEnabled = hasSelection
        includeElseIfCheckbox.toolTipText = "Use if/else if/else chain instead of switch for string/number flags"

        val optionsPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            add(includeElseCheckbox)
            add(includeElseIfCheckbox)
            add(addImportCheckbox)
            if (hasSelection) {
                add(wrapSelectionCheckbox)
            }
        }

        // Build details panel
        buildDetailsPanel()

        // Left panel with flag table and search
        val leftPanel = FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Flag Set:"), flagSetCombo, 1, false)
            .addLabeledComponent(JBLabel("Search:"), searchField, 1, false)
            .addComponent(tableScrollPane, 1)
            .panel

        // Create split pane
        val splitPane = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, leftPanel, detailsPanel).apply {
            dividerLocation = 450
            resizeWeight = 0.5
        }

        // Main panel
        val mainPanel = JPanel(BorderLayout()).apply {
            add(splitPane, BorderLayout.CENTER)
            add(optionsPanel, BorderLayout.SOUTH)
            preferredSize = Dimension(900, 500)
        }

        return mainPanel
    }

    private fun buildDetailsPanel() {
        // Configure text areas to be read-only and wrap
        listOf(descriptionArea, variationsArea, defaultRuleArea, targetingArea, rolloutDetailsArea).forEach { area ->
            area.isEditable = false
            area.lineWrap = true
            area.wrapStyleWord = true
            area.background = JBUI.CurrentTheme.CustomFrameDecorations.paneBackground()
        }

        // Header section
        flagNameLabel.font = flagNameLabel.font.deriveFont(Font.BOLD, 14f)
        flagTypeLabel.foreground = JBColor.GRAY
        rolloutTypeLabel.foreground = JBColor.GRAY
        flagStatusLabel.font = flagStatusLabel.font.deriveFont(Font.ITALIC)

        val headerPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            border = JBUI.Borders.emptyBottom(10)
            add(flagNameLabel)
            add(Box.createVerticalStrut(4))
            add(flagTypeLabel)
            add(Box.createVerticalStrut(4))
            add(rolloutTypeLabel)
            add(Box.createVerticalStrut(4))
            add(flagStatusLabel)
        }

        // Details form
        val detailsForm = FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Description:"), JBScrollPane(descriptionArea).apply {
                preferredSize = Dimension(300, 50)
            }, 1, true)
            .addLabeledComponent(JBLabel("Variations:"), JBScrollPane(variationsArea).apply {
                preferredSize = Dimension(300, 50)
            }, 1, true)
            .addLabeledComponent(JBLabel("Default Rule:"), JBScrollPane(defaultRuleArea).apply {
                preferredSize = Dimension(300, 40)
            }, 1, true)
            .addLabeledComponent(JBLabel("Rollout Details:"), JBScrollPane(rolloutDetailsArea).apply {
                preferredSize = Dimension(300, 60)
            }, 1, true)
            .addLabeledComponent(JBLabel("Targeting Rules:"), JBScrollPane(targetingArea).apply {
                preferredSize = Dimension(300, 80)
            }, 1, true)
            .panel

        detailsPanel.apply {
            border = JBUI.Borders.empty(10)
            add(headerPanel, BorderLayout.NORTH)
            add(detailsForm, BorderLayout.CENTER)
        }

        // Set initial state
        clearDetailsPanel()
    }

    private fun updateDetailsPanel() {
        val selectedRow = flagTable.selectedRow
        if (selectedRow < 0 || selectedRow >= filteredFlags.size) {
            clearDetailsPanel()
            return
        }
        val flag = filteredFlags[selectedRow]

        // Header info
        val strategy = flag.getRolloutStrategy()
        flagNameLabel.text = "${strategy.icon} ${flag.key}"
        flagTypeLabel.text = "Type: ${flag.getVariationType().getDisplayName()}"
        rolloutTypeLabel.text = "Strategy: ${strategy.icon} ${strategy.displayName}"
        flagStatusLabel.text = if (flag.disable) "Status: Disabled" else "Status: Enabled"
        flagStatusLabel.foreground = if (flag.disable) JBColor.RED else JBColor.GREEN

        // Description
        val description = flag.getDescription()
        descriptionArea.text = description ?: "No description available"
        descriptionArea.foreground = if (description != null) JBColor.foreground() else JBColor.GRAY

        // Variations
        val variationsText = flag.variations.entries.joinToString("\n") { (name, value) ->
            "$name = $value"
        }
        variationsArea.text = if (variationsText.isNotEmpty()) variationsText else "No variations defined"

        // Default rule
        defaultRuleArea.text = flag.getDefaultRuleSummary()

        // Rollout details based on strategy
        rolloutDetailsArea.text = getRolloutDetails(flag)
        rolloutDetailsArea.foreground = if (rolloutDetailsArea.text.isNotEmpty() &&
            !rolloutDetailsArea.text.startsWith("No ")) JBColor.foreground() else JBColor.GRAY

        // Targeting rules
        val targeting = flag.targeting
        if (targeting.isNullOrEmpty()) {
            targetingArea.text = "No targeting rules defined"
            targetingArea.foreground = JBColor.GRAY
        } else {
            val targetingText = targeting.mapIndexed { index, rule ->
                val ruleNum = index + 1
                val condition = rule.getQueryDisplay()
                val outcome = rule.getSummary()
                "Rule $ruleNum: $condition\n  -> $outcome"
            }.joinToString("\n\n")
            targetingArea.text = targetingText
            targetingArea.foreground = JBColor.foreground()
        }
    }

    private fun getRolloutDetails(flag: FeatureFlag): String {
        val strategy = flag.getRolloutStrategy()
        return when (strategy) {
            RolloutStrategy.SCHEDULED -> {
                flag.scheduledRollout?.joinToString("\n") { it.getSummary() } ?: "Scheduled rollout configured"
            }
            RolloutStrategy.EXPERIMENT -> {
                flag.experimentation?.getSummary() ?: "Experiment configured"
            }
            RolloutStrategy.PROGRESSIVE -> {
                flag.progressiveRollout?.getSummary() ?: "Progressive rollout configured"
            }
            RolloutStrategy.PERCENTAGE, RolloutStrategy.TARGETED_PERCENTAGE -> {
                "Percentage distribution in default rule"
            }
            RolloutStrategy.TARGETED -> {
                "${flag.getTargetingRuleCount()} targeting rule(s)"
            }
            RolloutStrategy.STATIC -> {
                val variationName = flag.defaultRule?.variation ?: "default"
                val variationValue = flag.variations[variationName]
                if (variationValue != null && variationValue != variationName) {
                    "Fixed rollout to: $variationName ($variationValue)"
                } else {
                    "Fixed rollout to: $variationName"
                }
            }
            RolloutStrategy.DISABLED -> {
                "Flag is disabled"
            }
        }
    }

    private fun clearDetailsPanel() {
        flagNameLabel.text = "Select a flag to view details"
        flagTypeLabel.text = ""
        rolloutTypeLabel.text = ""
        flagStatusLabel.text = ""
        descriptionArea.text = ""
        variationsArea.text = ""
        defaultRuleArea.text = ""
        rolloutDetailsArea.text = ""
        targetingArea.text = ""
    }

    private fun loadFlagSets() {
        try {
            val client = GoffApiClient()
            flagSets = client.getFlagSets()

            val model = CollectionComboBoxModel(flagSets)
            flagSetCombo.model = model

            // Select default flag set if configured
            val defaultFlagSet = GoffSettings.getInstance().defaultFlagSet
            if (defaultFlagSet.isNotBlank()) {
                flagSets.find { it.id == defaultFlagSet }?.let {
                    flagSetCombo.selectedItem = it
                }
            } else if (flagSets.isNotEmpty()) {
                flagSetCombo.selectedIndex = 0
            }

            loadFlags()
        } catch (e: Exception) {
            showError("Failed to load flag sets: ${e.message}")
        }
    }

    private fun loadFlags() {
        val selectedFlagSet = flagSetCombo.selectedItem as? FlagSet ?: return

        try {
            val client = GoffApiClient()
            allFlags = client.getFlags(selectedFlagSet.id)
            filterFlags()
        } catch (e: Exception) {
            showError("Failed to load flags: ${e.message}")
        }
    }

    private fun filterFlags() {
        val searchText = searchField.text.lowercase()
        filteredFlags = if (searchText.isBlank()) {
            allFlags
        } else {
            allFlags.filter { it.key.lowercase().contains(searchText) }
        }

        flagTableModel.setFlags(filteredFlags)
    }

    private fun updateOkButton() {
        val selectedRow = flagTable.selectedRow
        isOKActionEnabled = selectedRow >= 0 && selectedRow < filteredFlags.size
    }

    private fun showError(message: String) {
        JOptionPane.showMessageDialog(
            contentPane,
            message,
            "Error",
            JOptionPane.ERROR_MESSAGE
        )
    }

    override fun doOKAction() {
        val selectedRow = flagTable.selectedRow
        selectedFlag = if (selectedRow >= 0 && selectedRow < filteredFlags.size) {
            filteredFlags[selectedRow]
        } else null
        includeElse = includeElseCheckbox.isSelected
        includeElseIf = includeElseIfCheckbox.isSelected
        addImport = addImportCheckbox.isSelected
        wrapSelection = wrapSelectionCheckbox.isSelected
        super.doOKAction()
    }
}

/**
 * Table model for the flag list.
 */
class FlagTableModel : AbstractTableModel() {
    private var flags: List<FeatureFlag> = emptyList()
    private val columnNames = arrayOf("Flag Name", "Type", "Strategy")

    fun setFlags(newFlags: List<FeatureFlag>) {
        flags = newFlags
        fireTableDataChanged()
    }

    fun getFlag(row: Int): FeatureFlag? = flags.getOrNull(row)

    override fun getRowCount(): Int = flags.size
    override fun getColumnCount(): Int = columnNames.size
    override fun getColumnName(column: Int): String = columnNames[column]

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any? {
        val flag = flags.getOrNull(rowIndex) ?: return null
        return when (columnIndex) {
            0 -> flag  // Flag name column - pass the whole flag for rendering
            1 -> flag.getVariationType()
            2 -> flag.getRolloutStrategy()
            else -> null
        }
    }
}

/**
 * Cell renderer for flag name column.
 */
class FlagNameCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(
        table: JTable?,
        value: Any?,
        isSelected: Boolean,
        hasFocus: Boolean,
        row: Int,
        column: Int
    ): Component {
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)

        if (value is FeatureFlag) {
            text = value.key
            toolTipText = value.getDescription() ?: "No description"
        }

        return this
    }
}

/**
 * Cell renderer for type column.
 */
class TypeCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(
        table: JTable?,
        value: Any?,
        isSelected: Boolean,
        hasFocus: Boolean,
        row: Int,
        column: Int
    ): Component {
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)

        if (value is VariationType) {
            val icon = when (value) {
                VariationType.BOOLEAN -> "🔘"
                VariationType.STRING -> "📝"
                VariationType.NUMBER -> "🔢"
                VariationType.JSON -> "📦"
            }
            text = "$icon ${value.getDisplayName()}"
            toolTipText = value.getDisplayName()
        }

        return this
    }
}

/**
 * Cell renderer for strategy column.
 */
class StrategyCellRenderer : DefaultTableCellRenderer() {
    override fun getTableCellRendererComponent(
        table: JTable?,
        value: Any?,
        isSelected: Boolean,
        hasFocus: Boolean,
        row: Int,
        column: Int
    ): Component {
        super.getTableCellRendererComponent(table, value, isSelected, hasFocus, row, column)

        if (value is RolloutStrategy) {
            text = "${value.icon} ${value.displayName}"
            toolTipText = value.description

            // Color code based on strategy
            if (!isSelected) {
                foreground = when (value) {
                    RolloutStrategy.DISABLED -> JBColor.RED
                    RolloutStrategy.EXPERIMENT -> JBColor.BLUE
                    RolloutStrategy.SCHEDULED -> JBColor.ORANGE
                    RolloutStrategy.PROGRESSIVE -> JBColor.CYAN
                    else -> JBColor.foreground()
                }
            }
        }

        return this
    }
}
