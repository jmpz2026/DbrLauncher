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

package com.movtery.zalithlauncher.bridge

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context.CLIPBOARD_SERVICE
import androidx.annotation.Keep
import com.movtery.zalithlauncher.BuildKeys
import com.movtery.zalithlauncher.context.GlobalContext
import com.movtery.zalithlauncher.game.launch.Launcher
import com.movtery.zalithlauncher.utils.killProgress
import com.movtery.zalithlauncher.utils.logging.Logger
import com.movtery.zalithlauncher.utils.network.openLinkInternal
import com.movtery.zalithlauncher.R
import com.movtery.zalithlauncher.game.support.canal_movil.UrlSegura
import com.google.android.material.dialog.MaterialAlertDialogBuilder

private const val TAG = "ZLNativeInvoker"

@Keep
object ZLNativeInvoker {
    @JvmStatic
    var staticLauncher: Launcher? = null

    /**
     * DBR: single gate for every link the game asks to open (AWT Desktop.browse, clipboard "open",
     * DbrCore through the mobile channel). Only http/https pass [UrlSegura]; file: and any other
     * scheme are refused (file: used to share any path on the device without asking). The user
     * always confirms in a dialog that shows the real host as punycode.
     */
    @Keep
    @JvmStatic
    fun openLink(link: String) {
        val url = UrlSegura.validar(link)
        if (url == null) {
            Logger.warning(TAG, "link refused (only http/https): ${link.take(120)}")
            return
        }
        (GlobalContext as? Activity)?.let { activity ->
            activity.runOnUiThread {
                val aviso = activity.getString(if (url.confiable) R.string.dbr_link_verified else R.string.dbr_link_unverified)
                MaterialAlertDialogBuilder(activity)
                    .setTitle(R.string.dbr_link_title)
                    .setMessage(activity.getString(R.string.dbr_link_message, url.url, url.hostAscii) + "\n\n" + aviso)
                    .setPositiveButton(R.string.dbr_link_open) { _, _ -> activity.openLinkInternal(url.url) }
                    .setNegativeButton(R.string.generic_cancel) { dialog, _ -> dialog.dismiss() }
                    .show()
            }
        }
    }

    @Keep
    @JvmStatic
    fun querySystemClipboard() {
        (GlobalContext as? Activity)?.let { activity ->
            activity.runOnUiThread {
                val clipData = (activity.getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager)?.primaryClip ?: run {
                    ZLBridge.clipboardReceived(null, null)
                    return@runOnUiThread
                }
                val clipItemText = clipData.getItemAt(0).text ?: run {
                    ZLBridge.clipboardReceived(null, null)
                    return@runOnUiThread
                }
                ZLBridge.clipboardReceived(clipItemText.toString(), "plain")
            }
        }
    }

    @Keep
    @JvmStatic
    fun putClipboardData(data: String, mimeType: String) {
        (GlobalContext as? Activity)?.let { activity ->
            activity.runOnUiThread {
                val clipData = when (mimeType) {
                    "text/plain" -> ClipData.newPlainText(BuildKeys.LAUNCHER_IDENTIFIER, data)
                    "text/html" -> ClipData.newHtmlText(BuildKeys.LAUNCHER_IDENTIFIER, data, data)
                    else -> null
                }
                clipData?.let {
                    (activity.getSystemService(CLIPBOARD_SERVICE) as? ClipboardManager)?.setPrimaryClip(it)
                }
            }
        }
    }

    @Keep
    @JvmStatic
    fun jvmExit(exitCode: Int, isSignal: Boolean) {
        staticLauncher?.exit()
        staticLauncher?.onExit?.invoke(exitCode, isSignal)
        staticLauncher = null
        killProgress()
    }
}