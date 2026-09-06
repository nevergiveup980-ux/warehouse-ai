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
    FIRST_WAIT=30
    SCENE_WAIT=4
    ;;
  ipad)
    DEVICE_TYPE="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devicetypes",[]); prefs=["iPad Pro 13-inch (M5)","iPad Pro 13-inch (M4)","iPad Pro (13-inch) (M5)","iPad Pro (13-inch) (M4)"]; by={x.get("name"):x.get("identifier") for x in d}; found=next((by[n] for n in prefs if n in by),None); found=found or next((x.get("identifier") for x in d if "iPad" in x.get("name","") and "13-inch" in x.get("name","")),None); found=found or next((x.get("identifier") for x in d if "iPad Pro" in x.get("name","") and ("12.9-inch" in x.get("name","") or "12.9 inch" in x.get("name",""))),None); print(found or "")')"
    [[ -n "$DEVICE_TYPE" ]] || { echo 'No 13-inch/12.9-inch iPad Pro Simulator device type found'; exit 1; }
    DEVICE_LABEL='iPad Pro 13-inch'
    FIRST_WAIT=15
    SCENE_WAIT=3
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

# Scene control is entirely internal to the screenshot-only app bundle. We rewrite a
# tiny JSON file in the installed Simulator app; the injected WebView controller polls
# it and changes pages itself. This avoids iOS URL-scheme confirmation dialogs.
APP_CONTAINER="$(xcrun simctl get_app_container "$UDID" ca.runlu.warehouseos app)"
COMMAND_FILE="$APP_CONTAINER/public/screenshot-scene-command.json"
[[ -d "$APP_CONTAINER/public" ]] || { echo "Installed screenshot public directory not found: $APP_CONTAINER/public"; exit 1; }
printf '%s\n' '{"scene":"dashboard","seq":0}' > "$COMMAND_FILE"

xcrun simctl launch "$UDID" ca.runlu.warehouseos

INFO="$OUT_DIR/capture-info.txt"
printf '%s\n' "family=$FAMILY" "runtime=$RUNTIME" "device_label=$DEVICE_LABEL" "device_type=$DEVICE_TYPE" "udid=$UDID" "scene_control=internal-json-file" > "$INFO"

command_scene(){
  local order="$1"
  local scene="$2"
  local seq=$((10#$order))
  echo "Commanding RUNLU $FAMILY scene internally: $scene (seq=$seq)"
  printf '{"scene":"%s","seq":%d}\n' "$scene" "$seq" > "$COMMAND_FILE"

  # Carpet rendering is heavier than the other scenes. Re-issue only this scene with
  # a fresh sequence number so a transient WebView polling/render miss cannot leave
  # screenshot 03 on the previous Inventory page. All other scene timings stay intact.
  if [[ "$scene" == 'carpet' ]]; then
    sleep 1
    local confirm_seq=$((seq + 100))
    echo "Confirming RUNLU $FAMILY carpet scene internally (seq=$confirm_seq)"
    printf '{"scene":"%s","seq":%d}\n' "$scene" "$confirm_seq" > "$COMMAND_FILE"
    sleep 5
  else
    sleep "$SCENE_WAIT"
  fi
}

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

  local width height alpha bytes
  width="$(sips -g pixelWidth "$shot" | awk '/pixelWidth/{print $2}')"
  height="$(sips -g pixelHeight "$shot" | awk '/pixelHeight/{print $2}')"
  alpha="$(sips -g hasAlpha "$shot" | awk '/hasAlpha/{print $2}')"
  bytes="$(stat -f%z "$shot")"
  [[ "$alpha" == 'no' ]] || { echo "Normalized screenshot unexpectedly has alpha: $shot"; exit 1; }
  (( bytes >= 250000 )) || { echo "Screenshot looks unexpectedly blank or incomplete (${bytes} bytes): $shot"; exit 1; }
  echo "Captured RUNLU $FAMILY scene $scene: ${width}x${height}, JPEG/no-alpha, ${bytes} bytes -> $shot"
  printf '%s\n' "scene_${order}=${scene}|${width}x${height}|format=jpeg|alpha=${alpha}|bytes=${bytes}" >> "$INFO"
}

# Give the fresh WebView one generous startup window. Every subsequent scene is selected
# by rewriting the screenshot-only JSON command file, then allowing the page to settle.
sleep "$FIRST_WAIT"
for item in \
  '01 dashboard' \
  '02 inventory' \
  '03 carpet' \
  '04 receiving' \
  '05 transfer' \
  '06 scan' \
  '07 users' \
  '08 backup'
do
  set -- $item
  command_scene "$1" "$2"
  capture_scene "$1" "$2"
done

COUNT="$(find "$OUT_DIR" -maxdepth 1 -type f -name '*.jpg' | wc -l | tr -d ' ')"
[[ "$COUNT" == '8' ]] || { echo "Expected 8 screenshot JPEGs, found $COUNT"; exit 1; }
echo "RUNLU App Store $FAMILY screenshot sequence complete: 8 internal-command JPEG/no-alpha scenes."
