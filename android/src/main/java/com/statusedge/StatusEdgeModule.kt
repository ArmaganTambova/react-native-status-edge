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

    // DisplayCutout.getBoundingRects() is available since API 28 (Android 9).
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
        // Below API 34, use the activity's display metrics (activity is a UiContext).
        @Suppress("DEPRECATION")
        val density: Float = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          windowMetrics.density
        } else {
          activity.resources.displayMetrics.density
        }

        // Obtain display cutout:
        // • API 31+: WindowMetrics.windowInsets is a snapshot tied to the window at
        //   query time — more reliable than decorView.rootWindowInsets which may be
        //   null or stale before the first layout pass.
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
            // A cutout is "attached to the top" when its top edge sits inside the
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
            val circle = extractCameraCircle(displayCutout, density, safeInsetTopPx)
            if (circle != null) {
              cameraCirclesArray.put(circle as Any)
            } else {
              for (rect in rects) {
                val r = rect.width() / 2f
                val cy = bestCy(
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
                cameraCirclesArray.put(circleObj as Any)
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
   * Uses the hidden getCutoutPath() method (API 31+, @hide) to obtain the
   * precise geometric path of the physical camera hole.
   *
   * Walks the full class hierarchy so that OEM subclasses of DisplayCutout
   * (e.g. Samsung) are also handled correctly.
   *
   * The derived circle uses [bestCy] to correct for Samsung's bottom-aligned
   * safe-area circle, where the raw geometric centre sits lower than the
   * physical camera lens.
   */
  private fun extractCameraCircle(
    displayCutout: android.view.DisplayCutout,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONObject? {
    return try {
      val path = findCutoutPath(displayCutout) ?: return null
      if (path.isEmpty) return null

      val bounds = RectF()
      path.computeBounds(bounds, /* exact= */ true)
      if (bounds.isEmpty) return null

      // Use width/2 as radius — width equals the physical camera diameter on
      // both circle-path (Pixel, Samsung API 31+) and column-path OEM variants.
      val r = bounds.width() / 2f
      val cy = bestCy(
        rectCenterY    = bounds.centerY(),
        rectBottomY    = bounds.bottom,
        rectHeightPx   = bounds.height(),
        rectWidthPx    = bounds.width(),
        r              = r,
        safeInsetTopPx = safeInsetTopPx,
      )

      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (cy / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      obj
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Calculates the best-estimate camera circle centre Y (in pixels).
   *
   * Samsung One UI defines the safe-area path as a column or circle whose
   * BOTTOM edge coincides with safeInsetTop (status-bar bottom), with no
   * bottom padding.  The raw geometric centre of that shape sits lower than
   * the physical camera lens.
   *
   * When the shape bottom is within 5 % of safeInsetTop we blend the raw
   * centre with the status-bar midpoint (50/50), pulling the animation ring
   * up to match the physical camera position on Samsung devices.
   *
   * For tall-column shapes (height > width × 1.2) the raw cy is already
   * bottom − r (camera bottom − radius = camera centre), so no further
   * blend is needed.
   */
  private fun bestCy(
    rectCenterY: Float,
    rectBottomY: Float,
    rectHeightPx: Float,
    rectWidthPx: Float,
    r: Float,
    safeInsetTopPx: Float,
  ): Float {
    val isTallColumn = rectHeightPx > rectWidthPx * 1.2f

    val cyCandidatePx = if (isTallColumn) {
      rectBottomY - r          // Samsung column: bottom edge = camera bottom
    } else {
      rectCenterY              // Circle/oval path: geometric centre
    }

    // Apply Samsung bottom-aligned circle correction.
    if (!isTallColumn && safeInsetTopPx > 0f) {
      val bottomGapFraction = (safeInsetTopPx - rectBottomY) / safeInsetTopPx
      if (bottomGapFraction < 0.05f) {
        // Circle bottom ≈ safeInsetTop → blend toward status-bar midpoint.
        return (cyCandidatePx + safeInsetTopPx / 2f) / 2f
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
    }
    return null
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
