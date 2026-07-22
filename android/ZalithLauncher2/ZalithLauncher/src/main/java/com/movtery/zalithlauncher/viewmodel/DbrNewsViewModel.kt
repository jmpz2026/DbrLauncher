/*
 * DbrLauncherMobile — noticias del servidor (news.json) para la pestaña Noticias.
 * Basado en ZalithLauncher 2 (GPL-3.0). Versión modificada no oficial.
 */

package com.movtery.zalithlauncher.viewmodel

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.movtery.zalithlauncher.utils.GSON
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.URL

data class NewsItem(
    val title: String = "",
    val date: String = "",
    val tag: String = "",
    val body: String = ""
)

private data class NewsData(val items: List<NewsItem> = emptyList())

private const val NEWS_URL =
    "https://raw.githubusercontent.com/jmpz2026/DbrLauncher/assets/news.json"

class DbrNewsViewModel : ViewModel() {
    /** null = cargando; lista (posiblemente vacía) = cargado. */
    var items by mutableStateOf<List<NewsItem>?>(null)
        private set

    init {
        load()
    }

    fun load() {
        items = null
        viewModelScope.launch {
            items = withContext(Dispatchers.IO) {
                runCatching {
                    val json = URL(NEWS_URL).readText()
                    GSON.fromJson(json, NewsData::class.java)?.items ?: emptyList()
                }.getOrDefault(emptyList())
            }
        }
    }
}

@OptIn(ExperimentalMaterial3ExpressiveApi::class)
@Composable
fun DbrNewsDialog(onDismiss: () -> Unit) {
    val viewModel: DbrNewsViewModel = viewModel()
    val items = viewModel.items

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = MaterialTheme.shapes.extraLarge,
            color = MaterialTheme.colorScheme.surface,
            tonalElevation = 6.dp
        ) {
            Column(
                modifier = Modifier
                    .widthIn(max = 520.dp)
                    .padding(all = 20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Noticias",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.primary
                )
                when {
                    items == null -> {
                        LoadingIndicator()
                    }
                    items.isEmpty() -> {
                        Text(
                            text = "No hay noticias por ahora.",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                    else -> {
                        LazyColumn(
                            modifier = Modifier.heightIn(max = 360.dp),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            items(items) { item ->
                                NewsItemLayout(item)
                            }
                        }
                    }
                }
                Button(
                    modifier = Modifier.align(Alignment.End),
                    onClick = onDismiss
                ) {
                    Text("Cerrar")
                }
            }
        }
    }
}

@Composable
private fun NewsItemLayout(item: NewsItem) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = item.title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (item.tag.isNotEmpty()) {
                Text(
                    modifier = Modifier.alpha(0.8f),
                    text = item.tag,
                    style = MaterialTheme.typography.labelSmall
                )
            }
            if (item.date.isNotEmpty()) {
                Text(
                    modifier = Modifier.alpha(0.6f),
                    text = item.date,
                    style = MaterialTheme.typography.labelSmall
                )
            }
        }
        Text(
            modifier = Modifier.fillMaxWidth(),
            text = item.body,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}
