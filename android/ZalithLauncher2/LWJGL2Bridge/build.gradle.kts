import java.security.MessageDigest

// DBR: -javaagent jar for native LWJGL 2 (1.7.10). Holds the stub org.lwjgl.glfw.GLFW that pojavexec's runtime
// JNI_OnLoad expects, and loads pojavexec and libglfw into the game JVM before Minecraft starts.
plugins {
    id("java-library")
}

tasks.jar {
    archiveFileName.set("dbr-lwjgl2-bridge.jar")
    destinationDirectory.set(file("../ZalithLauncher/src/main/assets/components/lwjgl2/"))
    manifest {
        attributes("Premain-Class" to "online.dragonblock.lwjgl2.Lwjgl2Bridge")
    }
    // Reproducible jar, so the hash below only changes when the content changes.
    isPreserveFileTimestamps = false
    isReproducibleFileOrder = true
    // The launcher re-extracts components/lwjgl2 only when "version" differs from the installed one.
    // Write it as a hash of every file in the component, so a new bridge always reaches the phone.
    doLast {
        val dir = destinationDirectory.get().asFile
        val md = MessageDigest.getInstance("SHA-256")
        dir.listFiles()!!.filter { it.isFile && it.name != "version" }.sortedBy { it.name }.forEach {
            md.update(it.name.toByteArray())
            md.update(it.readBytes())
        }
        val hash = md.digest().joinToString("") { "%02x".format(it) }.take(16)
        File(dir, "version").writeText(hash)
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
}
