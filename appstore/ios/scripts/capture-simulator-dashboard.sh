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
    SHOT_NAME='iphone-dashboard.png'
    ;;
  ipad)
    DEVICE_TYPE="$(xcrun simctl list devicetypes -j | python3 -c 'import json,sys; d=json.load(sys.stdin).get("devicetypes",[]); prefs=["iPad Pro 13-inch (M5)","iPad Pro 13-inch (M4)","iPad Pro (13-inch) (M5)","iPad Pro (13-inch) (M4)"]; by={x.get("name"):x.get("identifier") for x in d}; found=next((by[n] for n in prefs if n in by),None); found=found or next((x.get("identifier") for x in d if "iPad" in x.get("name","") and "13-inch" in x.get("name","")),None); found=found or next((x.get("identifier") for x in d if "iPad Pro" in x.get("name","") and ("12.9-inch" in x.get("name","") or "12.9 inch" in x.get("name",""))),None); print(found or "")')"
    [[ -n "$DEVICE_TYPE" ]] || { echo 'No 13-inch/12.9-inch iPad Pro Simulator device type found'; exit 1; }
    DEVICE_LABEL='iPad Pro 13-inch'
    SHOT_NAME='ipad-dashboard.png'
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

# Allow PBKDF2 demo-account creation, iframe core loading and initial rendering to settle.
sleep 14
SHOT="$OUT_DIR/$SHOT_NAME"
xcrun simctl io "$UDID" screenshot "$SHOT"
test -s "$SHOT"
WIDTH="$(sips -g pixelWidth "$SHOT" | awk '/pixelWidth/{print $2}')"
HEIGHT="$(sips -g pixelHeight "$SHOT" | awk '/pixelHeight/{print $2}')"
ALPHA="$(sips -g hasAlpha "$SHOT" | awk '/hasAlpha/{print $2}')"
[[ "$ALPHA" == 'no' ]] || { echo "Screenshot unexpectedly has alpha: $SHOT"; exit 1; }
echo "Captured RUNLU raw $FAMILY dashboard screenshot: ${WIDTH}x${HEIGHT} -> $SHOT"
printf '%s\n' "family=$FAMILY" "runtime=$RUNTIME" "device_label=$DEVICE_LABEL" "device_type=$DEVICE_TYPE" "udid=$UDID" "width=$WIDTH" "height=$HEIGHT" "has_alpha=$ALPHA" > "$OUT_DIR/capture-info.txt"
