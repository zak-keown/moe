#include <stdio.h>
#include <string.h>

#include "moe_tab.h"

int main(int argc, char **argv) {
  if (argc != 3) {
    fputs("usage: tab-native-smoke <expected-version> <transcript>\n", stderr);
    return 2;
  }
  const char *actual = moe_tab_version();
  if (actual == NULL || strcmp(actual, argv[1]) != 0) {
    fprintf(stderr, "moe_tab_version reported %s; expected %s\n",
            actual == NULL ? "<null>" : actual, argv[1]);
    return 1;
  }

  moe_tab_string_free(NULL);
  char *estimate = NULL;
  int32_t estimate_status = moe_tab_estimate_path(argv[2], "tab", &estimate);
  if (estimate_status != 0 || estimate == NULL || strstr(estimate, "total_usd") == NULL) {
    fprintf(stderr, "moe_tab_estimate_path failed with status %d\n", estimate_status);
    moe_tab_string_free(estimate);
    return 1;
  }
  moe_tab_string_free(estimate);

  char *refresh = NULL;
  int32_t refresh_status = moe_tab_refresh_pricing("Apr-2027", &refresh);
  if (refresh_status != 7 || refresh == NULL) {
    fprintf(stderr, "moe_tab_refresh_pricing contract failed with status %d\n", refresh_status);
    moe_tab_string_free(refresh);
    return 1;
  }
  moe_tab_string_free(refresh);

  printf("moe_tab_version=%s\n", actual);
  return 0;
}
