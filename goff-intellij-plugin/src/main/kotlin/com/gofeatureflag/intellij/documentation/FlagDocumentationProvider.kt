package com.gofeatureflag.intellij.documentation

import com.gofeatureflag.intellij.services.FlagCacheService
import com.intellij.lang.documentation.AbstractDocumentationProvider
import com.intellij.lang.documentation.DocumentationMarkup
import com.intellij.psi.PsiElement

/**
 * Provides documentation popups when hovering over flag keys.
 */
class FlagDocumentationProvider : AbstractDocumentationProvider() {

    companion object {
        private val FLAG_KEY_PATTERN = Regex("""['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]""")

        // Patterns that indicate flag context
        private val FLAG_CONTEXT_INDICATORS = listOf(
            "getBooleanValue", "getStringValue", "getNumberValue", "getObjectValue",
            "get_boolean_value", "get_string_value", "get_number_value", "get_object_value",
            "BooleanValue", "StringValue", "FloatValue", "IntValue",
            "evaluateFlag", "evaluate_flag", "featureFlag", "feature_flag"
        )
    }

    override fun generateDoc(element: PsiElement?, originalElement: PsiElement?): String? {
        if (element == null) return null

        // Get the text around the element
        val lineText = getLineText(element) ?: return null

        // Check if we're in a flag context
        if (!isInFlagContext(lineText)) return null

        // Try to extract flag key
        val flagKey = extractFlagKey(element.text) ?: extractFlagKey(lineText) ?: return null

        // Get flag from cache
        val cacheService = FlagCacheService.getInstance()
        val flag = cacheService.getFlag(flagKey)

        return buildDocumentation(flagKey, flag != null, flag)
    }

    override fun getQuickNavigateInfo(element: PsiElement?, originalElement: PsiElement?): String? {
        if (element == null) return null

        val flagKey = extractFlagKey(element.text) ?: return null
        val flag = FlagCacheService.getInstance().getFlag(flagKey)

        return if (flag != null) {
            "Feature Flag: $flagKey (${flag.getVariationType().getDisplayName()})"
        } else null
    }

    private fun getLineText(element: PsiElement): String? {
        val document = element.containingFile?.viewProvider?.document ?: return null
        val lineNumber = document.getLineNumber(element.textOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineEnd = document.getLineEndOffset(lineNumber)
        return document.getText(com.intellij.openapi.util.TextRange(lineStart, lineEnd))
    }

    private fun isInFlagContext(lineText: String): Boolean {
        return FLAG_CONTEXT_INDICATORS.any { lineText.contains(it) }
    }

    private fun extractFlagKey(text: String): String? {
        val match = FLAG_KEY_PATTERN.find(text)
        return match?.groupValues?.getOrNull(1)
    }

    private fun buildDocumentation(flagKey: String, exists: Boolean, flag: com.gofeatureflag.intellij.model.FeatureFlag?): String {
        return buildString {
            append(DocumentationMarkup.DEFINITION_START)
            append("<b>Feature Flag:</b> $flagKey")
            append(DocumentationMarkup.DEFINITION_END)

            append(DocumentationMarkup.CONTENT_START)

            if (!exists) {
                append("<p><b style='color: orange'>⚠️ Flag not found in cache</b></p>")
                append("<p>This flag key was not found in the cached flags. ")
                append("It may be a new flag or the cache may be stale.</p>")
                append("<p><i>Use 'Refresh Flags' to update the cache.</i></p>")
            } else if (flag != null) {
                // Status
                val statusColor = if (flag.disable) "red" else "green"
                val statusText = if (flag.disable) "Disabled" else "Enabled"
                append("<p><b>Status:</b> <span style='color: $statusColor'>$statusText</span></p>")

                // Type
                append("<p><b>Type:</b> ${flag.getVariationType().getDisplayName()}</p>")

                // Variations
                append("<p><b>Variations:</b></p>")
                append("<ul>")
                flag.variations.forEach { (name, value) ->
                    append("<li><code>$name</code>: $value</li>")
                }
                append("</ul>")

                // Default rule
                flag.defaultRule?.let { rule ->
                    append("<p><b>Default Rule:</b></p>")
                    rule.variation?.let {
                        append("<p style='margin-left: 16px'>Variation: <code>$it</code></p>")
                    }
                    rule.percentage?.let { pct ->
                        append("<p style='margin-left: 16px'>Percentage rollout:</p>")
                        append("<ul style='margin-left: 16px'>")
                        pct.forEach { (v, p) ->
                            append("<li><code>$v</code>: ${(p * 100).toInt()}%</li>")
                        }
                        append("</ul>")
                    }
                }

                // Version
                flag.version?.let {
                    append("<p><b>Version:</b> $it</p>")
                }
            }

            append(DocumentationMarkup.CONTENT_END)

            append(DocumentationMarkup.SECTIONS_START)
            append("<tr><td><b>SDK Import:</b></td><td>Required for flag evaluation</td></tr>")
            append(DocumentationMarkup.SECTIONS_END)
        }
    }
}
