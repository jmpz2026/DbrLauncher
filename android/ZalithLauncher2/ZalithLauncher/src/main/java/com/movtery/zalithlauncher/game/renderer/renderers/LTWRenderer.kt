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

package com.movtery.zalithlauncher.game.renderer.renderers

import com.movtery.zalithlauncher.game.renderer.RendererInterface

/**
 * DBR: LTW (Large Thin Wrapper), OpenGL core sobre OpenGL ES 3. Es el renderizador con el que
 * funciona Angelica (modpack experimental). `libltw.so` sale sin modificar de
 * https://github.com/MojoLauncher/LTW (LGPL-3.0), ver android/third_party/LTW.
 * Misma configuración que el plugin LTW para Zalith; la librería exporta también su EGL.
 */
object LTWRenderer : RendererInterface {
    override fun getRendererId(): String = "opengles3_ltw"

    override fun getUniqueIdentifier(): String = "5f0e7c1a-3d2b-4c8e-9a41-6b7d2e8f1c30"

    override fun getRendererName(): String = "LTW (OpenGL ES 3)"

    override fun getRendererSummary(): String = "Necesario para el modpack experimental (Angelica)"

    override fun getRendererEnv(): Lazy<Map<String, String>> = lazy {
        mapOf(
            "LIBGL_ES" to "3",
            "LIBGL_NOERROR" to "1",
            "force_glsl_extensions_warn" to "true",
            "allow_higher_compat_version" to "true",
            "allow_glsl_extension_directive_midshader" to "true"
        )
    }

    override fun getDlopenLibrary(): Lazy<List<String>> = lazy { emptyList() }

    override fun getRendererLibrary(): String = "libltw.so"

    override fun getRendererEGL(): String = "libltw.so"
}
