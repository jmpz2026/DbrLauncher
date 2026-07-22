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
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.movtery.zalithlauncher.R

/**
 * DBR: fuente pixel (Pixelify Sans) para identidad estilo Minecraft/desktop.
 * Se usa una instancia ESTÁTICA (Regular). Las variable fonts hacían "instancing"
 * por cada peso distinto → causaba ~2s de lag al componer pantallas con mucho texto
 * (ej. Ajustes). Además se fuerza FontWeight.Normal para evitar bold sintético.
 * El cuerpo se deja en la fuente legible del sistema.
 */
val PixelFontFamily = FontFamily(Font(R.font.pixelify_sans, FontWeight.Normal))

private fun TextStyle.pixel(): TextStyle =
    copy(fontFamily = PixelFontFamily, fontWeight = FontWeight.Normal)

private val base = Typography()

val AppTypography = base.copy(
    displayLarge = base.displayLarge.pixel(),
    displayMedium = base.displayMedium.pixel(),
    displaySmall = base.displaySmall.pixel(),
    headlineLarge = base.headlineLarge.pixel(),
    headlineMedium = base.headlineMedium.pixel(),
    headlineSmall = base.headlineSmall.pixel(),
    titleLarge = base.titleLarge.pixel(),
    titleMedium = base.titleMedium.pixel(),
    titleSmall = base.titleSmall.pixel(),
    labelLarge = base.labelLarge.pixel(),
    labelMedium = base.labelMedium.pixel(),
    labelSmall = base.labelSmall.pixel()
    // body* se mantienen en la fuente por defecto (legible).
)
