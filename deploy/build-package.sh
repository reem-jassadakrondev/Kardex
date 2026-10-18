#!/usr/bin/env bash
# Builds the Windows install package on the dev machine:
#   release/kardex-<version>.zip  with  backend/ (no venv/.env), frontend/dist/, deploy/windows/,
#   wheels/ (Windows Python 3.12 wheels, so the server needs little or no internet), VERSION
#
#   deploy/build-package.sh            # version = <date>-<git sha>
#   deploy/build-package.sh 1.0.0
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHA="$(git -C "$ROOT" rev-parse --short HEAD)"
VERSION="${1:-$(date +%Y.%m.%d)-$SHA}"
NAME="kardex-$VERSION"
STAGE="$ROOT/release/.build"
OUT="$STAGE/$NAME"
PYTHON="$ROOT/backend/venv/bin/python"

if [ -n "$(git -C "$ROOT" status --porcelain)" ]; then
  echo "!! working tree has uncommitted changes - the package will include them (VERSION says $SHA)"
fi

echo "==> Frontend build (ES5 legacy bundle)"
(cd "$ROOT/frontend" && npm run build && npm run check:legacy)

echo "==> Backend tests"
(cd "$ROOT/backend" && "$PYTHON" -m pytest -q)

echo "==> Assembling $OUT"
rm -rf "$STAGE" "$ROOT/release/$NAME.zip"
mkdir -p "$OUT/backend" "$OUT/frontend" "$OUT/deploy"
rsync -a --exclude '__pycache__' "$ROOT/backend/app" "$ROOT/backend/alembic" "$OUT/backend/"
cp "$ROOT/backend/alembic.ini" "$ROOT/backend/requirements.txt" "$OUT/backend/"
cp -R "$ROOT/frontend/dist" "$OUT/frontend/dist"
rsync -a "$ROOT/deploy/windows" "$OUT/deploy/"
echo "$VERSION" > "$OUT/VERSION"

echo "==> Windows wheels (cp312, win_amd64)"
# pip evaluates environment markers for the machine it runs on (macOS), not for --platform: resolve the
# pinned set here, swap the macOS-only/Windows-only packages, then fetch exactly those Windows wheels.
WIN_REQS="$OUT/.win-requirements.txt"
"$PYTHON" -m pip install -q --dry-run --ignore-installed --report - -r "$ROOT/backend/requirements.txt" \
  | "$PYTHON" -c '
import json, sys
names = {p["metadata"]["name"].lower(): p["metadata"]["version"] for p in json.load(sys.stdin)["install"]}
names.pop("uvloop", None)            # not available on Windows
names.setdefault("colorama", "0.4.6")  # Windows-only dependency of click
print("\n".join(f"{n}=={v}" for n, v in sorted(names.items())))' > "$WIN_REQS"
if "$PYTHON" -m pip download -q --no-deps -r "$WIN_REQS" \
    --only-binary=:all: --platform win_amd64 --python-version 3.12 --implementation cp -d "$OUT/wheels"; then
  echo "    $(ls "$OUT/wheels" | wc -l | tr -d ' ') wheels"
else
  echo "!! wheel download failed - install.ps1 will fetch packages from PyPI instead"
  rm -rf "$OUT/wheels"
fi
rm -f "$WIN_REQS"

echo "==> Zipping"
(cd "$STAGE" && zip -qr "$ROOT/release/$NAME.zip" "$NAME")
rm -rf "$STAGE"
echo "Done: release/$NAME.zip ($(du -h "$ROOT/release/$NAME.zip" | cut -f1))"
