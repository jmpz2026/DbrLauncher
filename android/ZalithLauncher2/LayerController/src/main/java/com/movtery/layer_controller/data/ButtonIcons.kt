package com.movtery.layer_controller.data

import androidx.annotation.DrawableRes
import com.movtery.layer_controller.R

/**
 * DBR: iconos que puede llevar un botón (campo `icon` de [NormalData]).
 * Son Material Symbols (Apache 2.0) en `res/drawable/ctl_icon_*.xml`; el id es el nombre del símbolo.
 * Un id desconocido se ignora y el botón queda solo con texto.
 */
object ButtonIcons {
    private val icons = mapOf(
        "auto_awesome" to R.drawable.ctl_icon_auto_awesome,
        "backpack" to R.drawable.ctl_icon_backpack,
        "chat" to R.drawable.ctl_icon_chat,
        "directions_run" to R.drawable.ctl_icon_directions_run,
        "expand_more" to R.drawable.ctl_icon_expand_more,
        "flare" to R.drawable.ctl_icon_flare,
        "flight" to R.drawable.ctl_icon_flight,
        "grid_view" to R.drawable.ctl_icon_grid_view,
        "keyboard" to R.drawable.ctl_icon_keyboard,
        "keyboard_double_arrow_down" to R.drawable.ctl_icon_keyboard_double_arrow_down,
        "keyboard_double_arrow_up" to R.drawable.ctl_icon_keyboard_double_arrow_up,
        "list" to R.drawable.ctl_icon_list,
        "my_location" to R.drawable.ctl_icon_my_location,
        "speed" to R.drawable.ctl_icon_speed,
        "swords" to R.drawable.ctl_icon_swords,
        "touch_app" to R.drawable.ctl_icon_touch_app
    )

    val ids: Set<String> get() = icons.keys

    @DrawableRes
    fun resolve(id: String?): Int? = id?.let { icons[it] }
}
