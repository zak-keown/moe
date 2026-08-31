#ifndef MOE_TAB_H
#define MOE_TAB_H

#include <stdarg.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>

/*
 Library version as a `'static` NUL-terminated string. Do NOT free.
 */
const char *moe_tab_version(void);

/*
 Free a string previously returned in an `out_json` out-parameter. NULL is a no-op.
 */
void moe_tab_string_free(char *s);

/*
 Estimate cost from a transcript file path (borrowed). See the ownership contract.
 */
int32_t moe_tab_estimate_path(const char *path, const char *dialect, char **out_json);

/*
 Refresh pricing tables (network). `as_of` is the caller's date string. See the contract.
 */
int32_t moe_tab_refresh_pricing(const char *as_of, char **out_json);

#endif  /* MOE_TAB_H */
