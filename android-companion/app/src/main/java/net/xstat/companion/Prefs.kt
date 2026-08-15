package net.xstat.companion

import android.content.Context

/**
 * Persists the user's connection preference across launches.
 *
 * mode: "lan"    → run UDP discovery on next launch
 *       "manual" → use the saved [manualUrl] directly
 *       null     → never chosen yet; show the chooser on launch
 */
object Prefs {

    private const val NAME = "xstat_prefs"
    private const val KEY_MODE = "mode"
    private const val KEY_MANUAL_URL = "manual_url"
    private const val KEY_HINT_SHOWN = "hint_shown_count"

    private fun prefs(context: Context) =
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun mode(context: Context): String? = prefs(context).getString(KEY_MODE, null)

    fun manualUrl(context: Context): String? = prefs(context).getString(KEY_MANUAL_URL, null)

    fun saveLan(context: Context) {
        prefs(context).edit().putString(KEY_MODE, "lan").apply()
    }

    fun saveManual(context: Context, url: String) {
        prefs(context).edit()
            .putString(KEY_MODE, "manual")
            .putString(KEY_MANUAL_URL, url.trim().trimEnd('/'))
            .apply()
    }

    /** Clear connection settings only; the settings hint counter is kept. */
    fun clear(context: Context) {
        prefs(context).edit()
            .remove(KEY_MODE)
            .remove(KEY_MANUAL_URL)
            .apply()
    }

    // ── "How to open settings" hint counter (max N shows over the app's life) ─

    fun hintShownCount(context: Context): Int = prefs(context).getInt(KEY_HINT_SHOWN, 0)

    fun incrementHintShown(context: Context) {
        prefs(context).edit().putInt(KEY_HINT_SHOWN, hintShownCount(context) + 1).apply()
    }
}
