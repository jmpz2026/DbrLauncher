/*
 * Zalith Launcher 2
 * Copyright (C) 2025 MovTery <movtery228@qq.com> and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/gpl-3.0.txt>.
 */

package com.movtery.zalithlauncher.game.control

import com.movtery.zalithlauncher.game.input.EfficientAndroidLWJGLKeycode
import com.movtery.zalithlauncher.game.keycodes.ControlEventKeycode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import java.security.MessageDigest
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * DBR: convierte un layout de PojavLauncher / Amethyst (versiones 3-8, teclas GLFW) o de
 * MojoLauncher (versión 9, keycodes de Android) al formato de ZalithLauncher2, para que
 * el botón Importar los acepte. Es el puerto de android/tools/pojav-layout-to-zl2.py.
 *
 * Los botones normales van a la capa "botones" (WASD a "movimiento", que se oculta con el
 * joystick), el botón GUI a la capa "gui" y cada drawer a una capa oculta que su botón
 * abre y cierra. Los joysticks de Pojav no se convierten: ZL2 tiene el suyo propio.
 */
object PojavLayoutConverter {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    private const val MARGIN = 2.0
    private const val MIN_VERSION = 3
    private const val MAX_VERSION = 9
    /** Desde la v9 (MojoLauncher) los keycodes son de Android; antes, GLFW. */
    private const val ANDROID_KEYCODES_SINCE = 9

    private const val SPECIAL_KEYBOARD = -1
    private const val SPECIAL_TOGGLE_GUI = -2
    private const val SPECIAL_MOUSE_PRI = -3
    private const val SPECIAL_MOUSE_SEC = -4
    private const val SPECIAL_VIRTUAL_MOUSE = -5
    private const val SPECIAL_MOUSE_MID = -6
    private const val SPECIAL_SCROLL_UP = -7
    private const val SPECIAL_SCROLL_DOWN = -8
    private const val SPECIAL_MENU = -9

    /** Keycodes Android de W, A, S, D. */
    private val ANDROID_WASD = setOf(51, 29, 47, 32)
    /** Keycodes GLFW de W, A, S, D. */
    private val GLFW_WASD = setOf(87, 65, 83, 68)

    /** Nombre de evento ("GLFW_KEY_A") por keycode GLFW. */
    private val glfwNames: Map<Int, String> by lazy {
        ControlEventKeycode::class.java.declaredFields
            .filter { it.type == String::class.java && java.lang.reflect.Modifier.isStatic(it.modifiers) }
            .mapNotNull { field ->
                val name = field.get(null) as? String ?: return@mapNotNull null
                if (!name.startsWith("GLFW_KEY_") || name == ControlEventKeycode.GLFW_KEY_UNKNOWN) return@mapNotNull null
                ControlEventKeycode.getKeycodeFromEvent(name)?.let { it.toInt() to name }
            }
            .toMap()
    }

    /** ¿Es un layout de Pojav/Mojo (y no uno de ZL2)? */
    fun isPojavLayout(jsonString: String): Boolean = runCatching {
        val obj = json.parseToJsonElement(jsonString).jsonObject
        "mControlDataList" in obj && "editorVersion" !in obj
    }.getOrDefault(false)

    /**
     * @param layoutName nombre que se mostrará en la lista de controles
     * @param screenWidthDp ancho de la pantalla de referencia en dp (horizontal)
     * @param screenHeightDp alto de la pantalla de referencia en dp (horizontal)
     * @return el layout en formato ZL2 (editorVersion 11), listo para `loadLayoutFromString`
     */
    fun convert(
        jsonString: String,
        layoutName: String,
        screenWidthDp: Double,
        screenHeightDp: Double
    ): String {
        val src = json.parseToJsonElement(jsonString).jsonObject
        val version = src["version"]?.jsonPrimitive?.intOrNull
            ?: throw IllegalArgumentException("Layout de Pojav demasiado viejo (sin versión): ábrelo y guárdalo en un launcher actual")
        require(version in MIN_VERSION..MAX_VERSION) { "Versión de layout de Pojav no soportada: $version" }
        val androidKeycodes = version >= ANDROID_KEYCODES_SINCE
        val scale = src["scaledAt"]?.jsonPrimitive?.doubleOrNull ?: 100.0

        val ctx = Session(screenWidthDp, screenHeightDp, scale, androidKeycodes)
        val layerGui = uid("layer", "gui")
        val layerMain = uid("layer", "main")
        val layerMove = uid("layer", "move")
        val buttons = mutableMapOf<String, MutableList<JsonObject>>(
            layerGui to mutableListOf(), layerMain to mutableListOf(), layerMove to mutableListOf()
        )
        val drawerLayers = mutableListOf<JsonObject>()

        src["mControlDataList"]?.jsonArray?.forEachIndexed { i, el ->
            val c = el.jsonObject
            val pos = ctx.position(c)
            val built = ctx.button(c, "btn|$i", pos, layerMain, layerMove)
            val target = when {
                built.togglesGui -> layerGui
                built.isMovement -> layerMove
                else -> layerMain
            }
            buttons.getValue(target).add(built.json)
        }

        src["mDrawerDataList"]?.jsonArray?.forEachIndexed { d, el ->
            val drawer = el.jsonObject
            val props = drawer["properties"]?.jsonObject ?: return@forEachIndexed
            val drawerLayer = uid("layer", "drawer", d)
            val drawerPos = ctx.position(props)
            val drawerButton = ctx.button(props, "drawer|$d", drawerPos, layerMain, layerMove, extraEvents = listOf(
                event("switch_layer", drawerLayer)
            ))
            buttons.getValue(layerMain).add(drawerButton.json)

            val orientation = drawer["orientation"]?.jsonPrimitive?.contentOrNull ?: "FREE"
            val children = drawer["buttonProperties"]?.jsonArray?.mapIndexed { i, childEl ->
                val child = childEl.jsonObject
                val pos = if (orientation == "FREE") ctx.position(child) else {
                    val step = i + 1
                    when (orientation) {
                        "RIGHT" -> drawerPos.copy(x = drawerPos.x + drawerPos.w * step)
                        "LEFT" -> drawerPos.copy(x = drawerPos.x - drawerPos.w * step)
                        "UP" -> drawerPos.copy(y = drawerPos.y - drawerPos.h * step)
                        else -> drawerPos.copy(y = drawerPos.y + drawerPos.h * step)
                    }
                }
                ctx.button(child, "drawer|$d|$i", pos, layerMain, layerMove).json
            }.orEmpty()
            val name = props["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty().ifEmpty { "drawer ${d + 1}" }
            drawerLayers.add(layer(name, drawerLayer, children, hide = true))
        }

        val out = buildJsonObject {
            put("info", buildJsonObject {
                put("name", text(layoutName))
                put("author", text(""))
                put("description", text("Importado desde PojavLauncher (v$version)"))
                put("versionCode", 1)
                put("versionName", "1.0")
            })
            put("layers", buildJsonArray {
                add(layer("gui", layerGui, buttons.getValue(layerGui)))
                add(layer("botones", layerMain, buttons.getValue(layerMain)))
                add(layer("movimiento", layerMove, buttons.getValue(layerMove), hideWhenJoystick = true))
                drawerLayers.forEach { add(it) }
            })
            put("styles", JsonArray(ctx.styles))
            put("editorVersion", 11)
        }
        return out.toString()
    }

    private data class Pos(val x: Double, val y: Double, val w: Double, val h: Double)

    private class Built(val json: JsonObject, val togglesGui: Boolean, val isMovement: Boolean)

    private class Session(
        val screenW: Double,
        val screenH: Double,
        val scale: Double,
        val androidKeycodes: Boolean
    ) {
        val styles = mutableListOf<JsonObject>()
        private val styleByAlpha = mutableMapOf<Double, String>()

        fun position(c: JsonObject): Pos {
            val w = c.double("width", 50.0)
            val h = c.double("height", 50.0)
            val vars = mapOf(
                "top" to 0.0, "left" to 0.0,
                "screen_width" to screenW, "screen_height" to screenH,
                "width" to w, "height" to h, "margin" to MARGIN,
                "right" to screenW - w, "bottom" to screenH - h,
                "preferred_scale" to scale
            )
            val x = c["dynamicX"]?.jsonPrimitive?.contentOrNull?.let { Expression.eval(it, vars) } ?: c.double("x", 0.0)
            val y = c["dynamicY"]?.jsonPrimitive?.contentOrNull?.let { Expression.eval(it, vars) } ?: c.double("y", 0.0)
            return Pos(x, y, w, h)
        }

        fun button(
            c: JsonObject,
            id: String,
            pos: Pos,
            layerMain: String,
            layerMove: String,
            extraEvents: List<JsonObject> = emptyList()
        ): Built {
            var text = c["name"]?.jsonPrimitive?.contentOrNull?.trim().orEmpty()
            val codes = c["keycodes"]?.jsonArray?.mapNotNull { it.jsonPrimitive.intOrNull }?.filter { it != 0 }.orEmpty()
            val events = mutableListOf<JsonObject>()
            var togglesGui = false
            for (k in codes) {
                when (k) {
                    SPECIAL_KEYBOARD -> events += event("launcher_event", "launcher.event.switch_ime")
                    SPECIAL_TOGGLE_GUI -> {
                        togglesGui = true
                        events += event("switch_layer", layerMain)
                        events += event("switch_layer", layerMove)
                    }
                    SPECIAL_MOUSE_PRI -> events += event("launcher_event", "GLFW_MOUSE_BUTTON_LEFT")
                    SPECIAL_MOUSE_SEC -> events += event("launcher_event", "GLFW_MOUSE_BUTTON_RIGHT")
                    SPECIAL_MOUSE_MID -> events += event("launcher_event", "GLFW_MOUSE_BUTTON_MIDDLE")
                    SPECIAL_SCROLL_UP -> events += event("launcher_event", "launcher.event.scroll_up.single")
                    SPECIAL_SCROLL_DOWN -> events += event("launcher_event", "launcher.event.scroll_down.single")
                    // ZL2 no tiene ratón virtual aparte: su menú lo incluye
                    SPECIAL_VIRTUAL_MOUSE, SPECIAL_MENU -> {
                        events += event("launcher_event", "launcher.event.switch_menu")
                        if (text.isEmpty() || text.equals("mouse", true)) text = "Menú"
                    }
                    else -> if (k > 0) keyName(k)?.let { events += event("key", it) }
                }
            }
            events += extraEvents
            val wasd = if (androidKeycodes) ANDROID_WASD else GLFW_WASD
            val isMovement = !togglesGui && codes.isNotEmpty() && codes.all { it in wasd }

            val displayInGame = c.bool("displayInGame", true)
            val displayInMenu = c.bool("displayInMenu", true)
            val visibility = when {
                displayInGame && displayInMenu -> "always"
                displayInGame -> "in_game"
                displayInMenu -> "in_menu"
                else -> "always"
            }
            val px = ((pos.x / (screenW - pos.w)).coerceIn(0.0, 1.0) * 10000).roundToInt()
            val py = ((pos.y / (screenH - pos.h)).coerceIn(0.0, 1.0) * 10000).roundToInt()

            val btn = buildJsonObject {
                put("text", text(text))
                put("uuid", uid("btn", id, text))
                put("position", buildJsonObject { put("x", px); put("y", py) })
                put("buttonSize", buildJsonObject {
                    put("type", "percentage")
                    put("widthDp", round2(pos.w))
                    put("heightDp", round2(pos.h))
                    put("widthPercentage", percentOfHeight(pos.w))
                    put("heightPercentage", percentOfHeight(pos.h))
                    put("widthReference", "screen_height")
                    put("heightReference", "screen_height")
                })
                put("buttonStyle", style(c))
                put("textAlignment", "Center")
                put("visibilityType", visibility)
                put("clickEvents", JsonArray(events))
                put("isSwipple", c.bool("isSwipeable", false))
                put("isPenetrable", c.bool("passThruEnabled", false))
                put("isToggleable", c.bool("isToggle", false))
            }
            return Built(btn, togglesGui, isMovement)
        }

        private fun keyName(code: Int): String? {
            val glfw = if (androidKeycodes) {
                val index = EfficientAndroidLWJGLKeycode.getIndexByKey(code)
                if (index < 0) return null
                EfficientAndroidLWJGLKeycode.getValueByIndex(index).toInt()
            } else code
            return glfwNames[glfw]
        }

        private fun percentOfHeight(v: Double) = (v / screenH * 10000).roundToInt().coerceIn(100, 10000)

        /** Un estilo por opacidad: Pojav aplica la opacidad a todo el botón, texto incluido. */
        private fun style(c: JsonObject): String {
            val alpha = (c.double("opacity", 1.0) * 100).roundToLong() / 100.0
            styleByAlpha[alpha]?.let { return it }
            val bg = c.long("bgColor", 0x4D000000)
            val stroke = c.long("strokeColor", 0xFFFFFFFF)
            val strokeWidth = c.double("strokeWidth", 0.0).toInt()
            val shape = buildJsonObject {
                put("topStart", 0.0); put("topEnd", 0.0); put("bottomEnd", 0.0); put("bottomStart", 0.0)
            }
            val cfg = buildJsonObject {
                put("alpha", alpha)
                put("pressedAlpha", minOf(1.0, alpha + 0.3))
                put("backgroundColor", color(bg))
                put("pressedBackgroundColor", color(0x80000000L or (bg and 0xFFFFFF)))
                put("contentColor", color(0xFFFFFFFF))
                put("pressedContentColor", color(0xFFFFFFFF))
                put("borderWidth", strokeWidth)
                put("pressedBorderWidth", strokeWidth)
                put("borderColor", color(stroke))
                put("pressedBorderColor", color(stroke))
                put("borderRadius", shape)
                put("pressedBorderRadius", shape)
            }
            val id = uid("style", alpha)
            styles += buildJsonObject {
                put("name", "pojav ${(alpha * 100).roundToInt()}%")
                put("uuid", id)
                put("animateSwap", false)
                put("commonStyle", true)
                put("lightStyle", cfg)
                put("darkStyle", cfg)
            }
            styleByAlpha[alpha] = id
            return id
        }
    }

    private fun layer(
        name: String,
        uuid: String,
        buttons: List<JsonObject>,
        hide: Boolean = false,
        hideWhenJoystick: Boolean = false
    ) = buildJsonObject {
        put("name", name)
        put("uuid", uuid)
        put("hide", hide)
        put("hideWhenMouse", false)
        put("hideWhenGamepad", true)
        if (hideWhenJoystick) put("hideWhenJoystick", true)
        put("visibilityType", "always")
        put("normalButtons", JsonArray(buttons))
    }

    private fun event(type: String, key: String) = buildJsonObject { put("type", type); put("key", key) }

    private fun text(value: String) = buildJsonObject {
        put("default", value)
        put("matchQueue", JsonArray(emptyList()))
    }

    /** editorVersion 11: colores ARGB en los 32 bits bajos, sin signo. */
    private fun color(argb: Long) = argb and 0xFFFFFFFFL

    private fun round2(v: Double) = (v * 100).roundToLong() / 100.0

    private fun uid(vararg parts: Any): String {
        val digest = MessageDigest.getInstance("SHA-1").digest(parts.joinToString("|").toByteArray())
        return digest.joinToString("") { "%02x".format(it) }.take(12)
    }

    private fun JsonObject.double(key: String, default: Double) = this[key]?.jsonPrimitive?.doubleOrNull ?: default
    private fun JsonObject.long(key: String, default: Long) = this[key]?.jsonPrimitive?.longOrNull ?: default
    private fun JsonObject.bool(key: String, default: Boolean) = this[key]?.jsonPrimitive?.booleanOrNull ?: default

    /**
     * Las posiciones de Pojav son expresiones tipo "0.5 * ${screen_width} - ${width}".
     * Pojav trabaja en px y px() pasa de dp a px; aquí todo va en dp, así que px() no hace nada.
     */
    internal object Expression {
        fun eval(expr: String, vars: Map<String, Double>): Double {
            val replaced = Regex("""\$\{(\w+)\}""").replace(expr) { m ->
                val v = vars[m.groupValues[1]] ?: throw IllegalArgumentException("Variable desconocida: ${m.value}")
                "($v)"
            }.replace("px(", "(").replace("dp(", "(")
            return Parser(replaced).parse()
        }

        private class Parser(val s: String) {
            var i = 0

            fun parse(): Double {
                val v = sum()
                skip()
                require(i == s.length) { "Expresión inválida: $s" }
                return v
            }

            private fun skip() { while (i < s.length && s[i] == ' ') i++ }

            private fun sum(): Double {
                var v = product()
                while (true) {
                    skip()
                    when (s.getOrNull(i)) {
                        '+' -> { i++; v += product() }
                        '-' -> { i++; v -= product() }
                        else -> return v
                    }
                }
            }

            private fun product(): Double {
                var v = unary()
                while (true) {
                    skip()
                    when (s.getOrNull(i)) {
                        '*' -> { i++; v *= unary() }
                        '/' -> { i++; v /= unary() }
                        else -> return v
                    }
                }
            }

            private fun unary(): Double {
                skip()
                return when (s.getOrNull(i)) {
                    '-' -> { i++; -unary() }
                    '+' -> { i++; unary() }
                    '(' -> {
                        i++
                        val v = sum()
                        skip()
                        require(s.getOrNull(i) == ')') { "Falta ')' en: $s" }
                        i++
                        v
                    }
                    else -> number()
                }
            }

            private fun number(): Double {
                val start = i
                while (i < s.length && (s[i].isDigit() || s[i] == '.')) i++
                if (i < s.length && (s[i] == 'e' || s[i] == 'E')) {
                    i++
                    if (i < s.length && (s[i] == '+' || s[i] == '-')) i++
                    while (i < s.length && s[i].isDigit()) i++
                }
                require(i > start) { "Número esperado en la posición $start de: $s" }
                return s.substring(start, i).toDouble()
            }
        }
    }
}
