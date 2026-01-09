package com.gofeatureflag.intellij.actions

import com.gofeatureflag.intellij.model.SupportedLanguage
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.module.ModuleManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ModuleRootManager
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.JBColor
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.ui.FormBuilder
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Dimension
import java.awt.Font
import java.io.File
import javax.swing.*

/**
 * Action to manually add OpenFeature dependencies to the project.
 */
class AddDependenciesAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return

        // Detect project types from project root and module content roots
        val projectRoot = project.basePath?.let { File(it) } ?: return
        val detectedProjects = detectProjectTypes(project, projectRoot)

        if (detectedProjects.isEmpty()) {
            Messages.showInfoMessage(
                project,
                "No supported project types detected in the workspace.\n\n" +
                "Supported project types:\n" +
                "• JavaScript/TypeScript (package.json)\n" +
                "• Python (requirements.txt, pyproject.toml)\n" +
                "• Go (go.mod)\n" +
                "• Java/Kotlin (pom.xml, build.gradle)\n" +
                "• C# (.csproj)\n" +
                "• Rust (Cargo.toml)\n" +
                "• PHP (composer.json)\n" +
                "• Ruby (Gemfile)\n" +
                "• Swift (Package.swift)\n" +
                "• Dart/Flutter (pubspec.yaml)",
                "Add OpenFeature Dependencies"
            )
            return
        }

        // Show dialog to select which projects to add dependencies to
        val dialog = AddDependenciesDialog(project, detectedProjects)
        if (dialog.showAndGet()) {
            val selectedProjects = dialog.getSelectedProjects()
            if (selectedProjects.isNotEmpty()) {
                addDependencies(project, selectedProjects)
            }
        }
    }

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    /**
     * Detected project info.
     */
    data class DetectedProject(
        val type: ProjectType,
        val path: File,
        val configFileName: String,  // Just the filename (e.g., "build.gradle")
        val displayPath: String,      // Display path relative to project root (e.g., "my-module/build.gradle")
        val alreadyHasDependencies: Boolean
    )

    enum class ProjectType(
        val displayName: String,
        val icon: String,
        val packages: List<String>
    ) {
        NPM("JavaScript/TypeScript (npm)", "📦", listOf("@openfeature/web-sdk", "@openfeature/go-feature-flag-provider")),
        PYTHON_REQUIREMENTS("Python (requirements.txt)", "🐍", listOf("openfeature-sdk", "gofeatureflag-python-provider")),
        PYTHON_POETRY("Python (Poetry)", "🐍", listOf("openfeature-sdk", "gofeatureflag-python-provider")),
        GO("Go", "🐹", listOf("github.com/open-feature/go-sdk", "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag")),
        MAVEN("Java/Kotlin (Maven)", "☕", listOf("dev.openfeature:sdk", "dev.openfeature.contrib.providers:go-feature-flag")),
        GRADLE("Java/Kotlin (Gradle)", "🐘", listOf("dev.openfeature:sdk", "dev.openfeature.contrib.providers:go-feature-flag")),
        INTELLIJ_JAVA("Java (IntelliJ Project)", "☕", listOf("dev.openfeature:sdk:1.7.0", "dev.openfeature.contrib.providers:go-feature-flag:0.2.0")),
        DOTNET("C# (.NET)", "🔷", listOf("OpenFeature", "OpenFeature.Contrib.Providers.GOFeatureFlag")),
        RUST("Rust (Cargo)", "🦀", listOf("open-feature", "go-feature-flag-provider")),
        PHP("PHP (Composer)", "🐘", listOf("open-feature/sdk", "open-feature/go-feature-flag-provider")),
        RUBY("Ruby (Bundler)", "💎", listOf("openfeature-sdk", "openfeature-go-feature-flag-provider")),
        SWIFT("Swift (SPM)", "🍎", listOf("OpenFeature")),
        DART("Dart/Flutter (pub)", "🎯", listOf("openfeature", "go_feature_flag_provider"))
    }

    private fun detectProjectTypes(project: Project, projectRoot: File): List<DetectedProject> {
        val detected = mutableListOf<DetectedProject>()
        val searchedPaths = mutableSetOf<String>()
        val dirsToSearch = mutableListOf<File>()

        // Add project root first
        dirsToSearch.add(projectRoot)

        // Recursively search subdirectories up to 4 levels deep
        addSubdirectories(projectRoot, dirsToSearch, 0, 4)

        // Add IntelliJ module content roots (handles complex project structures)
        try {
            val moduleManager = ModuleManager.getInstance(project)
            for (module in moduleManager.modules) {
                val moduleRootManager = ModuleRootManager.getInstance(module)
                for (contentRoot in moduleRootManager.contentRoots) {
                    contentRoot.path?.let { path ->
                        val dir = File(path)
                        if (dir.exists() && dir.isDirectory) {
                            dirsToSearch.add(dir)
                            // Also search subdirectories of module roots
                            addSubdirectories(dir, dirsToSearch, 0, 2)
                        }
                    }
                }
                // Also check source roots
                for (sourceRoot in moduleRootManager.sourceRoots) {
                    sourceRoot.parent?.path?.let { path ->
                        val dir = File(path)
                        if (dir.exists() && dir.isDirectory) {
                            dirsToSearch.add(dir)
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // Module detection failed, continue with file-based detection
        }

        // Also check .idea/modules.xml for module paths
        try {
            val modulesXml = File(projectRoot, ".idea/modules.xml")
            if (modulesXml.exists()) {
                val content = modulesXml.readText()
                // Extract module file paths from modules.xml
                val modulePattern = Regex("""filepath="\${'$'}PROJECT_DIR\${'$'}/([^"]+)""")
                modulePattern.findAll(content).forEach { match ->
                    val modulePath = match.groupValues[1]
                    val moduleDir = File(projectRoot, modulePath).parentFile
                    if (moduleDir?.exists() == true && moduleDir.isDirectory) {
                        dirsToSearch.add(moduleDir)
                    }
                }
            }
        } catch (e: Exception) {
            // modules.xml parsing failed, continue
        }

        for (dir in dirsToSearch) {
            // Avoid searching the same directory twice
            val canonicalPath = try { dir.canonicalPath } catch (e: Exception) { dir.absolutePath }
            if (searchedPaths.contains(canonicalPath)) continue
            searchedPaths.add(canonicalPath)

            detectProjectTypesInDir(dir, detected, projectRoot)
        }

        return detected
    }

    private fun addSubdirectories(dir: File, dirsToSearch: MutableList<File>, currentDepth: Int, maxDepth: Int) {
        if (currentDepth >= maxDepth) return

        dir.listFiles { file ->
            file.isDirectory &&
            !file.name.startsWith(".") &&
            file.name != "node_modules" &&
            file.name != "build" &&
            file.name != "target" &&
            file.name != "out" &&
            file.name != "bin" &&
            file.name != "obj" &&
            file.name != "__pycache__" &&
            file.name != "vendor"
        }?.forEach { subDir ->
            dirsToSearch.add(subDir)
            addSubdirectories(subDir, dirsToSearch, currentDepth + 1, maxDepth)
        }
    }

    private fun detectProjectTypesInDir(dir: File, detected: MutableList<DetectedProject>, projectRoot: File) {
        val relativePath = try {
            if (dir == projectRoot) "" else dir.relativeTo(projectRoot).path
        } catch (e: Exception) {
            // Directory is outside project root, use absolute path
            dir.absolutePath
        }
        val pathPrefix = if (relativePath.isEmpty()) "" else "$relativePath/"

        // Check for package.json (npm)
        val packageJson = File(dir, "package.json")
        if (packageJson.exists()) {
            val content = packageJson.readText()
            val hasDeps = content.contains("@openfeature/web-sdk") &&
                         content.contains("@openfeature/go-feature-flag-provider")
            detected.add(DetectedProject(ProjectType.NPM, dir, "package.json", "${pathPrefix}package.json", hasDeps))
        }

        // Check for requirements.txt (Python)
        val requirementsTxt = File(dir, "requirements.txt")
        if (requirementsTxt.exists()) {
            val content = requirementsTxt.readText()
            val hasDeps = content.contains("openfeature-sdk") &&
                         content.contains("gofeatureflag-python-provider")
            detected.add(DetectedProject(ProjectType.PYTHON_REQUIREMENTS, dir, "requirements.txt", "${pathPrefix}requirements.txt", hasDeps))
        }

        // Check for pyproject.toml (Python Poetry)
        val pyprojectToml = File(dir, "pyproject.toml")
        if (pyprojectToml.exists()) {
            val content = pyprojectToml.readText()
            val hasDeps = content.contains("openfeature-sdk") &&
                         content.contains("gofeatureflag-python-provider")
            detected.add(DetectedProject(ProjectType.PYTHON_POETRY, dir, "pyproject.toml", "${pathPrefix}pyproject.toml", hasDeps))
        }

        // Check for go.mod (Go)
        val goMod = File(dir, "go.mod")
        if (goMod.exists()) {
            val content = goMod.readText()
            val hasDeps = content.contains("github.com/open-feature/go-sdk") &&
                         content.contains("go-feature-flag")
            detected.add(DetectedProject(ProjectType.GO, dir, "go.mod", "${pathPrefix}go.mod", hasDeps))
        }

        // Check for pom.xml (Maven)
        val pomXml = File(dir, "pom.xml")
        if (pomXml.exists()) {
            val content = pomXml.readText()
            val hasDeps = content.contains("dev.openfeature") &&
                         content.contains("go-feature-flag")
            detected.add(DetectedProject(ProjectType.MAVEN, dir, "pom.xml", "${pathPrefix}pom.xml", hasDeps))
        }

        // Check for build.gradle or build.gradle.kts (Gradle)
        val buildGradle = File(dir, "build.gradle")
        val buildGradleKts = File(dir, "build.gradle.kts")
        val settingsGradle = File(dir, "settings.gradle")
        val settingsGradleKts = File(dir, "settings.gradle.kts")

        // Consider it a Gradle project if it has build.gradle or settings.gradle
        val gradleFile = when {
            buildGradleKts.exists() -> buildGradleKts
            buildGradle.exists() -> buildGradle
            settingsGradleKts.exists() -> settingsGradleKts  // Root of multi-module project
            settingsGradle.exists() -> settingsGradle
            else -> null
        }

        if (gradleFile != null) {
            val content = gradleFile.readText()
            // Also check build.gradle if we found settings.gradle
            val buildContent = if (gradleFile.name.startsWith("settings")) {
                val bf = if (buildGradleKts.exists()) buildGradleKts else buildGradle
                if (bf.exists()) bf.readText() else ""
            } else content

            val hasDeps = buildContent.contains("dev.openfeature") &&
                         buildContent.contains("go-feature-flag")
            // For Gradle, prefer build.gradle over settings.gradle for actual dependency modifications
            val actualBuildFile = when {
                buildGradleKts.exists() -> buildGradleKts.name
                buildGradle.exists() -> buildGradle.name
                else -> gradleFile.name
            }
            detected.add(DetectedProject(ProjectType.GRADLE, dir, actualBuildFile, "${pathPrefix}${gradleFile.name}", hasDeps))
        }

        // Check for .csproj (C#/.NET)
        val csprojFiles = dir.listFiles { _, name -> name.endsWith(".csproj") }
        if (!csprojFiles.isNullOrEmpty()) {
            val csprojFile = csprojFiles.first()
            val content = csprojFile.readText()
            val hasDeps = content.contains("OpenFeature") &&
                         content.contains("GOFeatureFlag")
            detected.add(DetectedProject(ProjectType.DOTNET, dir, csprojFile.name, "${pathPrefix}${csprojFile.name}", hasDeps))
        }

        // Check for Cargo.toml (Rust)
        val cargoToml = File(dir, "Cargo.toml")
        if (cargoToml.exists()) {
            val content = cargoToml.readText()
            val hasDeps = content.contains("open-feature") &&
                         content.contains("go-feature-flag")
            detected.add(DetectedProject(ProjectType.RUST, dir, "Cargo.toml", "${pathPrefix}Cargo.toml", hasDeps))
        }

        // Check for composer.json (PHP)
        val composerJson = File(dir, "composer.json")
        if (composerJson.exists()) {
            val content = composerJson.readText()
            val hasDeps = content.contains("open-feature") &&
                         content.contains("go-feature-flag")
            detected.add(DetectedProject(ProjectType.PHP, dir, "composer.json", "${pathPrefix}composer.json", hasDeps))
        }

        // Check for Gemfile (Ruby)
        val gemfile = File(dir, "Gemfile")
        if (gemfile.exists()) {
            val content = gemfile.readText()
            val hasDeps = content.contains("openfeature") &&
                         content.contains("go-feature-flag")
            detected.add(DetectedProject(ProjectType.RUBY, dir, "Gemfile", "${pathPrefix}Gemfile", hasDeps))
        }

        // Check for Package.swift (Swift)
        val packageSwift = File(dir, "Package.swift")
        if (packageSwift.exists()) {
            val content = packageSwift.readText()
            val hasDeps = content.contains("OpenFeature")
            detected.add(DetectedProject(ProjectType.SWIFT, dir, "Package.swift", "${pathPrefix}Package.swift", hasDeps))
        }

        // Check for pubspec.yaml (Dart/Flutter)
        val pubspecYaml = File(dir, "pubspec.yaml")
        if (pubspecYaml.exists()) {
            val content = pubspecYaml.readText()
            val hasDeps = content.contains("openfeature") &&
                         content.contains("go_feature_flag")
            detected.add(DetectedProject(ProjectType.DART, dir, "pubspec.yaml", "${pathPrefix}pubspec.yaml", hasDeps))
        }

        // Check for IntelliJ-native Java project (.iml file without Maven/Gradle)
        // Only check if we haven't already found Maven or Gradle in this directory
        val hasMavenOrGradle = detected.any {
            it.path == dir && (it.type == ProjectType.MAVEN || it.type == ProjectType.GRADLE)
        }
        if (!hasMavenOrGradle) {
            val imlFiles = dir.listFiles { _, name -> name.endsWith(".iml") }
            if (!imlFiles.isNullOrEmpty()) {
                val imlFile = imlFiles.first()
                val content = imlFile.readText()
                // Check if it's a Java module (contains JAVA_MODULE or has Java SDK)
                if (content.contains("JAVA_MODULE") || content.contains("inheritedJdk") || content.contains("languageLevel")) {
                    // Check if OpenFeature is already in the libraries
                    val hasDeps = content.contains("openfeature") || content.contains("OpenFeature")
                    detected.add(DetectedProject(ProjectType.INTELLIJ_JAVA, dir, imlFile.name, "${pathPrefix}${imlFile.name}", hasDeps))
                }
            }
        }
    }

    private fun addDependencies(project: Project, selectedProjects: List<DetectedProject>) {
        ApplicationManager.getApplication().executeOnPooledThread {
            for (detectedProject in selectedProjects) {
                try {
                    when (detectedProject.type) {
                        ProjectType.NPM -> installNpmDependencies(project, detectedProject)
                        ProjectType.PYTHON_REQUIREMENTS -> installPythonRequirementsDependencies(project, detectedProject)
                        ProjectType.PYTHON_POETRY -> installPythonPoetryDependencies(project, detectedProject)
                        ProjectType.GO -> installGoDependencies(project, detectedProject)
                        ProjectType.MAVEN -> installMavenDependencies(project, detectedProject)
                        ProjectType.GRADLE -> installGradleDependencies(project, detectedProject)
                        ProjectType.INTELLIJ_JAVA -> installIntelliJJavaDependencies(project, detectedProject)
                        ProjectType.DOTNET -> installDotNetDependencies(project, detectedProject)
                        ProjectType.RUST -> installRustDependencies(project, detectedProject)
                        ProjectType.PHP -> installPhpDependencies(project, detectedProject)
                        ProjectType.RUBY -> installRubyDependencies(project, detectedProject)
                        ProjectType.SWIFT -> installSwiftDependencies(project, detectedProject)
                        ProjectType.DART -> installDartDependencies(project, detectedProject)
                    }
                } catch (e: Exception) {
                    showNotification(project, "Failed to add dependencies for ${detectedProject.type.displayName}: ${e.message}", NotificationType.ERROR)
                }
            }
        }
    }

    private fun installNpmDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "npm install $packages", "Installing npm packages...")
    }

    private fun installPythonRequirementsDependencies(project: Project, detectedProject: DetectedProject) {
        val requirementsFile = File(detectedProject.path, "requirements.txt")
        val content = requirementsFile.readText()
        val newContent = content.trimEnd() + "\n" + detectedProject.type.packages.joinToString("\n") + "\n"
        requirementsFile.writeText(newContent)
        showNotification(project, "Added dependencies to requirements.txt. Run: pip install -r requirements.txt")
    }

    private fun installPythonPoetryDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "poetry add $packages", "Installing Python packages with Poetry...")
    }

    private fun installGoDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "go get $packages", "Installing Go modules...")
    }

    private fun installMavenDependencies(project: Project, detectedProject: DetectedProject) {
        val pomFile = File(detectedProject.path, "pom.xml")
        val pom = pomFile.readText()

        val dependencies = """
    <!-- OpenFeature SDK -->
    <dependency>
        <groupId>dev.openfeature</groupId>
        <artifactId>sdk</artifactId>
        <version>1.7.0</version>
    </dependency>
    <!-- GO Feature Flag Provider -->
    <dependency>
        <groupId>dev.openfeature.contrib.providers</groupId>
        <artifactId>go-feature-flag</artifactId>
        <version>0.2.0</version>
    </dependency>
"""

        if (pom.contains("</dependencies>")) {
            val newPom = pom.replace("</dependencies>", "$dependencies</dependencies>")
            pomFile.writeText(newPom)
            showNotification(project, "Added OpenFeature dependencies to pom.xml. Run: mvn install")
        } else {
            showNotification(project, "Could not find </dependencies> in pom.xml. Please add dependencies manually.", NotificationType.WARNING)
        }
    }

    private fun installGradleDependencies(project: Project, detectedProject: DetectedProject) {
        val gradleFile = File(detectedProject.path, detectedProject.configFileName)
        val gradle = gradleFile.readText()

        val isKotlinDsl = gradleFile.name.endsWith(".kts")
        val dependencies = if (isKotlinDsl) {
            """
    // OpenFeature SDK
    implementation("dev.openfeature:sdk:1.7.0")
    // GO Feature Flag Provider
    implementation("dev.openfeature.contrib.providers:go-feature-flag:0.2.0")
"""
        } else {
            """
    // OpenFeature SDK
    implementation 'dev.openfeature:sdk:1.7.0'
    // GO Feature Flag Provider
    implementation 'dev.openfeature.contrib.providers:go-feature-flag:0.2.0'
"""
        }

        val dependenciesRegex = Regex("""dependencies\s*\{""")
        val match = dependenciesRegex.find(gradle)

        if (match != null) {
            val insertPos = match.range.last + 1
            val newGradle = gradle.substring(0, insertPos) + dependencies + gradle.substring(insertPos)
            gradleFile.writeText(newGradle)
            showNotification(project, "Added OpenFeature dependencies to ${detectedProject.displayPath}. Sync your Gradle project.")
        } else {
            showNotification(project, "Could not find dependencies block in ${detectedProject.displayPath}. Please add dependencies manually.", NotificationType.WARNING)
        }
    }

    private fun installIntelliJJavaDependencies(project: Project, detectedProject: DetectedProject) {
        // For IntelliJ-native Java projects, we need to guide the user to add libraries manually
        // or suggest converting to Maven/Gradle
        ApplicationManager.getApplication().invokeLater {
            val message = """
                |To add OpenFeature dependencies to an IntelliJ Java project:
                |
                |Option 1: Convert to Maven/Gradle (Recommended)
                |  • Right-click on project → Add Framework Support → Maven or Gradle
                |  • Then run "Add OpenFeature Dependencies" again
                |
                |Option 2: Add JARs manually
                |  1. Go to File → Project Structure → Libraries
                |  2. Click + → From Maven...
                |  3. Search for and add:
                |     • dev.openfeature:sdk:1.7.0
                |     • dev.openfeature.contrib.providers:go-feature-flag:0.2.0
                |  4. Click OK and apply changes
                |
                |Option 3: Download JARs directly
                |  • OpenFeature SDK: https://repo1.maven.org/maven2/dev/openfeature/sdk/
                |  • GO Feature Flag Provider: https://repo1.maven.org/maven2/dev/openfeature/contrib/providers/go-feature-flag/
            """.trimMargin()

            Messages.showInfoMessage(project, message, "Add OpenFeature Dependencies")
        }
    }

    private fun installDotNetDependencies(project: Project, detectedProject: DetectedProject) {
        runCommand(project, detectedProject.path,
            "dotnet add package OpenFeature && dotnet add package OpenFeature.Contrib.Providers.GOFeatureFlag",
            "Installing NuGet packages...")
    }

    private fun installRustDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "cargo add $packages", "Installing Rust crates...")
    }

    private fun installPhpDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "composer require $packages", "Installing Composer packages...")
    }

    private fun installRubyDependencies(project: Project, detectedProject: DetectedProject) {
        val gemfile = File(detectedProject.path, "Gemfile")
        val content = gemfile.readText()
        val gems = detectedProject.type.packages.joinToString("\n") { "gem '$it'" }
        gemfile.writeText(content.trimEnd() + "\n" + gems + "\n")
        showNotification(project, "Added gems to Gemfile. Run: bundle install")
    }

    private fun installSwiftDependencies(project: Project, detectedProject: DetectedProject) {
        showNotification(project,
            "Add to Package.swift dependencies:\n" +
            ".package(url: \"https://github.com/open-feature/swift-sdk.git\", from: \"0.1.0\")",
            NotificationType.INFORMATION)
    }

    private fun installDartDependencies(project: Project, detectedProject: DetectedProject) {
        val packages = detectedProject.type.packages.joinToString(" ")
        runCommand(project, detectedProject.path, "flutter pub add $packages", "Installing Flutter packages...")
    }

    private fun runCommand(project: Project, workDir: File, command: String, message: String) {
        showNotification(project, message, NotificationType.INFORMATION)

        try {
            val processBuilder = ProcessBuilder()
            processBuilder.directory(workDir)

            val isWindows = System.getProperty("os.name").lowercase().contains("windows")
            if (isWindows) {
                processBuilder.command("cmd", "/c", command)
            } else {
                processBuilder.command("sh", "-c", command)
            }

            val process = processBuilder.start()
            val exitCode = process.waitFor()

            ApplicationManager.getApplication().invokeLater {
                if (exitCode == 0) {
                    showNotification(project, "Dependencies installed successfully!", NotificationType.INFORMATION)
                } else {
                    val error = process.errorStream.bufferedReader().readText()
                    showNotification(project, "Failed to install dependencies: $error", NotificationType.ERROR)
                }
            }
        } catch (e: Exception) {
            ApplicationManager.getApplication().invokeLater {
                showNotification(project, "Failed to run command: ${e.message}", NotificationType.ERROR)
            }
        }
    }

    private fun showNotification(project: Project, message: String, type: NotificationType = NotificationType.INFORMATION) {
        ApplicationManager.getApplication().invokeLater {
            NotificationGroupManager.getInstance()
                .getNotificationGroup("GO Feature Flag")
                .createNotification(message, type)
                .notify(project)
        }
    }
}

/**
 * Dialog for selecting which projects to add dependencies to.
 */
class AddDependenciesDialog(
    private val project: Project,
    private val detectedProjects: List<AddDependenciesAction.DetectedProject>
) : DialogWrapper(project) {

    private val checkboxes = mutableMapOf<AddDependenciesAction.DetectedProject, JBCheckBox>()

    init {
        title = "Add OpenFeature Dependencies"
        init()
    }

    override fun createCenterPanel(): JComponent {
        val mainPanel = JPanel(BorderLayout())
        mainPanel.border = JBUI.Borders.empty(10)

        // Header
        val headerLabel = JBLabel("Detected project types in your workspace:")
        headerLabel.font = headerLabel.font.deriveFont(Font.BOLD)

        // Project list
        val projectsPanel = JPanel()
        projectsPanel.layout = BoxLayout(projectsPanel, BoxLayout.Y_AXIS)
        projectsPanel.border = JBUI.Borders.empty(10, 0)

        for (detectedProject in detectedProjects) {
            val panel = JPanel(BorderLayout(10, 0))
            panel.border = JBUI.Borders.empty(5)

            val checkbox = JBCheckBox().apply {
                isSelected = !detectedProject.alreadyHasDependencies
                isEnabled = !detectedProject.alreadyHasDependencies
            }
            checkboxes[detectedProject] = checkbox

            val infoPanel = JPanel()
            infoPanel.layout = BoxLayout(infoPanel, BoxLayout.Y_AXIS)

            val titleLabel = JBLabel("${detectedProject.type.icon} ${detectedProject.type.displayName}")
            titleLabel.font = titleLabel.font.deriveFont(Font.BOLD)

            val pathLabel = JBLabel(detectedProject.displayPath)
            pathLabel.font = pathLabel.font.deriveFont(Font.PLAIN, 11f)
            pathLabel.foreground = JBColor.GRAY

            val packagesLabel = JBLabel("Packages: ${detectedProject.type.packages.joinToString(", ")}")
            packagesLabel.font = packagesLabel.font.deriveFont(Font.PLAIN, 10f)
            packagesLabel.foreground = JBColor.GRAY

            infoPanel.add(titleLabel)
            infoPanel.add(pathLabel)
            infoPanel.add(packagesLabel)

            if (detectedProject.alreadyHasDependencies) {
                val installedLabel = JBLabel("✓ Already installed")
                installedLabel.font = installedLabel.font.deriveFont(Font.ITALIC, 10f)
                installedLabel.foreground = JBColor.GREEN.darker()
                infoPanel.add(installedLabel)
            }

            panel.add(checkbox, BorderLayout.WEST)
            panel.add(infoPanel, BorderLayout.CENTER)

            projectsPanel.add(panel)
            projectsPanel.add(Box.createVerticalStrut(5))
        }

        val scrollPane = JBScrollPane(projectsPanel)
        scrollPane.preferredSize = Dimension(500, 300)
        scrollPane.border = null

        mainPanel.add(headerLabel, BorderLayout.NORTH)
        mainPanel.add(scrollPane, BorderLayout.CENTER)

        return mainPanel
    }

    fun getSelectedProjects(): List<AddDependenciesAction.DetectedProject> {
        return checkboxes.filter { it.value.isSelected }.keys.toList()
    }
}
