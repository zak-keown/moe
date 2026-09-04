# chrome-ws

Chrome DevTools Protocol CLI - zero dependencies.

## Quick Test

```bash
node scripts/chrome-ws.mjs start                        # Launch Chrome (auto-detects platform)
node scripts/chrome-ws.mjs new "https://example.com"   # Create tab
node scripts/chrome-ws.mjs navigate 0 "https://example.com"
node scripts/chrome-ws.mjs extract 0 "h1"              # Extract heading
```

## Documentation

- `SKILL.md` - Complete usage guide
- `EXAMPLES.md` - Real-world examples

## Requirements

- Node.js 24+
- Chrome with `--remote-debugging-port=9222`

## Environment Variables

| Variable | Purpose |
|---|---|
| `CHROME_WS_BROWSER` | Path to browser executable (overrides auto-detection) |
| `CHROME_WS_HOST` | Debug host address (default `127.0.0.1`) |
| `CHROME_WS_PORT` | Debug port (default `9222`) |
| `CHROME_WS_PROFILE` | Profile name. Default `moe-glass` with auto-disambiguation when contended; set explicitly to share a Chrome across processes. |
| `CHROME_EXTRA_ARGS` | Whitespace-separated extra flags appended to the Chrome command line. |

## Windows Notes

- The CLI now binds to `127.0.0.1:9222` by default to avoid name-resolution issues on Windows.
- Customize the connection via `CHROME_WS_HOST` / `CHROME_WS_PORT` if you forward DevTools elsewhere.
