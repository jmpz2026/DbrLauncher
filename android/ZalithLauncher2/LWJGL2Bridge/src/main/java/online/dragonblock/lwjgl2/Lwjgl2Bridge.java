package online.dragonblock.lwjgl2;

/**
 * -javaagent entry point for native LWJGL 2. Loads pojavexec into the game JVM (its JNI_OnLoad sets up the input
 * bridge for this VM) and then libglfw.so, the GLFW that liblwjgl64.so links against.
 */
public final class Lwjgl2Bridge {
    private Lwjgl2Bridge() {}

    public static void premain(String args) {
        System.loadLibrary("pojavexec");
        System.loadLibrary("glfw");
        System.out.println("DBR-GLFW: LWJGL 2 bridge loaded");
    }

    public static void premain(String args, java.lang.instrument.Instrumentation instrumentation) {
        premain(args);
    }
}
