#!/usr/bin/env bash
#
# verify-unlock-page.sh — executable Self-check for haven-unlock-campaign output.
# Static builds only. Usage: verify-unlock-page.sh <site-dir>
# Exit 0 (silent) on pass; FAIL line on stderr + exit 1 on first violation.
#
set -u

SITE="${1:?usage: verify-unlock-page.sh <site-dir>}"
HTML="$SITE/index.html"
[ -f "$HTML" ] || { echo "FAIL: missing $HTML" >&2; exit 1; }

fail() { echo "FAIL: $1" >&2; exit 1; }

# 1. File ends at </html> (whitespace aside) — placement, not just balance
tail -c 64 "$HTML" | grep -q '</html>[[:space:]]*$' \
  || fail "content after </html>"

# 2. Articles balanced and non-empty
opens=$(grep -o '<article' "$HTML" | wc -l)
closes=$(grep -o '</article>' "$HTML" | wc -l)
[ "$opens" -gt 0 ] && [ "$opens" = "$closes" ] \
  || fail "unbalanced articles ($opens open / $closes close)"

# 3. Buy path: 2+ valid trade links (hero + live rung minimum), new-tabbed
trade_re='https://mint\.club/token/(ethereum|sepolia|arbitrum|base|optimism)/0x[0-9a-f]{40}'
n_trade=$(grep -oE "$trade_re" "$HTML" | wc -l)
[ "$n_trade" -ge 2 ] || fail "want 2+ valid trade links, found $n_trade"
grep -o 'https://mint\.club[^"]*' "$HTML" | grep -Evq "$trade_re" \
  && fail "malformed trade URL present"
while IFS= read -r line; do
  case "$line" in *'target="_blank"'*) ;; *) fail "trade link without target=_blank";; esac
done < <(grep -o '<a[^>]*mint\.club[^>]*>' "$HTML")

# 4. Capture: working Convos invite link, never a subscribe button
grep -qE 'https://popup\.convos\.org/v2\?i=[A-Za-z0-9_-]+' "$HTML" \
  || fail "missing Convos invite link (popup.convos.org/v2?i=<slug>)"
grep -i '<button[^>]*>' "$HTML" | grep -qi 'subscri' \
  && fail "subscribe must be a Convos link, not a button"

# 5. No dead controls: no bare href="#", every #id resolves, no enabled buttons
grep -q 'href="#"' "$HTML" && fail 'bare href="#" anchor'
ids=$(grep -o 'href="#[^"]*"' "$HTML" | sed 's/href="#//; s/"//' | sort -u)
for id in $ids; do
  grep -q "id=\"$id\"" "$HTML" || fail "anchor #$id resolves nowhere"
done
grep '<button' "$HTML" | grep -v -q 'disabled' && fail "enabled button in static build"

# 6. Offline deps: http refs allowed only on <a> navigation lines
bad=$(grep -n -o '<[^>]*\(src\|href\)="http[^"]*"' "$HTML" | grep -v '<a ') || true
[ -z "$bad" ] || fail "external dependency: $bad"
grep -rn -E '@import|url\(http' "$SITE" --include='*.css' | grep -q . \
  && fail "external CSS ref"

# 7. Seal strings: content identifiers never belong on the page
grep -q 'bafy' "$HTML" && fail "CID string on page"

exit 0
