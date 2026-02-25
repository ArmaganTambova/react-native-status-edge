package com.statusedge

import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import org.json.JSONArray
import org.json.JSONObject

class StatusEdgeModule(reactContext: ReactApplicationContext) :
  NativeStatusEdgeSpec(reactContext) {

  override fun getName(): String {
    return NAME
  }

  @ReactMethod
  override fun getCutoutData(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.resolve(buildDefaultJson().toString())
      return
    }

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(buildDefaultJson().toString())
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val json = JSONObject()
        val rectsArray = JSONArray()
        var type = "None"
        var safeAreaTopDp = 0f

        val density = reactApplicationContext.resources.displayMetrics.density
        val windowMetrics = activity.windowManager.currentWindowMetrics
        val screenWidthPx = windowMetrics.bounds.width()

        val decorView = activity.window.decorView
        val rootInsets = decorView.rootWindowInsets

        if (rootInsets != null) {
          val displayCutout = rootInsets.displayCutout

          if (displayCutout != null) {
            safeAreaTopDp = displayCutout.safeInsetTop / density
            val rects = displayCutout.boundingRects

            if (rects.isNotEmpty()) {
              // Find the primary top cutout (highest priority for classification)
              // Prefer cutouts attached to the top edge (top <= 10px threshold)
              val topCutouts = rects.filter { it.top <= 10 }
              val mainRect = if (topCutouts.isNotEmpty()) {
                topCutouts.maxByOrNull { it.width() * it.height() }!!
              } else {
                rects.maxByOrNull { it.width() * it.height() }!!
              }

              // Add all rects converted to dp
              for (rect in rects) {
                val rectObj = JSONObject()
                rectObj.put("x", rect.left / density)
                rectObj.put("y", rect.top / density)
                rectObj.put("width", rect.width() / density)
                rectObj.put("height", rect.height() / density)
                rectsArray.put(rectObj)
              }

              val widthPx = mainRect.width()
              val heightPx = mainRect.height()
              val widthRatio = widthPx.toDouble() / screenWidthPx.toDouble()
              // Aspect ratio to distinguish waterdrop (tall/narrow) from punch-hole (round)
              val aspectRatio = if (widthPx > 0) heightPx.toDouble() / widthPx.toDouble() else 1.0

              // isAttachedToTop: 10px threshold handles rounding quirks across devices
              val isAttachedToTop = mainRect.top <= 10

              type = when {
                isAttachedToTop && widthRatio > 0.35 -> "Notch"
                isAttachedToTop && aspectRatio > 1.3  -> "WaterDrop"
                isAttachedToTop                        -> "Dot"
                widthRatio > 0.35                      -> "Island"
                else                                   -> "Dot"
              }
            }
          }
        }

        json.put("cutoutType", type)
        json.put("cutoutRects", rectsArray)
        json.put("safeAreaTop", safeAreaTopDp)

        promise.resolve(json.toString())
      } catch (e: Exception) {
        promise.reject("STATUS_EDGE_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  private fun buildDefaultJson(): JSONObject {
    val json = JSONObject()
    json.put("cutoutType", "None")
    json.put("cutoutRects", JSONArray())
    json.put("safeAreaTop", 0)
    return json
  }

  companion object {
    const val NAME = "StatusEdge"
  }
}
