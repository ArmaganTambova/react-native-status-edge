package com.statusedge

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
      promise.resolve("{}")
      return
    }

    UiThreadUtil.runOnUiThread {
      val json = JSONObject()
      val rectsArray = JSONArray()
      var type = "None"
      var safeAreaTop = 0

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        val decorView = activity.window.decorView
        val rootInsets = decorView.rootWindowInsets

        if (rootInsets != null) {
            val displayCutout = rootInsets.displayCutout

            if (displayCutout != null) {
              safeAreaTop = displayCutout.safeInsetTop
              val rects = displayCutout.boundingRects

              if (rects.isNotEmpty()) {
                val mainRect = rects[0]

                for (rect in rects) {
                  val rectObj = JSONObject()
                  rectObj.put("x", rect.left)
                  rectObj.put("y", rect.top)
                  rectObj.put("width", rect.width())
                  rectObj.put("height", rect.height())
                  rectsArray.put(rectObj)
                }

                if (mainRect.top <= 0) {
                   type = "Notch"
                } else {
                   val width = mainRect.width()
                   val height = mainRect.height()
                   if (width.toDouble() > height.toDouble() * 1.5) {
                     type = "Island"
                   } else {
                     type = "Dot"
                   }
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
