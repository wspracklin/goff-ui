package com.gofeatureflag.intellij.dependencies

import com.gofeatureflag.intellij.model.SupportedLanguage
import com.gofeatureflag.intellij.settings.GoffSettings
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.diagnostic.Logger
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VfsUtil
import java.io.File

/**
 * Manages automatic installation of OpenFeature dependencies for different languages.
 */
object DependencyManager {

    private val logger = Logger.getInstance(DependencyManager::class.java)

    /**
     * Check and install dependencies for the given language if needed.
     */
    fun ensureDependencies(project: Project, language: SupportedLanguage, projectRoot: VirtualFile?) {
        if (!GoffSettings.getInstance().autoAddDependencies) {
            return
        }

        val root = projectRoot ?: project.baseDir ?: return

        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                when (language) {
                    SupportedLanguage.JAVASCRIPT, SupportedLanguage.TYPESCRIPT -> {
                        addNpmDependencies(project, root)
                    }
                    SupportedLanguage.PYTHON -> {
                        addPythonDependencies(project, root)
                    }
                    SupportedLanguage.GO -> {
                        addGoDependencies(project, root)
                    }
                    SupportedLanguage.JAVA -> {
                        addJavaDependencies(project, root)
                    }
                    SupportedLanguage.KOTLIN -> {
                        addKotlinDependencies(project, root)
                    }
                    SupportedLanguage.CSHARP -> {
                        addDotNetDependencies(project, root)
                    }
                    SupportedLanguage.RUST -> {
                        addRustDependencies(project, root)
                    }
                    SupportedLanguage.PHP -> {
                        addPhpDependencies(project, root)
                    }
                    SupportedLanguage.RUBY -> {
                        addRubyDependencies(project, root)
                    }
                    SupportedLanguage.SWIFT -> {
                        addSwiftDependencies(project, root)
                    }
                    SupportedLanguage.DART -> {
                        addDartDependencies(project, root)
                    }
                }
            } catch (e: Exception) {
                logger.warn("Failed to add dependencies: ${e.message}")
            }
        }
    }

    /**
     * Add npm dependencies for JavaScript/TypeScript projects.
     */
    private fun addNpmDependencies(project: Project, root: VirtualFile) {
        val packageJsonFile = root.findChild("package.json") ?: return
        val packageJson = VfsUtil.loadText(packageJsonFile)

        // Check if dependencies already exist
        if (packageJson.contains("@openfeature/web-sdk") &&
            packageJson.contains("@openfeature/go-feature-flag-provider")) {
            return
        }

        // Run npm install
        val dependencies = listOf(
            "@openfeature/web-sdk",
            "@openfeature/go-feature-flag-provider"
        )

        runCommand(project, root, "npm install ${dependencies.joinToString(" ")}", "Installing OpenFeature npm packages...")
    }

    /**
     * Add Python dependencies.
     */
    private fun addPythonDependencies(project: Project, root: VirtualFile) {
        val requirementsFile = root.findChild("requirements.txt")
        val pyprojectFile = root.findChild("pyproject.toml")

        val dependencies = listOf(
            "openfeature-sdk",
            "gofeatureflag-python-provider"
        )

        if (requirementsFile != null) {
            val content = VfsUtil.loadText(requirementsFile)
            val missingDeps = dependencies.filter { !content.contains(it) }

            if (missingDeps.isNotEmpty()) {
                // Add to requirements.txt
                WriteCommandAction.runWriteCommandAction(project) {
                    val newContent = content.trimEnd() + "\n" + missingDeps.joinToString("\n") + "\n"
                    VfsUtil.saveText(requirementsFile, newContent)
                }
                showNotification(project, "Added OpenFeature dependencies to requirements.txt. Run: pip install -r requirements.txt")
            }
        } else if (pyprojectFile != null) {
            runCommand(project, root, "pip install ${dependencies.joinToString(" ")}", "Installing OpenFeature Python packages...")
        } else {
            runCommand(project, root, "pip install ${dependencies.joinToString(" ")}", "Installing OpenFeature Python packages...")
        }
    }

    /**
     * Add Go dependencies.
     */
    private fun addGoDependencies(project: Project, root: VirtualFile) {
        val goModFile = root.findChild("go.mod") ?: return
        val goMod = VfsUtil.loadText(goModFile)

        val dependencies = listOf(
            "github.com/open-feature/go-sdk/openfeature",
            "github.com/open-feature/go-sdk-contrib/providers/go-feature-flag/pkg"
        )

        val missingDeps = dependencies.filter { !goMod.contains(it.substringBefore("/pkg")) }

        if (missingDeps.isNotEmpty()) {
            runCommand(project, root, "go get ${missingDeps.joinToString(" ")}", "Installing OpenFeature Go modules...")
        }
    }

    /**
     * Add Java dependencies (Maven or Gradle).
     */
    private fun addJavaDependencies(project: Project, root: VirtualFile) {
        val pomFile = root.findChild("pom.xml")
        val gradleFile = root.findChild("build.gradle") ?: root.findChild("build.gradle.kts")

        if (pomFile != null) {
            addMavenDependencies(project, pomFile)
        } else if (gradleFile != null) {
            addGradleDependencies(project, gradleFile)
        }
    }

    private fun addMavenDependencies(project: Project, pomFile: VirtualFile) {
        val pom = VfsUtil.loadText(pomFile)

        if (pom.contains("dev.openfeature") && pom.contains("go-feature-flag")) {
            return
        }

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

        // Find </dependencies> and insert before it
        if (pom.contains("</dependencies>")) {
            WriteCommandAction.runWriteCommandAction(project) {
                val newPom = pom.replace("</dependencies>", "$dependencies</dependencies>")
                VfsUtil.saveText(pomFile, newPom)
            }
            showNotification(project, "Added OpenFeature dependencies to pom.xml. Run: mvn install")
        } else {
            showNotification(project, "Please add OpenFeature dependencies manually to pom.xml", NotificationType.WARNING)
        }
    }

    private fun addGradleDependencies(project: Project, gradleFile: VirtualFile) {
        val gradle = VfsUtil.loadText(gradleFile)

        if (gradle.contains("dev.openfeature") && gradle.contains("go-feature-flag")) {
            return
        }

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

        // Find dependencies block and insert
        val dependenciesRegex = Regex("""dependencies\s*\{""")
        val match = dependenciesRegex.find(gradle)

        if (match != null) {
            WriteCommandAction.runWriteCommandAction(project) {
                val insertPos = match.range.last + 1
                val newGradle = gradle.substring(0, insertPos) + dependencies + gradle.substring(insertPos)
                VfsUtil.saveText(gradleFile, newGradle)
            }
            showNotification(project, "Added OpenFeature dependencies to ${gradleFile.name}. Sync your Gradle project.")
        } else {
            showNotification(project, "Please add OpenFeature dependencies manually to ${gradleFile.name}", NotificationType.WARNING)
        }
    }

    /**
     * Add Kotlin dependencies (same as Java).
     */
    private fun addKotlinDependencies(project: Project, root: VirtualFile) {
        addJavaDependencies(project, root)
    }

    /**
     * Add .NET/C# dependencies.
     */
    private fun addDotNetDependencies(project: Project, root: VirtualFile) {
        // Find .csproj file
        val csprojFile = findFileWithExtension(root, "csproj") ?: return
        val csproj = VfsUtil.loadText(csprojFile)

        if (csproj.contains("OpenFeature") && csproj.contains("GOFeatureFlag")) {
            return
        }

        runCommand(project, root,
            "dotnet add package OpenFeature && dotnet add package OpenFeature.Contrib.Providers.GOFeatureFlag",
            "Installing OpenFeature NuGet packages...")
    }

    /**
     * Add Rust dependencies.
     */
    private fun addRustDependencies(project: Project, root: VirtualFile) {
        val cargoFile = root.findChild("Cargo.toml") ?: return
        val cargo = VfsUtil.loadText(cargoFile)

        if (cargo.contains("open-feature") && cargo.contains("go-feature-flag")) {
            return
        }

        runCommand(project, root,
            "cargo add open-feature go-feature-flag-provider",
            "Installing OpenFeature Rust crates...")
    }

    /**
     * Add PHP dependencies.
     */
    private fun addPhpDependencies(project: Project, root: VirtualFile) {
        val composerFile = root.findChild("composer.json") ?: return
        val composer = VfsUtil.loadText(composerFile)

        if (composer.contains("open-feature") && composer.contains("go-feature-flag")) {
            return
        }

        runCommand(project, root,
            "composer require open-feature/sdk open-feature/go-feature-flag-provider",
            "Installing OpenFeature Composer packages...")
    }

    /**
     * Add Ruby dependencies.
     */
    private fun addRubyDependencies(project: Project, root: VirtualFile) {
        val gemfile = root.findChild("Gemfile") ?: return
        val gems = VfsUtil.loadText(gemfile)

        if (gems.contains("openfeature") && gems.contains("go-feature-flag")) {
            return
        }

        val dependencies = """
gem 'openfeature-sdk'
gem 'openfeature-go-feature-flag-provider'
"""

        WriteCommandAction.runWriteCommandAction(project) {
            val newGems = gems.trimEnd() + "\n" + dependencies
            VfsUtil.saveText(gemfile, newGems)
        }
        showNotification(project, "Added OpenFeature gems to Gemfile. Run: bundle install")
    }

    /**
     * Add Swift dependencies (Swift Package Manager).
     */
    private fun addSwiftDependencies(project: Project, root: VirtualFile) {
        val packageFile = root.findChild("Package.swift") ?: return
        val packageSwift = VfsUtil.loadText(packageFile)

        if (packageSwift.contains("OpenFeature") && packageSwift.contains("go-feature-flag")) {
            return
        }

        showNotification(project,
            "Add OpenFeature to Package.swift dependencies:\n" +
            ".package(url: \"https://github.com/open-feature/swift-sdk.git\", from: \"0.1.0\")",
            NotificationType.INFORMATION)
    }

    /**
     * Add Dart/Flutter dependencies.
     */
    private fun addDartDependencies(project: Project, root: VirtualFile) {
        val pubspecFile = root.findChild("pubspec.yaml") ?: return
        val pubspec = VfsUtil.loadText(pubspecFile)

        if (pubspec.contains("openfeature") && pubspec.contains("go_feature_flag")) {
            return
        }

        runCommand(project, root,
            "flutter pub add openfeature go_feature_flag_provider",
            "Installing OpenFeature Dart packages...")
    }

    /**
     * Run a command in the project directory.
     */
    private fun runCommand(project: Project, root: VirtualFile, command: String, message: String) {
        showNotification(project, message, NotificationType.INFORMATION)

        try {
            val processBuilder = ProcessBuilder()
            processBuilder.directory(File(root.path))

            // Determine shell based on OS
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
                    showNotification(project, "OpenFeature dependencies installed successfully!", NotificationType.INFORMATION)
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

    /**
     * Find a file with a specific extension in the directory.
     */
    private fun findFileWithExtension(dir: VirtualFile, extension: String): VirtualFile? {
        return dir.children.firstOrNull { it.name.endsWith(".$extension") }
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
