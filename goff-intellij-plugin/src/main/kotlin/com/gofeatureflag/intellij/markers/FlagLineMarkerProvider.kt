package com.gofeatureflag.intellij.markers

import com.gofeatureflag.intellij.services.FlagCacheService
import com.intellij.codeInsight.daemon.GutterIconNavigationHandler
import com.intellij.codeInsight.daemon.LineMarkerInfo
import com.intellij.codeInsight.daemon.LineMarkerProvider
import com.intellij.icons.AllIcons
import com.intellij.openapi.editor.markup.GutterIconRenderer
import com.intellij.openapi.ui.popup.JBPopupFactory
import com.intellij.psi.PsiElement
import com.intellij.psi.util.elementType
import com.intellij.ui.awt.RelativePoint
import java.awt.event.MouseEvent
import javax.swing.Icon

/**
 * Provides gutter icons for lines that contain feature flag checks.
 * Shows a flag icon in the gutter next to lines with flag evaluations.
 */
class FlagLineMarkerProvider : LineMarkerProvider {

    companion object {
        // Patterns to detect flag evaluation calls
        private val FLAG_PATTERNS = listOf(
            // OpenFeature patterns
            Regex("""getBooleanValue\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""getStringValue\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""getNumberValue\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""getIntegerValue\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""getDoubleValue\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""getObjectValue\s*\(\s*['"]([^'"]+)['"]"""),
            // Python style
            Regex("""get_boolean_value\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""get_string_value\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""get_number_value\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""get_object_value\s*\(\s*['"]([^'"]+)['"]"""),
            // Go style
            Regex("""BooleanValue\s*\([^,]*,\s*['"]([^'"]+)['"]"""),
            Regex("""StringValue\s*\([^,]*,\s*['"]([^'"]+)['"]"""),
            Regex("""FloatValue\s*\([^,]*,\s*['"]([^'"]+)['"]"""),
            Regex("""IntValue\s*\([^,]*,\s*['"]([^'"]+)['"]"""),
            // Generic
            Regex("""evaluateFlag\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""evaluate_flag\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""featureFlag\s*\(\s*['"]([^'"]+)['"]"""),
            Regex("""feature_flag\s*\(\s*['"]([^'"]+)['"]"""),
        )
    }

    override fun getLineMarkerInfo(element: PsiElement): LineMarkerInfo<*>? {
        // Only process leaf elements to avoid duplicate markers
        if (element.firstChild != null) return null

        // Check if this element's line contains a flag pattern
        val lineText = getLineText(element) ?: return null
        val flagKey = extractFlagKey(lineText) ?: return null

        // Get flag info from cache
        val cacheService = FlagCacheService.getInstance()
        val flag = cacheService.getFlag(flagKey)

        val icon = if (flag != null) {
            if (flag.disable) AllIcons.Debugger.Db_disabled_breakpoint
            else AllIcons.Actions.Lightning
        } else {
            AllIcons.General.Warning
        }

        val tooltip = buildTooltip(flagKey, flag != null, flag?.disable ?: false)

        return LineMarkerInfo(
            element,
            element.textRange,
            icon,
            { tooltip },
            FlagGutterIconNavigationHandler(flagKey),
            GutterIconRenderer.Alignment.LEFT,
            { tooltip }
        )
    }

    private fun getLineText(element: PsiElement): String? {
        val document = element.containingFile?.viewProvider?.document ?: return null
        val lineNumber = document.getLineNumber(element.textOffset)
        val lineStart = document.getLineStartOffset(lineNumber)
        val lineEnd = document.getLineEndOffset(lineNumber)
        return document.getText(com.intellij.openapi.util.TextRange(lineStart, lineEnd))
    }

    private fun extractFlagKey(lineText: String): String? {
        for (pattern in FLAG_PATTERNS) {
            val match = pattern.find(lineText)
            if (match != null) {
                return match.groupValues.getOrNull(1)
            }
        }
        return null
    }

    private fun buildTooltip(flagKey: String, exists: Boolean, disabled: Boolean): String {
        return buildString {
            append("Feature Flag: $flagKey\n")
            if (!exists) {
                append("⚠️ Flag not found in cache")
            } else if (disabled) {
                append("🔴 Flag is disabled")
            } else {
                append("🟢 Flag is enabled")
            }
            append("\n\nClick for more options")
        }
    }
}

/**
 * Handler for gutter icon clicks.
 */
class FlagGutterIconNavigationHandler(private val flagKey: String) : GutterIconNavigationHandler<PsiElement> {

    override fun navigate(e: MouseEvent, elt: PsiElement) {
        val cacheService = FlagCacheService.getInstance()
        val flag = cacheService.getFlag(flagKey)

        val items = mutableListOf<String>()
        items.add("Flag: $flagKey")

        if (flag != null) {
            items.add("Type: ${flag.getVariationType().getDisplayName()}")
            items.add("Variations: ${flag.getVariationNames().joinToString(", ")}")
            items.add("Status: ${if (flag.disable) "Disabled" else "Enabled"}")
        } else {
            items.add("⚠️ Flag not found - click to refresh cache")
        }

        val popup = JBPopupFactory.getInstance()
            .createPopupChooserBuilder(items)
            .setTitle("Feature Flag Details")
            .setItemChosenCallback { selected ->
                if (selected.contains("refresh")) {
                    cacheService.syncFlags()
                }
            }
            .createPopup()

        popup.show(RelativePoint(e))
    }
}
