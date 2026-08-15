package net.xstat.companion

import android.animation.AnimatorInflater
import android.animation.AnimatorSet
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import androidx.appcompat.app.AppCompatActivity

/**
 * Splash screen that shows the XStat logo + animated pulse while the UDP
 * discovery runs in the background.  Transitions to MainActivity once a
 * host is found (or after a timeout triggers the "no host found" state
 * handled in MainActivity).
 */
class SplashActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private val animators = mutableListOf<AnimatorSet>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_splash)

        // Start staggered pulse animations on the five dots
        val dotIds = listOf(R.id.dot1, R.id.dot2, R.id.dot3, R.id.dot4, R.id.dot5)
        dotIds.forEachIndexed { i, id ->
            val dot = findViewById<View>(id)
            val anim = AnimatorInflater.loadAnimator(this, R.animator.pulse_dot) as AnimatorSet
            anim.startDelay = (i * 120L)
            anim.setTarget(dot)
            anim.start()
            animators += anim
        }

        when (Prefs.mode(this)) {
            // Manual URL saved → connect directly, skip discovery
            "manual" -> {
                val url = Prefs.manualUrl(this)
                if (!url.isNullOrEmpty()) {
                    launchMain(url)
                } else {
                    launchChooser()
                }
            }
            // LAN chosen before → run discovery
            "lan" -> startDiscovery()
            // Never chosen → ask the user first
            else -> launchChooser()
        }
    }

    private fun startDiscovery() {
        DiscoveryManager.findXStat(
            timeoutMs = 15_000L,
            onFound = { url ->
                handler.post {
                    launchMain(url)
                }
            },
            onTimeout = {
                handler.post {
                    launchMain(null)
                }
            }
        )
    }

    private fun launchChooser() {
        val intent = Intent(this, ChooserActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }

    private fun launchMain(url: String?) {
        val intent = Intent(this, MainActivity::class.java)
        if (url != null) {
            intent.putExtra(MainActivity.EXTRA_URL, url)
        }
        startActivity(intent)
        finish()
        // No transition animation — keeps the feel seamless
        overridePendingTransition(0, 0)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        animators.forEach { it.cancel() }
        DiscoveryManager.cancel()
    }
}
