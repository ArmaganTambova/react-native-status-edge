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
        val rawDensity = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          windowMetrics.density
        } else {
          activity.resources.displayMetrics.density
        }
        // Guard against a 0 / NaN density yielding NaN coordinates (JSONException).
        val density = if (rawDensity.isFinite() && rawDensity > 0f) rawDensity else 1f

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
          val circles = extractCameraCircles(rectsPx, pathBounds, density)
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
   * The camera circle is the CENTRE of the cutout's bounding box (see
   * circleFromBounds). On a single cutout we prefer the precise path bounds
   * (sub-pixel cx / width); otherwise we emit one circle per bounding rect.
   */
  private fun extractCameraCircles(
    rects: List<Rect>,
    pathBounds: RectF?,
    density: Float,
  ): JSONArray {
    val circles = JSONArray()

    // Single cutout with a usable path → use the precise path bounds.
    if (pathBounds != null && rects.size == 1) {
      circles.put(circleFromBounds(pathBounds, density))
      return circles
    }

    // Otherwise one circle per bounding rect.
    rects.forEach { circles.put(circleFromBounds(RectF(it), density)) }
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
  // Circle helper
  // ---------------------------------------------------------------------------

  /**
   * Camera circle from the cutout's bounding box: centre = box centre,
   * radius = half the SHORTER side.
   *
   * Samsung One UI reports a center punch-hole not as the bare circle but as a
   * vertical SAFE-AREA STRIPE the width of the camera hole, spanning from the
   * top of the screen (y = 0) down to safeInsetTop. Android does NOT encode
   * where the lens sits inside that stripe — the cutout path is a featureless
   * rectangle (verified on a real Samsung device: ~18.7×34.1 dp from y=0, no
   * arc) — so neither the top nor the bottom edge is the lens. Empirically the
   * lens is mid-stripe, so the geometric CENTRE is the best estimate
   * (top-anchoring rendered ~8 dp too high, bottom-anchoring ~8 dp too low).
   *
   * For AOSP / Pixel / OnePlus the bounding box IS the real circle, so the
   * centre and half-width are exact (a no-op vs the old behaviour).
   *
   * radius uses min(width, height): width is the uncontaminated lens-diameter
   * axis — the Samsung stripe inflates only the height.
   *
   *   r  = min(width, height) / 2
   *   cx = bounds.centerX
   *   cy = bounds.centerY
   */
  private fun circleFromBounds(bounds: RectF, density: Float): JSONObject {
    val r = min(bounds.width(), bounds.height()) / 2f
    return JSONObject().apply {
      put("cx", (bounds.centerX() / density).toDouble())
      put("cy", (bounds.centerY() / density).toDouble())
      put("r",  (r                / density).toDouble())
    }
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
