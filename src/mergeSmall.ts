import type { TCountedSpan, TSpan } from './types'


// ['A', 'B'] and ['A', 'C'] → ['A']
const commonPath = (a: string[], b: string[]): string[] => {
	const split = a.findIndex((title, i) => title !== b[i])
	return a.slice(0, split === -1 ? b.length : split)
}

const join = (a: TCountedSpan, b: TCountedSpan): TCountedSpan => ({ start: a.start, end: b.end, path: commonPath(a.path, b.path), level: a.level, tokens: a.tokens + b.tokens })

// FNV-1a of the chunk's first line, as a fraction of 2^32: the same line always gives the same value. The murmur3
// finalizer spreads lines that differ only at the end (`## Step 1`, `## Step 2`) over the whole range.
const lineHash = (text: string, chunk: TSpan): number => {
	const body = text.slice(chunk.start, chunk.end).trimStart()
	const line = body.slice(0, body.indexOf('\n') >>> 0).trim()
	let hash = 0x811c9dc5
	for (let i = 0; i < line.length; i++) hash = Math.imul(hash ^ line.charCodeAt(i), 0x01000193)
	hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
	hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
	return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32
}


// Chunks under `min` gather into groups. A group never grows past `max` of its common path, takes chunks until it
// reaches `min`, and past that keeps only a small chunk that shares more of its heading path with the group than
// with the chunk after it, so a heading-only section joins its own subsection. On a tie the chunk itself decides:
// it starts a new group when its first line hashes below tokens / min. Where groups end thus depends on the chunks
// there, not on the sizes of all before them, and an edit regroups a group or two around it, not the rest of the run.
const groupRun = (text: string, chunks: TCountedSpan[], min: number, target: number, max: (path: string[]) => number): TCountedSpan[] => {
	const fits = (a: TCountedSpan, b: TCountedSpan) => a.tokens + b.tokens <= max(commonPath(a.path, b.path))
	const startsGroup = (group: TCountedSpan, chunk: TCountedSpan, next: TCountedSpan | undefined): boolean => {
		if (!fits(group, chunk)) return true
		if (group.tokens < min) return false
		if (chunk.tokens >= min || group.tokens + chunk.tokens > target) return true
		const sharedGroup = commonPath(chunk.path, group.path).length
		const sharedNext = next ? commonPath(chunk.path, next.path).length : -1
		if (sharedGroup !== sharedNext) return sharedNext > sharedGroup
		return lineHash(text, chunk) < chunk.tokens / min
	}

	const groups: TCountedSpan[] = []
	chunks.forEach((chunk, i) => {
		const group = groups.at(-1)
		if (!group || startsGroup(group, chunk, chunks[i + 1])) groups.push(chunk)
		else groups[groups.length - 1] = join(group, chunk)
	})

	// A last group under `min` joins the one before it.
	const last = groups.at(-1)
	const prev = groups.at(-2)
	if (last && prev && last.tokens < min && fits(prev, last)) groups.splice(-2, 2, join(prev, last))
	return groups
}


// A higher heading than the one before (`##` after `###`) closes a subsection; merging never crosses it.
export const mergeSmall = (text: string, chunks: TCountedSpan[], min: number, target: number, max: (path: string[]) => number): TCountedSpan[] => {
	const runs: TCountedSpan[][] = []
	chunks.forEach((chunk, i) => {
		const prev = chunks[i - 1]
		if (!prev || chunk.level < prev.level) runs.push([chunk])
		else runs.at(-1)?.push(chunk)
	})
	return runs.flatMap(run => groupRun(text, run, min, target, max))
}
