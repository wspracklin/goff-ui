package com.gofeatureflag.intellij.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

/**
 * Persistent settings for the GO Feature Flag plugin.
 */
@Service
@State(
    name = "com.gofeatureflag.intellij.settings.GoffSettings",
    storages = [Storage("GoFeatureFlagPlugin.xml")]
)
class GoffSettings : PersistentStateComponent<GoffSettings.State> {

    data class State(
        var apiUrl: String = "http://localhost:4000",
        var apiKey: String = "",
        var defaultFlagSet: String = "",
        var autoImportEnabled: Boolean = true,
        var autoAddDependencies: Boolean = true,
        var showNotifications: Boolean = true,
        var defaultEvaluationContext: String = "{ \"targetingKey\": \"user-123\" }",
        var relayProxyUrl: String = "http://localhost:1031",
        var cachedFlags: MutableList<CachedFlag> = mutableListOf()
    )

    data class CachedFlag(
        var key: String = "",
        var variationType: String = "boolean", // boolean, string, number, json
        var variations: MutableList<String> = mutableListOf()
    )

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        XmlSerializerUtil.copyBean(state, myState)
    }

    var apiUrl: String
        get() = myState.apiUrl
        set(value) { myState.apiUrl = value }

    var apiKey: String
        get() = myState.apiKey
        set(value) { myState.apiKey = value }

    var defaultFlagSet: String
        get() = myState.defaultFlagSet
        set(value) { myState.defaultFlagSet = value }

    var autoImportEnabled: Boolean
        get() = myState.autoImportEnabled
        set(value) { myState.autoImportEnabled = value }

    var autoAddDependencies: Boolean
        get() = myState.autoAddDependencies
        set(value) { myState.autoAddDependencies = value }

    var showNotifications: Boolean
        get() = myState.showNotifications
        set(value) { myState.showNotifications = value }

    var relayProxyUrl: String
        get() = myState.relayProxyUrl
        set(value) { myState.relayProxyUrl = value }

    var defaultEvaluationContext: String
        get() = myState.defaultEvaluationContext
        set(value) { myState.defaultEvaluationContext = value }

    var cachedFlags: MutableList<CachedFlag>
        get() = myState.cachedFlags
        set(value) { myState.cachedFlags = value }

    companion object {
        fun getInstance(): GoffSettings {
            return ApplicationManager.getApplication().getService(GoffSettings::class.java)
        }
    }
}
