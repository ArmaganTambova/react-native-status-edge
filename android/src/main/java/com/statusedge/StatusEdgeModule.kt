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

    // DisplayCutout.getBoundingRects() requires API 28 (Android 9)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
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

        val windowMetrics = activity.windowManager.currentWindowMetrics
        val screenWidthPx = windowMetrics.bounds.width()

        // Use window-accurate density for pixel↔dp conversion.
        // WindowMetrics.getDensity() (API 34+) is tied to the actual window,
        // avoiding errors with multi-display or display-size accessibility scaling.
        // Below API 34 use the activity's display metrics (activity is a UiContext).
        @Suppress("DEPRECATION")
        val density: Float = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          windowMetrics.density
        } else {
          activity.resources.displayMetrics.density
        }

        // Obtain display cutout:
        // • API 31+: use WindowMetrics.windowInsets — snapshot is tied to the window
        //   at metrics-query time, more reliable than decorView.rootWindowInsets which
        //   may not be populated before the first layout pass.
        // • API 28–30: fall back to decorView.rootWindowInsets.
        val displayCutout = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          windowMetrics.windowInsets.displayCutout
        } else {
          activity.window.decorView.rootWindowInsets?.displayCutout
        }

        if (displayCutout != null) {
          safeAreaTopDp = displayCutout.safeInsetTop / density
          val rects = displayCutout.boundingRects

          if (rects.isNotEmpty()) {
            // A cutout is "attached to the top" when its top edge is within the
            // safe-inset region (not a floating island below the status bar).
            val safeTopPx = displayCutout.safeInsetTop
            val topCutouts = rects.filter { it.top < safeTopPx }
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
            val isAttachedToTop = mainRect.top < safeTopPx

            type = when {
              isAttachedToTop && widthRatio > 0.35 -> "Notch"
              isAttachedToTop && widthRatio > 0.15 -> "WaterDrop"
              isAttachedToTop                       -> "Dot"
              widthRatio > 0.35                     -> "Island"
              else                                  -> "Dot"
            }
          }

          if (type == "Dot" || type == "Island") {
            val safeInsetTopPx = displayCutout.safeInsetTop.toFloat()

            // getCutoutPath() available on API 31+
            val circle = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
              extractCameraCircleViaPath(displayCutout, density, safeInsetTopPx)
            } else {
              null
            }

            if (circle != null) {
              cameraCirclesArray.put(circle)
            } else {
              // Fallback for API 28–30 or when getCutoutPath() is unavailable:
              // derive circle from the bounding rect geometry.
              for (rect in rects) {
                // Camera width = physical camera diameter; use width/2 as radius.
                val r = rect.width() / 2f
                val cy = circleCenter(
                  rectCenterY    = rect.exactCenterY(),
                  rectBottomY    = rect.bottom.toFloat(),
                  rectHeightPx   = rect.height().toFloat(),
                  rectWidthPx    = rect.width().toFloat(),
                  r              = r,
                  safeInsetTopPx = safeInsetTopPx,
                )
                val circleObj = JSONObject()
                circleObj.put("cx", (rect.exactCenterX() / density).toDouble())
                circleObj.put("cy", (cy / density).toDouble())
                circleObj.put("r",  (r / density).toDouble())
                cameraCirclesArray.put(circleObj)
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
   * Shape cases:
   *
   * 1. Tall column (height > width × 1.2): OEM returns the safe-area slab
   *    (e.g. some Samsung firmware).  Width = camera diameter, bottom = camera
   *    bottom (Samsung spec: no horizontal/bottom padding).
   *    → r = width/2,  cy = bounds.bottom − r
   *
   * 2. Near-square / circle (width ≈ height): path IS the physical camera
   *    non-functional area (e.g. Pixel, most Samsung API 31+ devices).
   *    → r = width/2,  cy via circleCenter() which corrects for
   *    Samsung's "bottom-aligned" circle (circle bottom ≈ safeInsetTop).
   * It attempts to handle multiple cutouts if the path contains multiple detached contours,
   * though typical getCutoutPath usually returns a single combined path.
   *
   * Logic Update:
   * We prioritize the geometric center (centerY) of the path bounds.
   * Previous logic aligned "tall" paths to the bottom, which caused misalignment on some
   * newer Samsung devices (S25 Ultra) where the path is tall but centered.
   * We now only apply special alignment if the aspect ratio is extreme (> 2.0).
   */
  private fun extractCameraCirclesViaPath(
    displayCutout: android.view.DisplayCutout,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONObject? {
    return try {
      val path = findCutoutPath(displayCutout) ?: return null
      if (path.isEmpty) return null
  ): JSONArray {
    val result = JSONArray()
    try {
      // Use public API available since Android 12 (API 31)
      val path = displayCutout.cutoutPath ?: return result
      if (path.isEmpty) return result

      val bounds = RectF()
      path.computeBounds(bounds, /* exact= */ true)
      if (bounds.isEmpty) return result

      // Always use width as the camera dimension – horizontal extent equals the
      // physical camera diameter on both circle-path and column-path devices.
      val r = bounds.width() / 2f
      val cy = circleCenter(
        rectCenterY    = bounds.centerY(),
        rectBottomY    = bounds.bottom,
        rectHeightPx   = bounds.height(),
        rectWidthPx    = bounds.width(),
        r              = r,
        safeInsetTopPx = safeInsetTopPx,
      )
      val r = Math.min(bounds.width(), bounds.height()) / 2f

      // Use geometric center by default.
      // Only bottom-align if it's an extremely tall column (e.g. > 2x height/width),
      // which might suggest a waterfall cutout or very specific safe-area slab.
      // S25 Ultra has ratio ~1.66 (30/18), so it will now use centerY().
      val cy = if (bounds.height() > bounds.width() * 2.0f) {
        bounds.bottom - r
      } else {
        bounds.centerY()
      }

      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (cy / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      result.put(obj)
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Calculates the best-estimate camera circle centre Y (in pixels).
   *
   * Samsung (and some other OEMs) define the safe-area path as a column or
   * circle whose BOTTOM edge coincides with safeInsetTop (the status-bar
   * bottom), with no bottom padding.  The raw geometric centre of such a shape
   * sits lower than the physical camera because the safe-area extends the full
   * status-bar height above the lens.
   *
   * Correction strategy (applied when the shape bottom is within 5 % of
   * safeInsetTop):
   *   • The physical camera occupies the lower portion of the status bar.
   *   • We blend the raw geometric centre (cy_raw) with the status-bar midpoint
   *     (safeInsetTop / 2) using a 50 / 50 weight.  This empirically matches
   *     Samsung One UI devices where the punch-hole sits in the lower-centre of
   *     the status bar.
   *   • For column-shaped paths (height > width × 1.2) the raw cy already uses
   *     bottom − r (= camera bottom − radius), so no additional blend is needed.
   */
  private fun circleCenter(
    rectCenterY: Float,
    rectBottomY: Float,
    rectHeightPx: Float,
    rectWidthPx: Float,
    r: Float,
    safeInsetTopPx: Float,
  ): Float {
    val isTallColumn = rectHeightPx > rectWidthPx * 1.2f

    // Raw best-estimate for cy:
    //   • Tall column → camera bottom-aligned (Samsung column spec)
    //   • Circle/oval  → geometric centre of the path
    val cyCandidatePx = if (isTallColumn) {
      rectBottomY - r
    } else {
      rectCenterY
    }

    // For circle-shaped paths check whether the bottom is bottom-aligned to
    // the safe area (Samsung behaviour). If so, blend toward the status-bar
    // midpoint to correct for the safe-area padding above the physical lens.
    if (!isTallColumn && safeInsetTopPx > 0f) {
      val bottomGapFraction = (safeInsetTopPx - rectBottomY) / safeInsetTopPx
      if (bottomGapFraction < 0.05f) {
        // Circle bottom ≈ safeInsetTop → Samsung bottom-aligned circle.
        // Physical camera centre ≈ midpoint of (raw cy, status-bar centre).
        val safeAreaMidPx = safeInsetTopPx / 2f
        return (cyCandidatePx + safeAreaMidPx) / 2f
      }
    }

    return cyCandidatePx
  }

  /**
   * Walks the class hierarchy of [displayCutout] to locate and invoke the
   * hidden getCutoutPath() method.  getDeclaredMethod() only searches the
   * exact runtime class; on OEMs that subclass android.view.DisplayCutout the
   * method is declared on the parent, so we must traverse up.
   */
  private fun findCutoutPath(displayCutout: android.view.DisplayCutout): Path? {
    var cls: Class<*>? = displayCutout.javaClass
    while (cls != null) {
      try {
        val m = cls.getDeclaredMethod("getCutoutPath")
        m.isAccessible = true
        return m.invoke(displayCutout) as? Path
      } catch (_: NoSuchMethodException) {
        cls = cls.superclass
      } catch (_: Exception) {
        break
      }
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
