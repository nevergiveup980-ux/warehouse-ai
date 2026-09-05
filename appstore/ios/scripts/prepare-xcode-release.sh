#!/bin/bash
set -euo pipefail

VERSION="${RUNLU_MARKETING_VERSION:-1.0.0}"
BUILD="${RUNLU_BUILD_NUMBER:-1}"
PROJECT="ios/App/App.xcodeproj/project.pbxproj"
PLIST="ios/App/App/Info.plist"

if [[ ! -f "$PROJECT" || ! -f "$PLIST" ]]; then
  echo "Generated Capacitor iOS project not found. Run npx cap add ios / npx cap sync ios first."
  exit 1
fi

python3 - "$PROJECT" "$VERSION" "$BUILD" <<'PY'
from pathlib import Path
import re, sys
path=Path(sys.argv[1]); version=sys.argv[2]; build=sys.argv[3]
text=path.read_text()
text,nv=re.subn(r'MARKETING_VERSION = [^;]+;', f'MARKETING_VERSION = {version};', text)
text,nb=re.subn(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', text)
if nv < 2 or nb < 2:
    raise SystemExit(f'Unexpected Xcode project version fields: marketing={nv}, build={nb}')
path.write_text(text)
PY

DISPLAY_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$PLIST")"
[[ "$DISPLAY_NAME" == "RUNLU Warehouse OS" ]] || { echo "Unexpected display name: $DISPLAY_NAME"; exit 1; }

grep -q 'PRODUCT_BUNDLE_IDENTIFIER = ca.runlu.warehouseos;' "$PROJECT" || { echo 'Bundle ID mismatch'; exit 1; }
grep -q "MARKETING_VERSION = ${VERSION};" "$PROJECT" || { echo 'Marketing version mismatch'; exit 1; }
grep -q "CURRENT_PROJECT_VERSION = ${BUILD};" "$PROJECT" || { echo 'Build number mismatch'; exit 1; }
grep -q 'TARGETED_DEVICE_FAMILY = "1,2";' "$PROJECT" || { echo 'Expected iPhone + iPad target family'; exit 1; }

echo "RUNLU iOS release identity verified"
echo "  App: $DISPLAY_NAME"
echo "  Bundle ID: ca.runlu.warehouseos"
echo "  Version: $VERSION"
echo "  Build: $BUILD"
echo "  Devices: iPhone + iPad"
echo "Export-compliance declaration remains an App Store Connect decision because the app creates encrypted backups."
