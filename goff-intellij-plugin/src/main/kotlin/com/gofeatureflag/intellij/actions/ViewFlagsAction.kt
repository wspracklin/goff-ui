package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.FlagSet
import com.gofeatureflag.intellij.model.VariationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.table.JBTable
import com.intellij.util.ui.FormBuilder
import java.awt.Dimension
import javax.swing.*
import javax.swing.table.AbstractTableModel

/**
 * Action to view all available feature flags.
 */
class ViewFlagsAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        ViewFlagsDialog(project).show()
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }
}

/**
 * Dialog to display all flags.
 */
class ViewFlagsDialog(project: Project) : DialogWrapper(project) {

    private val flagSetCombo = ComboBox<FlagSet>()
    private val flagsTable = JBTable()
    private var flagSets: List<FlagSet> = emptyList()
    private var flags: List<FeatureFlag> = emptyList()

    init {
        title = "View Feature Flags"
        init()
        loadFlagSets()
    }

    override fun createCenterPanel(): JComponent {
        flagSetCombo.addActionListener { loadFlags() }

        flagsTable.model = FlagsTableModel(emptyList())
        flagsTable.setSelectionMode(ListSelectionModel.SINGLE_SELECTION)
        flagsTable.autoResizeMode = JTable.AUTO_RESIZE_ALL_COLUMNS

        val tableScrollPane = JBScrollPane(flagsTable).apply {
            preferredSize = Dimension(600, 400)
        }

        return FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Flag Set:"), flagSetCombo, 1, false)
            .addLabeledComponent(JBLabel("Flags:"), tableScrollPane, 1, true)
            .panel
    }

    private fun loadFlagSets() {
        try {
            val client = GoffApiClient()
            flagSets = client.getFlagSets()

            flagSetCombo.model = CollectionComboBoxModel(flagSets)
            flagSetCombo.renderer = object : DefaultListCellRenderer() {
                override fun getListCellRendererComponent(
                    list: JList<*>?,
                    value: Any?,
                    index: Int,
                    isSelected: Boolean,
                    cellHasFocus: Boolean
                ): java.awt.Component {
                    super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
                    if (value is FlagSet) {
                        text = value.name
                    }
                    return this
                }
            }

            if (flagSets.isNotEmpty()) {
                flagSetCombo.selectedIndex = 0
                loadFlags()
            }
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                contentPane,
                "Failed to load flag sets: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }

    private fun loadFlags() {
        val selectedFlagSet = flagSetCombo.selectedItem as? FlagSet ?: return

        try {
            val client = GoffApiClient()
            flags = client.getFlags(selectedFlagSet.id)
            flagsTable.model = FlagsTableModel(flags)
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                contentPane,
                "Failed to load flags: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }

    override fun createActions(): Array<Action> {
        return arrayOf(okAction)
    }
}

/**
 * Table model for displaying flags.
 */
class FlagsTableModel(private val flags: List<FeatureFlag>) : AbstractTableModel() {

    private val columns = arrayOf("Key", "Type", "Variations", "Status")

    override fun getRowCount(): Int = flags.size

    override fun getColumnCount(): Int = columns.size

    override fun getColumnName(column: Int): String = columns[column]

    override fun getValueAt(rowIndex: Int, columnIndex: Int): Any {
        val flag = flags[rowIndex]
        return when (columnIndex) {
            0 -> flag.key
            1 -> flag.getVariationType().getDisplayName()
            2 -> flag.getVariationNames().joinToString(", ")
            3 -> if (flag.disable) "Disabled" else "Enabled"
            else -> ""
        }
    }
}
