#!/usr/bin/env bash
# Diagnostic invoked by the publish job in .gitlab-ci.yml. Prints the
# NPM_ID_TOKEN's claims (safe — JWT payloads are public) and reproduces
# pnpm's own OIDC exchange call verbatim per package so npm's rejection
# reason surfaces (pnpm strips it to "Unknown error").
#
# Remove the script step from .gitlab-ci.yml once OIDC publishes green;
# this file itself can stay for the next debug cycle.
set -u
python3 - <<'PY'
import base64, json, os
tok = os.environ.get('NPM_ID_TOKEN', '')
print(f'NPM_ID_TOKEN present: {bool(tok)}  length: {len(tok)}')
if tok:
    parts = tok.split('.')
    print(f'segments: {len(parts)}')
    if len(parts) >= 2:
        payload = parts[1] + '=' * (-len(parts[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        for k in ['iss','sub','aud','namespace_path','project_path','ref','ref_type','ref_path','ref_protected','ci_config_ref_uri','ci_config_sha','environment','pipeline_source']:
            print(f'  {k}: {claims.get(k)}')
PY
for PKG in memory glass core crew backstory; do
  echo "=== POST oidc/token/exchange/package/@bubstack%2Fmoe-$PKG ==="
  curl -s -o /tmp/npm-oidc-resp -w 'HTTP %{http_code}\n' \
    -X POST "https://registry.npmjs.org/-/npm/v1/oidc/token/exchange/package/@bubstack%2Fmoe-$PKG" \
    -H "Accept: application/json" \
    -H "Authorization: Bearer $NPM_ID_TOKEN" \
    -H "Content-Length: 0"
  echo "--- body ---"; head -c 2000 /tmp/npm-oidc-resp; echo
done
