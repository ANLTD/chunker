import { findFences } from './fences'
import type { TSectionSpan, TSpan } from './types'


const HEADING = /^ {0,3}#{1,6}[ \t]+\S/
// `Title` over `===` (level 1) or `---` (level 2).
const UNDERLINE = /^ {0,3}(=+|-+)[ \t]*$/
const THEMATIC_BREAK = /^ {0,3}([-*_])([ \t]*\1){2,}[ \t]*$/
const CONTAINER = /^ {0,3}(>|[-+*]([ \t]|$)|\d{1,9}[.)]([ \t]|$))/
const INDENTED_CODE = /^( {4}|\t)/
// Lines that end a paragraph before them: a block quote, a bullet or `1.` item with text, a thematic break.
const INTERRUPTS = /^ {0,3}(>|([-+*]|1[.)])[ \t]+\S|([-*_])([ \t]*\3){2,}[ \t]*$)/

const cleanTitle = (title: string): string => title.trim().replace(/\\(.)/g, '$1')


// Sections start at heading lines and tile the text (whitespace-only ones dropped); `path` is the headings above,
// `level` the section's own heading level, 0 before the first heading. A setext heading starts at its first line.
export const splitSections = (text: string, fences: TSpan[] = findFences(text)): TSectionSpan[] => {
	const sections: TSectionSpan[] = []
	let headings: { level: number, title: string }[] = []
	let path: string[] = []
	let sectionLevel = 0
	let start = 0
	let offset = 0
	let fence = 0
	// The paragraph that an underline would turn into a heading. Lines after a list item or a block quote, up to
	// a blank line, continue that container and are never one: `- item\ntext\n---` has no heading.
	let paragraph: { start: number, lines: string[] } | undefined
	let lazy = false

	const open = (at: number, level: number, title: string) => {
		if (text.slice(start, at).trim()) sections.push({ start, end: at, path, level: sectionLevel })
		start = at
		sectionLevel = level
		headings = headings.filter(h => h.level < level)
		headings.push({ level, title })
		path = headings.map(h => h.title)
	}

	for (const line of text.split('\n')) {
		const lineStart = offset
		offset += line.length + 1

		// Inside a fence, or on its opening line, nothing is a heading.
		while ((fences[fence]?.end ?? Infinity) < lineStart) fence++
		if ((fences[fence]?.start ?? Infinity) < offset) {
			paragraph = undefined
			continue
		}

		if (HEADING.test(line)) {
			const heading = line.trim()
			const level = heading.search(/[ \t]/)
			open(lineStart, level, cleanTitle(heading.slice(level).replace(/[ \t]+#+[ \t]*$/, '')))
			paragraph = undefined
			lazy = false
			continue
		}

		const underline = line.match(UNDERLINE)?.[1]
		if (paragraph && underline) {
			open(paragraph.start, underline.startsWith('=') ? 1 : 2, cleanTitle(paragraph.lines.map(l => l.trim()).join(' ')))
			paragraph = undefined
			continue
		}

		if (!line.trim()) {
			paragraph = undefined
			lazy = false
		} else if (paragraph && !INTERRUPTS.test(line)) {
			paragraph.lines.push(line)
		} else if (THEMATIC_BREAK.test(line)) {
			paragraph = undefined
			lazy = false
		} else if (CONTAINER.test(line)) {
			paragraph = undefined
			lazy = true
		} else {
			paragraph = lazy || INDENTED_CODE.test(line) ? undefined : { start: lineStart, lines: [line] }
		}
	}

	if (text.slice(start).trim()) sections.push({ start, end: text.length, path, level: sectionLevel })
	return sections
}
