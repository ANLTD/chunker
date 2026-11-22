import { describe, expect, it } from 'vitest'
import { splitSections } from '../src/splitSections'


const paths = (text: string) => splitSections(text).map(section => section.path)


describe('splitSections', () => {
	it('keeps text without headings as one section', () => {
		const text = 'Just a note.\n\nSecond paragraph.'
		expect(splitSections(text)).toEqual([{ start: 0, end: text.length, path: [], level: 0 }])
	})

	it('nests heading paths by level', () => {
		const text = 'Intro\n# A\na\n## B\nb\n## C\nc\n# D\nd'
		expect(paths(text)).toEqual([[], ['A'], ['A', 'B'], ['A', 'C'], ['D']])
	})

	it('tiles the text', () => {
		const text = 'Intro\n# A\na\n\n## B\nb\n'
		const sections = splitSections(text)
		expect(sections.map(section => text.slice(section.start, section.end)).join('')).toBe(text)
	})

	it('needs a space after # for a heading', () => {
		expect(paths('#tag in a note\nmore text')).toEqual([[]])
		expect(paths('intro\n# 1 place\ntext')).toEqual([[], ['1 place']])
	})

	it('ignores headings inside code fences', () => {
		const text = '# A\n```\n# not a heading\n```\n   ~~~~\n# still code\n~~~\n~~~~\n# B\nb'
		expect(paths(text)).toEqual([['A'], ['B']])
	})

	it('does not open a fence at inline code', () => {
		expect(paths('```npm i``` installs it.\n# A\na')).toEqual([[], ['A']])
	})

	it('closes a fence only on a bare marker', () => {
		expect(paths('```\ncode\n```js\n# not a heading\n```\n# A\na')).toEqual([[], ['A']])
	})

	it('ignores headings inside front matter', () => {
		expect(paths('---\ntitle: x\n# comment\n---\n\nBody\n# A\na')).toEqual([[], ['A']])
		expect(paths('---\r\n# comment\r\n... \r\n# A\r\na')).toEqual([[], ['A']])
		expect(paths('text\n\n---\n# A\n---\na')).toEqual([[], ['A']])
	})

	it('cleans heading titles', () => {
		expect(paths('# Title ##\ntext')).toEqual([['Title']])
		expect(paths('# \\*Starred\\*\ntext')).toEqual([['*Starred*']])
	})

	it('reads setext headings', () => {
		expect(paths('Title\n===\ntext\n\nSub\n---\nmore')).toEqual([['Title'], ['Title', 'Sub']])
		const text = 'Intro\n\nLine one\nline two\n  ===  \ntext'
		const sections = splitSections(text)
		expect(sections.map(section => section.path)).toEqual([[], ['Line one line two']])
		expect(text.slice(sections[1]?.start)).toMatch(/^Line one/)
	})

	it('does not take other underlined lines for setext headings', () => {
		for (const text of ['---\ntext', 'text\n\n---\nmore', 'text\n\n===', '- item\n---', '- item\nlazy\n---', '> quote\n---', '    code\n---', '```\nx\n```\n---', '| a |\n|---|']) {
			expect(paths(text)).toEqual([[]])
		}
	})

	it('drops whitespace-only sections', () => {
		expect(paths('\n\n# A\na')).toEqual([['A']])
	})
})