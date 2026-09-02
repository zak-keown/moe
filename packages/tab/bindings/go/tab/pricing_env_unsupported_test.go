//go:build !darwin && !linux

package tab

import "testing"

// setPricingDir on platforms with no dlopen'd core (loader_unsupported.go):
// every entry point fails fast before ever reading the env var, so the
// libc-setenv dance in pricing_env_test.go has nothing to reach. Keep the
// same signature so tab_test.go builds and vets on every GOOS.
func setPricingDir(t *testing.T, dir string) {
	t.Helper()
	t.Setenv("MOE_TAB_PRICING_DIR", dir)
}
