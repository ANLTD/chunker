# @anweb/chunker

Splits markdown or plain text into chunks for embeddings. Each chunk stays under a token limit, follows the document's headings, and knows exactly where it came from in the source text.

No dependencies. You pass the tokenizer of your embedding model, so the limits are counted in its real tokens.

```bash
npm install @anweb/chunker
```

## Usage

```ts
import { chunkText } from '@anweb/chunker'
import { Tiktoken } from 'js-tiktoken/lite'
import cl100k_base from 'js-tiktoken/ranks/cl100k_base'

const encoder = new Tiktoken(cl100k_base)

const { chunks } = chunkText(markdown, {
	countTokens: text => encoder.encode(text).length
})

for (const chunk of chunks) {
	chunk.text   // what to embed
	chunk.path   // headings above the chunk: ['Guide', 'Setup']
	chunk.start  // where the chunk's own text starts in `markdown`
	chunk.end    // and where it ends
}
```

`countTokens` is any `(text) => number`: tiktoken for OpenAI models, a Hugging Face tokenizer for local ones. With a heading header and overlap:

```ts
const { chunks } = chunkText(markdown, {
	countTokens: text => encoder.encode(text).length,
	buildHeader: path => ['My document', ...path].join(' › '),
	max: 2000,
	overlap: 100
})
```

## How text is cut

1. **Sections.** The text is split at markdown headings: `#` to `######` followed by a space, or a paragraph underlined with `===` or `---`. Lines inside code fences and YAML front matter are never headings, and `#hashtag` is not a heading. A block between `---` lines at the top is front matter only when it reads as YAML (`key: value` lines); otherwise the `---` are plain dividers. Text without headings is one section.
2. **Pieces.** A section over the limit is cut at the strongest boundary it has: paragraphs, then lines, then sentences (including CJK sentences that end without a space), then words. A run with no boundary at all is cut evenly, never inside a surrogate pair. A code block (a ```` ``` ```` or `~~~` fence) is never cut while it fits `max`; a bigger one is cut like any text.
3. **Packing.** Neighboring pieces of a section are glued back together up to `target` tokens.
4. **Merging.** Chunks under `min` tokens gather into groups of at least `min`. A small chunk joins the side that shares more of its heading path, so a heading with no text of its own joins its first subsection instead of the previous section. When both sides share as much, the chunk itself decides whether it starts a new group, by a hash of its first line, so where groups end depends on the chunks there and not on the sizes of everything before them. Merging never crosses the end of a subsection: after `### A1`, nothing under it joins the `## B` that follows.

A chunk never mixes the end of one section with the start of another unless one of them is under `min`.

## Options

| Option | Default | |
|---|---|---|
| `countTokens` | required | `(text) => number`, the tokenizer of your embedding model. |
| `buildHeader` | none | `(path) => string`. Puts a header in front of every chunk's text, followed by a blank line. Its tokens count toward `max`. |
| `max` | `2000` | Hard limit for a chunk, header and overlap included. |
| `target` | `1000` | Pieces are packed up to this size. |
| `min` | `200` | Chunks below this size are merged into a neighbor. |
| `overlap` | `0` | Up to this many tokens from the end of the previous chunk are repeated at the start of the next one. |

Sums of token counts can run a token or so high per joint, since a BPE tokenizer may merge characters across it.

## Chunks

```ts
interface TChunk {
	text: string          // header + overlap + body
	start: number         // body start in the source
	end: number           // body end in the source
	overlapStart: number  // overlap start in the source; equals `start` without overlap
	path: string[]        // heading path
}
```

`text.slice(chunk.overlapStart, chunk.end)` is the chunk's text without the header. Leading and trailing whitespace is trimmed from every body.

## Overlap

With `overlap`, a chunk begins with the end of the previous one, so a thought cut at a boundary still lands whole in one chunk. The overlap starts at a sentence or line when one fits, otherwise at a word, and never in the middle of a code block. It never crosses a heading: the first chunk of a section starts clean.

The overlap is reserved inside `max` up front, so where chunks are cut does not depend on their neighbors.

## Stable chunks

An edit changes the chunks of the section it is in. When it lands in a run of small sections merged together, it usually regroups one or two groups around it, and never reaches past the end of the subsection: after the next heading that is higher in the outline than the one before it (`## B` after `### A2`), chunks stay byte for byte. So if you store a hash of every chunk's text next to its vector, you re-embed only the chunks whose hash changed.

Include `rulesVersion` from the result in those hashes. It changes whenever a release moves where chunks are cut, which re-embeds everything once. Include the options and the tokenizer you chunk with too: changing any of them moves the cuts as well.

## License

MIT