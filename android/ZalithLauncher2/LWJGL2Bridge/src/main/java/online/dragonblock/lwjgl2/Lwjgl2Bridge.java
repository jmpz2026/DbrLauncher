package online.dragonblock.lwjgl2;

import java.io.File;
import java.net.URL;

/**
 * -javaagent entry point for native LWJGL 2. Loads pojavexec into the game JVM (its JNI_OnLoad sets up the input
 * bridge for this VM), then libglfw.so (the GLFW that liblwjgl64.so links against) and liblwjgl64.so itself.
 *
 * Everything is logged with the "DBR-LWJGL2:" prefix: when LWJGL 2's own native fails to load, org.lwjgl.Sys silently
 * falls back to "lwjgl", which on Android is LWJGL 3's core library, and the real reason would be lost.
 */
public final class Lwjgl2Bridge {
    private static final String[] NATIVES = {
        "liblwjgl64.so", "libglfw.so", "libpojavexec.so", "liblwjgl.so", "libopenal.so"
    };

    private Lwjgl2Bridge() {}

    private static void log(String message) {
        System.out.println("DBR-LWJGL2: " + message);
    }

    public static void premain(String args) {
        log("bridge starting");
        for (String key : new String[] {"java.version", "os.arch", "os.version", "java.library.path",
            "org.lwjgl.librarypath", "org.lwjgl.opengl.libname", "org.lwjgl.util.Debug"}) {
            log(key + " = " + System.getProperty(key));
        }
        final String dir = System.getProperty("org.lwjgl.librarypath");
        if (dir != null) {
            for (String name : NATIVES) {
                final File file = new File(dir, name);
                log(name + ": " + (file.isFile() ? file.length() + " bytes" : "MISSING") + " in " + dir);
            }
        }
        for (String entry : System.getProperty("java.class.path", "").split(File.pathSeparator)) {
            if (entry.toLowerCase().contains("lwjgl")) log("classpath: " + entry);
        }
        final URL sys = Lwjgl2Bridge.class.getClassLoader().getResource("org/lwjgl/Sys.class");
        log("org.lwjgl.Sys comes from " + sys);
        final URL glfw3 = Lwjgl2Bridge.class.getClassLoader().getResource("org/lwjgl/system/Library.class");
        if (glfw3 != null) log("WARNING: LWJGL 3 classes are also on the classpath: " + glfw3);

        load("pojavexec", null);
        load("glfw", null);
        load("lwjgl64", dir == null ? null : new File(dir, "liblwjgl64.so").getAbsolutePath());
        log("bridge loaded");
    }

    private static void load(String name, String path) {
        try {
            if (path != null) System.load(path);
            else System.loadLibrary(name);
            log("loaded " + (path != null ? path : name));
        } catch (Throwable t) {
            log("FAILED to load " + (path != null ? path : name) + ": " + t);
            t.printStackTrace(System.out);
        }
    }

    public static void premain(String args, java.lang.instrument.Instrumentation instrumentation) {
        premain(args);
    }
}
