import { MAX_TOKENS, MIN_TOKENS, RULES_VERSION, TARGET_TOKENS } from './constants'
import { findFences } from './fences'
import { findOverlapStart } from './findOverlapStart'
import { mergeSmall } from './mergeSmall'
import { packChunks } from './packChunks'
import { splitBlocks } from './splitBlocks'
import { splitSections } from './splitSections'
import type { TChunk, TChunkOptions, TChunkResult } from './types'


// Sections at headings, pieces under the budget, packed up to the target, small ones merged.
export const chunkText = (text: string, options: TChunkOptions): TChunkResult => {
	const { countTokens, buildHeader, min = MIN_TOKENS, target = TARGET_TOKENS, max = MAX_TOKENS, overlap = 0 } = options ?? {}
	if (typeof countTokens !== 'function') throw new TypeError('countTokens is required: pass the tokenizer of your embedding model')
	if (!(max >= 1)) throw new RangeError('max must be at least 1')
	if (!(overlap >= 0 && overlap < max)) throw new RangeError('overlap must be from 0 to below max')
	if (!(target >= 1)) throw new RangeError('target must be at least 1')
	if (!(min >= 0)) throw new RangeError('min must be 0 or more')

	const fences = findFences(text)
	const sections = splitSections(text, fences)

	// The header and the overlap are reserved, so a chunk with both stays within max. The budget depends only on
	// the chunk's own path, so neither a neighbor nor a heading elsewhere moves its cuts. An empty header takes nothing.
	const bodyMax = (path: string[]): number => {
		const header = buildHeader?.(path)
		return max - overlap - (header ? countTokens(`${header}\n\n`) : 0)
	}

	const packed = sections.flatMap(section => {
		const limit = bodyMax(section.path)
		if (!(limit >= 1)) throw new RangeError('buildHeader and overlap must leave room for text below max')
		const pieces = splitBlocks(text, section, limit, countTokens, fences)
		return packChunks(pieces, Math.min(target, limit))
	})
	const bodies = mergeSmall(text, packed, min, target, bodyMax).map((chunk): Omit<TChunk, 'overlapStart' | 'text'> => {
		const raw = text.slice(chunk.start, chunk.end)
		return {
			start: chunk.start + raw.length - raw.trimStart().length,
			end: chunk.end - (raw.length - raw.trimEnd().length),
			path: chunk.path
		}
	})

	// The overlap comes only from the section the chunk starts in, so a new heading starts clean.
	let section = 0
	const chunks = bodies.map((body, i): TChunk => {
		while ((sections[section + 1]?.start ?? Infinity) <= body.start) section++
		const prev = bodies[i - 1]
		const from = Math.max(prev?.start ?? 0, sections[section]?.start ?? 0)
		// Counted up to the body, so the whitespace between the two counts toward the overlap.
		const overlapStart = overlap && prev && from < prev.end
			? findOverlapStart(text, { start: from, end: body.start }, overlap, countTokens, fences)
			: body.start
		const header = buildHeader?.(body.path)
		const content = text.slice(overlapStart, body.end)
		return { ...body, overlapStart, text: header ? `${header}\n\n${content}` : content }
	})

	return { rulesVersion: RULES_VERSION, chunks }
}