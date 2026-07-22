/*
 * DbrLauncherMobile — componentes de UI estilo desktop (Minecraft/pixel).
 * Fondo de bloques deepslate, panel de piedra con bisel y botón oro (CTA).
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.ui.dbr

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageShader
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.ShaderBrush
import androidx.compose.ui.graphics.TileMode
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Paleta DBR (misma que el desktop).
val DbrGold = Color(0xFFFFCF4A)
val DbrGoldDeep = Color(0xFFE0951B)
val DbrStone = Color(0xFF2B2B2B)
val DbrInk = Color(0xFF2A1600)
val DbrCream = Color(0xFFE8E2D4)

private class Speck(val x: Int, val y: Int, val w: Int, val h: Int, val color: Long)

// Manchas del bloque deepslate en una celda de 16x16 (tomadas del SVG del desktop).
private val speckles = listOf(
    Speck(2, 1, 2, 2, 0xFF191512), Speck(5, 3, 2, 1, 0xFF3B352E), Speck(9, 2, 1, 2, 0xFF181410),
    Speck(12, 4, 2, 2, 0xFF1D1915), Speck(3, 6, 1, 2, 0xFF3B352E), Speck(7, 7, 2, 2, 0xFF181410),
    Speck(11, 8, 1, 1, 0xFF3B352E), Speck(14, 9, 2, 2, 0xFF191512), Speck(1, 10, 2, 1, 0xFF342E28),
    Speck(5, 11, 1, 2, 0xFF181410), Speck(9, 12, 2, 2, 0xFF342E28), Speck(13, 13, 2, 1, 0xFF191512),
    Speck(4, 14, 1, 1, 0xFF3B352E), Speck(15, 2, 1, 1, 0xFF342E28)
)

/**
 * Fondo de bloques deepslate pixelado, tileado.
 * El patrón se dibuja UNA vez en un [ImageBitmap] y se repite con un shader
 * (barato por frame), para no penalizar las transiciones entre pantallas.
 */
@Composable
fun BlockBackground(
    modifier: Modifier = Modifier,
    tileSize: Dp = 48.dp,
    baseColor: Color = Color(0xFF2B2723)
) {
    val density = LocalDensity.current
    val tilePx = with(density) { tileSize.roundToPx() }.coerceAtLeast(16)
    val tile = remember(tilePx, baseColor) {
        val bmp = ImageBitmap(tilePx, tilePx)
        val canvas = Canvas(bmp)
        val paint = Paint()
        val cell = tilePx / 16f
        paint.color = baseColor
        canvas.drawRect(0f, 0f, tilePx.toFloat(), tilePx.toFloat(), paint)
        for (s in speckles) {
            paint.color = Color(s.color)
            canvas.drawRect(s.x * cell, s.y * cell, (s.x + s.w) * cell, (s.y + s.h) * cell, paint)
        }
        bmp
    }
    val brush = remember(tile) {
        ShaderBrush(ImageShader(tile, TileMode.Repeated, TileMode.Repeated))
    }
    Box(modifier = modifier.background(brush))
}

/** Bisel pixelado: fondo + borde negro 2px + realce claro (arriba/izq) y sombra (abajo/der). */
fun Modifier.pixelBevel(
    background: Color,
    borderWidth: Dp = 2.dp,
    highlight: Color = Color.White.copy(alpha = 0.14f),
    shadow: Color = Color.Black.copy(alpha = 0.5f)
): Modifier = this
    .background(background)
    .drawBehind {
        val b = borderWidth.toPx()
        val w = size.width
        val h = size.height
        // borde negro
        drawRect(Color.Black, size = Size(w, b))
        drawRect(Color.Black, topLeft = Offset(0f, h - b), size = Size(w, b))
        drawRect(Color.Black, size = Size(b, h))
        drawRect(Color.Black, topLeft = Offset(w - b, 0f), size = Size(b, h))
        // realce interior (arriba/izquierda)
        drawRect(highlight, topLeft = Offset(b, b), size = Size(w - 2 * b, b))
        drawRect(highlight, topLeft = Offset(b, b), size = Size(b, h - 2 * b))
        // sombra interior (abajo/derecha)
        drawRect(shadow, topLeft = Offset(b, h - 2 * b), size = Size(w - 2 * b, b))
        drawRect(shadow, topLeft = Offset(w - 2 * b, b), size = Size(b, h - 2 * b))
    }

/** Panel de piedra con bisel (estilo desktop). */
fun Modifier.stonePanel(background: Color = DbrStone): Modifier =
    this.clip(RectangleShape).pixelBevel(background = background)

/** Botón oro (CTA) estilo desktop, con texto oscuro. */
@Composable
fun GoldButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    contentPadding: PaddingValues = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    content: @Composable RowScope.() -> Unit
) {
    Row(
        modifier = modifier
            .clip(RectangleShape)
            .pixelBevel(background = DbrGoldDeep)
            .clickable(onClick = onClick)
            .padding(contentPadding),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically
    ) {
        CompositionLocalProvider(LocalContentColor provides DbrInk, content = { content() })
    }
}

/** Botón de la barra de navegación (piedra; activo = oro). */
@Composable
fun StoneNavButton(
    text: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RectangleShape)
            .pixelBevel(background = if (selected) DbrGoldDeep else DbrStone)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = text,
            color = if (selected) DbrInk else DbrCream,
            style = MaterialTheme.typography.titleSmall,
            maxLines = 1
        )
    }
}

/** Barra de navegación inferior estilo desktop: Noticias · Jugar · Ajustes (+ Discord). */
@Composable
fun DbrBottomBar(
    inLauncherScreen: Boolean,
    inSettingsScreen: Boolean,
    onNews: () -> Unit,
    toMainScreen: () -> Unit,
    toSettingsScreen: () -> Unit,
    onDiscord: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
            .pixelBevel(background = DbrStone)
    ) {
        StoneNavButton(
            text = "Discord",
            selected = false,
            onClick = onDiscord,
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 10.dp)
        )
        Row(
            modifier = Modifier.align(Alignment.Center),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StoneNavButton(text = "Noticias", selected = false, onClick = onNews)
            StoneNavButton(text = "Jugar", selected = inLauncherScreen, onClick = toMainScreen)
            StoneNavButton(text = "Ajustes", selected = inSettingsScreen, onClick = toSettingsScreen)
        }
    }
}
