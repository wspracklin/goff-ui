package com.gofeatureflag.intellij.completion

import com.gofeatureflag.intellij.model.VariationType
import com.gofeatureflag.intellij.services.FlagCacheService
import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElement
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.editor.EditorModificationUtil
import com.intellij.patterns.PlatformPatterns
import com.intellij.psi.PsiElement
import com.intellij.util.ProcessingContext
import javax.swing.Icon

/**
 * Provides code completion for feature flag keys within string literals.
 * Detects when the user is typing inside a string that might be a flag key
 * and suggests available flags from the cache.
 */
class FlagKeyCompletionContributor : CompletionContributor() {

    init {
        // Extend completion for any element (we'll filter in the provider)
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            FlagKeyCompletionProvider()
        )
    }
}

/**
 * Completion provider that suggests flag keys.
 */
class FlagKeyCompletionProvider : CompletionProvider<CompletionParameters>() {

    companion object {
        // Patterns that suggest we're in a flag evaluation context
        private val FLAG_CONTEXT_PATTERNS = listOf(
            // OpenFeature SDK patterns
            Regex("""getBooleanValue\s*\(\s*['"]"""),
            Regex("""getStringValue\s*\(\s*['"]"""),
            Regex("""getNumberValue\s*\(\s*['"]"""),
            Regex("""getObjectValue\s*\(\s*['"]"""),
            Regex("""getIntegerValue\s*\(\s*['"]"""),
            Regex("""getDoubleValue\s*\(\s*['"]"""),
            Regex("""get_boolean_value\s*\(\s*['"]"""),
            Regex("""get_string_value\s*\(\s*['"]"""),
            Regex("""get_number_value\s*\(\s*['"]"""),
            Regex("""get_object_value\s*\(\s*['"]"""),
            // GO Feature Flag direct patterns
            Regex("""BooleanValue\s*\([^,]*,\s*['"]"""),
            Regex("""StringValue\s*\([^,]*,\s*['"]"""),
            Regex("""FloatValue\s*\([^,]*,\s*['"]"""),
            Regex("""IntValue\s*\([^,]*,\s*['"]"""),
            // Generic flag patterns
            Regex("""featureFlag\s*\(\s*['"]"""),
            Regex("""feature_flag\s*\(\s*['"]"""),
            Regex("""flag\s*\(\s*['"]"""),
            Regex("""flagKey\s*[=:]\s*['"]"""),
            Regex("""flag_key\s*[=:]\s*['"]"""),
            Regex("""evaluateFlag\s*\(\s*['"]"""),
            Regex("""evaluate_flag\s*\(\s*['"]"""),
        )
    }

    override fun addCompletions(
        parameters: CompletionParameters,
        context: ProcessingContext,
        result: CompletionResultSet
    ) {
        val position = parameters.position
        val originalFile = parameters.originalFile

        // Check if we're inside a string literal
        if (!isInsideString(position)) {
            return
        }

        // Get the text before the cursor to check context
        val document = parameters.editor.document
        val offset = parameters.offset
        val lineStart = document.getLineStartOffset(document.getLineNumber(offset))
        val textBeforeCursor = document.getText(com.intellij.openapi.util.TextRange(lineStart, offset))

        // Check if we're in a flag evaluation context
        if (!isInFlagContext(textBeforeCursor)) {
            return
        }

        // Get current prefix being typed
        val prefix = getCurrentPrefix(position)

        // Ensure cache is populated
        val cacheService = FlagCacheService.getInstance()
        cacheService.syncIfNeeded()

        // Search for matching flags
        val flags = cacheService.searchFlags(prefix)

        // Add completion items
        for (flag in flags) {
            val element = createFlagLookupElement(flag.key, flag.getVariationType(), flag.getVariationNames())
            result.addElement(PrioritizedLookupElement.withPriority(element, 100.0))
        }

        // Add recent flags with higher priority
        val recentFlags = cacheService.getRecentFlags()
        for (flag in recentFlags) {
            if (flag.key.lowercase().contains(prefix.lowercase())) {
                val element = createFlagLookupElement(
                    flag.key,
                    flag.getVariationType(),
                    flag.getVariationNames(),
                    isRecent = true
                )
                result.addElement(PrioritizedLookupElement.withPriority(element, 200.0))
            }
        }
    }

    private fun isInsideString(element: PsiElement): Boolean {
        var current: PsiElement? = element
        while (current != null) {
            val elementType = current.node?.elementType?.toString()?.lowercase() ?: ""
            if (elementType.contains("string") ||
                elementType.contains("literal") ||
                elementType.contains("quoted")) {
                return true
            }
            current = current.parent
        }

        // Fallback: check the text directly
        val text = element.text
        return text.startsWith("\"") || text.startsWith("'") || text.startsWith("`")
    }

    private fun isInFlagContext(textBeforeCursor: String): Boolean {
        return FLAG_CONTEXT_PATTERNS.any { pattern ->
            pattern.containsMatchIn(textBeforeCursor)
        }
    }

    private fun getCurrentPrefix(element: PsiElement): String {
        val text = element.text
        // Remove quotes and placeholder
        return text
            .removePrefix("\"")
            .removePrefix("'")
            .removePrefix("`")
            .removeSuffix("\"")
            .removeSuffix("'")
            .removeSuffix("`")
            .replace(CompletionUtilCore.DUMMY_IDENTIFIER, "")
            .replace(CompletionUtilCore.DUMMY_IDENTIFIER_TRIMMED, "")
    }

    private fun createFlagLookupElement(
        flagKey: String,
        variationType: VariationType,
        variations: List<String>,
        isRecent: Boolean = false
    ): LookupElement {
        val typeIcon = getTypeIcon(variationType)
        val typeText = variationType.getDisplayName()
        val tailText = if (isRecent) " (recent)" else " [${variations.joinToString(", ")}]"

        return LookupElementBuilder.create(flagKey)
            .withIcon(typeIcon)
            .withTypeText(typeText)
            .withTailText(tailText, true)
            .withInsertHandler { insertContext, _ ->
                // Mark as recently used
                FlagCacheService.getInstance().markFlagUsed(flagKey)

                // Move caret outside the closing quote if needed
                val editor = insertContext.editor
                val currentChar = insertContext.document.charsSequence.getOrNull(editor.caretModel.offset)
                if (currentChar == '"' || currentChar == '\'' || currentChar == '`') {
                    EditorModificationUtil.moveCaretRelatively(editor, 1)
                }
            }
            .withBoldness(isRecent)
    }

    private fun getTypeIcon(variationType: VariationType): Icon? {
        // In a real implementation, you'd return actual icons
        // For now, return null and rely on type text
        return null
    }
}
