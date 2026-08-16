package net.xstat.companion

import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat

/**
 * Settings screen. Manages the saved server address list: add / edit / delete
 * URLs and pick which one is active. Also offers LAN discovery, a "keep screen
 * on" toggle, a language switcher, and a full configuration reset.
 */
class SettingsActivity : AppCompatActivity() {

    private lateinit var urlList: LinearLayout

    /** Set when any connection config changed; drives the result code on exit. */
    private var dirty = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        urlList = findViewById(R.id.urlList)

        findViewById<Switch>(R.id.switchKeepScreenOn).apply {
            isChecked = Prefs.keepScreenOn(this@SettingsActivity)
            setOnCheckedChangeListener { _, on ->
                Prefs.setKeepScreenOn(this@SettingsActivity, on)
            }
        }

        findViewById<ImageButton>(R.id.btnLanguage).setOnClickListener { showLanguageDialog() }

        findViewById<Button>(R.id.btnAddUrl).setOnClickListener { showUrlDialog(null) }
        findViewById<Button>(R.id.btnLan).setOnClickListener {
            Prefs.saveLan(this)
            dirty = true
            refresh()
        }
        findViewById<Button>(R.id.btnClear).setOnClickListener { confirmClear() }
        findViewById<Button>(R.id.btnBack).setOnClickListener { finishWithResult() }
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        finishWithResult()
    }

    /** Report whether the connection config changed so the caller can refresh. */
    private fun finishWithResult() {
        setResult(if (dirty) RESULT_OK else RESULT_CANCELED)
        finish()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    // ── Rendering ───────────────────────────────────────────────────────────

    private fun refresh() {
        val summary = when (Prefs.mode(this)) {
            "lan" -> getString(R.string.settings_mode_lan)
            "manual" -> getString(R.string.settings_mode_manual, Prefs.activeUrl(this) ?: "-")
            else -> getString(R.string.settings_mode_none)
        }
        findViewById<TextView>(R.id.configSummary).text = summary
        renderUrlList()
    }

    private fun renderUrlList() {
        urlList.removeAllViews()
        val mode = Prefs.mode(this)
        val active = Prefs.activeUrl(this)
        val isManual = mode == "manual" && active != null

        Prefs.urls(this).forEach { url ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = ContextCompat.getDrawable(this@SettingsActivity, R.drawable.bg_card)
                setPadding(dp(12), dp(8), dp(10), dp(8))
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply { bottomMargin = dp(8) }
            }

            // Radio + label both activate the URL
            val radio = RadioButton(this).apply {
                isChecked = isManual && url == active
                contentDescription = getString(R.string.settings_activate)
                buttonTintList = ColorStateList.valueOf(
                    ContextCompat.getColor(this@SettingsActivity, R.color.purple)
                )
            }
            radio.setOnClickListener { activate(url) }

            val label = TextView(this).apply {
                text = url
                textSize = 15f
                setTextColor(ContextCompat.getColor(this@SettingsActivity, R.color.text))
                maxLines = 1
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            label.setOnClickListener { activate(url) }

            row.addView(radio)
            row.addView(label)
            row.addView(pillButton(R.string.settings_edit_url, R.color.slate) { showUrlDialog(url) })
            row.addView(pillButton(R.string.settings_delete_url, R.color.danger) { confirmDelete(url) })
            urlList.addView(row)
        }
    }

    /** Compact inline action pill (TextView + rounded tinted background). */
    private fun pillButton(textRes: Int, bgColorRes: Int, onClick: () -> Unit) =
        TextView(this).apply {
            text = getString(textRes)
            textSize = 13f
            setTextColor(ContextCompat.getColor(this@SettingsActivity, R.color.text))
            background = ContextCompat.getDrawable(this@SettingsActivity, R.drawable.bg_btn_small)
            backgroundTintList = ColorStateList.valueOf(
                ContextCompat.getColor(this@SettingsActivity, bgColorRes)
            )
            setPadding(dp(14), dp(6), dp(14), dp(6))
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = true
            setOnClickListener { onClick() }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { leftMargin = dp(6) }
        }

    // ── Language ────────────────────────────────────────────────────────────

    private fun showLanguageDialog() {
        val options = arrayOf(
            getString(R.string.language_system),
            getString(R.string.language_zh),
            getString(R.string.language_en)
        )
        val codes = arrayOf("", "zh", "en")
        val checked = codes.indexOf(Prefs.language(this) ?: "").coerceAtLeast(0)

        AlertDialog.Builder(this)
            .setTitle(R.string.settings_language)
            .setSingleChoiceItems(options, checked) { _, which ->
                applyLanguage(codes[which])
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun applyLanguage(code: String) {
        Prefs.setLanguage(this, code)
        val localeList = when (code) {
            "" -> LocaleListCompat.getEmptyLocaleList()
            "zh" -> LocaleListCompat.forLanguageTags("zh-CN")
            else -> LocaleListCompat.forLanguageTags("en")
        }
        AppCompatDelegate.setApplicationLocales(localeList)
        recreate()
    }

    // ── Actions ─────────────────────────────────────────────────────────────

    private fun activate(url: String) {
        Prefs.setActiveUrl(this, url)
        dirty = true
        refresh()
    }

    /** Dialog to add a new URL, or edit [existing] when non-null. */
    private fun showUrlDialog(existing: String?) {
        val input = EditText(this).apply {
            hint = getString(R.string.manual_url_hint)
            setText(existing ?: "")
            setSelectAllOnFocus(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }

        AlertDialog.Builder(this)
            .setTitle(if (existing == null) R.string.settings_add_url_title else R.string.settings_edit_url_title)
            .setView(input)
            .setPositiveButton(R.string.settings_save) { _, _ ->
                val value = input.text.toString().trim().trimEnd('/')
                if (value.isEmpty()) return@setPositiveButton
                if (existing == null) {
                    Prefs.addUrl(this, value)
                } else {
                    Prefs.updateUrl(this, existing, value)
                }
                dirty = true
                refresh()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmDelete(url: String) {
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_delete_title)
            .setMessage(getString(R.string.settings_delete_message, url))
            .setPositiveButton(R.string.settings_delete_url) { _, _ ->
                Prefs.removeUrl(this, url)
                dirty = true
                refresh()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun confirmClear() {
        AlertDialog.Builder(this)
            .setTitle(R.string.settings_clear_title)
            .setMessage(R.string.settings_clear_message)
            .setPositiveButton(R.string.settings_clear) { _, _ ->
                Prefs.clear(this)
                restartToChooser()
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    private fun restartToChooser() {
        val intent = Intent(this, ChooserActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }

    private fun dp(value: Int): Int =
        (resources.displayMetrics.density * value).toInt()
}
