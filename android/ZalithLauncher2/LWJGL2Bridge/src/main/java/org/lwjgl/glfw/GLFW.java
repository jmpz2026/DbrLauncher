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
}
