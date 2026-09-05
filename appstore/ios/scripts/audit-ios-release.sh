#!/bin/bash
set -euo pipefail

DERIVED="${RUNLU_DERIVED_DATA:-DerivedData}"
REPORT="${RUNLU_AUDIT_REPORT:-native-release-audit.txt}"
EXPECTED_BUNDLE="ca.runlu.warehouseos"
EXPECTED_VERSION="${RUNLU_MARKETING_VERSION:-1.0.0}"
EXPECTED_BUILD="${RUNLU_BUILD_NUMBER:-1}"

: > "$REPORT"
log(){ echo "$*" | tee -a "$REPORT"; }
fail(){ log "FAIL: $*"; exit 1; }

APP="$(find "$DERIVED/Build/Products" -type d -name '*.app' -maxdepth 5 2>/dev/null | head -n 1 || true)"
[[ -n "$APP" && -d "$APP" ]] || fail "Built .app was not found under $DERIVED/Build/Products"
PLIST="$APP/Info.plist"
[[ -f "$PLIST" ]] || fail "Built app Info.plist missing: $PLIST"

BUNDLE="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$PLIST")"
VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$PLIST")"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$PLIST")"
DISPLAY="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST")"

[[ "$BUNDLE" == "$EXPECTED_BUNDLE" ]] || fail "Built bundle ID is $BUNDLE"
[[ "$VERSION" == "$EXPECTED_VERSION" ]] || fail "Built marketing version is $VERSION"
[[ "$BUILD" == "$EXPECTED_BUILD" ]] || fail "Built build number is $BUILD"
[[ "$DISPLAY" == "RUNLU Warehouse OS" ]] || fail "Built display name is $DISPLAY"

log "Built app identity: $DISPLAY · $BUNDLE · $VERSION ($BUILD)"

for key in NSCameraUsageDescription NSMicrophoneUsageDescription NSSpeechRecognitionUsageDescription; do
  /usr/libexec/PlistBuddy -c "Print :$key" "$PLIST" >/dev/null 2>&1 || fail "Missing $key in built app"
done
log "Camera, microphone and speech-recognition usage descriptions are present."

# Exact RUNLU/private endpoints and screenshot-only data must never survive into the compiled app.
for needle in \
  'https://ekrnknlawekeoszzkamd.supabase.co' \
  'runlu-gpt-gateway.nevergiveup980.workers.dev' \
  'warehouse.runlu.ca' \
  'RUNLU_SCREENSHOT_FIXTURE_V1' \
  'Northstar Flooring Supply' \
  'PO-DEMO-001'; do
  if grep -R -a -F -q "$needle" "$APP"; then
    fail "Forbidden runtime/demo marker found in compiled app: $needle"
  fi
done
log "Compiled app contains no known RUNLU cloud/private endpoints or screenshot-fixture markers."

# Inspect every privacy manifest that is actually present in generated sources or built products.
MANIFEST_LIST="privacy-manifests.txt"
find ios "$DERIVED/Build/Products" -name 'PrivacyInfo.xcprivacy' -type f 2>/dev/null | sort -u > "$MANIFEST_LIST" || true
COUNT="$(wc -l < "$MANIFEST_LIST" | tr -d ' ')"
log "Privacy manifests discovered: $COUNT"
if [[ "$COUNT" -gt 0 ]]; then
  while IFS= read -r manifest; do
    [[ -n "$manifest" ]] || continue
    plutil -lint "$manifest" >/dev/null || fail "Malformed privacy manifest: $manifest"
    log "  valid: $manifest"
  done < "$MANIFEST_LIST"
else
  log "  none discovered; no manifest declaration is invented by this audit. Final Archive validation remains required."
fi

# Surface privacy-related compiler/linker messages for human review without hiding them.
if [[ -f native-build.log ]]; then
  PRIVACY_LINES="$(grep -i -E 'privacy|xcprivacy|required reason' native-build.log || true)"
  if [[ -n "$PRIVACY_LINES" ]]; then
    log "Privacy-related build log lines:"
    printf '%s\n' "$PRIVACY_LINES" | tail -n 80 | tee -a "$REPORT"
  else
    log "No privacy-manifest / Required Reason API warnings were emitted in this simulator build log."
  fi
fi

log "RUNLU native release audit passed for the unsigned simulator build."
log "Archive/signing/TestFlight validation is still a separate gate."
