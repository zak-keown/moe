"""ctypes loader and low-level prototypes for moe-tab's C ABI."""
import ctypes
import os
import sys
from pathlib import Path


def _lib_filename() -> str:
    if sys.platform == "darwin":
        return "libmoe_tab_ffi.dylib"
    if sys.platform == "win32":
        return "moe_tab_ffi.dll"
    return "libmoe_tab_ffi.so"


def _candidates():
    if os.environ.get("MOE_TAB_LIB"):
        yield Path(os.environ["MOE_TAB_LIB"])
    here = Path(__file__).resolve()
    name = _lib_filename()
    yield here.parent / name                      # installed beside the package
    repo = here.parents[3]                         # …/packages/tab
    for profile in ("release", "debug"):
        yield repo / "target" / profile / name     # in-tree dev build


def _load():
    tried = []
    for p in _candidates():
        tried.append(str(p))
        if p.exists():
            return ctypes.CDLL(str(p))
    raise OSError(
        "moe_tab_ffi shared library not found. Set MOE_TAB_LIB or run "
        "`cargo build -p moe-tab-ffi`. Looked in:\n  " + "\n  ".join(tried)
    )


_lib = _load()

c_char_pp = ctypes.POINTER(ctypes.POINTER(ctypes.c_char))

_lib.moe_tab_version.restype = ctypes.c_char_p
_lib.moe_tab_version.argtypes = []

_lib.moe_tab_string_free.restype = None
_lib.moe_tab_string_free.argtypes = [ctypes.POINTER(ctypes.c_char)]

_lib.moe_tab_estimate_path.restype = ctypes.c_int32
_lib.moe_tab_estimate_path.argtypes = [ctypes.c_char_p, ctypes.c_char_p, c_char_pp]

_lib.moe_tab_refresh_pricing.restype = ctypes.c_int32
_lib.moe_tab_refresh_pricing.argtypes = [ctypes.c_char_p, c_char_pp]


def _decode_and_free(out) -> "bytes | None":
    """Copy the moe-tab-owned C string into Python bytes, then free it. Always frees."""
    if not out:
        return None
    try:
        return ctypes.cast(out, ctypes.c_char_p).value  # copies up to the NUL
    finally:
        _lib.moe_tab_string_free(out)


def call(fn, *args) -> "tuple[int, bytes | None]":
    """Invoke an estimate/refresh fn whose last param is the out-pointer. Returns (code, json)."""
    out = ctypes.POINTER(ctypes.c_char)()
    code = fn(*args, ctypes.byref(out))
    return code, _decode_and_free(out)
