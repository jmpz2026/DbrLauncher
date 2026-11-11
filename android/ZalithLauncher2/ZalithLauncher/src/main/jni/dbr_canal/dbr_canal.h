/*
 * DBR: mobile channel between the game JVM and the Android launcher (see docs/canal-movil.md).
 *
 * Both directions carry (type, bytes). This layer only moves bounded byte arrays: it never
 * interprets a payload. Validation of each type lives in the launcher (CanalMovil.kt) and in
 * DbrCore (core.movil).
 */
#ifndef DBR_CANAL_H
#define DBR_CANAL_H

#include <stdint.h>

/* Largest payload either side may send. Anything bigger is dropped before any copy. */
#define DBR_CANAL_MAX_PAYLOAD 1024
/* Launcher -> game queue depth. When full, the oldest message is dropped. */
#define DBR_CANAL_QUEUE_SLOTS 32

/* Game -> launcher: forwards one message to CallbackBridge.onDbrMessage(int, byte[]). */
void dbr_canal_to_android(int type, const uint8_t* payload, int length);

/*
 * Launcher -> game: pops the oldest queued message.
 * Returns the payload length (0..DBR_CANAL_MAX_PAYLOAD) and writes the type, or -1 when empty.
 * out must hold DBR_CANAL_MAX_PAYLOAD bytes.
 */
int dbr_canal_pop(int* type, uint8_t* out);

#endif
