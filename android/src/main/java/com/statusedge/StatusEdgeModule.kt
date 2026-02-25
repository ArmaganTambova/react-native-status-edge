package com.statusedge

import com.facebook.react.bridge.ReactApplicationContext

class StatusEdgeModule(reactContext: ReactApplicationContext) :
  NativeStatusEdgeSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Double {
    return a * b
  }

  companion object {
    const val NAME = NativeStatusEdgeSpec.NAME
  }
}
