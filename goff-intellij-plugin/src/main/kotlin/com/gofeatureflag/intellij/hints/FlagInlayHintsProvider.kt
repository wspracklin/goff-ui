package com.gofeatureflag.intellij.hints

import com.gofeatureflag.intellij.services.FlagCacheService
import com.intellij.codeInsight.hints.*
import com.intellij.codeInsight.hints.presentation.InlayPresentation
import com.intellij.codeInsight.hints.presentation.PresentationFactory
import com.intellij.openapi.editor.Editor
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import javax.swing.JComponent
import javax.swing.JPanel

/**
 * Provides inline hints showing feature flag status next to flag keys.
 */
@Suppress("UnstableApiUsage")
class FlagInlayHintsProvider : InlayHintsProvider<FlagInlayHintsProvider.Settings> {

    companion object {
        private val FLAG_KEY_PATTERN = Regex("""['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]""")
    }

    data class Settings(
        var showStatus: Boolean = true,
        var showType: Boolean = false
    )

    override val key: SettingsKey<Settings> = SettingsKey("go.feature.flag.hints")
    override val name: String = "GO Feature Flag"
    override val previewText: String = """
        const flagValue = await client.getBooleanValue('my-feature', false);
        if (flagValue) {
            // Flag is enabled
        }
    """.trimIndent()

    override fun createSettings(): Settings = Settings()

    override fun createConfigurable(settings: Settings): ImmediateConfigurable {
        return object : ImmediateConfigurable {
            override fun createComponent(listener: ChangeListener): JComponent = JPanel()
            override val mainCheckboxText: String = "Show flag status hints"
        }
    }

    override fun getCollectorFor(
        file: PsiFile,
        editor: Editor,
        settings: Settings,
        sink: InlayHintsSink
    ): InlayHintsCollector {
        return FlagInlayHintsCollector(editor, settings)
    }

    class FlagInlayHintsCollector(
        private val editor: Editor,
        private val settings: Settings
    ) : InlayHintsCollector {

        override fun collect(element: PsiElement, editor: Editor, sink: InlayHintsSink): Boolean {
            if (!settings.showStatus) return true

            // Only process leaf elements
            if (element.firstChild != null) return true

            val text = element.text
            val matches = FLAG_KEY_PATTERN.findAll(text)

            val factory = PresentationFactory(editor)
            val cacheService = FlagCacheService.getInstance()

            for (match in matches) {
                val flagKey = match.groupValues[1]
                val flag = cacheService.getFlag(flagKey)

                if (flag != null) {
                    val statusText = if (flag.disable) "⊘" else "✓"
                    val presentation = factory.smallText(statusText)

                    val offset = element.textRange.startOffset + match.range.last + 1
                    sink.addInlineElement(offset, false, presentation, false)
                }
            }

            return true
        }
    }
}
