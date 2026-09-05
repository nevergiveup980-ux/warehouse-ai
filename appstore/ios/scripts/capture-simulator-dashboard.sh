#!/bin/bash
set -euo pipefail

OUT_DIR="${RUNLU_SCREENSHOT_DIR:-screenshots/raw}"
DERIVED="${RUNLU_SCREENSHOT_DERIVED:-ScreenshotDerivedData}"
mkdir -p "$OUT_DIR"
rm -rf "$DERIVED"

RUNTIME="$(xcrun simctl list runtimes -j | python3 -c 'import json,sys,re; d=json.load(sys.stdin); rows=[r for r in d.get("runtimes",[]) if r.get("isAvailable") and "iOS" in r.get("name","")]; rows.sort(key=lambda r: tuple(int(x) for x in re.findall(r"\d+", r.get("version", "0"))), reverse=True); print(rows[0]["identifier"] if rows else "")')"
[[ -n "$RUNTIME" ]] || { echo 'No available iOS Simulator runtime found'; exit 1; }

DEVICE_TYPE="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devicetypes",[]); prefs=["iPhone 17 Pro Max","iPhone 16 Pro Max","iPhone 15 Pro Max"]; by={x.get("name"):x.get("identifier") for x in d}; found=next((by[n] for n in prefs if n in by),None); found=found or next((x.get("identifier") for x in d if "iPhone" in x.get("name","") and "Pro Max" in x.get("name","")),None); print(found or "")')"
[[ -n "$DEVICE_TYPE" ]] || { echo 'No Pro Max iPhone Simulator device type found'; exit 1; }

UDID="$(xcrun simctl create 'RUNLU AppStore Screenshot' "$DEVICE_TYPE" "$RUNTIME")"
cleanup(){ xcrun simctl shutdown "$UDID" >/dev/null 2>&1 || true; xcrun simctl delete "$UDID" >/dev/null 2>&1 || true; }
trap cleanup EXIT

xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time '9:41' --batteryLevel 100 --batteryState charged --wifiBars 3 --cellularBars 4 >/dev/null 2>&1 || true

# Replace only this generated Xcode project's web assets with the isolated screenshot fixture.
rm -rf ios/App/App/public
cp -R screenshot-www ios/App/App/public

echo "Building screenshot simulator target: $DEVICE_TYPE · $RUNTIME · $UDID"
xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DERIVED" \
  CODE_SIGNING_ALLOWED=NO \
  build >/tmp/runlu-screenshot-xcodebuild.log

APP="$(find "$DERIVED/Build/Products/Debug-iphonesimulator" -maxdepth 1 -type d -name '*.app' | head -n 1)"
[[ -n "$APP" && -d "$APP" ]] || { echo 'Screenshot simulator .app not found'; exit 1; }
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" ca.runlu.warehouseos

# Allow PBKDF2 demo-account creation, iframe core loading and initial rendering to settle.
sleep 14
SHOT="$OUT_DIR/iphone-dashboard.png"
xcrun simctl io "$UDID" screenshot "$SHOT"
test -s "$SHOT"
WIDTH="$(sips -g pixelWidth "$SHOT" | awk '/pixelWidth/{print $2}')"
HEIGHT="$(sips -g pixelHeight "$SHOT" | awk '/pixelHeight/{print $2}')"
echo "Captured RUNLU raw dashboard screenshot: ${WIDTH}x${HEIGHT} -> $SHOT"
printf '%s\n' "runtime=$RUNTIME" "device_type=$DEVICE_TYPE" "udid=$UDID" "width=$WIDTH" "height=$HEIGHT" > "$OUT_DIR/capture-info.txt"
