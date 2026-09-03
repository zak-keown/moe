# Imported data parity

## Unicode CaseFolding 16.0.0

`src/artifact/unicode-casefold.ts` is generated from the Unicode Character
Database file `CaseFolding-16.0.0.txt`, dated 2024-04-30, using its `C` and
`F` mappings (the locale-independent common/full fold; Turkic-only `T`
mappings are intentionally excluded). Source:
`https://www.unicode.org/Public/16.0.0/ucd/CaseFolding.txt`.

The generated module is an offline, complete mapping table for that source;
all unlisted code points fold to themselves and the caller performs NFC after
substitution. Unicode's terms of use apply; see
`https://www.unicode.org/terms_of_use.html`.
