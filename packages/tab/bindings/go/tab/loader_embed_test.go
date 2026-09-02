package tab

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/ebitengine/purego"
)

// Feed the dev dylib's bytes through the embedded extract+dlopen path and confirm a
// real symbol resolves — the same mechanics the published moe-tab-go module relies on.
func TestExtractEmbeddedLoads(t *testing.T) {
	var libPath string
	for _, p := range devTargets() {
		if fileExists(p) {
			libPath = p
			break
		}
	}
	if libPath == "" {
		t.Skip("build the cdylib first: cargo build -p moe-tab-ffi")
	}
	raw, err := os.ReadFile(libPath)
	if err != nil {
		t.Fatal(err)
	}
	path, err := extractEmbedded(raw, libExt(), t.TempDir())
	if err != nil {
		t.Fatalf("extractEmbedded: %v", err)
	}
	if !fileExists(path) {
		t.Fatalf("extracted path missing: %s", path)
	}
	h, err := purego.Dlopen(path, purego.RTLD_NOW|purego.RTLD_GLOBAL)
	if err != nil {
		t.Fatalf("dlopen extracted: %v", err)
	}
	var version func() uintptr
	purego.RegisterLibFunc(&version, h, "moe_tab_version")
	if got := cstr(version()); got == "" {
		t.Fatal("empty version from extracted lib")
	}
}

func TestExtractEmbeddedIdempotent(t *testing.T) {
	base := t.TempDir()
	b := []byte("not a real lib, just bytes for path logic")
	p1, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	p2, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	if p1 != p2 {
		t.Fatalf("paths differ: %s vs %s", p1, p2)
	}
}

// CR-081: extractEmbedded's short-circuit trusted a pre-existing target on
// existence alone. On a shared host, the target path is a content hash of
// the (public) embedded bytes, so a local user can pre-plant arbitrary bytes
// there before the real writer ever runs; the next process to reach this
// path would dlopen whatever was planted. Assert extractEmbedded re-checks
// the hash and overwrites a mismatching target rather than trusting it.
func TestExtractEmbeddedRejectsTamperedTarget(t *testing.T) {
	base := t.TempDir()
	b := []byte("the real, expected library bytes")

	// Plant the target ourselves with the WRONG bytes, at the exact path
	// extractEmbedded would derive for b — simulating an attacker who
	// pre-created it first.
	first, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(first, []byte("PLANTED-MALICIOUS-BYTES"), 0o755); err != nil {
		t.Fatal(err)
	}

	second, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	if second != first {
		t.Fatalf("path changed: %s vs %s", first, second)
	}
	got, err := os.ReadFile(second)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(b) {
		t.Fatalf("extractEmbedded trusted tampered bytes instead of rewriting them: got %q", got)
	}
}

// A target that is a symlink to attacker-controlled content must also be
// replaced, not dlopened as-is — os.Rename on a mismatch must unlink the
// symlink rather than write through it.
func TestExtractEmbeddedReplacesSymlinkTarget(t *testing.T) {
	base := t.TempDir()
	b := []byte("the real, expected library bytes for symlink test")

	first, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("VICTIM-CONTENT"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(first); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, first); err != nil {
		t.Fatal(err)
	}

	second, err := extractEmbedded(b, "so", base)
	if err != nil {
		t.Fatal(err)
	}
	if second != first {
		t.Fatalf("path changed: %s vs %s", first, second)
	}
	if fi, err := os.Lstat(second); err != nil {
		t.Fatal(err)
	} else if fi.Mode()&os.ModeSymlink != 0 {
		t.Fatalf("target is still a symlink after extractEmbedded")
	}
	victimBytes, err := os.ReadFile(victim)
	if err != nil {
		t.Fatal(err)
	}
	if string(victimBytes) != "VICTIM-CONTENT" {
		t.Fatalf("extractEmbedded wrote through the symlink into the victim file: %q", victimBytes)
	}
}
