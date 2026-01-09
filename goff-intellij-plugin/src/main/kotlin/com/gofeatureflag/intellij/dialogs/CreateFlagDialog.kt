package com.gofeatureflag.intellij.dialogs

import com.gofeatureflag.intellij.api.FlagFactory
import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.model.FeatureFlag
import com.gofeatureflag.intellij.model.FlagSet
import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import java.awt.Dimension
import javax.swing.*

/**
 * Dialog for creating a new feature flag.
 */
class CreateFlagDialog(
    private val project: Project,
    initialFlagKey: String = ""
) : DialogWrapper(project) {

    private val flagKeyField = JBTextField(initialFlagKey)
    private val flagSetCombo = ComboBox<FlagSet>()
    private val variationTypeCombo = ComboBox<VariationType>()
    private val descriptionArea = JBTextArea(3, 40)
    private val trackEventsCheckbox = JBCheckBox("Track evaluation events", true)
    private val disabledCheckbox = JBCheckBox("Start disabled", false)
    private val insertAfterCreateCheckbox = JBCheckBox("Insert flag check after creation", true)

    private var flagSets: List<FlagSet> = emptyList()

    var createdFlag: FeatureFlag? = null
        private set
    var selectedFlagSet: FlagSet? = null
        private set
    var insertAfterCreate: Boolean = true
        private set

    init {
        title = "Create New Feature Flag"
        init()
        loadFlagSets()
    }

    override fun createCenterPanel(): JComponent {
        // Flag key field
        flagKeyField.toolTipText = "Unique identifier for the flag (e.g., my-new-feature)"

        // Variation type combo
        variationTypeCombo.model = CollectionComboBoxModel(VariationType.values().toList())
        variationTypeCombo.selectedItem = VariationType.BOOLEAN
        variationTypeCombo.renderer = object : DefaultListCellRenderer() {
            override fun getListCellRendererComponent(
                list: JList<*>?,
                value: Any?,
                index: Int,
                isSelected: Boolean,
                cellHasFocus: Boolean
            ): java.awt.Component {
                super.getListCellRendererComponent(list, value, index, isSelected, cellHasFocus)
                if (value is VariationType) {
                    text = value.getDisplayName()
                }
                return this
            }
        }

        // Description area
        descriptionArea.lineWrap = true
        descriptionArea.wrapStyleWord = true
        descriptionArea.toolTipText = "Optional description for the flag"

        val descriptionScrollPane = JScrollPane(descriptionArea).apply {
            preferredSize = Dimension(400, 80)
        }

        // Options panel
        val optionsPanel = JPanel().apply {
            layout = BoxLayout(this, BoxLayout.Y_AXIS)
            add(trackEventsCheckbox)
            add(disabledCheckbox)
            add(insertAfterCreateCheckbox)
        }

        return FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Flag Set:"), flagSetCombo, 1, false)
            .addLabeledComponent(JBLabel("Flag Key:"), flagKeyField, 1, false)
            .addLabeledComponent(JBLabel("Variation Type:"), variationTypeCombo, 1, false)
            .addLabeledComponent(JBLabel("Description:"), descriptionScrollPane, 1, true)
            .addComponent(optionsPanel, 1)
            .addComponentFillVertically(JPanel(), 0)
            .panel
    }

    private fun loadFlagSets() {
        try {
            val client = GoffApiClient()
            flagSets = client.getFlagSets()

            val model = CollectionComboBoxModel(flagSets)
            flagSetCombo.model = model
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

            // Select default flag set if configured
            val defaultFlagSet = GoffSettings.getInstance().defaultFlagSet
            if (defaultFlagSet.isNotBlank()) {
                flagSets.find { it.id == defaultFlagSet }?.let {
                    flagSetCombo.selectedItem = it
                }
            } else if (flagSets.isNotEmpty()) {
                flagSetCombo.selectedIndex = 0
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

    override fun doValidate(): ValidationInfo? {
        val flagKey = flagKeyField.text.trim()

        if (flagKey.isBlank()) {
            return ValidationInfo("Flag key is required", flagKeyField)
        }

        // Validate flag key format
        val validKeyPattern = Regex("^[a-zA-Z][a-zA-Z0-9_-]*$")
        if (!validKeyPattern.matches(flagKey)) {
            return ValidationInfo(
                "Flag key must start with a letter and contain only letters, numbers, dashes, and underscores",
                flagKeyField
            )
        }

        if (flagSetCombo.selectedItem == null) {
            return ValidationInfo("Please select a flag set", flagSetCombo)
        }

        return null
    }

    override fun doOKAction() {
        val flagKey = flagKeyField.text.trim()
        val flagSet = flagSetCombo.selectedItem as? FlagSet ?: return
        val variationType = variationTypeCombo.selectedItem as? VariationType ?: VariationType.BOOLEAN

        try {
            // Create the flag
            var flag = FlagFactory.createDefaultFlag(flagKey, variationType)

            // Apply options
            flag = flag.copy(
                trackEvents = trackEventsCheckbox.isSelected,
                disable = disabledCheckbox.isSelected,
                metadata = if (descriptionArea.text.isNotBlank()) {
                    mapOf("description" to descriptionArea.text.trim())
                } else null
            )

            // Save to API
            val client = GoffApiClient()
            client.createFlag(flagSet.id, flagKey, flag)

            createdFlag = flag
            selectedFlagSet = flagSet
            insertAfterCreate = insertAfterCreateCheckbox.isSelected

            super.doOKAction()
        } catch (e: Exception) {
            JOptionPane.showMessageDialog(
                contentPane,
                "Failed to create flag: ${e.message}",
                "Error",
                JOptionPane.ERROR_MESSAGE
            )
        }
    }
}
