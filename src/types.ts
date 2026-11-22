// [start, end) of the input text: the steps move ranges and never copy text.
export interface TSpan {
	start: number
	end: number
}

export interface TSectionSpan extends TSpan {
	path: string[]
	level: number
}

export interface TCountedSpan extends TSectionSpan {
	tokens: number
}

// `text` is the header, the overlap and the body; `start`/`end` mark the body only.
export interface TChunk extends TSpan {
	path: string[]
	overlapStart: number
	text: string
}

export interface TChunkResult {
	rulesVersion: number
	chunks: TChunk[]
}

export type TCountTokens = (text: string) => number

export interface TChunkOptions {
	// The tokenizer of the embedding model: limits are only as true as this count.
	countTokens: TCountTokens
	buildHeader?: (path: string[]) => string
	min?: number
	target?: number
	max?: number
	overlap?: number
}