#!/usr/bin/env python3
"""Chunk spec files into sections for parallel extraction.

Usage: chunk_spec.py <path> [--max-tokens 4000]

If <path> is a file, chunks that single file.
If <path> is a directory, chunks all .md files recursively.

Output: JSON array of chunks to stdout. Each chunk has:
  source_file, heading, start_line, end_line, content, estimated_tokens

Chunking strategy:
  Files < max_tokens: single chunk (whole file)
  Files >= max_tokens: split by ## headings
  Sections still over max_tokens: split by ### headings
"""
import argparse
import json
import re
import sys
from pathlib import Path


def estimate_tokens(text: str) -> int:
    """Estimate token count. Conservative: 1 word ~ 1.3 tokens."""
    return int(len(text.split()) * 1.3)


def split_by_heading(content: str, level: int) -> list[dict]:
    """Split markdown by heading level. Returns list of {heading, content}."""
    prefix = "#" * level
    pattern = re.compile(rf"^{prefix} (.+)$", re.MULTILINE)
    matches = list(pattern.finditer(content))

    if not matches:
        return [{"heading": None, "content": content}]

    sections: list[dict] = []

    # Preamble before first heading
    if matches[0].start() > 0:
        preamble = content[: matches[0].start()].strip()
        if preamble:
            sections.append({"heading": "(preamble)", "content": preamble})

    for idx, match in enumerate(matches):
        start = match.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(content)
        sections.append({
            "heading": match.group(1).strip(),
            "content": content[start:end].strip(),
        })

    return sections


def find_line_range(
    full_content: str, section_content: str, search_from: int = 0
) -> tuple[int, int, int]:
    """Find the start and end line numbers of section_content within
    full_content, searching from search_from onward.

    Sections are always visited in document order, so searching forward
    from where the previous match ended (rather than always from the start
    of full_content) keeps sections with duplicate heading text and shared
    opening content attributed to their own occurrence instead of every
    one after the first resolving to the first match found.

    Returns (start_line, end_line, next_search_from) — pass next_search_from
    as search_from on the next call to keep searching forward.
    """
    pos = full_content.find(section_content[:80], search_from)
    if pos == -1:
        return 1, full_content.count("\n") + 1, search_from
    start_line = full_content[:pos].count("\n") + 1
    end_line = start_line + section_content.count("\n")
    return start_line, end_line, pos + len(section_content[:80])


def chunk_file(path: Path, max_tokens: int) -> list[dict]:
    """Chunk a single file into sections."""
    content = path.read_text()
    tokens = estimate_tokens(content)

    if tokens <= max_tokens:
        return [{
            "source_file": str(path),
            "heading": None,
            "start_line": 1,
            "end_line": content.count("\n") + 1,
            "content": content,
            "estimated_tokens": tokens,
        }]

    # Split by ## headings
    sections = split_by_heading(content, level=2)
    chunks: list[dict] = []

    # Sections (and their ### subsections) are visited in document order, so
    # a single cursor threaded through every find_line_range call — never
    # reset back to the start of content — keeps each occurrence attributed
    # to its own line range instead of every one after the first resolving
    # to whichever occurrence happens to come first in the document.
    search_from = 0

    for section in sections:
        sec_tokens = estimate_tokens(section["content"])
        start_line, end_line, search_from = find_line_range(content, section["content"], search_from)

        if sec_tokens <= max_tokens:
            chunks.append({
                "source_file": str(path),
                "heading": section["heading"],
                "start_line": start_line,
                "end_line": end_line,
                "content": section["content"],
                "estimated_tokens": sec_tokens,
            })
        else:
            # Sub-split by ### headings
            subsections = split_by_heading(section["content"], level=3)
            for subsec in subsections:
                sub_tokens = estimate_tokens(subsec["content"])
                sub_start, sub_end, search_from = find_line_range(content, subsec["content"], search_from)
                heading = section["heading"]
                if subsec["heading"] and subsec["heading"] != "(preamble)":
                    heading = f"{heading} > {subsec['heading']}"
                chunks.append({
                    "source_file": str(path),
                    "heading": heading,
                    "start_line": sub_start,
                    "end_line": sub_end,
                    "content": subsec["content"],
                    "estimated_tokens": sub_tokens,
                })

    return chunks


def chunk_path(path: Path, max_tokens: int) -> list[dict]:
    """Chunk a file or directory."""
    if path.is_file():
        return chunk_file(path, max_tokens)
    if path.is_dir():
        chunks: list[dict] = []
        for md_file in sorted(path.rglob("*.md")):
            chunks.extend(chunk_file(md_file, max_tokens))
        return chunks
    return []


def main() -> int:
    parser = argparse.ArgumentParser(description="Chunk spec files for extraction")
    parser.add_argument("path", help="File or directory to chunk")
    parser.add_argument("--max-tokens", type=int, default=4000,
                        help="Max tokens per chunk (default 4000)")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"error: path not found: {path}", file=sys.stderr)
        return 2

    chunks = chunk_path(path, args.max_tokens)
    json.dump(chunks, sys.stdout, indent=2)
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
