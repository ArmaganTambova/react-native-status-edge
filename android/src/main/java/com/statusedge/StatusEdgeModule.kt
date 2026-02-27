package com.statusedge

import android.graphics.Path
import android.graphics.RectF
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
        val cameraCirclesArray = JSONArray()
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
              val widthRatio = widthPx.toDouble() / screenWidthPx.toDouble()

              // isAttachedToTop: 10px threshold handles rounding quirks across devices
              val isAttachedToTop = mainRect.top <= 10

              // Classification by width ratio:
              //   Notch     — attached, very wide  (>35%)
              //   WaterDrop — attached, medium     (>15%, classic teardrop notch ~20-30%)
              //   Dot       — attached, small      (<15%, punch-hole cameras ~5-10%
              //               even when Android inflates the bounding rect slightly)
              //   Island    — floating, wide       (>35%)
              //   Dot       — floating, small
              type = when {
                isAttachedToTop && widthRatio > 0.35 -> "Notch"
                isAttachedToTop && widthRatio > 0.15 -> "WaterDrop"
                isAttachedToTop                       -> "Dot"
                widthRatio > 0.35                     -> "Island"
                else                                  -> "Dot"
              }
            }

            // Derive exact camera circle from the cutout path shape.
            // getCutoutPath() (@hide, API 31+) returns the actual geometric path of
            // the physical camera hole — computeBounds() gives the tight bounding rect.
            if (type == "Dot" || type == "Island") {
              val circle = extractCameraCircle(displayCutout, density)
              if (circle != null) cameraCirclesArray.put(circle)
            }
          }
        }

        json.put("cutoutType", type)
        json.put("cutoutRects", rectsArray)
        json.put("cameraCircles", cameraCirclesArray)
        json.put("safeAreaTop", safeAreaTopDp)

        promise.resolve(json.toString())
      } catch (e: Exception) {
        promise.reject("STATUS_EDGE_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  /**
   * Uses the hidden getCutoutPath() method (available since API 31 as @hide) to
   * obtain the precise geometric shape of the physical camera hole.
   * computeBounds() on the resulting Path gives the tight bounding rect from
   * which we derive cx, cy, and r in density-independent pixels.
   *
   * Falls back gracefully to null on any error so the JS layer can use the
   * bounding-rect estimation instead.
   */
  private fun extractCameraCircle(
    displayCutout: android.view.DisplayCutout,
    density: Float,
  ): JSONObject? {
    return try {
      // @hide method — exists on API 31+, accessible via reflection
      val method = displayCutout.javaClass.getDeclaredMethod("getCutoutPath")
      method.isAccessible = true
      val path = method.invoke(displayCutout) as? Path ?: return null
      if (path.isEmpty) return null

      val bounds = RectF()
      path.computeBounds(bounds, /* exact= */ true)
      if (bounds.isEmpty) return null

      // Even if the path is a safe-area column (height > width), its vertical
      // center often aligns with the camera center better than just using
      // the bounding rect's center, especially if the OEM provides a specific path.
      // However, for very tall columns, this might still be off, but combined
      // with the JS-side fix (centering), we trust the path's geometry if available.
      // We no longer return null for high aspect ratios, but instead provide
      // the path's center as a "best effort" precise coordinate.

      val r  = Math.min(bounds.width(), bounds.height()) / 2f
      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (bounds.centerY() / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      obj
    } catch (_: Exception) {
      null
    }
  }

  private fun buildDefaultJson(): JSONObject {
    val json = JSONObject()
    json.put("cutoutType", "None")
    json.put("cutoutRects", JSONArray())
    json.put("cameraCircles", JSONArray())
    json.put("safeAreaTop", 0)
    return json
  }

  companion object {
    const val NAME = "StatusEdge"
  }
}
