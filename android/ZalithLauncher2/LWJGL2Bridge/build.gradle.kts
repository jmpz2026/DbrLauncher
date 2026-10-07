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
}

java {
    sourceCompatibility = JavaVersion.VERSION_1_8
    targetCompatibility = JavaVersion.VERSION_1_8
}
