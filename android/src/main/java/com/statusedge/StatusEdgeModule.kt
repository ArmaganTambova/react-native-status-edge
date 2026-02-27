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
              val topCutouts = rects.filter { it.top <= 10 }
              val mainRect = if (topCutouts.isNotEmpty()) {
                topCutouts.maxByOrNull { it.width() * it.height() }!!
              } else {
                rects.maxByOrNull { it.width() * it.height() }!!
              }

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
              val isAttachedToTop = mainRect.top <= 10

              type = when {
                isAttachedToTop && widthRatio > 0.35 -> "Notch"
                isAttachedToTop && widthRatio > 0.15 -> "WaterDrop"
                isAttachedToTop                       -> "Dot"
                widthRatio > 0.35                     -> "Island"
                else                                  -> "Dot"
              }
            }

            if (type == "Dot" || type == "Island") {
              // Try to get precise camera shape from Path API first
              val circlesFromPath = extractCameraCirclesViaPath(displayCutout, density)

              if (circlesFromPath.length() > 0) {
                 for (i in 0 until circlesFromPath.length()) {
                    cameraCirclesArray.put(circlesFromPath.getJSONObject(i))
                 }
              } else {
                // Fallback: derive circle from the safe-area bounding rect.
                for (rect in rects) {
                  val r = Math.min(rect.width(), rect.height()) / 2f
                  // If the rect is a tall column (OEM safe-area slab) the camera
                  // circle is bottom-aligned: its bottom edge = rect bottom.
                  // Use cy = bottom − r instead of the column midpoint.
                  val cy = if (rect.height().toFloat() > rect.width() * 1.2f) {
                    rect.bottom.toFloat() - r
                  } else {
                    rect.exactCenterY()
                  }
                  val circleObj = JSONObject()
                  circleObj.put("cx", (rect.exactCenterX() / density).toDouble())
                  circleObj.put("cy", (cy / density).toDouble())
                  circleObj.put("r", (r / density).toDouble())
                  cameraCirclesArray.put(circleObj)
                }
              }
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
   * Derives the camera circles from the path returned by the public
   * getCutoutPath() method (API 31+).
   *
   * It attempts to handle multiple cutouts if the path contains multiple detached contours,
   * though typical getCutoutPath usually returns a single combined path.
   *
   * Two cases are handled based on the shape of the path bounding box:
   *
   * 1. Nearly-square bounds (width ≈ height): the path IS the physical camera
   *    circle (e.g. Pixel devices).  Use cy = bounds.centerY().
   *
   * 2. Tall column (height > width × 1.2): the OEM returns the safe-area slab
   *    instead of the physical hole (e.g. Samsung).  Verified from Samsung's
   *    config_mainBuiltInDisplayCutout spec:
   *      • Column width  = camera diameter (no horizontal padding)
   *      • Column bottom = camera bottom   (no bottom padding)
   *    Therefore cy = bounds.bottom − r, not the column midpoint.
   */
  private fun extractCameraCirclesViaPath(
    displayCutout: android.view.DisplayCutout,
    density: Float,
  ): JSONArray {
    val result = JSONArray()
    try {
      // Use public API available since Android 12 (API 31)
      val path = displayCutout.cutoutPath ?: return result
      if (path.isEmpty) return result

      // In complex cases (multiple holes), the path might be composed of multiple
      // detached figures. However, Path API doesn't easily expose sub-paths.
      // We start by computing the bounds of the entire path.
      // If we need to support dual-camera holes that are separate (like some older phones),
      // we might need more complex path analysis, but usually "Island" covers that as one pill.

      val bounds = RectF()
      path.computeBounds(bounds, /* exact= */ true)
      if (bounds.isEmpty) return result

      // Logic for single bounding box of the path.
      // If the path is a pill (Island), bounds will be wide.
      // If the path is a tall column (Samsung hidden hole), bounds will be tall.

      val r = Math.min(bounds.width(), bounds.height()) / 2f
      val cy = if (bounds.height() > bounds.width() * 1.2f) {
        bounds.bottom - r   // tall column: camera bottom-aligned
      } else {
        bounds.centerY()    // square/circle path: use geometric centre
      }

      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (cy / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      result.put(obj)
    } catch (_: Exception) {
      // Ignore errors, return empty array to trigger fallback
    }
    return result
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
