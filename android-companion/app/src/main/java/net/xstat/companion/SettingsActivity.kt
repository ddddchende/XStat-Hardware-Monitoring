package net.xstat.companion

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Settings screen. Shows the current connection configuration and lets the
 * user clear it, which sends the app back to the chooser on next launch.
 */
class SettingsActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val summary = when (Prefs.mode(this)) {
            "lan" -> getString(R.string.settings_mode_lan)
            "manual" -> getString(R.string.settings_mode_manual, Prefs.manualUrl(this) ?: "-")
            else -> getString(R.string.settings_mode_none)
        }
        findViewById<TextView>(R.id.configSummary).text = summary

        findViewById<Button>(R.id.btnClear).setOnClickListener {
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

        findViewById<Button>(R.id.btnBack).setOnClickListener { finish() }
    }

    private fun restartToChooser() {
        val intent = Intent(this, ChooserActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }
}
