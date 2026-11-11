package com.movtery.layer_controller.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * DBR: game states reported by DbrCore through the mobile channel (ESTADO message). A button or
 * layer can be shown only while one of them is active ([NormalData.dbrShowIf]) or hidden while
 * one is active ([NormalData.dbrHideIf]). [bit] is the position in the ESTADO bit mask; append
 * only, never reorder.
 */
@Serializable
enum class EstadoDbr(val bit: Int) {
    /** Holding the DBC charge ki key. */
    @SerialName("charging_ki")
    CARGANDO_KI(0),

    /** Holding the DBC transform key. */
    @SerialName("transforming")
    TRANSFORMANDO(1),

    /** Chat open. */
    @SerialName("chat")
    CHAT(2),

    /** Inventory, chest or any container open. */
    @SerialName("container")
    CONTENEDOR(3),

    /** A Dbr mod screen (core.ui) open. */
    @SerialName("dbr_screen")
    PANTALLA_DBR(4),

    /** Pause menu or any other screen open. */
    @SerialName("other_screen")
    OTRA_PANTALLA(5),

    /** Lock-on active (DBC or DbrKiMod). */
    @SerialName("lock_on")
    FIJANDO(6);

    companion object {
        /** Decodes the ESTADO bit mask; unknown bits are ignored. */
        fun desdeBits(bits: Int): Set<EstadoDbr> = entries.filterTo(LinkedHashSet()) { bits and (1 shl it.bit) != 0 }
    }
}

/**
 * True when the DBR conditions allow showing. [estado] null = DbrCore is not connected (PC, old
 * DbrCore): the conditions are ignored so a layout with conditions never strands a button.
 */
fun condicionesDbr(estado: Set<EstadoDbr>?, mostrarSi: Set<EstadoDbr>, ocultarSi: Set<EstadoDbr>): Boolean {
    if (estado == null) return true
    if (ocultarSi.any { it in estado }) return false
    if (mostrarSi.isNotEmpty() && mostrarSi.none { it in estado }) return false
    return true
}
