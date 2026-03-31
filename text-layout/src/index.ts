import { clearCache } from './vendor/pretext/layout.js'
import type { WhiteSpaceMode } from './vendor/pretext/analysis.js'
import { layoutStyledText, prepareStyledText, type PreparedStyledText, type StyledTextRun } from './styled-layout.js'

export type { WhiteSpaceMode } from './vendor/pretext/analysis.js'
export type { StyledTextRun }

export type TextLayoutSupportLevel = 'supported' | 'unsupported'
export type TextLayoutWidthRule = 'column' | 'full_width' | 'full_page'

export interface TextLayoutBoxModel {
  marginTopPx?: number
  marginBottomPx?: number
  paddingTopPx?: number
  paddingBottomPx?: number
  paddingLeftPx?: number
  paddingRightPx?: number
  borderTopPx?: number
  borderBottomPx?: number
  borderLeftPx?: number
  borderRightPx?: number
}

export interface TextLayoutSurface {
  surfaceId: string
  unitId: string
  nodeId: string
  kind: string
  theme?: string | null
  supportLevel: TextLayoutSupportLevel
  runs: StyledTextRun[]
  widthPx?: number
  widthRule?: TextLayoutWidthRule
  lineHeightPx: number
  minLineCount?: number
  whiteSpace?: WhiteSpaceMode
  direction?: 'ltr' | 'rtl' | 'auto'
  boxModel?: TextLayoutBoxModel
}

export interface PreparedTextSurface {
  surface: TextLayoutSurface
  prepared: PreparedStyledText
}

export interface TextSurfaceMeasurement {
  surfaceId: string
  unitId: string
  supported: boolean
  widthPx: number
  contentWidthPx: number
  lineCount: number
  textHeightPx: number
  totalHeightPx: number
}

function sumBox(values: Array<number | undefined>): number {
  let total = 0
  for (const value of values) {
    total += value ?? 0
  }
  return total
}

function getHorizontalInsets(surface: TextLayoutSurface): number {
  const boxModel = surface.boxModel ?? {}
  return sumBox([
    boxModel.paddingLeftPx,
    boxModel.paddingRightPx,
    boxModel.borderLeftPx,
    boxModel.borderRightPx,
  ])
}

function getVerticalInsets(surface: TextLayoutSurface): number {
  const boxModel = surface.boxModel ?? {}
  return sumBox([
    boxModel.marginTopPx,
    boxModel.marginBottomPx,
    boxModel.paddingTopPx,
    boxModel.paddingBottomPx,
    boxModel.borderTopPx,
    boxModel.borderBottomPx,
  ])
}

export function supportsSurface(surface: TextLayoutSurface): boolean {
  return surface.supportLevel === 'supported'
    && surface.runs.some((run) => run.text.length > 0)
    && ((surface.widthPx ?? 0) > 0)
}

export function prepareSurface(surface: TextLayoutSurface): PreparedTextSurface | null {
  if (!supportsSurface(surface)) return null
  return {
    surface,
    prepared: prepareStyledText(surface.runs),
  }
}

export function layoutSurface(preparedSurface: PreparedTextSurface, widthPx?: number): TextSurfaceMeasurement {
  const surface = preparedSurface.surface
  const resolvedWidth = Math.max(1, widthPx ?? surface.widthPx ?? 1)
  const contentWidthPx = Math.max(1, resolvedWidth - getHorizontalInsets(surface))
  const rawLayout = layoutStyledText(preparedSurface.prepared, contentWidthPx, surface.lineHeightPx)
  const lineCount = Math.max(surface.minLineCount ?? 0, rawLayout.lineCount)
  const textHeightPx = lineCount * surface.lineHeightPx
  const totalHeightPx = textHeightPx + getVerticalInsets(surface)

  return {
    surfaceId: surface.surfaceId,
    unitId: surface.unitId,
    supported: true,
    widthPx: resolvedWidth,
    contentWidthPx,
    lineCount,
    textHeightPx,
    totalHeightPx,
  }
}

export function measureTextSurfaces(surfaces: TextLayoutSurface[]): TextSurfaceMeasurement[] {
  return surfaces.map((surface) => {
    const preparedSurface = prepareSurface(surface)
    if (preparedSurface === null) {
      return {
        surfaceId: surface.surfaceId,
        unitId: surface.unitId,
        supported: false,
        widthPx: Math.max(1, surface.widthPx ?? 1),
        contentWidthPx: Math.max(1, (surface.widthPx ?? 1) - getHorizontalInsets(surface)),
        lineCount: 0,
        textHeightPx: 0,
        totalHeightPx: 0,
      }
    }
    return layoutSurface(preparedSurface)
  })
}

export function clearTextLayoutCache(): void {
  clearCache()
}
