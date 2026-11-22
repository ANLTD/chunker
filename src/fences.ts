import type { TSpan } from './types'


// Any indent: a fence may sit inside a list item.
const FENCE = /^[ \t]*(`{3,}|~{3,})(.*)$/
const FRONT_MATTER = /^﻿?---[ \t]*$/
const FRONT_MATTER_END = /^(---|\.\.\.)[ \t]*$/
// A one-word key: `title: x`, `tags:`.
const YAML_KEY = /^["']?[\p{L}\p{N}_][\p{L}\p{N}_.-]*["']?[ \t]*:([ \t]|$)/u
// Unindented lines a YAML mapping may have besides keys: a list item or a comment.
const YAML_OTHER = /^(-([ \t]|$)|#)/


// Reads as YAML: starts with a key, and every unindented line is a key, a list item or a comment. A memo that only
// opens with a `---` divider has a heading or plain text in there, and stays markdown.
const isYaml = (lines: string[]): boolean => {
	const filled = lines.map(line => line.trimEnd()).filter(Boolean)
	return YAML_KEY.test(filled[0] ?? '') && filled.every(line => /^[ \t]/.test(line) || YAML_KEY.test(line) || YAML_OTHER.test(line))
}

// YAML front matter: `---` on the first line up to the next `---` or `...`, when what is between reads as YAML.
const findFrontMatter = (lines: string[]): { span: TSpan, lines: number, next: number } | undefined => {
	if (!FRONT_MATTER.test(lines[0]?.trimEnd() ?? '')) return undefined
	let offset = 0
	for (const [i, line] of lines.entries()) {
		if (i && FRONT_MATTER_END.test(line.trimEnd())) {
			if (!isYaml(lines.slice(1, i))) return undefined
			return { span: { start: 0, end: offset + line.trimEnd().length }, lines: i + 1, next: offset + line.length + 1 }
		}
		offset += line.length + 1
	}
	return undefined
}


// Code fences, from the opening marker to the end of the closing line, and front matter, kept whole the same way.
// A backtick fence has no backtick after its marker (```a``` is inline code). A fence closes on a bare marker of
// the same char, at least as long; an unclosed one runs to the end of the text.
export const findFences = (text: string): TSpan[] => {
	const lines = text.split('\n')
	const frontMatter = findFrontMatter(lines)
	const fences: TSpan[] = frontMatter ? [frontMatter.span] : []
	let fence = ''
	let start = 0
	let offset = frontMatter?.next ?? 0

	for (const line of lines.slice(frontMatter?.lines ?? 0)) {
		const lineStart = offset
		offset += line.length + 1

		const [, marker, info = ''] = line.match(FENCE) ?? []
		if (!marker) continue
		if (!fence) {
			if (marker.startsWith('`') && info.includes('`')) continue
			fence = marker
			start = lineStart + line.length - line.trimStart().length
		} else if (marker.startsWith(fence) && !info.trim()) {
			fences.push({ start, end: lineStart + line.trimEnd().length })
			fence = ''
		}
	}

	if (fence) fences.push({ start, end: text.trimEnd().length })
	return fences
}


export const fencesIn = (span: TSpan, fences: TSpan[]): TSpan[] => fences.filter(fence => span.start <= fence.start && fence.end <= span.end)


export const insideFence = (at: number, fences: TSpan[]): boolean => fences.some(fence => fence.start < at && at < fence.end)
