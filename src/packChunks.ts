import type { TCountedSpan } from './types'


// Glue a section's pieces up to `target` by summed counts; a sum runs a token or so high per joint, as BPE merges across it.
export const packChunks = (pieces: TCountedSpan[], target: number): TCountedSpan[] => {
	const chunks: TCountedSpan[] = []

	for (const piece of pieces) {
		const last = chunks.at(-1)

		if (last && last.tokens + piece.tokens <= target) {
			last.end = piece.end
			last.tokens += piece.tokens
		} else {
			chunks.push({ ...piece })
		}
	}

	return chunks
}