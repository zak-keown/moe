#!/usr/bin/env python3
"""Stage this repo's generated plugins into the local dogfood marketplace.

Replaces one plugin directory at a time, re-applies the per-machine repoints
that cannot live in the repo, and refuses to finish if any hook or MCP command
points at a file that is not there. That last check is the point of the script:
a staged plugin whose hook target is missing takes down every hook in every
session that loads it, and Claude Code reports it only as a Node module
resolution error with no plugin name attached.

Usage:
    python3 .claude/skills/moe-dogfood/scripts/stage.py [--dry-run] [--no-backup]

Run from the repo root. Requires `pnpm mint` and `pnpm build` to have run first;
the script checks for their outputs rather than running them for you, because
building is slow and you usually already have.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import NoReturn

MARKETPLACE = Path.home() / ".moe" / "local-marketplace"

# Plugins whose generated form references a build output or a package path that
# the repo does not carry. Each entry says how to make the staged copy runnable.
#
# Keep this table honest: if you add a plugin that ships a compiled runtime, it
# belongs here, and if one stops needing a repoint, delete its entry. A stale
# entry fails loudly (missing source path) rather than silently, on purpose.
REPOINTS = {
    "moe-crew": "copy_dist",  # hooks call ${CLAUDE_PLUGIN_ROOT}/dist/emit-event.cjs
    "moe-memory": "global_cli",  # hooks + mcp.json call ./dist/cli.js
    # SessionStart calls ${CLAUDE_PLUGIN_ROOT}/dist/ensure-statusline.cjs, which
    # then reads vendor/ccstatusline/ccstatusline.js relative to the same root.
    # Both travel through the npm package, so neither is in plugins/.
    "moe-statusline": "copy_dist",
}

# Where a repointed plugin's runtime actually lives on this machine.
GLOBAL_PACKAGE = {"moe-memory": "@tc/moe-memory"}

# Which workspace directories to copy, for copy_dist plugins. Each entry maps a
# source path in the repo to its destination name inside the staged plugin.
DIST_SOURCE = {
    "moe-crew": {"packages/crew/dist": "dist"},
    "moe-statusline": {
        "packages/statusline/dist": "dist",
        "packages/statusline/vendor": "vendor",
    },
}


def fail(msg: str) -> NoReturn:
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(1)


def npm_global_root() -> Path:
    try:
        out = subprocess.run(
            ["npm", "root", "-g"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        fail("could not run `npm root -g`; is npm on PATH?")
    return Path(out)


def load_registry(repo: Path) -> dict:
    path = repo / ".claude-plugin" / "marketplace.json"
    if not path.exists():
        fail(f"{path} not found — run this from the repo root")
    return json.loads(path.read_text())


def check_prerequisites(repo: Path, registry: dict) -> None:
    """Confirm the repo side is built before we copy anything into the install."""
    missing = [
        p["name"]
        for p in registry["plugins"]
        if not (repo / "plugins" / p["name"]).is_dir()
    ]
    if missing:
        fail(f"plugins/ is missing {', '.join(missing)} — run `pnpm mint` first")

    for name, kind in REPOINTS.items():
        if kind != "copy_dist":
            continue
        for rel in DIST_SOURCE[name]:
            src = repo / rel
            if not src.is_dir():
                fail(f"{src} not built — run `pnpm build` first ({name} needs it)")


def backup(dest: Path) -> Path | None:
    if not dest.exists():
        return None
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = dest.parent / f"{dest.name}.bak-{stamp}"
    shutil.copytree(dest, target)
    return target


def apply_repoint(name: str, staged: Path, repo: Path) -> list[str]:
    """Make a staged plugin runnable on this machine. Returns a list of notes."""
    kind = REPOINTS.get(name)
    if kind is None:
        return []

    if kind == "copy_dist":
        notes = []
        for rel, dest in DIST_SOURCE[name].items():
            shutil.copytree(repo / rel, staged / dest)
            notes.append(f"copied {rel} -> {name}/{dest}")
        return notes

    if kind == "global_cli":
        cli = npm_global_root() / GLOBAL_PACKAGE[name] / "dist" / "cli.js"
        if not cli.exists():
            fail(
                f"{name} needs the globally installed {GLOBAL_PACKAGE[name]}, "
                f"but {cli} is not there. Install it from a local `npm pack` "
                f"tarball, or add a copy_dist entry instead."
            )
        notes = []
        # Walk every hooks.json under hooks/, not just the top-level one. Mint
        # emits a second, nested hooks/moe-mint/hooks.json carrying its own copy
        # of the same command, and repointing only the top one leaves a live
        # SessionStart hook aimed at a dist/ that is not staged. Scoping the walk
        # to hooks/ keeps the example plugin under skills/ out of it.
        for hooks in sorted((staged / "hooks").rglob("hooks.json")):
            # Edit the parsed structure, not the file text. In the raw file the
            # command's inner quotes are backslash-escaped, so a regex over the
            # text cannot see the quoted token it needs to replace; once decoded
            # they are ordinary quotes and the substitution is straightforward.
            cfg = json.loads(hooks.read_text())
            changed = False
            for entries in cfg.get("hooks", {}).values():
                for entry in entries:
                    for hook in entry.get("hooks", []):
                        cmd = hook.get("command", "")
                        swapped = re.sub(
                            r'"[^"]*dist/cli\.js"', f'"{cli}"', cmd
                        )
                        if swapped != cmd:
                            hook["command"] = swapped
                            changed = True
            if changed:
                hooks.write_text(json.dumps(cfg, indent=2) + "\n")
                rel = hooks.relative_to(staged)
                notes.append(f"repointed {name}/{rel} at {cli}")

        # Two MCP configs ship side by side: mcp.json for the neutral plugin
        # spec and .mcp.json for Claude Code. They are separate files with
        # separate contents, and repointing only one leaves the server dead in
        # whichever harness reads the other.
        for filename in ("mcp.json", ".mcp.json"):
            mcp = staged / filename
            if not mcp.exists():
                continue
            cfg = json.loads(mcp.read_text())
            for server in cfg.get("mcpServers", {}).values():
                server["args"] = [
                    str(cli) if a.endswith("dist/cli.js") else a
                    for a in server.get("args", [])
                ]
                # cwd only made sense while the path was relative to the plugin.
                server.pop("cwd", None)
            mcp.write_text(json.dumps(cfg, indent=2) + "\n")
            notes.append(f"repointed {name}/{filename} at {cli}")
        return notes

    fail(f"unknown repoint kind {kind!r} for {name}")


def hook_targets(staged: Path) -> list[tuple[str, Path]]:
    """Every filesystem path a staged plugin's hooks and MCP config will execute.

    Returns (event, path) pairs so a failure can name the event that would break.
    """
    found: list[tuple[str, Path]] = []
    root = str(staged)

    for hooks in sorted((staged / "hooks").rglob("hooks.json")):
        cfg = json.loads(hooks.read_text())
        for event, entries in cfg.get("hooks", {}).items():
            for entry in entries:
                for hook in entry.get("hooks", []):
                    cmd = hook.get("command", "")
                    # Collapse ${...} innermost-first: a nested
                    # ${PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT}} needs two passes,
                    # and a single-pass regex leaves a stray brace in the path.
                    expanded = cmd
                    for _ in range(5):
                        collapsed = re.sub(r"\$\{[^{}]*\}", root, expanded)
                        if collapsed == expanded:
                            break
                        expanded = collapsed
                    for token in re.findall(r'"([^"]+)"|(\S+)', expanded):
                        candidate = token[0] or token[1]
                        if "/" in candidate and candidate.startswith("/"):
                            found.append((event, Path(candidate)))

    for filename in ("mcp.json", ".mcp.json"):
        mcp = staged / filename
        if not mcp.exists():
            continue
        cfg = json.loads(mcp.read_text())
        for server in cfg.get("mcpServers", {}).values():
            for arg in server.get("args", []):
                # Resolve relative args against the plugin directory rather than
                # skipping them. An unrepointed "./dist/cli.js" is exactly the
                # failure this script exists to catch, and an absolute-only
                # check walks straight past it.
                if arg.startswith("/"):
                    found.append((filename, Path(arg)))
                elif arg.endswith(".js") or arg.endswith(".cjs"):
                    found.append((filename, (staged / arg).resolve()))
    return found


def verify(dest: Path, registry: dict) -> list[str]:
    """Every staged source resolves, and every hook target exists on disk."""
    problems = []
    for plugin in registry["plugins"]:
        name = plugin["name"]
        staged = dest / "plugins" / name
        if not staged.is_dir():
            problems.append(f"{name}: staged directory missing")
            continue
        for event, target in hook_targets(staged):
            if not target.exists():
                problems.append(
                    f"{name}: {event} hook points at {target}, which does not exist"
                )
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="report, change nothing")
    parser.add_argument("--no-backup", action="store_true", help="skip the backup copy")
    args = parser.parse_args()

    repo = Path.cwd()
    registry = load_registry(repo)
    check_prerequisites(repo, registry)

    names = [p["name"] for p in registry["plugins"]]
    staged_now = (
        sorted(p.name for p in (MARKETPLACE / "plugins").iterdir() if p.is_dir())
        if (MARKETPLACE / "plugins").is_dir()
        else []
    )
    retired = [n for n in staged_now if n not in names]

    print(f"registry: {', '.join(names)}")
    if retired:
        print(f"retired:  {', '.join(retired)} (will be removed from the marketplace)")
        print(
            "  note: `claude plugin uninstall <name>@moe` each of these FIRST, or the\n"
            "  running session keeps firing their hooks against a directory you deleted."
        )
    if args.dry_run:
        print("\n--dry-run: nothing written")
        return 0

    if not args.no_backup:
        saved = backup(MARKETPLACE)
        if saved:
            print(f"backup:   {saved}")

    (MARKETPLACE / "plugins").mkdir(parents=True, exist_ok=True)

    notes: list[str] = []
    for name in names:
        staged = MARKETPLACE / "plugins" / name
        if staged.exists():
            shutil.rmtree(staged)
        shutil.copytree(repo / "plugins" / name, staged)
        notes.extend(apply_repoint(name, staged, repo))

    for name in retired:
        shutil.rmtree(MARKETPLACE / "plugins" / name)

    # Every source becomes a local path: the npm-sourced entries in the repo's
    # registry point at a ProGet scope that has never been published to.
    local = json.loads(json.dumps(registry))
    for plugin in local["plugins"]:
        plugin["source"] = f"./plugins/{plugin['name']}"
    (MARKETPLACE / ".claude-plugin").mkdir(parents=True, exist_ok=True)
    (MARKETPLACE / ".claude-plugin" / "marketplace.json").write_text(
        json.dumps(local, indent=2) + "\n"
    )

    for note in notes:
        print(f"repoint:  {note}")

    problems = verify(MARKETPLACE, registry)
    if problems:
        print("\nFAILED verification — the install is broken as staged:")
        for p in problems:
            print(f"  - {p}")
        print("\nRestore the backup above before starting a new session.")
        return 1

    print(f"\nverified: every hook and MCP target resolves ({len(names)} plugins)")
    print("\nNext:")
    for name in retired:
        print(f"  claude plugin uninstall {name}@moe")
    print("  claude plugin marketplace update moe")
    for name in names:
        print(f"  claude plugin install {name}@moe   # if not already installed")
    print("  then restart the session — a running one holds the old hook registry")
    return 0


if __name__ == "__main__":
    sys.exit(main())
