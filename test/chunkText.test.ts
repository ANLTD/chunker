import { Tiktoken } from 'js-tiktoken/lite'
import cl100k_base from 'js-tiktoken/ranks/cl100k_base'
import { describe, expect, it } from 'vitest'
import { RULES_VERSION, chunkText as chunkWith, type TChunkOptions } from '../src'


const encoder = new Tiktoken(cl100k_base)
const tiktokenCount = (text: string) => encoder.encode(text).length

// A cheap stand-in tokenizer for the tests: limits on ASCII text are easy to check by length.
const approxTokens = (text: string) => Math.ceil(text.length / 4)
const chunkText = (text: string, options: Partial<TChunkOptions> = {}) => chunkWith(text, { countTokens: approxTokens, ...options })

const paragraph = (topic: string, sentences: number) =>
	Array.from({ length: sentences }, (_, i) => `Sentence ${i + 1} is about ${topic} and nothing else.`).join(' ')

const document = (sections: string[], paragraphs = 6, sentences = 12) =>
	sections.map(title => `## ${title}\n\n${Array.from({ length: paragraphs }, () => paragraph(title, sentences)).join('\n\n')}`).join('\n\n')

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/


describe('chunkText', () => {
	it('returns no chunks for empty text', () => {
		expect(chunkText('   \n')).toEqual({ rulesVersion: RULES_VERSION, chunks: [] })
	})

	it('keeps a short text as one chunk without surrounding whitespace', () => {
		const text = '\n  A short note.  \n'
		const { chunks } = chunkText(text)
		expect(chunks).toEqual([{ start: 3, end: 16, overlapStart: 3, path: [], text: 'A short note.' }])
	})

	it('requires countTokens', () => {
		// @ts-expect-error: countTokens is required
		expect(() => chunkWith('text', {})).toThrow(TypeError)
		// @ts-expect-error: options are required
		expect(() => chunkWith('text')).toThrow(TypeError)
	})

	it('points every chunk at its own source text', () => {
		const text = document(['Alpha', 'Beta', 'Gamma'])
		const { chunks } = chunkText(text, { max: 300, target: 200, min: 50 })
		expect(chunks.length).toBeGreaterThan(3)
		for (const chunk of chunks) expect(chunk.text).toBe(text.slice(chunk.start, chunk.end))
	})

	it('stays within max', () => {
		const text = document(['Alpha', 'Beta', 'Gamma'], 8, 30)
		const { chunks } = chunkText(text, { max: 250, target: 150, min: 40 })
		for (const chunk of chunks) expect(approxTokens(chunk.text)).toBeLessThanOrEqual(250)
	})

	it('stays within max with a real tokenizer, give or take a token per joint', () => {
		const text = document(['Alpha', 'Beta'], 8, 30)
		const { chunks } = chunkText(text, { countTokens: tiktokenCount, max: 300, target: 200, min: 50 })
		for (const chunk of chunks) expect(tiktokenCount(chunk.text)).toBeLessThanOrEqual(310)
	})

	it('cuts at paragraphs before sentences', () => {
		const text = `${paragraph('one', 20)}\n\n${paragraph('two', 20)}`
		const { chunks } = chunkText(text, { max: 300, target: 300, min: 0 })
		expect(chunks.map(chunk => chunk.text)).toEqual([paragraph('one', 20), paragraph('two', 20)])
	})

	it('cuts CJK text at sentence ends without spaces', () => {
		const sentence = '这是一个关于分块的句子。'
		const text = sentence.repeat(200)
		const { chunks } = chunkText(text, { max: 100, target: 100, min: 0 })
		expect(chunks.length).toBeGreaterThan(1)
		for (const chunk of chunks) expect(chunk.text.endsWith('。')).toBe(true)
	})

	it('never cuts inside a surrogate pair', () => {
		const text = '😀'.repeat(3000)
		const { chunks } = chunkText(text, { max: 333, target: 333, min: 0 })
		expect(chunks.length).toBeGreaterThan(1)
		for (const chunk of chunks) expect(LONE_SURROGATE.test(chunk.text)).toBe(false)
		expect(chunks.map(chunk => chunk.text).join('')).toBe(text)
	})

	it('keeps a code block that fits max in one chunk', () => {
		const code = `\`\`\`js\n${Array.from({ length: 12 }, (_, i) => `function f${i}() {\n\treturn ${i}\n}`).join('\n\n')}\n\`\`\``
		const text = `## Code\n\n${paragraph('before', 20)}\n\n${code}\n\n${paragraph('after', 40)}`
		for (const overlap of [0, 30]) {
			const { chunks } = chunkText(text, { max: 300, target: 50, min: 0, overlap })
			expect(chunks.some(chunk => chunk.text.endsWith(code))).toBe(true)
			for (const chunk of chunks) expect((chunk.text.match(/```/g) ?? []).length % 2).toBe(0)
		}
	})

	it('cuts a code block over max between its lines', () => {
		const code = `\`\`\`js\n${Array.from({ length: 60 }, (_, i) => `function f${i}() {\n\treturn ${i}\n}`).join('\n\n')}\n\`\`\``
		const { chunks } = chunkText(code, { max: 100, target: 100, min: 0 })
		expect(chunks.length).toBeGreaterThan(1)
		for (const chunk of chunks) {
			expect(approxTokens(chunk.text)).toBeLessThanOrEqual(100)
			expect(chunk.text).toMatch(/^(```js\n)?function[\s\S]*\}(\n```)?$/)
		}
	})

	it('cuts a code block over max between its blank lines when text surrounds it', () => {
		const code = `\`\`\`js\n${Array.from({ length: 40 }, (_, i) => `function f${i}() {\n\tconst a = ${i}\n\treturn a\n}`).join('\n\n')}\n\`\`\``
		const { chunks } = chunkText(`Intro paragraph.\n\n${code}\n\nOutro.`, { max: 200, target: 150, min: 0 })
		expect(chunks.length).toBeGreaterThan(2)
		for (const chunk of chunks) {
			expect(chunk.text).toMatch(/^(Intro|```js|function|Outro)/)
			expect(chunk.text).toMatch(/(\}|```|\.)$/)
		}
	})

	it('joins a heading-only section to its own subsection', () => {
		const text = `# Guide\n\n## Setup\n\n${paragraph('setup', 30)}\n\n# Other\n\n${paragraph('other', 30)}`
		const { chunks } = chunkText(text, { max: 400, target: 300, min: 50 })
		expect(chunks[0]?.text.startsWith('# Guide\n\n## Setup')).toBe(true)
		expect(chunks[0]?.path).toEqual(['Guide'])
	})

	it('puts the heading path into a header that counts toward max', () => {
		const text = document(['Alpha', 'Beta'], 8, 30)
		const buildHeader = (path: string[]) => ['Doc', ...path].join(' › ')
		const { chunks } = chunkText(text, { buildHeader, max: 250, target: 150, min: 40 })
		for (const chunk of chunks) {
			expect(chunk.text.startsWith(`${buildHeader(chunk.path)}\n\n`)).toBe(true)
			expect(approxTokens(chunk.text)).toBeLessThanOrEqual(250)
		}
	})

	it('reserves nothing for an empty header', () => {
		const text = document(['Alpha', 'Beta'], 8, 30)
		const options = { max: 250, target: 250, min: 40 }
		expect(chunkText(text, { ...options, buildHeader: () => '' })).toEqual(chunkText(text, options))
	})

	it('keeps chunks of other sections byte for byte when one section is edited', () => {
		const before = document(['Alpha', 'Beta', 'Gamma'])
		const after = before.replace('Sentence 3 is about Beta', 'Sentence 3, rewritten at length, is about Beta')
		const options = { max: 300, target: 200, min: 50 }
		const texts = (text: string) => new Set(chunkText(text, options).chunks.map(chunk => chunk.text))
		const old = texts(before)
		const changed = [...texts(after)].filter(text => !old.has(text))
		expect(changed.length).toBeGreaterThan(0)
		for (const text of changed) expect(text).toContain('Beta')
	})

	it('keeps a re-cut inside the subsection that was edited', () => {
		const before = `## A\n\n### A0\n\n${paragraph('a0', 26)}\n\n### A1\n\n${paragraph('a1', 2)}\n\n## B\n\n${paragraph('b', 2)}\n\n## C\n\n${paragraph('c', 2)}`
		const after = before.replace('### A1\n\n', '### A1\n\nOne more sentence. ')
		const options = { max: 300, target: 300, min: 100 }
		const texts = (text: string) => new Set(chunkText(text, options).chunks.map(chunk => chunk.text))
		const old = texts(before)
		const changed = [...texts(after)].filter(text => !old.has(text))
		expect(changed.length).toBeGreaterThan(0)
		for (const text of changed) expect(text).not.toContain('## B')
	})

	it('closes a subsection at a higher heading when a level is skipped', () => {
		const before = `# Top\n\n### A1\n\n${paragraph('a1', 2)}\n\n## B\n\n${paragraph('b', 2)}\n\n## C\n\n${paragraph('c', 2)}\n\n## D\n\n${paragraph('d', 2)}`
		const after = before.replace('### A1\n\n', `### A1\n\n${'One more sentence. '.repeat(25)}`)
		const options = { max: 300, target: 300, min: 100 }
		const texts = (text: string) => new Set(chunkText(text, options).chunks.map(chunk => chunk.text))
		const old = texts(before)
		const changed = [...texts(after)].filter(text => !old.has(text))
		expect(changed.length).toBeGreaterThan(0)
		for (const text of changed) expect(text).not.toMatch(/## [BCD]/)
	})

	it('regroups only a few chunks of a flat run of small sections after an edit', () => {
		const document = (edited: number) => Array.from({ length: 40 }, (_, i) => `## Section ${i}\n\n${paragraph(`s${i}`, i === edited ? 16 : 3 + (i * 7) % 5)}`).join('\n\n')
		const options = { max: 2000, target: 1000, min: 200 }
		const texts = (text: string) => chunkText(text, options).chunks.map(chunk => chunk.text)
		const old = new Set(texts(document(-1)))
		for (let edited = 0; edited < 40; edited++) {
			expect(texts(document(edited)).filter(text => !old.has(text)).length).toBeLessThanOrEqual(3)
		}
	})

	it('keeps cuts in other sections when a heading in the header gets longer', () => {
		const document = (title: string) => `## ${title}\n\n${paragraph('alpha', 40)}\n\n## Beta\n\n${paragraph('beta', 80)}\n\n## Gamma\n\n${paragraph('gamma', 80)}`
		const options = { max: 300, target: 300, min: 50, buildHeader: (path: string[]) => ['Doc', ...path].join(' › ') }
		const texts = (text: string) => new Set(chunkText(text, options).chunks.map(chunk => chunk.text))
		const old = texts(document('Alpha'))
		const changed = [...texts(document('Alpha, with a much longer and more descriptive title'))].filter(text => !old.has(text))
		expect(changed.length).toBeGreaterThan(0)
		for (const text of changed) expect(text).toContain('Alpha')
	})

	it('rejects options that leave no room', () => {
		expect(() => chunkText('text', { max: 0 })).toThrow(RangeError)
		expect(() => chunkText('text', { max: 100, overlap: 100 })).toThrow(RangeError)
		expect(() => chunkText('text', { overlap: -1 })).toThrow(RangeError)
		expect(() => chunkText('text', { target: 0 })).toThrow(RangeError)
		expect(() => chunkText('text', { target: Number.NaN })).toThrow(RangeError)
		expect(() => chunkText('text', { min: -1 })).toThrow(RangeError)
		expect(() => chunkText('text', { min: Number.NaN })).toThrow(RangeError)
		expect(() => chunkText('# A\ntext', { max: 50, buildHeader: () => 'Header '.repeat(50) })).toThrow(RangeError)
		expect(() => chunkText('# A\ntext', { max: 50, overlap: 30, buildHeader: () => 'Header '.repeat(12) })).toThrow(RangeError)
	})

	it('keeps a character that alone is over max', () => {
		const text = '🦜🦜x🦜'
		const { chunks } = chunkText(text, { countTokens: tiktokenCount, max: 1, target: 1, min: 0 })
		expect(chunks.map(chunk => chunk.text).join('')).toBe(text)
		for (const chunk of chunks) expect(LONE_SURROGATE.test(chunk.text)).toBe(false)
	})

	it('handles a document with very many headings', () => {
		const text = Array.from({ length: 200000 }, (_, i) => `# H${i}\nx`).join('\n')
		expect(() => chunkText(text, { buildHeader: path => path.join(' › ') })).not.toThrow()
	})
})


describe('chunkText overlap', () => {
	const text = `## Alpha\n\n${paragraph('alpha', 60)}\n\n## Beta\n\n${paragraph('beta', 60)}`
	const options = { max: 300, target: 200, min: 0, overlap: 40 }

	it('repeats the tail of the previous chunk', () => {
		const { chunks } = chunkText(text, options)
		const overlapped = chunks.filter(chunk => chunk.overlapStart < chunk.start)
		expect(overlapped.length).toBeGreaterThan(0)
		for (const chunk of overlapped) {
			const tail = text.slice(chunk.overlapStart, chunk.start).trimEnd()
			expect(chunk.text).toBe(text.slice(chunk.overlapStart, chunk.end))
			expect(approxTokens(tail)).toBeLessThanOrEqual(40)
			expect(tail.startsWith('Sentence')).toBe(true)
		}
	})

	it('stays within max with the overlap', () => {
		for (const chunk of chunkText(text, options).chunks) expect(approxTokens(chunk.text)).toBeLessThanOrEqual(300)
	})

	it('counts the blank line between the overlap and the body toward max', () => {
		const { chunks } = chunkText('twelve.\n\none two.', { max: 4, target: 4, min: 0, overlap: 2 })
		for (const chunk of chunks) expect(approxTokens(chunk.text)).toBeLessThanOrEqual(4)
	})

	it('does not carry text over a heading', () => {
		const { chunks } = chunkText(text, options)
		const first = chunks.find(chunk => chunk.path[0] === 'Beta')
		expect(first?.overlapStart).toBe(first?.start)
	})

	it('does not carry text over a repeated heading', () => {
		const repeated = `## Example\n\n${paragraph('first', 40)}\n\n## Example\n\n${paragraph('second', 40)}`
		for (const chunk of chunkText(repeated, options).chunks) {
			expect(chunk.text.includes('first') && chunk.text.includes('second')).toBe(false)
		}
	})

	it('carries the overlap after a heading-only section joins its subsection', () => {
		const guide = `# Guide\n\n## Setup\n\n${paragraph('setup', 60)}`
		const { chunks } = chunkText(guide, { ...options, min: 50 })
		expect(chunks.length).toBeGreaterThan(2)
		for (const chunk of chunks.slice(1)) {
			expect(chunk.overlapStart).toBeLessThan(chunk.start)
			expect(chunk.text).not.toContain('# Guide')
		}
	})

	it('falls back to words when no sentence fits', () => {
		const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ')
		const { chunks } = chunkText(words, { max: 300, target: 300, min: 0, overlap: 10 })
		const second = chunks[1]
		expect(second && second.overlapStart < second.start).toBe(true)
		expect(words.slice(second?.overlapStart, second?.start).startsWith('word')).toBe(true)
	})
})