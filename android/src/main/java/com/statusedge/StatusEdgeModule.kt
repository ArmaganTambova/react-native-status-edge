package com.statusedge

import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.DisplayCutout
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

    // Product requirement: Android 12+ only.
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      promise.resolve(buildDefaultJson().toString())
      return
    }

    UiThreadUtil.runOnUiThread {
      try {
        val result = JSONObject()
        val rectsArray = JSONArray()
        val circlesArray = JSONArray()

        val windowMetrics = activity.windowManager.currentWindowMetrics
        val displayCutout = windowMetrics.windowInsets.displayCutout

        @Suppress("DEPRECATION")
        val density = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
          windowMetrics.density
        } else {
          activity.resources.displayMetrics.density
        }

        if (displayCutout == null) {
          promise.resolve(buildDefaultJson().toString())
          return@runOnUiThread
        }

        val rectsPx = displayCutout.boundingRects
        if (rectsPx.isEmpty()) {
          result.put("cutoutType", "None")
          result.put("cutoutRects", rectsArray)
          result.put("cameraCircles", circlesArray)
          result.put("safeAreaTop", displayCutout.safeInsetTop / density)
          result.put("cutoutPathSvg", pathToSvg(displayCutout.cutoutPath))
          promise.resolve(result.toString())
          return@runOnUiThread
        }

        rectsPx.forEach { rect ->
          rectsArray.put(rectToDpJson(rect, density))
        }

        val safeInsetTopPx = displayCutout.safeInsetTop
        val screenWidthPx = windowMetrics.bounds.width().coerceAtLeast(1)
        val contours = getContourBounds(displayCutout.cutoutPath)
        val mainRect = selectMainRect(rectsPx, safeInsetTopPx)
        val type = classifyCutout(mainRect, safeInsetTopPx, screenWidthPx, contours)

        if (type == "Dot") {
          val circles = extractDotCircles(rectsPx, contours, density, safeInsetTopPx.toFloat())
          for (i in 0 until circles.length()) {
            circlesArray.put(circles.getJSONObject(i))
          }
        }

        result.put("cutoutType", type)
        result.put("cutoutRects", rectsArray)
        result.put("cameraCircles", circlesArray)
        result.put("safeAreaTop", safeInsetTopPx / density)
        result.put("cutoutPathSvg", pathToSvg(displayCutout.cutoutPath))

        promise.resolve(result.toString())
      } catch (e: Exception) {
        promise.reject("STATUS_EDGE_ERROR", e.message ?: "Unknown error", e)
      }
    }
  }

  private fun selectMainRect(rects: List<Rect>, safeInsetTopPx: Int): Rect {
    val topAttached = rects.filter { it.top <= safeInsetTopPx }
    return (if (topAttached.isNotEmpty()) topAttached else rects)
      .maxByOrNull { it.width() * it.height() }!!
  }

  private fun classifyCutout(
    mainRect: Rect,
    safeInsetTopPx: Int,
    screenWidthPx: Int,
    contours: List<RectF>,
  ): String {
    val widthRatio = mainRect.width().toFloat() / screenWidthPx.toFloat()
    val attachedToTop = mainRect.top <= safeInsetTopPx
    val aspectRatio = mainRect.width().toFloat() / mainRect.height().coerceAtLeast(1).toFloat()

    val roundContourOnMainRect = contours
      .filter { isRoundish(it) }
      .maxOfOrNull { intersectionScore(mainRect, it) }
      ?.let { it > 0.25f } == true

    // Critical fix: some punch-hole phones report a top-attached bounding rect;
    // avoid misclassifying them as WaterDrop.
    val likelyDot =
      (roundContourOnMainRect && widthRatio <= 0.16f) ||
      (!roundContourOnMainRect && widthRatio <= 0.12f && abs(aspectRatio - 1f) <= 0.45f)

    return if (attachedToTop) {
      when {
        widthRatio >= 0.22f -> "Notch"
        likelyDot -> "Dot"
        else -> "WaterDrop"
      }
    } else {
      if (widthRatio >= 0.18f || aspectRatio >= 2.2f) "Island" else "Dot"
    }
  }

  private fun extractDotCircles(
    rects: List<Rect>,
    contourBounds: List<RectF>,
    density: Float,
    safeInsetTopPx: Float,
  ): JSONArray {
    val circles = JSONArray()

    rects.forEach { rect ->
      val matchedContour = contourBounds
        .filter { isRoundish(it) }
        .maxByOrNull { intersectionScore(rect, it) }

      if (matchedContour != null && intersectionScore(rect, matchedContour) > 0f) {
        circles.put(contourToCircleJson(matchedContour, density, safeInsetTopPx))
      } else {
        circles.put(rectToCircleJson(rect, density, safeInsetTopPx))
      }
    }

    return circles
  }

  private fun getContourBounds(path: Path?): List<RectF> {
    if (path == null || path.isEmpty) return emptyList()

    val bounds = mutableListOf<RectF>()
    val measure = android.graphics.PathMeasure(path, false)

    do {
      val contourPath = Path()
      if (measure.length > 0f) {
        measure.getSegment(0f, measure.length, contourPath, true)
        val rect = RectF()
        contourPath.computeBounds(rect, true)
        if (!rect.isEmpty) {
          bounds.add(rect)
        }
      }
    } while (measure.nextContour())

    return bounds
  }

  private fun pathToSvg(path: Path?): String {
    if (path == null || path.isEmpty) return ""

    val points = path.approximate(0.5f)
    if (points.isEmpty()) return ""

    val builder = StringBuilder()
    var first = true
    for (i in points.indices step 3) {
      val x = points[i + 1]
      val y = points[i + 2]
      if (first) {
        builder.append("M ").append(x).append(' ').append(y)
        first = false
      } else {
        builder.append(" L ").append(x).append(' ').append(y)
      }
    }
    return builder.toString()
  }

  private fun isRoundish(rect: RectF): Boolean {
    val w = rect.width()
    val h = rect.height().coerceAtLeast(1f)
    val ratio = max(w, h) / min(w, h)
    return ratio <= 1.6f
  }

  private fun intersectionScore(rect: Rect, contour: RectF): Float {
    val left = max(rect.left.toFloat(), contour.left)
    val top = max(rect.top.toFloat(), contour.top)
    val right = min(rect.right.toFloat(), contour.right)
    val bottom = min(rect.bottom.toFloat(), contour.bottom)

    val iw = (right - left).coerceAtLeast(0f)
    val ih = (bottom - top).coerceAtLeast(0f)
    val inter = iw * ih
    if (inter <= 0f) return 0f

    val union = rect.width() * rect.height() + contour.width() * contour.height() - inter
    return if (union <= 0f) 0f else inter / union
  }

  private fun contourToCircleJson(rect: RectF, density: Float, safeInsetTopPx: Float): JSONObject {
    val diameter = (rect.width() + rect.height()) / 2f
    val r = diameter / 2f
    val cy = bestCy(
      centerY = rect.centerY(),
      bottomY = rect.bottom,
      heightPx = rect.height(),
      widthPx = rect.width(),
      r = r,
      safeInsetTopPx = safeInsetTopPx,
    )

    return JSONObject().apply {
      put("cx", rect.centerX() / density)
      put("cy", cy / density)
      put("r", r / density)
    }
  }

  private fun rectToCircleJson(rect: Rect, density: Float, safeInsetTopPx: Float): JSONObject {
    val r = min(rect.width(), rect.height()) / 2f
    val cy = bestCy(
      centerY = rect.exactCenterY(),
      bottomY = rect.bottom.toFloat(),
      heightPx = rect.height().toFloat(),
      widthPx = rect.width().toFloat(),
      r = r,
      safeInsetTopPx = safeInsetTopPx,
    )

    return JSONObject().apply {
      put("cx", rect.exactCenterX() / density)
      put("cy", cy / density)
      put("r", r / density)
    }
  }

  private fun bestCy(
    centerY: Float,
    bottomY: Float,
    heightPx: Float,
    widthPx: Float,
    r: Float,
    safeInsetTopPx: Float,
  ): Float {
    val tallColumn = heightPx > widthPx * 1.2f
    val candidate = if (tallColumn) bottomY - r else centerY

    if (!tallColumn && safeInsetTopPx > 0f) {
      val gapFraction = abs(safeInsetTopPx - bottomY) / safeInsetTopPx
      if (gapFraction < 0.05f) {
        return (candidate + safeInsetTopPx / 2f) / 2f
      }
    }

    return candidate
  }

  private fun rectToDpJson(rect: Rect, density: Float): JSONObject = JSONObject().apply {
    put("x", rect.left / density)
    put("y", rect.top / density)
    put("width", rect.width() / density)
    put("height", rect.height() / density)
  }

  private fun buildDefaultJson(): JSONObject = JSONObject().apply {
    put("cutoutType", "None")
    put("cutoutRects", JSONArray())
    put("cameraCircles", JSONArray())
    put("safeAreaTop", 0)
    put("cutoutPathSvg", "")
  }

  companion object {
    const val NAME = "StatusEdge"
  }
}
