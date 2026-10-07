/*
 * DBR: libglfw.so for native LWJGL 2.9.4 (MojoLauncher/lwjgl2-glfw) on Android.
 *
 * liblwjgl64.so from lwjgl2-glfw links against GLFW 3 and uses 38 of its functions. This library implements
 * them on top of the bridges pojavexec already has for LWJGL 3: the EGL context bridge (pojavCreateContext,
 * pojavMakeCurrent, pojavSwapBuffers) and the input event queue (pojav_environ, pojavPumpEvents), so 1.7.10 runs
 * on the same LWJGL 2 code path as on the PC instead of going through lwjglx.
 *
 * Notes:
 * - lwjgl2-glfw's callbacks call into Java with the game thread's JNIEnv, so input always goes through the event
 *   queue (isUseStackQueueCall) and is delivered from glfwPollEvents on the game thread.
 * - The Android side sends an accumulated absolute cursor position. In grab mode LWJGL 2 resets the cursor to (0, 0)
 *   every poll and reads deltas, so the cursor seen by LWJGL 2 is the Android one minus an offset.
 * - pojavexec's runtime JNI_OnLoad needs the stub class org.lwjgl.glfw.GLFW (bridge jar, loaded as -javaagent).
 * - Everything is logged with the "DBR-GLFW:" prefix to stdout, which pojavexec copies into latest_game.log.
 */

#include <dlfcn.h>
#include <jni.h>
#include <stdatomic.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/syscall.h>
#include <time.h>
#include <unistd.h>

#include "environ/environ.h"

#define API __attribute__((visibility("default")))

/* Flushed so the last line before a native crash is not lost. */
#define DBG(...) do { printf("DBR-GLFW: " __VA_ARGS__); printf("\n"); fflush(stdout); } while (0)

#define GLFW_TRUE 1
#define GLFW_FALSE 0
#define GLFW_FOCUSED 0x00020001
#define GLFW_ICONIFIED 0x00020002
#define GLFW_VISIBLE 0x00020004
#define GLFW_HOVERED 0x0002000B
#define GLFW_CLIENT_API 0x00022001
#define GLFW_CONTEXT_VERSION_MAJOR 0x00022002
#define GLFW_CONTEXT_VERSION_MINOR 0x00022003
#define GLFW_NO_API 0
#define GLFW_OPENGL_API 0x00030001
#define GLFW_CURSOR 0x00033001
#define GLFW_CURSOR_DISABLED 0x00034003

typedef struct {
    int width, height, redBits, greenBits, blueBits, refreshRate;
} GLFWvidmode;

typedef void (*GLFWglproc)(void);
typedef void (*GLFWwindowposfun)(void*, int, int);
typedef void (*GLFWwindowsizefun)(void*, int, int);
typedef void (*GLFWwindowclosefun)(void*);
typedef void (*GLFWwindowfocusfun)(void*, int);
typedef void (*GLFWwindowiconifyfun)(void*, int);
typedef void (*GLFWkeyfun)(void*, int, int, int, int);
typedef void (*GLFWcharfun)(void*, unsigned int);
typedef void (*GLFWmousebuttonfun)(void*, int, int, int);
typedef void (*GLFWcursorposfun)(void*, double, double);
typedef void (*GLFWcursorenterfun)(void*, int);
typedef void (*GLFWscrollfun)(void*, double, double);

/* pojavexec */
extern int pojavInit(void);
extern void pojavSetWindowHint(int hint, int value);
extern void pojavSwapBuffers(void);
extern void pojavMakeCurrent(void* window);
extern void* pojavCreateContext(void* contextSrc);
extern void pojavSwapInterval(int interval);
extern void pojavStartPumping(void);
extern void pojavPumpEvents(void* window);
extern void pojavStopPumping(void);
extern void* (*eglGetProcAddress_p)(const char* procname);

static JavaVM* g_vm;
static char* g_gl_libname;
static void* g_gl_handle;
static bool g_gl_handle_tried;
static bool g_initialized;
static __thread void* g_current;
static int g_monitor;
static GLFWvidmode g_mode;
static double g_offset_x, g_offset_y;
static bool g_grabbed;
static bool g_initial_events_sent;
static bool g_pumping;
static struct timespec g_start;
static unsigned long g_polls, g_swaps, g_proc_lookups, g_proc_misses;
static double g_last_report;

static GLFWwindowposfun g_cb_pos;
static GLFWwindowclosefun g_cb_close;
static GLFWwindowfocusfun g_cb_focus;
static GLFWwindowiconifyfun g_cb_iconify;

/* Lifecycle changes from the Android UI thread, delivered on the game thread at the next poll. -1 = none. */
static atomic_int g_pending_focus = -1;
static atomic_int g_pending_iconify = -1;
static atomic_bool g_pending_size = false;

static long thread_id(void) {
    return (long) syscall(SYS_gettid);
}

/* Native of the stub org.lwjgl.glfw.GLFW.glfwSetWindowAttrib(), called by pojavexec on lifecycle changes. */
static void JNICALL nDbrWindowAttrib(JNIEnv* env, jclass clazz, jint attrib, jint value) {
    (void) env;
    (void) clazz;
    DBG("Android lifecycle: %s = %d", attrib == GLFW_FOCUSED ? "focused" : attrib == GLFW_ICONIFIED ? "iconified" : "other attrib", value);
    if (attrib == GLFW_FOCUSED) atomic_store(&g_pending_focus, value);
    else if (attrib == GLFW_ICONIFIED) atomic_store(&g_pending_iconify, value);
}

API jint JNI_OnLoad(JavaVM* vm, void* reserved) {
    (void) reserved;
    g_vm = vm;
    DBG("JNI_OnLoad (game JVM) on thread %ld", thread_id());
    JNIEnv* env = NULL;
    if ((*vm)->GetEnv(vm, (void**) &env, JNI_VERSION_1_4) != JNI_OK || env == NULL) {
        DBG("WARNING: no JNIEnv in JNI_OnLoad");
        return JNI_VERSION_1_4;
    }

    jclass glfw = (*env)->FindClass(env, "org/lwjgl/glfw/GLFW");
    if (glfw != NULL) {
        JNINativeMethod methods[] = {{"nDbrWindowAttrib", "(II)V", (void*) nDbrWindowAttrib}};
        if ((*env)->RegisterNatives(env, glfw, methods, 1) != 0) DBG("WARNING: could not register the window attrib native");
        else DBG("window attrib native registered on org.lwjgl.glfw.GLFW");
    } else {
        DBG("WARNING: stub class org.lwjgl.glfw.GLFW not found; Android focus changes will not reach LWJGL 2");
    }
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);

    jclass system = (*env)->FindClass(env, "java/lang/System");
    jmethodID getProperty = system ? (*env)->GetStaticMethodID(env, system, "getProperty", "(Ljava/lang/String;)Ljava/lang/String;") : NULL;
    if (getProperty != NULL) {
        jstring key = (*env)->NewStringUTF(env, "org.lwjgl.opengl.libname");
        jstring value = (jstring) (*env)->CallStaticObjectMethod(env, system, getProperty, key);
        if (value != NULL) {
            const char* chars = (*env)->GetStringUTFChars(env, value, NULL);
            g_gl_libname = strdup(chars);
            (*env)->ReleaseStringUTFChars(env, value, chars);
        }
    }
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    DBG("GL library (org.lwjgl.opengl.libname): %s", g_gl_libname ? g_gl_libname : "(not set)");
    DBG("pojavexec state: runtime JVM %s, input stack queue %d, Android surface %p",
        pojav_environ->runtimeJavaVMPtr ? "registered" : "NOT registered", pojav_environ->isUseStackQueueCall,
        (void*) pojav_environ->pojavWindow);
    return JNI_VERSION_1_4;
}

static void update_video_mode(void) {
    int width = pojav_environ->savedWidth;
    int height = pojav_environ->savedHeight;
    g_mode.width = width > 0 ? width : 1280;
    g_mode.height = height > 0 ? height : 720;
    g_mode.redBits = g_mode.greenBits = g_mode.blueBits = 8;
    g_mode.refreshRate = 60;
}

static void set_grabbing(bool grab) {
    DBG("mouse %s", grab ? "grabbed (camera mode)" : "released (menu mode)");
    pojav_environ->isGrabbing = grab;
    JavaVM* dvm = pojav_environ->dalvikJavaVMPtr;
    if (dvm == NULL || pojav_environ->bridgeClazz == NULL || pojav_environ->method_onGrabStateChanged == NULL) {
        DBG("WARNING: cannot tell the Android UI about the grab state");
        return;
    }
    JNIEnv* dalvikEnv = NULL;
    if ((*dvm)->AttachCurrentThread(dvm, &dalvikEnv, NULL) != JNI_OK || dalvikEnv == NULL) {
        DBG("WARNING: could not attach to the Android VM for the grab state");
        return;
    }
    (*dalvikEnv)->CallStaticVoidMethod(dalvikEnv, pojav_environ->bridgeClazz, pojav_environ->method_onGrabStateChanged, (jboolean) grab);
    if ((*dalvikEnv)->ExceptionCheck(dalvikEnv)) {
        DBG("WARNING: onGrabStateChanged threw");
        (*dalvikEnv)->ExceptionClear(dalvikEnv);
    }
    (*dvm)->DetachCurrentThread(dvm);
}

/* ---- init / time / errors ---- */

API int glfwInit(void) {
    if (g_initialized) return GLFW_TRUE;
    clock_gettime(CLOCK_MONOTONIC, &g_start);
    const char* renderer = getenv("POJAV_RENDERER");
    DBG("glfwInit on thread %ld, POJAV_RENDERER=%s, Android surface %p", thread_id(), renderer ? renderer : "(unset)",
        (void*) pojav_environ->pojavWindow);
    if (pojav_environ->pojavWindow == NULL) DBG("WARNING: no Android surface yet (pojavWindow is NULL)");
    pojavInit();
    pojav_environ->isUseStackQueueCall = true;
    update_video_mode();
    g_initialized = true;
    DBG("initialized: surface %dx%d, renderer config %d, input stack queue forced on, eglGetProcAddress %s",
        pojav_environ->savedWidth, pojav_environ->savedHeight, pojav_environ->config_renderer,
        eglGetProcAddress_p ? "available" : "NOT available");
    return GLFW_TRUE;
}

API void glfwGetVersion(int* major, int* minor, int* rev) {
    if (major) *major = 3;
    if (minor) *minor = 3;
    if (rev) *rev = 8;
}

API int glfwGetError(const char** description) {
    if (description) *description = NULL;
    return 0;
}

API double glfwGetTime(void) {
    struct timespec now;
    clock_gettime(CLOCK_MONOTONIC, &now);
    return (double) (now.tv_sec - g_start.tv_sec) + (double) (now.tv_nsec - g_start.tv_nsec) / 1e9;
}

/* ---- monitors ---- */

API void* glfwGetPrimaryMonitor(void) {
    return &g_monitor;
}

API const GLFWvidmode* glfwGetVideoMode(void* monitor) {
    (void) monitor;
    update_video_mode();
    DBG("glfwGetVideoMode -> %dx%d", g_mode.width, g_mode.height);
    return &g_mode;
}

API const GLFWvidmode* glfwGetVideoModes(void* monitor, int* count) {
    (void) monitor;
    update_video_mode();
    if (count) *count = 1;
    return &g_mode;
}

/* ---- windows and contexts ---- */

API void glfwDefaultWindowHints(void) {
}

API void glfwWindowHint(int hint, int value) {
    if (hint != GLFW_CLIENT_API) return;
    /* pojavSetWindowHint aborts on APIs it does not know; everything here is desktop GL over the bridge. */
    pojavSetWindowHint(GLFW_CLIENT_API, value == GLFW_NO_API ? GLFW_NO_API : GLFW_OPENGL_API);
}

API void* glfwCreateWindow(int width, int height, const char* title, void* monitor, void* share) {
    (void) monitor;
    pojavSetWindowHint(GLFW_CLIENT_API, GLFW_OPENGL_API);
    void* window = pojavCreateContext(share);
    DBG("glfwCreateWindow(%dx%d, \"%s\", share=%p) -> context %p on thread %ld", width, height, title ? title : "",
        share, window, thread_id());
    if (window == NULL) DBG("ERROR: pojavCreateContext returned NULL");
    return window;
}

API void glfwDestroyWindow(void* window) {
    DBG("glfwDestroyWindow(%p)%s", window, (void*) pojav_environ->showingWindow == window ? " (the visible window)" : "");
    if (g_current == window) g_current = NULL;
    if ((void*) pojav_environ->showingWindow == window) pojav_environ->showingWindow = 0;
}

API void glfwMakeContextCurrent(void* window) {
    if (g_current != window) DBG("glfwMakeContextCurrent(%p) on thread %ld", window, thread_id());
    pojavMakeCurrent(window);
    g_current = window;
}

API void* glfwGetCurrentContext(void) {
    return g_current;
}

API void glfwSwapBuffers(void* window) {
    (void) window;
    if (g_swaps++ == 0) DBG("first glfwSwapBuffers on thread %ld", thread_id());
    pojavSwapBuffers();
}

API void glfwSwapInterval(int interval) {
    DBG("glfwSwapInterval(%d)", interval);
    pojavSwapInterval(interval);
}

API GLFWglproc glfwGetProcAddress(const char* name) {
    if (!g_gl_handle_tried) {
        g_gl_handle_tried = true;
        if (g_gl_libname != NULL) {
            g_gl_handle = dlopen(g_gl_libname, RTLD_NOW | RTLD_NOLOAD);
            if (g_gl_handle == NULL) g_gl_handle = dlopen(g_gl_libname, RTLD_NOW);
        }
        DBG("GL library handle for %s: %p%s", g_gl_libname ? g_gl_libname : "(none)", g_gl_handle,
            g_gl_handle ? "" : " (falling back to eglGetProcAddress and the global namespace)");
    }
    void* symbol = g_gl_handle ? dlsym(g_gl_handle, name) : NULL;
    if (symbol == NULL && eglGetProcAddress_p != NULL) symbol = eglGetProcAddress_p(name);
    if (symbol == NULL) symbol = dlsym(RTLD_DEFAULT, name);
    g_proc_lookups++;
    if (symbol == NULL && ++g_proc_misses <= 40) DBG("GL function not found: %s", name);
    return (GLFWglproc) symbol;
}

API void glfwShowWindow(void* window) {
    DBG("glfwShowWindow(%p): this is the visible window", window);
    pojav_environ->showingWindow = (long) window;
    g_initial_events_sent = false;
}

API void glfwHideWindow(void* window) {
    DBG("glfwHideWindow(%p)", window);
}

API void glfwSetWindowTitle(void* window, const char* title) {
    (void) window;
    DBG("window title: %s", title ? title : "");
}

API void glfwSetWindowShouldClose(void* window, int value) {
    (void) window;
    (void) value;
}

API int glfwGetWindowAttrib(void* window, int attrib) {
    (void) window;
    switch (attrib) {
        case GLFW_FOCUSED:
        case GLFW_VISIBLE:
        case GLFW_HOVERED:
            return GLFW_TRUE;
        case GLFW_CONTEXT_VERSION_MAJOR:
        case GLFW_CONTEXT_VERSION_MINOR:
            return 3;
        default:
            return GLFW_FALSE;
    }
}

API void glfwSetWindowAttrib(void* window, int attrib, int value) {
    (void) window;
    (void) attrib;
    (void) value;
}

API void glfwSetWindowMonitor(void* window, void* monitor, int x, int y, int width, int height, int refreshRate) {
    (void) window;
    (void) x;
    (void) y;
    (void) refreshRate;
    DBG("glfwSetWindowMonitor(%s, %dx%d): ignored, the window is always the whole surface", monitor ? "fullscreen" : "windowed",
        width, height);
    atomic_store(&g_pending_size, true);
}

/* ---- input ---- */

API void glfwSetInputMode(void* window, int mode, int value) {
    (void) window;
    if (mode != GLFW_CURSOR) return;
    bool grab = value == GLFW_CURSOR_DISABLED;
    if (grab == g_grabbed) return;
    g_grabbed = grab;
    if (!grab) g_offset_x = g_offset_y = 0;
    set_grabbing(grab);
}

API void glfwGetCursorPos(void* window, double* xpos, double* ypos) {
    (void) window;
    if (xpos) *xpos = pojav_environ->cursorX - g_offset_x;
    if (ypos) *ypos = pojav_environ->cursorY - g_offset_y;
}

API void glfwSetCursorPos(void* window, double xpos, double ypos) {
    (void) window;
    g_offset_x = pojav_environ->cursorX - xpos;
    g_offset_y = pojav_environ->cursorY - ypos;
}

#define SET_BRIDGE_CALLBACK(NAME, TYPE) \
API TYPE glfwSet##NAME##Callback(void* window, TYPE callback) { \
    (void) window; \
    TYPE previous = (TYPE) pojav_environ->GLFW_invoke_##NAME; \
    if ((void*) previous != (void*) callback) DBG("%s callback %s", #NAME, callback ? "set" : "cleared"); \
    pojav_environ->GLFW_invoke_##NAME = (GLFW_invoke_##NAME##_func*) callback; \
    return previous; \
}

SET_BRIDGE_CALLBACK(Key, GLFWkeyfun)
SET_BRIDGE_CALLBACK(Char, GLFWcharfun)
SET_BRIDGE_CALLBACK(MouseButton, GLFWmousebuttonfun)
SET_BRIDGE_CALLBACK(CursorPos, GLFWcursorposfun)
SET_BRIDGE_CALLBACK(CursorEnter, GLFWcursorenterfun)
SET_BRIDGE_CALLBACK(Scroll, GLFWscrollfun)
SET_BRIDGE_CALLBACK(WindowSize, GLFWwindowsizefun)

#undef SET_BRIDGE_CALLBACK

#define SET_LOCAL_CALLBACK(NAME, TYPE, FIELD) \
API TYPE glfwSet##NAME##Callback(void* window, TYPE callback) { \
    (void) window; \
    TYPE previous = FIELD; \
    if ((void*) previous != (void*) callback) DBG("%s callback %s", #NAME, callback ? "set" : "cleared"); \
    FIELD = callback; \
    return previous; \
}

SET_LOCAL_CALLBACK(WindowPos, GLFWwindowposfun, g_cb_pos)
SET_LOCAL_CALLBACK(WindowClose, GLFWwindowclosefun, g_cb_close)
SET_LOCAL_CALLBACK(WindowFocus, GLFWwindowfocusfun, g_cb_focus)
SET_LOCAL_CALLBACK(WindowIconify, GLFWwindowiconifyfun, g_cb_iconify)

#undef SET_LOCAL_CALLBACK

static void send_window_size(void* window) {
    GLFWwindowsizefun size = (GLFWwindowsizefun) pojav_environ->GLFW_invoke_WindowSize;
    update_video_mode();
    if (size) size(window, g_mode.width, g_mode.height);
}

API void glfwPollEvents(void) {
    void* window = (void*) pojav_environ->showingWindow;
    if (window == NULL) return;
    if (g_polls++ == 0) DBG("first glfwPollEvents on thread %ld", thread_id());
    if (!pojav_environ->isInputReady) pojav_environ->isInputReady = true;
    /* UI elements may redraw (and poll) while an event is being handled; never pump re-entrantly. */
    if (g_pumping) return;
    g_pumping = true;

    if (!g_initial_events_sent && pojav_environ->GLFW_invoke_WindowSize != NULL) {
        g_initial_events_sent = true;
        update_video_mode();
        DBG("initial events: size %dx%d, focused, visible, cursor inside", g_mode.width, g_mode.height);
        send_window_size(window);
        if (g_cb_focus) g_cb_focus(window, GLFW_TRUE);
        if (g_cb_iconify) g_cb_iconify(window, GLFW_FALSE);
        GLFWcursorenterfun enter = (GLFWcursorenterfun) pojav_environ->GLFW_invoke_CursorEnter;
        if (enter) enter(window, GLFW_TRUE);
    }
    if (atomic_exchange(&g_pending_size, false)) {
        update_video_mode();
        DBG("re-sending window size %dx%d", g_mode.width, g_mode.height);
        send_window_size(window);
    }
    int focus = atomic_exchange(&g_pending_focus, -1);
    if (focus != -1 && g_cb_focus) g_cb_focus(window, focus);
    int iconify = atomic_exchange(&g_pending_iconify, -1);
    if (iconify != -1 && g_cb_iconify) g_cb_iconify(window, iconify);

    size_t queued = atomic_load(&pojav_environ->eventCounter);
    pojavStartPumping();
    pojavPumpEvents(window);
    pojavStopPumping();
    g_pumping = false;

    double now = glfwGetTime();
    if (now - g_last_report >= 30.0) {
        g_last_report = now;
        DBG("status: %lu polls, %lu swaps, %zu events queued, size %dx%d, grabbed=%d, cursor=(%.0f,%.0f) offset=(%.0f,%.0f), GL lookups %lu (%lu missing)",
            g_polls, g_swaps, queued, pojav_environ->savedWidth, pojav_environ->savedHeight, g_grabbed,
            pojav_environ->cursorX, pojav_environ->cursorY, g_offset_x, g_offset_y, g_proc_lookups, g_proc_misses);
    }
}
