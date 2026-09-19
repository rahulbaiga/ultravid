package com.ultravid.app

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)
        val s: WebSettings = webView.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        s.allowFileAccess = true
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        webView.webViewClient = WebViewClient()
        webView.webChromeClient = WebChromeClient()
        webView.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }

    class AndroidBridge(private val ctx: Context) {
        @JavascriptInterface
        fun downloadMedia(url: String, title: String, extension: String) {
            try {
                val safe = (if (title.isBlank()) "ultravid" else title).replace(Regex("[^A-Za-z0-9._-]+"), "_").take(80)
                val req = DownloadManager.Request(Uri.parse(url))
                    .setTitle(safe)
                    .setDescription("UltraVid download")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "$safe.$extension")
                    .setAllowedOverMetered(true)
                    .setAllowedOverRoaming(true)
                (ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            } catch (_: Exception) { }
        }
    }
}
