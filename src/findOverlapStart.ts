import { fencesIn, insideFence } from './fences'
import { LEVELS } from './splitBlocks'
import type { TCountTokens, TSpan } from './types'


const boundaries = (text: string, span: TSpan, separators: RegExp[], whole: TSpan[]): number[] => {
	const body = text.slice(span.start, span.end)
	const found = separators.flatMap(separator => [...body.matchAll(separator)].map(match => span.start + match.index + match[0].length))
	return [...new Set(found)].filter(at => at < span.end && !insideFence(at, whole)).sort((a, b) => a - b)
}

// Earliest start whose tail fits; the tail only shrinks as the start moves right, so a binary search holds.
const earliestFit = (text: string, starts: number[], end: number, limit: number, countTokens: TCountTokens): number | undefined => {
	let low = 0
	let high = starts.length
	while (low < high) {
		const mid = (low + high) >> 1
		if (countTokens(text.slice(starts[mid], end)) <= limit) high = mid
		else low = mid + 1
	}
	return starts[low]
}


// Where the tail of `span` that repeats in the next chunk begins: at a sentence or line if one fits `limit`,
// else at a word, never inside a code fence the span holds whole; `span.end` when not even one word fits.
export const findOverlapStart = (text: string, span: TSpan, limit: number, countTokens: TCountTokens, fences: TSpan[]): number => {
	const whole = fencesIn(span, fences)
	const start = earliestFit(text, [span.start, ...boundaries(text, span, LEVELS.slice(0, 3), whole)], span.end, limit, countTokens)
		?? earliestFit(text, boundaries(text, span, LEVELS.slice(3), whole), span.end, limit, countTokens)
		?? span.end

	const lead = text.slice(start, span.end)
	return start + lead.length - lead.trimStart().length
}