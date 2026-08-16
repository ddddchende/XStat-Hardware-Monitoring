package net.xstat.companion

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

/**
 * First-launch connection chooser: pick automatic LAN discovery or
 * enter the service address manually.  The choice is saved in [Prefs]
 * so later launches skip this screen automatically.
 */
class ChooserActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_chooser)

        findViewById<Button>(R.id.btnLan).setOnClickListener {
            Prefs.saveLan(this)
            restartToSplash()
        }

        findViewById<Button>(R.id.btnManual).setOnClickListener {
            showManualUrlDialog()
        }
    }

    private fun restartToSplash() {
        val intent = Intent(this, SplashActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }

    private fun showManualUrlDialog() {
        val input = EditText(this).apply {
            hint = getString(R.string.manual_url_hint)
            setText(Prefs.activeUrl(this@ChooserActivity) ?: "")
            setSelectAllOnFocus(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.manual_url_title)
            .setView(input)
            .setPositiveButton(R.string.connect) { _, _ ->
                val url = input.text.toString().trim().trimEnd('/')
                if (url.isNotEmpty()) {
                    Prefs.saveManual(this, url)
                    restartToSplash()
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
