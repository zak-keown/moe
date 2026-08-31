package tab

// Dev build: no embedded native library. The published moe-tab-go module REPLACES this
// file with generated embed_<goos>_<goarch>.go files (and embed_unsupported.go). When
// embeddedLib is empty, the loader falls back to MOE_TAB_LIB / the repo target/ dir.
var embeddedLib []byte

const embeddedExt = ""
