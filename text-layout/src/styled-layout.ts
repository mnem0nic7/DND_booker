import {
  analyzeText,
  endsWithClosingQuote,
  isCJK,
  kinsokuEnd,
  kinsokuStart,
  leftStickyPunctuation,
  type AnalysisChunk,
  type SegmentBreakKind,
  type WhiteSpaceMode,
} from './vendor/pretext/analysis.js'
import {
  getCorrectedSegmentWidth,
  getEngineProfile,
  getFontMeasurementState,
  getSegmentGraphemeWidths,
  getSegmentMetrics,
  textMayContainEmoji,
} from './vendor/pretext/measurement.js'
import { countPreparedLines } from './vendor/pretext/line-break.js'

export interface StyledTextRun {
  text: string
  fontFamily: string
  fontSizePx: number
  fontWeight?: string | number
  fontStyle?: string
  whiteSpace?: WhiteSpaceMode
  direction?: 'ltr' | 'rtl' | 'auto'
  letterSpacingPx?: number
}

export interface PreparedStyledText {
  widths: number[]
  lineEndFitAdvances: number[]
  lineEndPaintAdvances: number[]
  kinds: SegmentBreakKind[]
  simpleLineWalkFastPath: boolean
  breakableWidths: (number[] | null)[]
  breakablePrefixWidths: (number[] | null)[]
  discretionaryHyphenWidth: number
  tabStopAdvance: number
  chunks: AnalysisChunk[]
  segments: string[]
  runIndexes: number[]
}

export interface StyledTextLayoutResult {
  lineCount: number
  height: number
}

interface PreparedRun {
  widths: number[]
  lineEndFitAdvances: number[]
  lineEndPaintAdvances: number[]
  kinds: SegmentBreakKind[]
  simpleLineWalkFastPath: boolean
  breakableWidths: (number[] | null)[]
  breakablePrefixWidths: (number[] | null)[]
  discretionaryHyphenWidth: number
  tabStopAdvance: number
  chunks: AnalysisChunk[]
  segments: string[]
}

let sharedGraphemeSegmenter: Intl.Segmenter | null = null

function getSharedGraphemeSegmenter(): Intl.Segmenter {
  if (sharedGraphemeSegmenter === null) {
    sharedGraphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
  return sharedGraphemeSegmenter
}

function countGraphemes(text: string): number {
  let count = 0
  for (const _grapheme of getSharedGraphemeSegmenter().segment(text)) {
    count++
  }
  return count
}

function formatFont(run: StyledTextRun): string {
  const style = run.fontStyle && run.fontStyle !== 'normal' ? `${run.fontStyle} ` : ''
  const weight = run.fontWeight !== undefined && run.fontWeight !== 'normal' ? `${run.fontWeight} ` : ''
  return `${style}${weight}${run.fontSizePx}px ${run.fontFamily}`.trim()
}

function applyLetterSpacingToSegmentWidth(width: number, text: string, letterSpacingPx: number): number {
  if (!Number.isFinite(letterSpacingPx) || Math.abs(letterSpacingPx) < 0.001) return width
  return width + (Math.max(0, countGraphemes(text) - 1) * letterSpacingPx)
}

function adjustBreakableGraphemeAdvances(
  graphemeWidths: number[] | null,
  letterSpacingPx: number,
): number[] | null {
  if (graphemeWidths === null) return null
  if (!Number.isFinite(letterSpacingPx) || Math.abs(letterSpacingPx) < 0.001) {
    return graphemeWidths
  }

  return graphemeWidths.map((width, index) => (
    index < graphemeWidths.length - 1 ? width + letterSpacingPx : width
  ))
}

function buildPrefixWidths(advances: number[] | null): number[] | null {
  if (advances === null) return null
  let total = 0
  return advances.map((width) => {
    total += width
    return total
  })
}

function mapAnalysisChunksToPreparedChunks(
  chunks: AnalysisChunk[],
  preparedStartByAnalysisIndex: number[],
  preparedEndByAnalysisIndex: number[],
): AnalysisChunk[] {
  const preparedChunks: AnalysisChunk[] = []
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!
    const startSegmentIndex =
      chunk.startSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.startSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0
    const endSegmentIndex =
      chunk.endSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.endSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0
    const consumedEndSegmentIndex =
      chunk.consumedEndSegmentIndex < preparedStartByAnalysisIndex.length
        ? preparedStartByAnalysisIndex[chunk.consumedEndSegmentIndex]!
        : preparedEndByAnalysisIndex[preparedEndByAnalysisIndex.length - 1] ?? 0

    preparedChunks.push({
      startSegmentIndex,
      endSegmentIndex,
      consumedEndSegmentIndex,
    })
  }

  return preparedChunks
}

function measureRun(run: StyledTextRun): PreparedRun {
  const text = run.text ?? ''
  const whiteSpace = run.whiteSpace ?? 'normal'
  const analysis = analyzeText(text, getEngineProfile(), whiteSpace)
  const font = formatFont(run)
  const letterSpacingPx = run.letterSpacingPx ?? 0
  const graphemeSegmenter = getSharedGraphemeSegmenter()
  const engineProfile = getEngineProfile()
  const { cache, emojiCorrection } = getFontMeasurementState(
    font,
    textMayContainEmoji(analysis.normalized),
  )
  const hyphenMetrics = getSegmentMetrics('-', cache)
  const discretionaryHyphenWidth = applyLetterSpacingToSegmentWidth(
    getCorrectedSegmentWidth('-', hyphenMetrics, emojiCorrection),
    '-',
    letterSpacingPx,
  )
  const spaceMetrics = getSegmentMetrics(' ', cache)
  const spaceWidth = applyLetterSpacingToSegmentWidth(
    getCorrectedSegmentWidth(' ', spaceMetrics, emojiCorrection),
    ' ',
    letterSpacingPx,
  )
  const tabStopAdvance = spaceWidth * 8

  if (analysis.len === 0) {
    return {
      widths: [],
      lineEndFitAdvances: [],
      lineEndPaintAdvances: [],
      kinds: [],
      simpleLineWalkFastPath: true,
      breakableWidths: [],
      breakablePrefixWidths: [],
      discretionaryHyphenWidth,
      tabStopAdvance,
      chunks: [],
      segments: [],
    }
  }

  const widths: number[] = []
  const lineEndFitAdvances: number[] = []
  const lineEndPaintAdvances: number[] = []
  const kinds: SegmentBreakKind[] = []
  const segments: string[] = []
  let simpleLineWalkFastPath = analysis.chunks.length <= 1
  const breakableWidths: (number[] | null)[] = []
  const breakablePrefixWidths: (number[] | null)[] = []
  const preparedStartByAnalysisIndex = Array.from<number>({ length: analysis.len })
  const preparedEndByAnalysisIndex = Array.from<number>({ length: analysis.len })

  function pushMeasuredSegment(
    textSegment: string,
    width: number,
    lineEndFitAdvance: number,
    lineEndPaintAdvance: number,
    kind: SegmentBreakKind,
    breakable: number[] | null,
    breakablePrefix: number[] | null,
  ): void {
    if (kind !== 'text' && kind !== 'space' && kind !== 'zero-width-break') {
      simpleLineWalkFastPath = false
    }
    widths.push(width)
    lineEndFitAdvances.push(lineEndFitAdvance)
    lineEndPaintAdvances.push(lineEndPaintAdvance)
    kinds.push(kind)
    segments.push(textSegment)
    breakableWidths.push(breakable)
    breakablePrefixWidths.push(breakablePrefix)
  }

  for (let mi = 0; mi < analysis.len; mi++) {
    preparedStartByAnalysisIndex[mi] = widths.length
    const segText = analysis.texts[mi]!
    const segWordLike = analysis.isWordLike[mi]!
    const segKind = analysis.kinds[mi]!

    if (segKind === 'soft-hyphen') {
      pushMeasuredSegment(
        segText,
        0,
        discretionaryHyphenWidth,
        discretionaryHyphenWidth,
        segKind,
        null,
        null,
      )
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    if (segKind === 'hard-break' || segKind === 'tab') {
      pushMeasuredSegment(segText, 0, 0, 0, segKind, null, null)
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    const segMetrics = getSegmentMetrics(segText, cache)

    if (segKind === 'text' && segMetrics.containsCJK) {
      let unitText = ''

      for (const gs of graphemeSegmenter.segment(segText)) {
        const grapheme = gs.segment
        if (unitText.length === 0) {
          unitText = grapheme
          continue
        }

        if (
          kinsokuEnd.has(unitText) ||
          kinsokuStart.has(grapheme) ||
          leftStickyPunctuation.has(grapheme) ||
          (engineProfile.carryCJKAfterClosingQuote &&
            isCJK(grapheme) &&
            endsWithClosingQuote(unitText))
        ) {
          unitText += grapheme
          continue
        }

        const unitMetrics = getSegmentMetrics(unitText, cache)
        const unitWidth = applyLetterSpacingToSegmentWidth(
          getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection),
          unitText,
          letterSpacingPx,
        )
        pushMeasuredSegment(unitText, unitWidth, unitWidth, unitWidth, 'text', null, null)
        unitText = grapheme
      }

      if (unitText.length > 0) {
        const unitMetrics = getSegmentMetrics(unitText, cache)
        const unitWidth = applyLetterSpacingToSegmentWidth(
          getCorrectedSegmentWidth(unitText, unitMetrics, emojiCorrection),
          unitText,
          letterSpacingPx,
        )
        pushMeasuredSegment(unitText, unitWidth, unitWidth, unitWidth, 'text', null, null)
      }
      preparedEndByAnalysisIndex[mi] = widths.length
      continue
    }

    const segmentWidth = applyLetterSpacingToSegmentWidth(
      getCorrectedSegmentWidth(segText, segMetrics, emojiCorrection),
      segText,
      letterSpacingPx,
    )
    const lineEndFitAdvance =
      segKind === 'space' || segKind === 'preserved-space' || segKind === 'zero-width-break'
        ? 0
        : segmentWidth
    const lineEndPaintAdvance =
      segKind === 'space' || segKind === 'zero-width-break'
        ? 0
        : segmentWidth

    if (segWordLike && segText.length > 1) {
      const rawGraphemeAdvances = getSegmentGraphemeWidths(segText, segMetrics, cache, emojiCorrection)
      const graphemeAdvances = adjustBreakableGraphemeAdvances(rawGraphemeAdvances, letterSpacingPx)
      const graphemePrefixWidths = engineProfile.preferPrefixWidthsForBreakableRuns
        ? buildPrefixWidths(graphemeAdvances)
        : null

      pushMeasuredSegment(
        segText,
        segmentWidth,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        segKind,
        graphemeAdvances,
        graphemePrefixWidths ?? buildPrefixWidths(graphemeAdvances),
      )
    } else {
      pushMeasuredSegment(
        segText,
        segmentWidth,
        lineEndFitAdvance,
        lineEndPaintAdvance,
        segKind,
        null,
        null,
      )
    }
    preparedEndByAnalysisIndex[mi] = widths.length
  }

  return {
    widths,
    lineEndFitAdvances,
    lineEndPaintAdvances,
    kinds,
    simpleLineWalkFastPath,
    breakableWidths,
    breakablePrefixWidths,
    discretionaryHyphenWidth,
    tabStopAdvance,
    chunks: mapAnalysisChunksToPreparedChunks(analysis.chunks, preparedStartByAnalysisIndex, preparedEndByAnalysisIndex),
    segments,
  }
}

export function prepareStyledText(runs: StyledTextRun[]): PreparedStyledText {
  const widths: number[] = []
  const lineEndFitAdvances: number[] = []
  const lineEndPaintAdvances: number[] = []
  const kinds: SegmentBreakKind[] = []
  const breakableWidths: (number[] | null)[] = []
  const breakablePrefixWidths: (number[] | null)[] = []
  const chunks: AnalysisChunk[] = []
  const segments: string[] = []
  const runIndexes: number[] = []
  let simpleLineWalkFastPath = true
  let discretionaryHyphenWidth = 0
  let tabStopAdvance = 0

  runs.forEach((run, runIndex) => {
    if (!run.text) return
    const preparedRun = measureRun(run)
    const segmentOffset = widths.length

    widths.push(...preparedRun.widths)
    lineEndFitAdvances.push(...preparedRun.lineEndFitAdvances)
    lineEndPaintAdvances.push(...preparedRun.lineEndPaintAdvances)
    kinds.push(...preparedRun.kinds)
    breakableWidths.push(...preparedRun.breakableWidths)
    breakablePrefixWidths.push(...preparedRun.breakablePrefixWidths)
    segments.push(...preparedRun.segments)
    runIndexes.push(...preparedRun.segments.map(() => runIndex))
    simpleLineWalkFastPath = simpleLineWalkFastPath && preparedRun.simpleLineWalkFastPath
    discretionaryHyphenWidth = Math.max(discretionaryHyphenWidth, preparedRun.discretionaryHyphenWidth)
    tabStopAdvance = Math.max(tabStopAdvance, preparedRun.tabStopAdvance)

    for (const chunk of preparedRun.chunks) {
      chunks.push({
        startSegmentIndex: chunk.startSegmentIndex + segmentOffset,
        endSegmentIndex: chunk.endSegmentIndex + segmentOffset,
        consumedEndSegmentIndex: chunk.consumedEndSegmentIndex + segmentOffset,
      })
    }
  })

  return {
    widths,
    lineEndFitAdvances,
    lineEndPaintAdvances,
    kinds,
    simpleLineWalkFastPath,
    breakableWidths,
    breakablePrefixWidths,
    discretionaryHyphenWidth,
    tabStopAdvance,
    chunks,
    segments,
    runIndexes,
  }
}

export function layoutStyledText(
  prepared: PreparedStyledText,
  maxWidth: number,
  lineHeight: number,
): StyledTextLayoutResult {
  const lineCount = countPreparedLines(prepared, maxWidth)
  return {
    lineCount,
    height: lineCount * lineHeight,
  }
}
