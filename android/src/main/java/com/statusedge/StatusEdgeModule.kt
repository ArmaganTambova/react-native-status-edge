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
        val screenWidthPx  = windowMetrics.bounds.width()
        val screenHeightPx = windowMetrics.bounds.height()

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
              // Strategy 1 (most accurate): parse the device's physical cutout spec string.
              // config_mainBuiltInDisplayCutout defines the exact physical camera hole,
              // without safe-area padding — the definitive source of truth.
              val circle = extractPhysicalCameraCircle(screenWidthPx, screenHeightPx, density)
              // Strategy 2: walk the class hierarchy to find getCutoutPath() (handles
              // OEMs that subclass android.view.DisplayCutout).
                ?: extractCameraCircleViaPath(displayCutout, density)

              if (circle != null) {
                cameraCirclesArray.put(circle)
              } else {
                // Strategy 3 (guaranteed fallback): derive circle from the safe-area
                // bounding rect.  cy = exactCenterY() places the circle at the centre
                // of the safe-area column, which is the best estimate we can make
                // without physical-hole data.
                for (rect in rects) {
                  val r = Math.min(rect.width(), rect.height()) / 2f
                  val circleObj = JSONObject()
                  circleObj.put("cx", (rect.exactCenterX() / density).toDouble())
                  circleObj.put("cy", (rect.exactCenterY() / density).toDouble())
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
   * Reads the hardware cutout specification from the Android system resource
   * "config_mainBuiltInDisplayCutout" and parses it via the hidden static
   * factory method DisplayCutout.fromSpec().
   *
   * This returns the PHYSICAL camera hole geometry — the ground-truth that the
   * framework itself uses internally — without any safe-area padding.  On OEM
   * devices like Samsung, DisplayCutout.boundingRects (and getCutoutPath) are
   * inflated by a safe-area margin; this method bypasses that inflation entirely.
   *
   * Returns null on any error so callers can fall through to the next strategy.
   */
  private fun extractPhysicalCameraCircle(
    screenWidthPx: Int,
    screenHeightPx: Int,
    density: Float,
  ): JSONObject? {
    return try {
      // Read the spec string that defines the physical cutout shape.
      val resources = android.content.res.Resources.getSystem()
      val id = resources.getIdentifier(
        "config_mainBuiltInDisplayCutout", "string", "android"
      )
      if (id == 0) return null
      val spec = resources.getString(id)
      if (spec.isNullOrBlank() || spec.equals("none", ignoreCase = true)) return null

      // DisplayCutout.fromSpec() is @hide but has been stable since API 30.
      // It parses the SVG-like path spec and returns a DisplayCutout whose
      // boundingRects are the tight physical camera-hole bounds (no padding).
      val clazz = Class.forName("android.view.DisplayCutout")
      val fromSpec = clazz.getDeclaredMethod(
        "fromSpec",
        String::class.java,
        Int::class.java,
        Int::class.java,
        Float::class.java,
      )
      fromSpec.isAccessible = true
      val physical = fromSpec.invoke(null, spec, screenWidthPx, screenHeightPx, density)
        as? android.view.DisplayCutout ?: return null

      val physRects = physical.boundingRects
      if (physRects.isEmpty()) return null

      // For top punch-hole cameras choose the topmost physical rect.
      val rect = physRects.minByOrNull { it.top } ?: return null

      // Reject degenerate results (e.g. spec returned a full-screen rect).
      if (rect.width() <= 0 || rect.height() <= 0) return null
      if (rect.width() > screenWidthPx / 2) return null

      val r = Math.min(rect.width(), rect.height()) / 2f
      val obj = JSONObject()
      obj.put("cx", (rect.exactCenterX() / density).toDouble())
      obj.put("cy", (rect.exactCenterY() / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      obj
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Obtains the camera-hole Path via the hidden getCutoutPath() method.
   * Unlike the single getDeclaredMethod() call, this walks up the full class
   * hierarchy so it works on OEMs (e.g. Samsung) that subclass
   * android.view.DisplayCutout — the method is declared on the parent class and
   * getDeclaredMethod() alone would throw NoSuchMethodException on subclasses.
   *
   * If the path turns out to be the safe-area column (height ≫ width), we still
   * extract a useful approximation: width gives the diameter and centerY() gives
   * a reasonable cy (≈ safeAreaTop/2, close to the camera centre for most OEMs).
   */
  private fun extractCameraCircleViaPath(
    displayCutout: android.view.DisplayCutout,
    density: Float,
  ): JSONObject? {
    return try {
      val path = findCutoutPath(displayCutout) ?: return null
      if (path.isEmpty) return null

      val bounds = RectF()
      path.computeBounds(bounds, /* exact= */ true)
      if (bounds.isEmpty) return null

      val r = Math.min(bounds.width(), bounds.height()) / 2f
      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (bounds.centerY() / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      obj
    } catch (_: Exception) {
      null
    }
  }

  /**
   * Walks the class hierarchy of [displayCutout] to locate and invoke the
   * hidden getCutoutPath() method.  This is necessary because getDeclaredMethod()
   * only searches the exact runtime class, not its superclasses.
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
