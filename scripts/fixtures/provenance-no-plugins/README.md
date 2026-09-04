Fixture for CR-069: a root directory with no `plugins/` subdirectory at all,
used to assert that `check-provenance.mjs` reports a diagnostic instead of
crashing with an uncaught `ENOENT` from `checkPluginLicenses`.
