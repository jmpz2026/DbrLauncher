/*
 * DBR: mobile channel between the game JVM and the Android launcher. See dbr_canal.h.
 *
 * libpojavexec.so is loaded once per process, by the Android VM and then by the game JVM, so the
 * statics below are shared by both sides.
 */
#include <jni.h>
#include <pthread.h>
#include <string.h>

#include "dbr_canal.h"
#include "environ/environ.h"
#include "logger/logger.h"

typedef struct {
    int type;
    int length;
    uint8_t data[DBR_CANAL_MAX_PAYLOAD];
} dbr_msg_t;

static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static dbr_msg_t g_queue[DBR_CANAL_QUEUE_SLOTS];
static int g_head; /* next slot to read */
static int g_count;

static jmethodID g_on_message; /* CallbackBridge.onDbrMessage(int, byte[]), looked up once */
static int g_lookup_failed;

static int valid_type(int type) {
    return type > 0 && type < 256;
}

void dbr_canal_to_android(int type, const uint8_t* payload, int length) {
    if (!valid_type(type) || length < 0 || length > DBR_CANAL_MAX_PAYLOAD) return;
    JavaVM* dvm = pojav_environ->dalvikJavaVMPtr;
    if (dvm == NULL || pojav_environ->bridgeClazz == NULL || g_lookup_failed) return;

    JNIEnv* env = NULL;
    int attached = 0;
    if ((*dvm)->GetEnv(dvm, (void**) &env, JNI_VERSION_1_4) != JNI_OK) {
        if ((*dvm)->AttachCurrentThread(dvm, &env, NULL) != JNI_OK || env == NULL) return;
        attached = 1;
    }

    if (g_on_message == NULL) {
        g_on_message = (*env)->GetStaticMethodID(env, pojav_environ->bridgeClazz, "onDbrMessage", "(I[B)V");
        if (g_on_message == NULL) {
            (*env)->ExceptionClear(env);
            g_lookup_failed = 1;
            LOG_TO_E("DBR-CANAL: CallbackBridge.onDbrMessage not found, channel disabled");
            if (attached) (*dvm)->DetachCurrentThread(dvm);
            return;
        }
    }

    jbyteArray array = (*env)->NewByteArray(env, length);
    if (array != NULL) {
        if (length > 0) (*env)->SetByteArrayRegion(env, array, 0, length, (const jbyte*) payload);
        (*env)->CallStaticVoidMethod(env, pojav_environ->bridgeClazz, g_on_message, (jint) type, array);
        (*env)->DeleteLocalRef(env, array);
    }
    if ((*env)->ExceptionCheck(env)) (*env)->ExceptionClear(env);
    if (attached) (*dvm)->DetachCurrentThread(dvm);
}

int dbr_canal_pop(int* type, uint8_t* out) {
    int length = -1;
    pthread_mutex_lock(&g_lock);
    if (g_count > 0) {
        dbr_msg_t* msg = &g_queue[g_head];
        *type = msg->type;
        length = msg->length;
        memcpy(out, msg->data, (size_t) length);
        g_head = (g_head + 1) % DBR_CANAL_QUEUE_SLOTS;
        g_count--;
    }
    pthread_mutex_unlock(&g_lock);
    return length;
}

/* Launcher -> game: called by CallbackBridge.nativeDbrPush on the Android side. */
JNIEXPORT void JNICALL
Java_org_lwjgl_glfw_CallbackBridge_nativeDbrPush(JNIEnv* env, jclass clazz, jint type, jbyteArray data) {
    (void) clazz;
    if (!valid_type(type) || data == NULL) return;
    jsize length = (*env)->GetArrayLength(env, data);
    if (length < 0 || length > DBR_CANAL_MAX_PAYLOAD) return; /* checked before any copy */

    pthread_mutex_lock(&g_lock);
    if (g_count == DBR_CANAL_QUEUE_SLOTS) { /* full: drop the oldest */
        g_head = (g_head + 1) % DBR_CANAL_QUEUE_SLOTS;
        g_count--;
    }
    dbr_msg_t* msg = &g_queue[(g_head + g_count) % DBR_CANAL_QUEUE_SLOTS];
    msg->type = type;
    msg->length = length;
    if (length > 0) (*env)->GetByteArrayRegion(env, data, 0, length, (jbyte*) msg->data);
    if ((*env)->ExceptionCheck(env)) {
        (*env)->ExceptionClear(env);
    } else {
        g_count++;
    }
    pthread_mutex_unlock(&g_lock);
}
