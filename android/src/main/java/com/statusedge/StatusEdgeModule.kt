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

        // --- debug collector ---
        val debug = JSONObject()
        debug.put("density", density)
        debug.put("screenWidthPx", screenWidthPx)
        debug.put("screenHeightPx", screenHeightPx)

        // Read the raw hardware cutout spec for diagnostic purposes.
        val configSpec = readConfigSpec()
        debug.put("configSpec", configSpec ?: "not_found")

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
              // Strategy 1: parse physical cutout spec via fromSpec() reflection.
              val (circle1, err1) = tryExtractPhysicalCameraCircle(screenWidthPx, screenHeightPx, density)
              debug.put("strategy1_fromSpec_error", err1 ?: "ok")

              // Strategy 2: getCutoutPath() via full superclass traversal.
              val (circle2, bounds2, err2) = tryExtractCameraCircleViaPath(displayCutout, density)
              debug.put("strategy2_path_error", err2 ?: "ok")
              if (bounds2 != null) {
                debug.put("pathBounds", JSONObject().apply {
                  put("left",   bounds2.left   / density)
                  put("top",    bounds2.top    / density)
                  put("right",  bounds2.right  / density)
                  put("bottom", bounds2.bottom / density)
                  put("width",  bounds2.width()  / density)
                  put("height", bounds2.height() / density)
                  // Candidate cy values so we can compare on-device:
                  val r = Math.min(bounds2.width(), bounds2.height()) / 2f
                  put("cy_centerY",    bounds2.centerY()            / density)
                  put("cy_bottomMinR", (bounds2.bottom - r)         / density)
                })
              }

              val circle = circle1 ?: circle2

              if (circle != null) {
                cameraCirclesArray.put(circle)
              } else {
                // Strategy 3: safe-area rect fallback.
                debug.put("strategy3_rectFallback", "used")
                for (rect in rects) {
                  val r = Math.min(rect.width(), rect.height()) / 2f
                  val circleObj = JSONObject()
                  circleObj.put("cx", (rect.exactCenterX() / density).toDouble())
                  circleObj.put("cy", (rect.exactCenterY() / density).toDouble())
                  circleObj.put("r", (r / density).toDouble())
                  // Candidate cy for tall-column case:
                  val cyBottomAligned = (rect.bottom.toFloat() - r) / density
                  debug.put("rect_cy_centerY",    (rect.exactCenterY() / density).toDouble())
                  debug.put("rect_cy_bottomMinR", cyBottomAligned.toDouble())
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
        json.put("_debug", debug)

        promise.resolve(json.toString())
      } catch (e: Exception) {
        promise.reject("STATUS_EDGE_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy 1 — DisplayCutout.fromSpec() via reflection
  // ---------------------------------------------------------------------------

  private fun tryExtractPhysicalCameraCircle(
    screenWidthPx: Int,
    screenHeightPx: Int,
    density: Float,
  ): Pair<JSONObject?, String?> {
    return try {
      val spec = readConfigSpec() ?: return Pair(null, "config_spec_not_found")
      if (spec.isBlank() || spec.equals("none", ignoreCase = true))
        return Pair(null, "config_spec_empty_or_none")

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
        as? android.view.DisplayCutout
        ?: return Pair(null, "fromSpec_returned_null")

      val physRects = physical.boundingRects
      if (physRects.isEmpty()) return Pair(null, "fromSpec_boundingRects_empty")

      val rect = physRects.minByOrNull { it.top }
        ?: return Pair(null, "fromSpec_no_top_rect")
      if (rect.width() <= 0 || rect.height() <= 0)
        return Pair(null, "fromSpec_degenerate_rect")
      if (rect.width() > screenWidthPx / 2)
        return Pair(null, "fromSpec_rect_too_wide")

      val r = Math.min(rect.width(), rect.height()) / 2f
      val obj = JSONObject()
      obj.put("cx", (rect.exactCenterX() / density).toDouble())
      obj.put("cy", (rect.exactCenterY() / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      Pair(obj, null)
    } catch (e: Exception) {
      Pair(null, e.javaClass.simpleName + ": " + e.message)
    }
  }

  // ---------------------------------------------------------------------------
  // Strategy 2 — getCutoutPath() via superclass traversal
  // ---------------------------------------------------------------------------

  private fun tryExtractCameraCircleViaPath(
    displayCutout: android.view.DisplayCutout,
    density: Float,
  ): Triple<JSONObject?, RectF?, String?> {
    return try {
      val path = findCutoutPath(displayCutout)
        ?: return Triple(null, null, "getCutoutPath_not_found")
      if (path.isEmpty) return Triple(null, null, "getCutoutPath_empty")

      val bounds = RectF()
      path.computeBounds(bounds, true)
      if (bounds.isEmpty) return Triple(null, null, "path_bounds_empty")

      val r = Math.min(bounds.width(), bounds.height()) / 2f

      // If the path is a tall safe-area column (height > 1.2 × width) the camera
      // circle sits at the BOTTOM of the column.  Use cy = bottom - r.
      // Otherwise (path is approximately square = actual circle) use centerY.
      val cy = if (bounds.height() > bounds.width() * 1.2f) {
        bounds.bottom - r
      } else {
        bounds.centerY()
      }

      val obj = JSONObject()
      obj.put("cx", (bounds.centerX() / density).toDouble())
      obj.put("cy", (cy / density).toDouble())
      obj.put("r",  (r / density).toDouble())
      Triple(obj, bounds, null)
    } catch (e: Exception) {
      Triple(null, null, e.javaClass.simpleName + ": " + e.message)
    }
  }

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

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  private fun readConfigSpec(): String? {
    return try {
      val resources = android.content.res.Resources.getSystem()
      val id = resources.getIdentifier("config_mainBuiltInDisplayCutout", "string", "android")
      if (id == 0) null else resources.getString(id)
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
