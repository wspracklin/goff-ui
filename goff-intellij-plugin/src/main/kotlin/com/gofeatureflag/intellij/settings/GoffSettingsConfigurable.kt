package com.gofeatureflag.intellij.settings

import com.gofeatureflag.intellij.api.GoffApiClient
import com.gofeatureflag.intellij.model.FlagSet
import com.intellij.openapi.options.Configurable
import com.intellij.openapi.ui.ComboBox
import com.intellij.openapi.ui.Messages
import com.intellij.ui.CollectionComboBoxModel
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBPasswordField
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.FlowLayout
import javax.swing.*

/**
 * Settings UI for GO Feature Flag plugin configuration.
 */
class GoffSettingsConfigurable : Configurable {

    private var apiUrlField: JBTextField? = null
    private var apiKeyField: JBPasswordField? = null
    private var relayProxyUrlField: JBTextField? = null
    private var defaultFlagSetCombo: ComboBox<FlagSetItem>? = null
    private var refreshFlagSetsButton: JButton? = null
    private var autoImportCheckbox: JBCheckBox? = null
    private var autoAddDependenciesCheckbox: JBCheckBox? = null
    private var showNotificationsCheckbox: JBCheckBox? = null
    private var defaultContextArea: JBTextArea? = null
    private var testConnectionButton: JButton? = null
    private var mainPanel: JPanel? = null
    private var flagSets: List<FlagSet> = emptyList()

    // Wrapper class for combo box display
    private data class FlagSetItem(val id: String, val name: String) {
        override fun toString(): String = if (id.isEmpty()) "(None)" else name
    }

    override fun getDisplayName(): String = "GO Feature Flag"

    override fun createComponent(): JComponent {
        apiUrlField = JBTextField().apply {
            toolTipText = "URL of your GO Feature Flag management API (e.g., http://localhost:4000)"
        }

        apiKeyField = JBPasswordField().apply {
            toolTipText = "API key for authentication (optional)"
        }

        relayProxyUrlField = JBTextField().apply {
            toolTipText = "URL of your GO Feature Flag relay proxy for SDK connections (e.g., http://localhost:1031)"
        }

        // Flag set combo box with refresh button
        defaultFlagSetCombo = ComboBox<FlagSetItem>().apply {
            toolTipText = "Default flag set to use when fetching and creating flags"
        }

        refreshFlagSetsButton = JButton("Refresh").apply {
            toolTipText = "Refresh the list of available flag sets from the API"
            addActionListener { loadFlagSets() }
        }

        val flagSetPanel = JPanel(BorderLayout(5, 0)).apply {
            add(defaultFlagSetCombo, BorderLayout.CENTER)
            add(refreshFlagSetsButton, BorderLayout.EAST)
        }

        autoImportCheckbox = JBCheckBox("Auto-import SDK libraries").apply {
            toolTipText = "Automatically add import statements when inserting flag checks"
        }

        autoAddDependenciesCheckbox = JBCheckBox("Auto-install OpenFeature dependencies").apply {
            toolTipText = "Automatically install OpenFeature SDK and GO Feature Flag provider packages to your project"
        }

        showNotificationsCheckbox = JBCheckBox("Show notifications").apply {
            toolTipText = "Show balloon notifications for plugin actions"
        }

        defaultContextArea = JBTextArea(3, 40).apply {
            toolTipText = "Default evaluation context JSON for flag evaluations"
            lineWrap = true
            wrapStyleWord = true
        }

        testConnectionButton = JButton("Test Connection").apply {
            addActionListener { testConnection() }
        }

        val contextScrollPane = JScrollPane(defaultContextArea).apply {
            preferredSize = Dimension(400, 80)
        }

        mainPanel = FormBuilder.createFormBuilder()
            .addLabeledComponent(JBLabel("Management API URL:"), apiUrlField!!, 1, false)
            .addLabeledComponent(JBLabel("API Key:"), apiKeyField!!, 1, false)
            .addLabeledComponent(JBLabel("Relay Proxy URL:"), relayProxyUrlField!!, 1, false)
            .addLabeledComponent(JBLabel("Default Flag Set:"), flagSetPanel, 1, false)
            .addSeparator()
            .addComponent(autoImportCheckbox!!, 1)
            .addComponent(autoAddDependenciesCheckbox!!, 1)
            .addComponent(showNotificationsCheckbox!!, 1)
            .addSeparator()
            .addLabeledComponent(JBLabel("Default Context (JSON):"), contextScrollPane, 1, true)
            .addComponent(JPanel(BorderLayout()).apply {
                add(testConnectionButton, BorderLayout.WEST)
            }, 1)
            .addComponentFillVertically(JPanel(), 0)
            .panel

        // Load flag sets on component creation
        loadFlagSetsAsync()

        return mainPanel!!
    }

    private fun loadFlagSets() {
        val url = apiUrlField?.text ?: return
        val apiKey = String(apiKeyField?.password ?: charArrayOf())

        try {
            val client = GoffApiClient(url, apiKey)
            flagSets = client.getFlagSets()
            updateFlagSetCombo()
            Messages.showInfoMessage(
                "Loaded ${flagSets.size} flag set(s).",
                "GO Feature Flag"
            )
        } catch (e: Exception) {
            Messages.showErrorDialog(
                "Failed to load flag sets: ${e.message}",
                "GO Feature Flag"
            )
        }
    }

    private fun loadFlagSetsAsync() {
        val settings = GoffSettings.getInstance()
        val url = settings.apiUrl
        val apiKey = settings.apiKey

        if (url.isBlank()) return

        Thread {
            try {
                val client = GoffApiClient(url, apiKey)
                flagSets = client.getFlagSets()
                SwingUtilities.invokeLater {
                    updateFlagSetCombo()
                    // Select the saved default flag set
                    selectFlagSet(settings.defaultFlagSet)
                }
            } catch (e: Exception) {
                // Silently fail on initial load
            }
        }.start()
    }

    private fun updateFlagSetCombo() {
        val items = mutableListOf(FlagSetItem("", "(None)"))
        items.addAll(flagSets.map { FlagSetItem(it.id, it.name) })
        defaultFlagSetCombo?.model = CollectionComboBoxModel(items)
    }

    private fun selectFlagSet(id: String) {
        val combo = defaultFlagSetCombo ?: return
        for (i in 0 until combo.itemCount) {
            val item = combo.getItemAt(i)
            if (item.id == id) {
                combo.selectedIndex = i
                return
            }
        }
        // If not found and ID is not empty, add it as a custom item
        if (id.isNotEmpty()) {
            val customItem = FlagSetItem(id, id)
            (combo.model as? CollectionComboBoxModel<FlagSetItem>)?.add(customItem)
            combo.selectedItem = customItem
        }
    }

    private fun getSelectedFlagSetId(): String {
        val item = defaultFlagSetCombo?.selectedItem as? FlagSetItem
        return item?.id ?: ""
    }

    private fun testConnection() {
        val url = apiUrlField?.text ?: return
        val apiKey = String(apiKeyField?.password ?: charArrayOf())

        try {
            val client = GoffApiClient(url, apiKey)
            val flagSets = client.getFlagSets()
            Messages.showInfoMessage(
                "Connection successful!\nFound ${flagSets.size} flag set(s).",
                "GO Feature Flag"
            )
        } catch (e: Exception) {
            Messages.showErrorDialog(
                "Connection failed: ${e.message}",
                "GO Feature Flag"
            )
        }
    }

    override fun isModified(): Boolean {
        val settings = GoffSettings.getInstance()
        return apiUrlField?.text != settings.apiUrl ||
                String(apiKeyField?.password ?: charArrayOf()) != settings.apiKey ||
                relayProxyUrlField?.text != settings.relayProxyUrl ||
                getSelectedFlagSetId() != settings.defaultFlagSet ||
                autoImportCheckbox?.isSelected != settings.autoImportEnabled ||
                autoAddDependenciesCheckbox?.isSelected != settings.autoAddDependencies ||
                showNotificationsCheckbox?.isSelected != settings.showNotifications ||
                defaultContextArea?.text != settings.defaultEvaluationContext
    }

    override fun apply() {
        val settings = GoffSettings.getInstance()
        settings.apiUrl = apiUrlField?.text ?: ""
        settings.apiKey = String(apiKeyField?.password ?: charArrayOf())
        settings.relayProxyUrl = relayProxyUrlField?.text ?: "http://localhost:1031"
        settings.defaultFlagSet = getSelectedFlagSetId()
        settings.autoImportEnabled = autoImportCheckbox?.isSelected ?: true
        settings.autoAddDependencies = autoAddDependenciesCheckbox?.isSelected ?: true
        settings.showNotifications = showNotificationsCheckbox?.isSelected ?: true
        settings.defaultEvaluationContext = defaultContextArea?.text ?: "{}"
    }

    override fun reset() {
        val settings = GoffSettings.getInstance()
        apiUrlField?.text = settings.apiUrl
        apiKeyField?.text = settings.apiKey
        relayProxyUrlField?.text = settings.relayProxyUrl
        selectFlagSet(settings.defaultFlagSet)
        autoImportCheckbox?.isSelected = settings.autoImportEnabled
        autoAddDependenciesCheckbox?.isSelected = settings.autoAddDependencies
        showNotificationsCheckbox?.isSelected = settings.showNotifications
        defaultContextArea?.text = settings.defaultEvaluationContext
    }

    override fun disposeUIResources() {
        mainPanel = null
        apiUrlField = null
        apiKeyField = null
        relayProxyUrlField = null
        defaultFlagSetCombo = null
        refreshFlagSetsButton = null
        autoImportCheckbox = null
        autoAddDependenciesCheckbox = null
        showNotificationsCheckbox = null
        defaultContextArea = null
        testConnectionButton = null
        flagSets = emptyList()
    }
}
