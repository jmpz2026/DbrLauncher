package org.lwjgl.glfw;

import java.nio.ByteBuffer;

/**
 * Stub for native LWJGL 2. pojavexec's runtime JNI_OnLoad looks up this class and these members (in LWJGL 3 they
 * belong to the launcher's own GLFW implementation). Key and mouse state are written here by the input bridge;
 * window attribute changes from the Android lifecycle are forwarded to libglfw.so.
 */
public final class GLFW {
    public static final ByteBuffer keyDownBuffer = ByteBuffer.allocateDirect(512);
    public static final ByteBuffer mouseDownBuffer = ByteBuffer.allocateDirect(16);

    private GLFW() {}

    public static void glfwSetWindowAttrib(long window, int attrib, int value) {
        try {
            nDbrWindowAttrib(attrib, value);
        } catch (UnsatisfiedLinkError ignored) {
            // libglfw.so not loaded yet: nothing to forward.
        }
    }

    public static void internalWindowSizeChanged(long window, int width, int height) {
        // libglfw.so reports the size to LWJGL 2 itself.
    }

    private static native void nDbrWindowAttrib(int attrib, int value);

    // ---- DBR mobile channel (docs/canal-movil.md) ----
    // Lives in org.lwjgl.* on purpose: Forge's LaunchClassLoader excludes that package, so mods reach this
    // class through the system class loader, where libglfw.so registered the natives.

    /** Protocol version of this bridge. DbrCore checks it before using the channel. */
    public static final int DBR_CANAL_VERSION = 1;
    /** Same limit as DBR_CANAL_MAX_PAYLOAD in dbr_canal.h. */
    public static final int DBR_CANAL_MAX_PAYLOAD = 1024;

    /**
     * Sends one message to the launcher. Returns false when the channel is not available (no native, bad
     * arguments). Never throws.
     */
    public static boolean dbrSend(int type, byte[] data) {
        if (type <= 0 || type > 255 || data == null || data.length > DBR_CANAL_MAX_PAYLOAD) return false;
        try {
            nDbrSend(type, data);
            return true;
        } catch (UnsatisfiedLinkError e) {
            return false;
        }
    }

    /**
     * Takes the oldest message from the launcher: byte 0 is the type (unsigned), the rest is the payload.
     * Returns null when the queue is empty or the channel is not available. Never throws.
     */
    public static byte[] dbrPoll() {
        try {
            return nDbrPoll();
        } catch (UnsatisfiedLinkError e) {
            return null;
        }
    }

    private static native void nDbrSend(int type, byte[] data);

    private static native byte[] nDbrPoll();
}
