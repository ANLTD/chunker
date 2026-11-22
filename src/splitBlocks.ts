import { fencesIn, insideFence } from './fences'
import type { TCountTokens, TCountedSpan, TSectionSpan, TSpan } from './types'


// Strongest to weakest: paragraphs, lines, sentences (CJK ones end without a space), words.
export const LEVELS = [
	/\n\s*\n/g,
	/\n/g,
	/[.!?…]+\s+|[。！？]+/g,
	/\s+/g
]


const insidePair = (text: string, at: number): boolean => {
	const code = text.charCodeAt(at)
	const prev = text.charCodeAt(at - 1)
	return code >= 0xDC00 && code <= 0xDFFF && prev >= 0xD800 && prev <= 0xDBFF
}


// Pieces of at most `max` tokens, cut at the strongest boundary the span has; each span is counted once.
export const splitBlocks = (
	text: string,
	span: TSectionSpan,
	max: number,
	countTokens: TCountTokens,
	fences: TSpan[],
	level = 0
): TCountedSpan[] => {
	const tokens = countTokens(text.slice(span.start, span.end))
	// One code point cannot be cut, whatever it counts.
	const single = span.end - span.start <= 1 || (span.end - span.start === 2 && insidePair(text, span.start + 1))
	if (tokens <= max || single) return [{ ...span, tokens }]

	// A code fence in the span stays whole, unless it is all the span has: then it is over max and cut like any text.
	const body = text.slice(span.start, span.end)
	const bodyStart = span.start + body.length - body.trimStart().length
	const bodyEnd = span.end - (body.length - body.trimEnd().length)
	const inner = fencesIn(span, fences)
	const whole = inner.filter(fence => bodyStart < fence.start || fence.end < bodyEnd)

	// The strongest level with a cut in the span; a cut falls right after its separator, so one at the span end is none.
	let found = level
	let cuts: number[] = []
	for (const separator of LEVELS.slice(level)) {
		cuts = [...body.matchAll(separator)]
			.map(match => span.start + match.index + match[0].length)
			.filter(at => at < span.end && !insideFence(at, whole))
		if (cuts.length) break
		found++
	}

	// Past the last level, cut evenly by length, never inside a surrogate pair.
	if (!cuts.length) {
		const pieces = Math.ceil(tokens / max)
		cuts = Array.from({ length: pieces - 1 }, (_, i) => {
			const at = span.start + Math.floor((span.end - span.start) * (i + 1) / pieces)
			if (!insidePair(text, at)) return at
			// Back off the pair, or forward when back is the span start, so every split makes progress.
			return at - 1 > span.start ? at - 1 : at + 1
		})
	}

	const parts: TSectionSpan[] = []
	let start = span.start
	for (const end of [...cuts, span.end]) {
		if (text.slice(start, end).trim()) parts.push({ ...span, start, end })
		start = end
	}

	// A part starts again at the same level: a fence that was kept whole may now be all the part has, and then
	// the cuts inside it at this level count. Elsewhere the part has none left, and moves on to the next level.
	return parts.flatMap(part => splitBlocks(text, part, max, countTokens, inner, found))
}