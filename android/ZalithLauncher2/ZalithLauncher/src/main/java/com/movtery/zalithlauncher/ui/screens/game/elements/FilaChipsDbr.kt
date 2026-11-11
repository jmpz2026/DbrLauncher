package com.movtery.zalithlauncher.ui.screens.game.elements

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.CanalMovil
import com.movtery.zalithlauncher.game.support.canal_movil.FrasesMovil
import com.movtery.zalithlauncher.game.support.canal_movil.Protocolo
import com.movtery.zalithlauncher.path.PathManager
import java.io.File

/** Height of the chip row; the game is lifted this much more so the chat bar stays visible. */
val ALTO_FILA_CHIPS = 40.dp

private val FONDO = Color(0xE01A1626)
private val CHIP = Color(0xFF2B2440)
private val CHIP_FRASE = Color(0xFF3A2E5C)
private val BORDE = Color(0xFF6E56CF)

private fun archivoFrases() = File(PathManager.DIR_FILES_PRIVATE, "dbr_frases.txt")

/**
 * Chip row shown above the keyboard while the chat is open (plan C). Left: the player's quick
 * phrases and the edit button. Right: popup suggestions while typing, else the server chips.
 * A tap only writes into the chat field through [CanalMovil.insertar]; nothing is ever sent.
 */
@Composable
fun FilaChipsDbr(modifier: Modifier = Modifier) {
    var frases by remember { mutableStateOf(FrasesMovil.cargar(archivoFrases())) }
    var editando by remember { mutableStateOf(false) }
    val estado by CanalMovil.sugerencias.collectAsState()

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(ALTO_FILA_CHIPS)
            .background(FONDO)
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Chip("✎ " + stringResource(R.string.dbr_frases_titulo), CHIP) { editando = true }
        frases.forEach { frase ->
            Chip(frase, CHIP_FRASE) { CanalMovil.insertar(Protocolo.MODO_ESCRIBIR, frase) }
        }
        if (estado.sugerencias.isNotEmpty()) {
            estado.sugerencias.forEach { s ->
                Chip(s, CHIP) { CanalMovil.insertar(Protocolo.MODO_SUGERENCIA, s) }
            }
        } else {
            estado.chips.forEach { c ->
                Chip(c, CHIP) { CanalMovil.insertar(Protocolo.MODO_ESCRIBIR, "$c ") }
            }
        }
    }

    if (editando) {
        EditorFrases(
            inicial = frases,
            onCerrar = { nuevas ->
                frases = FrasesMovil.limpiar(nuevas)
                FrasesMovil.guardar(archivoFrases(), frases)
                editando = false
            },
        )
    }
}

@Composable
private fun Chip(texto: String, fondo: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .height(30.dp)
            .background(fondo, RoundedCornerShape(15.dp))
            .border(1.dp, BORDE, RoundedCornerShape(15.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = texto,
            color = Color.White,
            fontSize = 13.sp,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.widthIn(max = 160.dp),
        )
    }
}

@Composable
private fun EditorFrases(inicial: List<String>, onCerrar: (List<String>) -> Unit) {
    var lista by remember { mutableStateOf(inicial) }
    var nueva by remember { mutableStateOf("") }
    var editIndice by remember { mutableStateOf(-1) }
    val llena = lista.size >= FrasesMovil.MAX_FRASES && editIndice < 0
    val valida = FrasesMovil.normalizar(nueva) != null

    AlertDialog(
        onDismissRequest = { onCerrar(lista) },
        title = { Text(stringResource(R.string.dbr_frases_titulo)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.dbr_frases_ayuda), fontSize = 12.sp)
                Column(
                    modifier = Modifier
                        .heightIn(max = 220.dp)
                        .verticalScroll(rememberScrollState()),
                ) {
                    if (lista.isEmpty()) Text(stringResource(R.string.dbr_frases_vacio), fontSize = 13.sp)
                    lista.forEachIndexed { i, frase ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                frase,
                                modifier = Modifier.weight(1f),
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            TextButton(onClick = { lista = FrasesMovil.mover(lista, i, -1) }) { Text("↑") }
                            TextButton(onClick = { lista = FrasesMovil.mover(lista, i, 1) }) { Text("↓") }
                            TextButton(onClick = { editIndice = i; nueva = frase }) { Text("✎") }
                            TextButton(onClick = {
                                lista = lista.filterIndexed { j, _ -> j != i }
                                if (editIndice == i) { editIndice = -1; nueva = "" }
                            }) { Text("✕") }
                        }
                    }
                }
                if (llena) Text(stringResource(R.string.dbr_frases_llenas), fontSize = 12.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = nueva,
                        onValueChange = { if (it.length <= FrasesMovil.MAX_LARGO) nueva = it.replace('\n', ' ') },
                        singleLine = true,
                        enabled = !llena,
                        label = { Text(stringResource(R.string.dbr_frases_nueva)) },
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(
                        enabled = valida && !llena,
                        onClick = {
                            val f = FrasesMovil.normalizar(nueva) ?: return@TextButton
                            lista = if (editIndice in lista.indices) {
                                lista.toMutableList().apply { set(editIndice, f) }
                            } else {
                                lista + f
                            }
                            lista = FrasesMovil.limpiar(lista)
                            editIndice = -1
                            nueva = ""
                        },
                    ) {
                        Text(
                            stringResource(
                                if (editIndice >= 0) R.string.dbr_frases_guardar else R.string.dbr_frases_agregar
                            )
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onCerrar(lista) }) { Text(stringResource(R.string.dbr_frases_cerrar)) }
        },
    )
}
