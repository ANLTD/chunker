# Changelog

## 0.2.1

A block between `---` lines at the top is YAML front matter only when it reads as YAML: it starts with a `key: value` line, and every unindented line is a key, a list item or a comment. Before, any text that opened with a `---` divider was taken for front matter up to the next `---`, and its headings were lost.

## 0.2.0

Requires Node.js 24 or later. No changes to how text is cut.

## 0.1.1

No code changes. The first release published from GitHub Actions through trusted publishing, with a provenance statement.

## 0.1.0

First release: chunks along markdown headings with source offsets and heading paths, your own tokenizer, an optional header and overlap.