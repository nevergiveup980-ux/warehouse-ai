#!/bin/bash
set -euo pipefail

FAMILY="${RUNLU_SCREENSHOT_FAMILY:-iphone}"
OUT_DIR="${RUNLU_SCREENSHOT_DIR:-screenshots/raw/${FAMILY}}"
DERIVED="${RUNLU_SCREENSHOT_DERIVED:-ScreenshotDerivedData-${FAMILY}}"
mkdir -p "$OUT_DIR"
rm -rf "$DERIVED"

RUNTIME="$(xcrun simctl list runtimes -j | python3 -c 'import json,sys,re; d=json.load(sys.stdin); rows=[r for r in d.get("runtimes",[]) if r.get("isAvailable") and "iOS" in r.get("name","")]; rows.sort(key=lambda r: tuple(int(x) for x in re.findall(r"\d+", r.get("version", "0"))), reverse=True); print(rows[0]["identifier"] if rows else "")')"
[[ -n "$RUNTIME" ]] || { echo 'No available iOS Simulator runtime found'; exit 1; }

case "$FAMILY" in
  iphone)
    DEVICE_TYPE="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devicetypes",[]); prefs=["iPhone 17 Pro Max","iPhone 16 Pro Max","iPhone 15 Pro Max"]; by={x.get("name"):x.get("identifier") for x in d}; found=next((by[n] for n in prefs if n in by),None); found=found or next((x.get("identifier") for x in d if "iPhone" in x.get("name","") and "Pro Max" in x.get("name","")),None); print(found or "")')"
    [[ -n "$DEVICE_TYPE" ]] || { echo 'No Pro Max iPhone Simulator device type found'; exit 1; }
    DEVICE_LABEL='iPhone Pro Max'
    ;;
  ipad)
    DEVICE_TYPE="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devicetypes",[]); prefs=["iPad Pro 13-inch (M5)","iPad Pro 13-inch (M4)","iPad Pro (13-inch) (M5)","iPad Pro (13-inch) (M4)"]; by={x.get("name"):x.get("identifier") for x in d}; found=next((by[n] for n in prefs if n in by),None); found=found or next((x.get("identifier") for x in d if "iPad" in x.get("name","") and "13-inch" in x.get("name","")),None); found=found or next((x.get("identifier") for x in d if "iPad Pro" in x.get("name","") and ("12.9-inch" in x.get("name","") or "12.9 inch" in x.get("name",""))),None); print(found or "")')"
    [[ -n "$DEVICE_TYPE" ]] || { echo 'No 13-inch/12.9-inch iPad Pro Simulator device type found'; exit 1; }
    DEVICE_LABEL='iPad Pro 13-inch'
    ;;
  *)
    echo "Unsupported RUNLU_SCREENSHOT_FAMILY: $FAMILY (expected iphone or ipad)"
    exit 1
    ;;
esac

UDID="$(xcrun simctl create "RUNLU AppStore ${FAMILY} Screenshot" "$DEVICE_TYPE" "$RUNTIME")"
cleanup(){ xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true; xcrun simctl delete "$UDID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time '9:41' --batteryLevel 100 --batteryState charged --wifiBars 3 --cellularBars 4 >/dev/null 2>&1 || true

# Replace only this generated Xcode project's web assets with the isolated screenshot fixture.
rm -rf ios/App/App/public
cp -R screenshot-www ios/App/App/public

echo "Building screenshot simulator target: $FAMILY · $DEVICE_LABEL · $DEVICE_TYPE · $RUNTIME · $UDID"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build >/tmp/runlu-screenshot-xcodebuild-${FAMILY}.log

APP="$(find "$DERIVED/Build/Products/Debug-iphonesimulator" -maxdepth 1 -type d -name '*.app' | head -n 1)"
[[ -n "$APP" && -d "$APP" ]] || { echo 'Screenshot simulator .app not found'; exit 1; }
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" ca.runlu.warehouseos

INFO="$OUT_DIR/capture-info.txt"
printf '%s\n' "family=$FAMILY" "runtime=$RUNTIME" "device_label=$DEVICE_LABEL" "device_type=$DEVICE_TYPE" "udid=$UDID" > "$INFO"

capture_scene(){
  local order="$1"
  local scene="$2"
  local raw="$OUT_DIR/.${order}-${scene}-raw.png"
  local shot="$OUT_DIR/${order}-${scene}.jpg"
  xcrun simctl io "$UDID" screenshot "$raw"
  test -s "$raw"

  # Simulator PNGs on current iOS runners may carry an alpha channel even when
  # every pixel is visually opaque. App Store screenshots must not contain
  # transparency, so normalize each master to high-quality JPEG before upload.
  sips -s format jpeg -s formatOptions 100 "$raw" --out "$shot" >/dev/null
  rm -f "$raw"
  test -s "$shot"

  local width height alpha
  width="$(sips -g pixelWidth "$shot" | awk '/pixelWidth/{print $2}')"
  height="$(sips -g pixelHeight "$shot" | awk '/pixelHeight/{print $2}')"
  alpha="$(sips -g hasAlpha "$shot" | awk '/hasAlpha/{print $2}')"
  [[ "$alpha" == 'no' ]] || { echo "Normalized screenshot unexpectedly has alpha: $shot"; exit 1; }
  echo "Captured RUNLU $FAMILY scene $scene: ${width}x${height}, JPEG/no-alpha -> $shot"
  printf '%s\n' "scene_${order}=${scene}|${width}x${height}|format=jpeg|alpha=${alpha}" >> "$INFO"
}

# The screenshot-only controller holds the dashboard for 20 seconds, then moves
# through the six mature-core operational scenes in ten-second windows before
# opening Users and Backup. Capture in the middle of each stable window.
sleep 15
capture_scene '01' 'dashboard'
for item in \
  '02 inventory' \
  '03 carpet' \
  '04 receiving' \
  '05 transfer' \
  '06 scan' \
  '07 users' \
  '08 backup'
do
  sleep 10
  set -- $item
  capture_scene "$1" "$2"
done

COUNT="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.jpg' | wc -l | tr -d ' ')"
[[ "$COUNT" == '8' ]] || { echo "Expected 8 screenshot JPEGs, found $COUNT"; exit 1; }
echo "RUNLU App Store $FAMILY screenshot sequence complete: 8 JPEG/no-alpha scenes."
