: << 'CMDBLOCK'
@echo off
REM Cross-platform polyglot wrapper for hook scripts.
REM On Windows: cmd.exe runs the batch portion, which finds and calls bash.
REM On Unix: the shell interprets this as a script (: is a no-op in bash).
REM
REM Hook scripts use extensionless filenames (e.g. "claude-judge-continuation"
REM not "claude-judge-continuation.sh") so Claude Code's Windows auto-detection --
REM which prepends "bash" to any command containing .sh -- does not interfere.
REM
REM Usage: run-hook.cmd <script-name> [args...]

if "%~1"=="" (
    echo run-hook.cmd: missing script name >&2
    exit /b 1
)

set "HOOK_DIR=%~dp0"

REM Try Git for Windows bash in standard locations
if exist "C:\Program Files\Git\bin\bash.exe" (
    "C:\Program Files\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)
if exist "C:\Program Files (x86)\Git\bin\bash.exe" (
    "C:\Program Files (x86)\Git\bin\bash.exe" "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM Try bash on PATH (e.g. user-installed Git Bash, MSYS2, Cygwin)
where bash >nul 2>nul
if %ERRORLEVEL% equ 0 (
    bash "%HOOK_DIR%%~1" %2 %3 %4 %5 %6 %7 %8 %9
    exit /b %ERRORLEVEL%
)

REM No bash found. Say so, then exit 0 anyway.
REM
REM Upstream exited silently here, with the comment "plugin still works, it just
REM skips the hook". The exit code is right and the silence is not: this wrapper
REM dispatches the SessionStart hook that bootstraps Moe, so on a native Windows
REM box with no Git for Windows bash, Moe's central mechanism is simply off --
REM and nothing anywhere says why. A skill that never fires looks identical to a
REM skill that fired and decided not to act.
REM
REM Still `exit /b 0`: a non-zero SessionStart hook can block or noisily break
REM every session on the machine, which is a worse failure than a missing hook.
REM Diagnosable beats silent; broken-loudly does not beat working.
echo run-hook.cmd: no bash found, so hook "%~1" did NOT run. >&2
echo   Moe's hooks are shell scripts and need a bash on this machine. >&2
echo   Install Git for Windows, or use WSL2 (the supported path today). >&2
exit /b 0
CMDBLOCK

# Unix: run the named script directly
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec bash "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
