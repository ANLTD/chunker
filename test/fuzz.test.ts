import { describe, expect, it } from 'vitest'
import { chunkText, type TChunkOptions } from '../src'


// Seeded, so a failure reproduces on every run.
const random = (seed: number) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31

const approxTokens = (text: string) => Math.ceil(text.length / 4)

// Pieces of markdown that tend to break a chunker: headings of both kinds, fences, front matter, lists, quotes,
// CRLF, CJK, surrogate pairs, combining marks and runs without any boundary.
const ATOMS = [
	'# H1 ', '## H2 ', '### H3 ', 'Title\n===\n', 'Sub\n---\n', '---\n', '```\n', '```js\n', '~~~\n', '```inline``` ',
	'\n', '\n\n', ' ', '\t', '\r\n', 'word', 'Sentence. ', '。', '😀', 'é', '- item\n', '> quote\n',
	'    # indented\n', 'x'.repeat(50)
]


describe('chunkText on random documents', () => {
	it('keeps every chunk whole, in order, within max and over all the text', () => {
		const rnd = random(1)
		const failures: string[] = []

		for (let run = 0; run < 3000 && failures.length < 5; run++) {
			const text = Array.from({ length: Math.floor(rnd() * 300) }, () => ATOMS[Math.floor(rnd() * ATOMS.length)]).join('')
			const max = 5 + Math.floor(rnd() * 60)
			const options: TChunkOptions = {
				countTokens: approxTokens,
				max,
				target: 1 + Math.floor(rnd() * max),
				min: Math.floor(rnd() * max),
				overlap: Math.floor(rnd() * Math.min(max - 1, 10)),
				buildHeader: rnd() < 0.5 ? path => path.join(' / ') : undefined
			}

			let chunks
			try {
				chunks = chunkText(text, options).chunks
			} catch (error) {
				// Options that leave no room below max are rejected; anything else is a bug.
				if (!(error instanceof RangeError)) failures.push(`threw ${String(error)} on ${JSON.stringify(text)}`)
				continue
			}

			const fail = (problem: string) => failures.push(`${problem}: ${JSON.stringify({ text, options: { ...options, buildHeader: !!options.buildHeader } })}`)
			let prevEnd = 0
			let covered = 0
			for (const chunk of chunks) {
				const body = text.slice(chunk.start, chunk.end)
				const header = options.buildHeader?.(chunk.path)
				if (chunk.start < prevEnd) fail('bodies overlap')
				if (chunk.overlapStart > chunk.start) fail('overlap starts after the body')
				if (chunk.text !== (header ? `${header}\n\n` : '') + text.slice(chunk.overlapStart, chunk.end)) fail('text is not header + source')
				if (!body || body !== body.trim()) fail('body is empty or untrimmed')
				// A single code point over max cannot be cut, so it is the one chunk allowed past it.
				if (approxTokens(chunk.text) > max && [...body].length > 1) fail(`chunk of ${approxTokens(chunk.text)} over max ${max}`)
				prevEnd = chunk.end
				covered += body.replace(/\s/g, '').length
			}
			if (covered !== text.replace(/\s/g, '').length) fail('text lost between chunks')
		}

		expect(failures).toEqual([])
	})
})
