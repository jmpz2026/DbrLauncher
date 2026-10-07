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
        // Load LWJGL 2's native here too: if it fails, org.lwjgl.Sys silently falls back to "lwjgl", which on Android
        // is LWJGL 3's core library, and the real reason is lost.
        final String dir = System.getProperty("org.lwjgl.librarypath");
        final String path = dir + "/liblwjgl64.so";
        try {
            System.load(path);
            System.out.println("DBR-GLFW: loaded " + path);
        } catch (Throwable t) {
            System.out.println("DBR-GLFW: could not load " + path + ": " + t);
            t.printStackTrace(System.out);
        }
        System.out.println("DBR-GLFW: LWJGL 2 bridge loaded");
    }

    public static void premain(String args, java.lang.instrument.Instrumentation instrumentation) {
        premain(args);
    }
}
