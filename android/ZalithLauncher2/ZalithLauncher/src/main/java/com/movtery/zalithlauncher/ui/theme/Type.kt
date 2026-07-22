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

package com.movtery.zalithlauncher.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import com.movtery.zalithlauncher.R

/**
 * DBR: fuente pixel (Pixelify Sans) para dar identidad estilo Minecraft/desktop.
 * Se usa en títulos, encabezados y etiquetas/botones; el cuerpo se deja en la
 * fuente legible del sistema para no perder legibilidad en pantallas densas.
 */
val PixelFontFamily = FontFamily(Font(R.font.pixelify_sans))

private val base = Typography()

val AppTypography = base.copy(
    displayLarge = base.displayLarge.copy(fontFamily = PixelFontFamily),
    displayMedium = base.displayMedium.copy(fontFamily = PixelFontFamily),
    displaySmall = base.displaySmall.copy(fontFamily = PixelFontFamily),
    headlineLarge = base.headlineLarge.copy(fontFamily = PixelFontFamily),
    headlineMedium = base.headlineMedium.copy(fontFamily = PixelFontFamily),
    headlineSmall = base.headlineSmall.copy(fontFamily = PixelFontFamily),
    titleLarge = base.titleLarge.copy(fontFamily = PixelFontFamily),
    titleMedium = base.titleMedium.copy(fontFamily = PixelFontFamily),
    titleSmall = base.titleSmall.copy(fontFamily = PixelFontFamily),
    labelLarge = base.labelLarge.copy(fontFamily = PixelFontFamily),
    labelMedium = base.labelMedium.copy(fontFamily = PixelFontFamily),
    labelSmall = base.labelSmall.copy(fontFamily = PixelFontFamily)
    // body* se mantienen en la fuente por defecto (legible).
)
