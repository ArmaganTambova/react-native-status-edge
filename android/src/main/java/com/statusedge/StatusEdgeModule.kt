package com.statusedge

import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class StatusEdgeModule(reactContext: ReactApplicationContext) :
  NativeStatusEdgeSpec(reactContext) {

  override fun getName(): String = NAME

  @ReactMethod
  override fun getCutoutData(promise: Promise) {
    val activity = currentActivity
    if (activity == null) {
      promise.resolve(buildDefaultJson().toString())
      return
    }

    // Android 12 (API 31) minimum: getCutoutPath() and WindowMetrics.getWindowInsets()
    // are both available here — no older-version fallbacks needed.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(buildDefaultJson().toString())
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val result     = JSONObject()
        val rectsArray = JSONArray()
        val circlesArray = JSONArray()

        val windowMetrics = activity.windowManager.currentWindowMetrics

        // WindowMetrics.getDensity() (API 34+) is window-accurate and handles
        // multi-display and accessibility display-size scaling. Below API 34 we
        // fall back to the activity's display metrics (activity is a UiContext).
        @Suppress("DEPRECATION")
        val density = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          windowMetrics.density
        } else {
          activity.resources.displayMetrics.density
        }

        // WindowMetrics.getWindowInsets() (API 30+) does not require view attachment
        // and always reflects the current window state — preferred over
        // decorView.getRootWindowInsets() which can be null before the first layout.
        val displayCutout = windowMetrics.windowInsets.displayCutout
        if (displayCutout == null) {
          promise.resolve(buildDefaultJson().toString())
          return@runOnUiThread
        }

        val safeInsetTopPx = displayCutout.safeInsetTop
        val screenWidthPx  = windowMetrics.bounds.width().coerceAtLeast(1)

        // getCutoutPath() — public API since Android 12 (API 31).
        // Returns the exact geometric shape of the physical cutout as configured
        // by the OEM in their system resources.
        //   • AOSP / Pixel / OnePlus: returns the precise camera-hole circle.
        //   • Samsung One UI: may return the full status-bar safe-area slab
        //     (tall rectangle) instead of just the camera circle.
        // We resolve this ambiguity by checking the path's aspect ratio before
        // trusting it as the camera shape.
        val cutoutPath: Path? = displayCutout.cutoutPath

        // Tightest axis-aligned bounding box of the entire path (all contours).
        // Path.computeBounds() is more reliable than PathMeasure.getSegment() for
        // obtaining accurate bounds of bezier-curve paths (circles are stored as
        // cubic beziers in Android; PathMeasure linearises them which can skew bounds).
        val pathBounds: RectF? = computePathBounds(cutoutPath)

        val rectsPx = displayCutout.boundingRects
        if (rectsPx.isEmpty()) {
          result.put("cutoutType",      "None")
          result.put("cutoutRects",     rectsArray)
          result.put("cameraCircles",   circlesArray)
          result.put("safeAreaTop",     safeInsetTopPx / density)
          result.put("cutoutPathSvg",   buildPathSvg(cutoutPath))
          result.put("cutoutPathBounds", pathBounds?.let { boundsToJson(it, density) })
          promise.resolve(result.toString())
          return@runOnUiThread
        }

        rectsPx.forEach { rectsArray.put(rectToDpJson(it, density)) }

        val mainRect = selectMainRect(rectsPx, safeInsetTopPx)
        val type     = classifyCutout(mainRect, safeInsetTopPx, screenWidthPx, pathBounds)

        if (type == "Dot" || type == "Island") {
          val circles = extractCameraCircles(
            rectsPx, pathBounds, density, safeInsetTopPx.toFloat()
          )
          for (i in 0 until circles.length()) {
            circlesArray.put(circles.getJSONObject(i))
          }
        }

        result.put("cutoutType",      type)
        result.put("cutoutRects",     rectsArray)
        result.put("cameraCircles",   circlesArray)
        result.put("safeAreaTop",     safeInsetTopPx / density)
        result.put("cutoutPathSvg",   buildPathSvg(cutoutPath))
        result.put("cutoutPathBounds", pathBounds?.let { boundsToJson(it, density) })

        promise.resolve(result.toString())
      } catch (e: Exception) {
        promise.reject("STATUS_EDGE_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Cutout selection & classification
  // ---------------------------------------------------------------------------

  private fun selectMainRect(rects: List<Rect>, safeInsetTopPx: Int): Rect {
    val topAttached = rects.filter { it.top <= safeInsetTopPx }
    return (if (topAttached.isNotEmpty()) topAttached else rects)
      .maxByOrNull { it.width() * it.height() }!!
  }

  /**
   * Classifies the primary cutout as one of: Notch, WaterDrop, Dot, Island.
   *
   * Two independent signals are combined:
   *
   * 1. Bounding-rect aspect ratio (width / height) — PRIMARY.
   *    A punch-hole (Dot) camera is circular → bounding rect is roughly square
   *    (ratio ≈ 1.0).  A WaterDrop notch is wider than it is tall (ratio > 1.4).
   *    This signal is reliable regardless of what getCutoutPath() returns.
   *
   * 2. Path bounding-box aspect ratio — SECONDARY.
   *    When getCutoutPath() returns the actual camera circle (AOSP, Pixel,
   *    OnePlus, etc.) the path bounds are also roughly square. When it returns a
   *    Samsung safe-area slab the path bounds are tall/wide, so this signal is
   *    simply ignored and we rely on signal 1.
   */
  private fun classifyCutout(
    mainRect: Rect,
    safeInsetTopPx: Int,
    screenWidthPx: Int,
    pathBounds: RectF?,
  ): String {
    val widthRatio    = mainRect.width().toFloat() / screenWidthPx.toFloat()
    val attachedToTop = mainRect.top <= safeInsetTopPx
    val rectAspect    = mainRect.width().toFloat() / mainRect.height().coerceAtLeast(1).toFloat()

    // Signal 1: square-ish bounding rect → punch-hole
    val rectIsCircular  = rectAspect <= 1.5f
    // Signal 2: square-ish path bounds → path itself is the camera circle
    val pathIsCircular  = pathBounds != null && isRoundish(pathBounds)

    // A punch-hole bounding rect is < 8 mm on any screen; with OEM padding it
    // stays below ~17 % of screen width. A path-confirmed circle can be up to
    // 20 % (some path bounds are wider due to safe-area inflation on some OEMs).
    val likelyDot =
      (pathIsCircular  && widthRatio <= 0.20f) ||
      (rectIsCircular  && widthRatio <= 0.17f)

    return if (attachedToTop) {
      when {
        widthRatio >= 0.22f -> "Notch"
        likelyDot           -> "Dot"
        else                -> "WaterDrop"
      }
    } else {
      if (widthRatio >= 0.18f || rectAspect >= 2.2f) "Island" else "Dot"
    }
  }

  // ---------------------------------------------------------------------------
  // Camera circle extraction
  // ---------------------------------------------------------------------------

  /**
   * Returns one {cx, cy, r} JSON object per physical camera hole (in dp).
   *
   * Priority:
   * 1. getCutoutPath() returned a circular shape AND there is exactly one
   *    bounding rect → path bounds ARE the camera circle. Sub-pixel accurate
   *    on AOSP / Pixel / OnePlus and most standard OEMs.
   * 2. Fallback (Samsung slab, multi-cutout, null path): one circle per
   *    bounding rect. The bounding rect is always the physical camera area.
   *    bestCy() corrects for OEM-specific vertical offsets.
   */
  private fun extractCameraCircles(
    rects: List<Rect>,
    pathBounds: RectF?,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONArray {
    val circles = JSONArray()

    // Path-first strategy: circular path + single cutout → use path bounds.
    if (pathBounds != null && isRoundish(pathBounds) && rects.size == 1) {
      circles.put(boundsToCircleJson(pathBounds, density, safeInsetTopPx))
      return circles
    }

    // Rect fallback: one circle per bounding rect.
    rects.forEach { circles.put(rectToCircleJson(it, density, safeInsetTopPx)) }
    return circles
  }

  // ---------------------------------------------------------------------------
  // Path utilities
  // ---------------------------------------------------------------------------

  /**
   * Returns the tightest axis-aligned bounding box of all path contours.
   *
   * Path.computeBounds() is used instead of PathMeasure.getSegment() because
   * getSegment() linearises bezier curves before computing bounds, which can
   * produce slightly inaccurate results for the cubic-bezier circles that
   * Android uses to encode punch-hole cutout shapes.
   */
  private fun computePathBounds(path: Path?): RectF? {
    if (path == null || path.isEmpty) return null
    val b = RectF()
    path.computeBounds(b, /* exact= */ true)
    return if (b.isEmpty) null else b
  }

  /**
   * Approximate SVG polyline of the cutout path for the JS layer.
   *
   * Coordinates are in physical display pixels (px), origin at the TOP-LEFT of
   * the screen (same as Android's Canvas / View coordinate system).
   * Divide each coordinate by the 'density' field to convert to dp.
   *
   * Error tolerance 0.5 px gives high fidelity at ~200–800 chars for a
   * typical punch-hole camera circle.
   */
  private fun buildPathSvg(path: Path?): String {
    if (path == null || path.isEmpty) return ""
    val pts = path.approximate(0.5f)
    if (pts.isEmpty()) return ""
    val sb = StringBuilder()
    var first = true
    for (i in pts.indices step 3) {
      val x = pts[i + 1]
      val y = pts[i + 2]
      if (first) { sb.append("M ").append(x).append(' ').append(y); first = false }
      else        sb.append(" L ").append(x).append(' ').append(y)
    }
    return sb.toString()
  }

  // ---------------------------------------------------------------------------
  // Circle helpers
  // ---------------------------------------------------------------------------

  /**
   * Camera circle from the cutout path's bounding box.
   * Uses (width + height) / 2 as the diameter to absorb minor asymmetry from
   * the bezier-to-polyline approximation inside computeBounds().
   */
  private fun boundsToCircleJson(
    bounds: RectF,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONObject {
    val diameter = (bounds.width() + bounds.height()) / 2f
    val r  = diameter / 2f
    val cy = bestCy(bounds.centerY(), bounds.bottom, bounds.height(), bounds.width(), r, safeInsetTopPx)
    return JSONObject().apply {
      put("cx", (bounds.centerX() / density).toDouble())
      put("cy", (cy / density).toDouble())
      put("r",  (r  / density).toDouble())
    }
  }

  /** Camera circle from a bounding rect. Radius = half the shorter side. */
  private fun rectToCircleJson(
    rect: Rect,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONObject {
    val r  = min(rect.width(), rect.height()) / 2f
    val cy = bestCy(
      rect.exactCenterY(), rect.bottom.toFloat(),
      rect.height().toFloat(), rect.width().toFloat(), r, safeInsetTopPx
    )
    return JSONObject().apply {
      put("cx", (rect.exactCenterX() / density).toDouble())
      put("cy", (cy / density).toDouble())
      put("r",  (r  / density).toDouble())
    }
  }

  /**
   * Best-estimate camera circle centre Y (pixels).
   *
   * OEM corrections applied:
   *
   * A) Tall safe-area column — some OEMs (historically Samsung One UI < 6)
   *    provide a column shape whose bottom = safeInsetTop and whose width equals
   *    the camera diameter. The physical camera sits at the TOP of this column:
   *      cy = column.bottom − r
   *
   * B) Bottom-aligned circle — some OEMs anchor a circular path/rect so its
   *    bottom edge is flush with the status-bar bottom (gap < 5 % of
   *    safeInsetTop). The true camera lens is physically slightly higher than
   *    the geometric centre of that circle; blending 50/50 with the status-bar
   *    midpoint corrects the offset:
   *      cy = (geometricCentre + safeInsetTop/2) / 2
   */
  private fun bestCy(
    centerY: Float,
    bottomY: Float,
    heightPx: Float,
    widthPx: Float,
    r: Float,
    safeInsetTopPx: Float,
  ): Float {
    val tallColumn = heightPx > widthPx * 1.2f
    val candidate  = if (tallColumn) bottomY - r else centerY

    if (!tallColumn && safeInsetTopPx > 0f) {
      val gapFraction = abs(safeInsetTopPx - bottomY) / safeInsetTopPx
      if (gapFraction < 0.05f) {
        return (candidate + safeInsetTopPx / 2f) / 2f
      }
    }
    return candidate
  }

  // ---------------------------------------------------------------------------
  // JSON helpers
  // ---------------------------------------------------------------------------

  /** True when a rect's longer side is ≤ 1.6× its shorter side (roughly circular). */
  private fun isRoundish(rect: RectF): Boolean {
    val w = rect.width()
    val h = rect.height().coerceAtLeast(1f)
    return max(w, h) / min(w, h) <= 1.6f
  }

  private fun rectToDpJson(rect: Rect, density: Float): JSONObject = JSONObject().apply {
    put("x",      rect.left          / density)
    put("y",      rect.top           / density)
    put("width",  rect.width()       / density)
    put("height", rect.height()      / density)
  }

  private fun boundsToJson(bounds: RectF, density: Float): JSONObject = JSONObject().apply {
    put("x",      (bounds.left       / density).toDouble())
    put("y",      (bounds.top        / density).toDouble())
    put("width",  (bounds.width()    / density).toDouble())
    put("height", (bounds.height()   / density).toDouble())
  }

  private fun buildDefaultJson(): JSONObject = JSONObject().apply {
    put("cutoutType",      "None")
    put("cutoutRects",     JSONArray())
    put("cameraCircles",   JSONArray())
    put("safeAreaTop",     0)
    put("cutoutPathSvg",   "")
    put("cutoutPathBounds", JSONObject.NULL)
  }

  companion object {
    const val NAME = "StatusEdge"
  }
}
