//go:build darwin || linux

package tab

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"
)

// C-ABI functions, bound once on first use.
var (
	loadOnce sync.Once
	loadErr  error

	cVersion      func() uintptr
	cEstimatePath func(path *byte, dialect *byte, out *uintptr) int32
	cRefresh      func(asOf *byte, out *uintptr) int32
	cStringFree   func(p uintptr)
)

// ensureLoaded resolves, dlopens, and binds the native library exactly once.
func ensureLoaded() error {
	loadOnce.Do(func() {
		h, err := openLibrary()
		if err != nil {
			loadErr = err
			return
		}
		purego.RegisterLibFunc(&cVersion, h, "moe_tab_version")
		purego.RegisterLibFunc(&cEstimatePath, h, "moe_tab_estimate_path")
		purego.RegisterLibFunc(&cRefresh, h, "moe_tab_refresh_pricing")
		purego.RegisterLibFunc(&cStringFree, h, "moe_tab_string_free")
	})
	return loadErr
}

func libExt() string {
	if runtime.GOOS == "darwin" {
		return "dylib"
	}
	return "so"
}

func dlopen(path string) (uintptr, error) {
	h, err := purego.Dlopen(path, purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		return 0, fmt.Errorf("moe-tab: dlopen %s: %w", path, err)
	}
	return h, nil
}

// openLibrary: MOE_TAB_LIB -> embedded (extract + dlopen, cache then temp) -> dev target/.
func openLibrary() (uintptr, error) {
	if env := os.Getenv("MOE_TAB_LIB"); env != "" {
		return dlopen(env) // explicit override: no fallback
	}
	if len(embeddedLib) > 0 {
		var firstErr error
		for _, base := range cacheBases() {
			path, err := extractEmbedded(embeddedLib, embeddedExt, base)
			if err == nil {
				if h, derr := dlopen(path); derr == nil {
					return h, nil
				} else {
					err = derr
				}
			}
			if firstErr == nil {
				firstErr = err
			}
		}
		return 0, fmt.Errorf("moe-tab: could not load embedded libmoe_tab_ffi (set MOE_TAB_LIB to override): %w", firstErr)
	}
	for _, path := range devTargets() {
		if fileExists(path) {
			return dlopen(path)
		}
	}
	return 0, fmt.Errorf("moe-tab: libmoe_tab_ffi not found; set MOE_TAB_LIB")
}

// cacheBases returns the dirs to try for extraction, persistent first then a
// noexec-resistant temp dir, deduplicated.
func cacheBases() []string {
	bases := []string{}
	if c, err := os.UserCacheDir(); err == nil {
		bases = append(bases, c)
	}
	if t := os.TempDir(); t != "" && (len(bases) == 0 || t != bases[0]) {
		bases = append(bases, t)
	}
	return bases
}

// devTargets are repo-relative build outputs, located from this source file (dev only).
func devTargets() []string {
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		return nil
	}
	root := filepath.Join(filepath.Dir(file), "..", "..", "..") // bindings/go/tab -> packages/tab
	return []string{
		filepath.Join(root, "target", "release", "libmoe_tab_ffi."+libExt()),
		filepath.Join(root, "target", "debug", "libmoe_tab_ffi."+libExt()),
	}
}

// extractEmbedded writes the lib to <base>/moe/tab-go/<hash>/libmoe_tab_ffi.<ext> atomically and
// returns its path. The content-hash dir is upgrade-safe; concurrent writers can't collide.
func extractEmbedded(b []byte, ext, base string) (string, error) {
	sum := sha256.Sum256(b)
	dir := filepath.Join(base, "moe", "tab-go", hex.EncodeToString(sum[:8]))
	target := filepath.Join(dir, "libmoe_tab_ffi."+ext)
	if fileExists(target) {
		return target, nil
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	tmp, err := os.CreateTemp(dir, "lib-*") // unique name per writer
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // harmless no-op once renamed
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Chmod(0o755); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmpName, target); err != nil {
		if fileExists(target) { // a concurrent writer won the race; identical bytes
			return target, nil
		}
		return "", err
	}
	return target, nil
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

// cstr reads a NUL-terminated C string at p without freeing it.
func cstr(p uintptr) string {
	if p == 0 {
		return ""
	}
	var n int
	for *(*byte)(unsafe.Pointer(p + uintptr(n))) != 0 {
		n++
	}
	return string(unsafe.Slice((*byte)(unsafe.Pointer(p)), n))
}

