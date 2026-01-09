package com.gofeatureflag.intellij.annotators

import com.gofeatureflag.intellij.services.FlagCacheService
import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement

/**
 * Annotator that validates flag keys and highlights unknown flags.
 */
class FlagKeyAnnotator : Annotator {

    companion object {
        // Patterns for flag evaluation contexts
        private val FLAG_CONTEXT_PATTERNS = listOf(
            Regex("""(getBooleanValue|getStringValue|getNumberValue|getObjectValue|getIntegerValue|getDoubleValue)\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""(get_boolean_value|get_string_value|get_number_value|get_object_value)\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""(BooleanValue|StringValue|FloatValue|IntValue)\s*\([^,]*,\s*['"]([^'"]+)['"]"""),
            Regex("""(evaluateFlag|evaluate_flag|featureFlag|feature_flag)\s*\(\s*['"]([^'"]+)['"]"""),
        )
    }

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        // Only process leaf elements
        if (element.firstChild != null) return

        // Get line text
        val lineText = getLineText(element) ?: return

        // Find flag keys in context
        for (pattern in FLAG_CONTEXT_PATTERNS) {
            val matches = pattern.findAll(lineText)
            for (match in matches) {
                val flagKey = match.groupValues.getOrNull(2) ?: continue

                // Check if flag exists
                val cacheService = FlagCacheService.getInstance()
                val flag = cacheService.getFlag(flagKey)

                // Find the flag key position in the element
                val flagKeyStart = element.text.indexOf(flagKey)
                if (flagKeyStart < 0) continue

                val textRange = TextRange(
                    element.textRange.startOffset + flagKeyStart,
                    element.textRange.startOffset + flagKeyStart + flagKey.length
                )

                if (flag == null) {
                    // Unknown flag - show warning
                    holder.newAnnotation(HighlightSeverity.WARNING, "Unknown feature flag: '$flagKey'")
                        .range(textRange)
                        .tooltip("This flag key was not found in the cached flags. It may be new or misspelled.")
                        .create()
                } else if (flag.disable) {
                    // Disabled flag - show info
                    holder.newAnnotation(HighlightSeverity.WEAK_WARNING, "Feature flag '$flagKey' is disabled")
                        .range(textRange)
                        .tooltip("This flag is currently disabled. The default/disabled variation will be returned.")
                        .create()
                }
            }
        }
    }

    private fun getLineText(element: PsiElement): String? {
        val document = element.containingFile?.viewProvider?.document ?: return null
        val lineNumber = document.getLineNumber(element.textOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineEnd = document.getLineEndOffset(lineNumber)
        return document.getText(TextRange(lineStart, lineEnd))
    }
}
