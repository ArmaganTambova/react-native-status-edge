package com.statusedge

import android.os.Build
import android.util.DisplayMetrics
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
      val json = JSONObject()
      json.put("cutoutType", "None")
      json.put("cutoutRects", JSONArray())
      json.put("safeAreaTop", 0)
      promise.resolve(json.toString())
      return
    }

    // Restriction: Android 12+ (API 31+)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      val json = JSONObject()
      json.put("cutoutType", "None") // Or throw error? User said "won't work", implies simply not functioning.
      json.put("cutoutRects", JSONArray())
      json.put("safeAreaTop", 0)
      promise.resolve(json.toString())
      return
    }

    UiThreadUtil.runOnUiThread {
      val json = JSONObject()
      val rectsArray = JSONArray()
      var type = "None"
      var safeAreaTop = 0

      // We are guaranteed API 31+ here due to the check above
      val decorView = activity.window.decorView
      val rootInsets = decorView.rootWindowInsets

      if (rootInsets != null) {
          val displayCutout = rootInsets.displayCutout

          if (displayCutout != null) {
              safeAreaTop = displayCutout.safeInsetTop
              val rects = displayCutout.boundingRects

              if (rects.isNotEmpty()) {
                val metrics = DisplayMetrics()
                // API 31+ (S) guarantees windowManager.currentWindowMetrics or display.getRealMetrics availability
                activity.display?.getRealMetrics(metrics)

                val screenWidth = metrics.widthPixels

                // Assume the main cutout is the first one
                val mainRect = rects[0]

                for (rect in rects) {
                  val rectObj = JSONObject()
                  rectObj.put("x", rect.left)
                  rectObj.put("y", rect.top)
                  rectObj.put("width", rect.width())
                  rectObj.put("height", rect.height())
                  rectsArray.put(rectObj)
                }

                val width = mainRect.width()
                val isAttachedToTop = mainRect.top <= 0
                val widthRatio = width.toDouble() / screenWidth.toDouble()

                // Classification Logic
                if (isAttachedToTop) {
                    // Attached to top (Notch or Teardrop/Hole)
                    // If wider than 35% of screen -> Notch
                    if (widthRatio > 0.35) {
                        type = "Notch"
                    } else {
                        // Narrow -> Dot (Teardrop, etc.)
                        type = "Dot"
                    }
                } else {
                    // Detached (Floating)
                    // If wider than 35% of screen -> Island (Dynamic Island style)
                    if (widthRatio > 0.35) {
                        type = "Island"
                    } else {
                        // Small/Narrow -> Dot (Punch hole)
                        type = "Dot"
                    }
                }
              }
            }
        }

      json.put("cutoutType", type)
      json.put("cutoutRects", rectsArray)
      json.put("safeAreaTop", safeAreaTop)

      promise.resolve(json.toString())
    }
  }

  companion object {
    const val NAME = "StatusEdge"
  }
}
