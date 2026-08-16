package net.xstat.companion

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Full-screen WebView that loads the XStat panel served by the .NET service.
 *
 * While the panel is displayed a background health monitor pings /health every
 * [HEALTH_INTERVAL_MS] ms. After [MAX_FAILURES] consecutive failures it
 * concludes the host has gone away and restarts SplashActivity so discovery
 * runs again automatically.
 *
 * Extras:
 *   EXTRA_URL  — fully-qualified URL discovered by DiscoveryManager,
 *                e.g. "http://192.168.1.100:9421"
 *                If absent/null the error view is shown immediately.
 */
class MainActivity : AppCompatActivity() {

    companion object {
        const val EXTRA_URL = "net.xstat.companion.EXTRA_URL"
        private const val HEALTH_INTERVAL_MS = 1_000L
        private const val MAX_FAILURES = 3
        private const val HINT_DURATION_MS = 5_000L
        private const val MAX_HINT_SHOWS = 3
        private const val HINT_FADE_IN_MS = 250L
        private const val HINT_FADE_OUT_MS = 400L
        private const val HINT_HOLD_MS =
            HINT_DURATION_MS - HINT_FADE_IN_MS - HINT_FADE_OUT_MS
    }

    private lateinit var webView: WebView
    private lateinit var errorView: View
    private lateinit var errorText: TextView
    private lateinit var retryButton: Button

    private val mainHandler = Handler(Looper.getMainLooper())
    private val hintHandler = Handler(Looper.getMainLooper())
    private val monitorRunning = AtomicBoolean(false)
    private var consecutiveFailures = 0
    private var currentBaseUrl: String? = null

    // Volume + / Volume − pressed together opens Settings (no on-screen button)
    private var volumeUpPressed = false
    private var volumeDownPressed = false
    private var volumeComboFired = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Full-screen immersive — hide status bar + nav bar
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        hideSystemUi()

        setContentView(R.layout.activity_main)

        webView     = findViewById(R.id.webView)
        errorView   = findViewById(R.id.errorView)
        errorText   = findViewById(R.id.errorText)
        retryButton = findViewById(R.id.retryButton)

        configureWebView()

        val url = intent.getStringExtra(EXTRA_URL)
        if (url != null) {
            currentBaseUrl = url
            loadUrl(url)
            startConnectionMonitor(url)
            showSettingsHint()
        } else {
            showError(getString(R.string.error_no_host))
        }

        retryButton.setOnClickListener { restartApp() }
    }

    // ── Settings access (no on-screen button) ───────────────────────────────

    /**
     * Volume + and Volume − pressed together opens Settings.
     * Single volume presses still adjust system volume (super is called).
     */
    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> volumeUpPressed = true
            KeyEvent.KEYCODE_VOLUME_DOWN -> volumeDownPressed = true
        }
        if (volumeUpPressed && volumeDownPressed && !volumeComboFired) {
            volumeComboFired = true
            openSettings()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_VOLUME_UP -> volumeUpPressed = false
            KeyEvent.KEYCODE_VOLUME_DOWN -> volumeDownPressed = false
        }
        if (!volumeUpPressed && !volumeDownPressed) volumeComboFired = false
        return super.onKeyUp(keyCode, event)
    }

    private fun openSettings() {
        // Pause the health monitor while Settings is on top; it restarts onResume
        stopConnectionMonitor()
        startActivity(Intent(this, SettingsActivity::class.java))
    }

    override fun onResume() {
        super.onResume()
        // Re-arm the monitor after returning from Settings
        val url = currentBaseUrl
        if (url != null && !monitorRunning.get()) {
            startConnectionMonitor(url)
        }
        // Note: do NOT reload here. The QQ OAuth callback arrives via
        // onNewIntent() and is loaded directly; a reload on resume would wipe
        // the just-loaded callback page before its JS could set the session.
    }

    /** Transient hint explaining how to reach Settings — at most [MAX_HINT_SHOWS] times ever. */
    private fun showSettingsHint() {
        if (Prefs.hintShownCount(this) >= MAX_HINT_SHOWS) return
        Prefs.incrementHintShown(this)
        hintHandler.removeCallbacksAndMessages(null)
        findViewById<TextView>(R.id.hintView).apply {
            // Pop-in (fade + scale up), hold, then fade out
            visibility = View.VISIBLE
            alpha = 0f
            scaleX = 0.85f
            scaleY = 0.85f
            animate()
                .alpha(1f).scaleX(1f).scaleY(1f)
                .setDuration(HINT_FADE_IN_MS)
                .start()
            hintHandler.postDelayed({
                if (isAttachedToWindow) {
                    animate()
                        .alpha(0f)
                        .setDuration(HINT_FADE_OUT_MS)
                        .withEndAction { visibility = View.GONE }
                        .start()
                }
            }, HINT_HOLD_MS)
        }
    }

    // ── Connection monitor ──────────────────────────────────────────────────

    private fun startConnectionMonitor(baseUrl: String) {
        monitorRunning.set(true)
        consecutiveFailures = 0
        scheduleHealthCheck(baseUrl)
    }

    private fun scheduleHealthCheck(baseUrl: String) {
        mainHandler.postDelayed({
            if (!monitorRunning.get()) return@postDelayed
            Thread {
                val healthy = pingHealth(baseUrl)
                mainHandler.post {
                    if (!monitorRunning.get()) return@post
                    if (healthy) {
                        consecutiveFailures = 0
                        scheduleHealthCheck(baseUrl)
                    } else {
                        consecutiveFailures++
                        if (consecutiveFailures >= MAX_FAILURES) {
                            // Host has gone away — restart discovery
                            monitorRunning.set(false)
                            restartApp()
                        } else {
                            scheduleHealthCheck(baseUrl)
                        }
                    }
                }
            }.apply { isDaemon = true; start() }
        }, HEALTH_INTERVAL_MS)
    }

    private fun pingHealth(baseUrl: String): Boolean {
        return try {
            val conn = URL("$baseUrl/health").openConnection() as HttpURLConnection
            conn.connectTimeout = 3_000
            conn.readTimeout    = 3_000
            conn.requestMethod  = "GET"
            val code = conn.responseCode
            conn.disconnect()
            // Host is reachable when we get any HTTP answer. 401/403 mean the
            // reverse proxy demands auth (e.g. a login page) — the host is still
            // up, so those must NOT count as a failure, otherwise the health
            // monitor would restart the app while the user is on the auth page.
            code in 200..299 || code == 401 || code == 403
        } catch (_: Exception) {
            false
        }
    }

    private fun stopConnectionMonitor() {
        monitorRunning.set(false)
        mainHandler.removeCallbacksAndMessages(null)
    }

    // ── WebView ─────────────────────────────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    @Suppress("DEPRECATION")
    private fun configureWebView() {
        // Older Android WebViews reject third-party cookies by default, which can
        // break cross-domain auth flows. Explicitly allow them (no-op on Android 12+).
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        // Strip the WebView "; wv" / "Version/4.0" markers so the UA looks like a
        // normal mobile Chrome (keeps the mobile layout, avoids WebView sniffing).
        val rawUa = webView.settings.userAgentString
        webView.settings.userAgentString = rawUa.replace("; wv", "").replace("Version/4.0 ", "")

        with(webView.settings) {
            javaScriptEnabled        = true
            domStorageEnabled        = true
            databaseEnabled          = true
            loadsImagesAutomatically = true
            mixedContentMode         = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode                = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            allowContentAccess       = true
            // Lucky OAuth opens the QQ auth page via window.open; without
            // multiple-window support the popup is blocked → about:blank#blocked.
            setSupportMultipleWindows(true)
            javaScriptCanOpenWindowsAutomatically = true
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false

            // Catches main-frame load errors (deprecated path, API < 23)
            @Suppress("OVERRIDE_DEPRECATION")
            override fun onReceivedError(
                view: WebView,
                errorCode: Int,
                description: String,
                failingUrl: String
            ) {
                // Never surface unknown-scheme navigations as a fatal error page.
                if (errorCode == WebViewClient.ERROR_UNSUPPORTED_SCHEME) return
                showError(getString(R.string.error_load_failed, description))
            }
        }

        // Support window.open: create a hidden popup WebView to satisfy Lucky's
        // "pre-open window" call, then when Lucky sets popup.location.href =
        // authUrl, intercept that navigation and open the QQ auth page in the
        // system browser. The main WebView keeps the login page polling OAuth.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message
            ): Boolean {
                val popup = WebView(view.context)
                popup.settings.javaScriptEnabled = true
                popup.webViewClient = object : WebViewClient() {
                    override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                        val url = request.url.toString()
                        if (url.startsWith("http://") || url.startsWith("https://")) {
                            try {
                                view.context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                            } catch (_: Exception) {}
                            return true
                        }
                        return false
                    }
                }
                val transport = resultMsg.obj as? WebView.WebViewTransport ?: return false
                transport.webView = popup
                resultMsg.sendToTarget()
                return true
            }
        }
    }

    private fun loadUrl(url: String) {
        errorView.visibility = View.GONE
        webView.visibility   = View.VISIBLE
        webView.loadUrl(url)
    }

    private fun showError(message: String) {
        stopConnectionMonitor()
        webView.visibility   = View.GONE
        errorView.visibility = View.VISIBLE
        errorText.text       = message
    }

    // ── Navigation & lifecycle ──────────────────────────────────────────────

    private fun restartApp() {
        stopConnectionMonitor()
        val intent = Intent(this, SplashActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        startActivity(intent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopConnectionMonitor()
    }

    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    @Suppress("OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }
}

