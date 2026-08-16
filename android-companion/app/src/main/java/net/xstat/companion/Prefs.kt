package net.xstat.companion

import android.content.Context
import org.json.JSONArray

/**
 * Persists the user's connection preference across launches.
 *
 * mode: "lan"    → run UDP discovery on next launch
 *       "manual" → use the active URL from [urls]
 *       null     → never chosen yet; show the chooser on launch
 *
 * URLs: the app keeps a list of manually-entered server addresses ([urls])
 * and marks one of them as active ([activeUrl]). "manual" mode connects to
 * the active one. URLs can be added / edited / deleted / re-activated freely
 * without clearing the whole configuration.
 */
object Prefs {

    private const val NAME = "xstat_prefs"
    private const val KEY_MODE = "mode"
    private const val KEY_MANUAL_URL = "manual_url"
    private const val KEY_URLS = "urls"
    private const val KEY_ACTIVE_URL = "active_url"
    private const val KEY_KEEP_SCREEN_ON = "keep_screen_on"
    private const val KEY_LANGUAGE = "language"
    private const val KEY_HINT_SHOWN = "hint_shown_count"

    private fun prefs(context: Context) =
        context.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun mode(context: Context): String? = prefs(context).getString(KEY_MODE, null)

    /** The active manual URL ("manual" mode connects to this), or null. */
    fun activeUrl(context: Context): String? =
        prefs(context).getString(KEY_ACTIVE_URL, null) ?: manualUrl(context)

    /** Legacy single-URL key; kept for migration from older builds. */
    private fun manualUrl(context: Context): String? =
        prefs(context).getString(KEY_MANUAL_URL, null)

    /** All saved manual URLs, in insertion order. */
    fun urls(context: Context): List<String> {
        val stored = prefs(context).getString(KEY_URLS, null)
        if (stored != null) {
            return try {
                val arr = JSONArray(stored)
                (0 until arr.length()).map { arr.getString(it) }
            } catch (_: Exception) {
                emptyList()
            }
        }
        // Migration: older builds only stored a single URL; seed the list from it.
        val legacy = manualUrl(context)
        return if (!legacy.isNullOrEmpty()) listOf(legacy) else emptyList()
    }

    private fun saveUrls(context: Context, urls: List<String>) {
        val arr = JSONArray()
        urls.forEach { arr.put(it) }
        prefs(context).edit().putString(KEY_URLS, arr.toString()).apply()
    }

    /** Switch to LAN discovery. The saved URL list is kept. */
    fun saveLan(context: Context) {
        prefs(context).edit().putString(KEY_MODE, "lan").apply()
    }

    /** Add (or replace) a URL and make it the active one ("manual" mode). */
    fun saveManual(context: Context, url: String) {
        val clean = url.trim().trimEnd('/')
        if (clean.isEmpty()) return
        saveUrls(context, (urls(context) + clean).distinct())
        setActive(context, clean)
    }

    /** Add a URL to the list without activating it. Auto-activates if nothing
     *  has been configured yet so the app stays immediately usable. */
    fun addUrl(context: Context, url: String) {
        val clean = url.trim().trimEnd('/')
        if (clean.isEmpty()) return
        saveUrls(context, (urls(context) + clean).distinct())
        if (mode(context) == null) setActive(context, clean)
    }

    /** Replace [oldUrl] in the list; keeps it active (and "manual" mode) if it
     *  was the active URL and the app is in manual mode. */
    fun updateUrl(context: Context, oldUrl: String, newUrl: String) {
        val clean = newUrl.trim().trimEnd('/')
        if (clean.isEmpty()) return
        val list = urls(context).toMutableList()
        val idx = list.indexOf(oldUrl)
        if (idx >= 0) list[idx] = clean else list.add(clean)
        saveUrls(context, list.distinct())
        if (mode(context) == "manual" && activeUrl(context) == oldUrl) setActive(context, clean)
    }

    /** Remove [url]; if it was the active manual URL, fall back to the first
     *  remaining URL (or back to the chooser when no URLs are left). In LAN
     *  mode the mode is untouched — only the list changes. */
    fun removeUrl(context: Context, url: String) {
        val list = urls(context).toMutableList()
        list.remove(url)
        saveUrls(context, list)
        if (mode(context) == "manual" && activeUrl(context) == url) {
            val next = list.firstOrNull()
            if (next != null) {
                setActive(context, next)
            } else {
                prefs(context).edit()
                    .remove(KEY_ACTIVE_URL)
                    .remove(KEY_MANUAL_URL)
                    .remove(KEY_MODE)
                    .apply()
            }
        }
    }

    /** Make [url] the active manual URL and switch to "manual" mode. */
    fun setActiveUrl(context: Context, url: String) {
        val clean = url.trim().trimEnd('/')
        if (clean.isEmpty() || !urls(context).contains(clean)) return
        setActive(context, clean)
    }

    private fun setActive(context: Context, url: String) {
        prefs(context).edit()
            .putString(KEY_MODE, "manual")
            .putString(KEY_ACTIVE_URL, url)
            .putString(KEY_MANUAL_URL, url)
            .apply()
    }

    // ── Keep screen on ──────────────────────────────────────────────────────

    fun keepScreenOn(context: Context): Boolean =
        prefs(context).getBoolean(KEY_KEEP_SCREEN_ON, false)

    fun setKeepScreenOn(context: Context, on: Boolean) {
        prefs(context).edit().putBoolean(KEY_KEEP_SCREEN_ON, on).apply()
    }

    // ── Language ("", null = follow system; "zh" / "en" = explicit) ─────────

    fun language(context: Context): String? = prefs(context).getString(KEY_LANGUAGE, null)

    fun setLanguage(context: Context, code: String) {
        prefs(context).edit().putString(KEY_LANGUAGE, code).apply()
    }

    /** Clear connection settings only; the settings hint counter is kept. */
    fun clear(context: Context) {
        prefs(context).edit()
            .remove(KEY_MODE)
            .remove(KEY_MANUAL_URL)
            .remove(KEY_ACTIVE_URL)
            .remove(KEY_URLS)
            .apply()
    }

    // ── "How to open settings" hint counter (max N shows over the app's life) ─

    fun hintShownCount(context: Context): Int = prefs(context).getInt(KEY_HINT_SHOWN, 0)

    fun incrementHintShown(context: Context) {
        prefs(context).edit().putInt(KEY_HINT_SHOWN, hintShownCount(context) + 1).apply()
    }
}
