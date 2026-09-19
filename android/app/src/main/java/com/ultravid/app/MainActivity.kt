package com.ultravid.app

import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

class MainActivity : Activity() {
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            webView = WebView(this)
            setContentView(webView)
            val s = webView!!.settings
            s.javaScriptEnabled = true
            s.domStorageEnabled = true
            s.allowFileAccess = true
            s.databaseEnabled = true
            s.mediaPlaybackRequiresUserGesture = false
            s.loadWithOverviewMode = true
            s.useWideViewPort = true
            webView!!.webViewClient = WebViewClient()
            webView!!.webChromeClient = WebChromeClient()
            webView!!.addJavascriptInterface(AndroidBridge(this), "AndroidBridge")
            webView!!.loadUrl("file:///android_asset/index.html")
        } catch (e: Exception) {
            try {
                Toast.makeText(this, "UltraVid failed to start: " + e.message, Toast.LENGTH_LONG).show()
            } catch (_: Exception) { }
        }
    }

    override fun onBackPressed() {
        val wv = webView
        if (wv != null && wv.canGoBack()) wv.goBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        try {
            webView?.destroy()
        } catch (_: Exception) { }
        webView = null
        super.onDestroy()
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
                toast("Download started: $safe")
            } catch (e: Exception) {
                toast("Download failed: " + e.message)
            }
        }

        @JavascriptInterface
        fun toast(message: String) {
            try {
                Toast.makeText(ctx, message, Toast.LENGTH_SHORT).show()
            } catch (_: Exception) { }
        }

        @JavascriptInterface
        fun shareText(text: String) {
            try {
                val i = Intent(Intent.ACTION_SEND)
                i.type = "text/plain"
                i.putExtra(Intent.EXTRA_TEXT, text)
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                ctx.startActivity(Intent.createChooser(i, "Share via").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (_: Exception) { }
        }
    }
}
