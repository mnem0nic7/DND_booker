import { createCanvas } from '@napi-rs/canvas'
import { registerMeasurementContextFactory, type MeasureContextLike } from './vendor/pretext/measurement.js'

let registered = false

export function ensureNodeCanvasMeasurementBackend(): void {
  if (registered) return

  registerMeasurementContextFactory(() => {
    const context = createCanvas(1, 1).getContext('2d')
    return context as unknown as MeasureContextLike
  })

  registered = true
}
