#!/usr/bin/env bash
# Prepares the folder to copy onto a USB stick for an on-site install:
#   release/kardex-<version>/
#     kardex-<version>.zip                 (deploy/build-package.sh <version>)
#     postgresql-<pg>-windows-x64.exe      (EDB installer)
#     python-3.12.10-amd64.exe             (python.org installer)
#     INSTALL.md                           (deploy/windows/INSTALL.md)
#     SHA256SUMS.txt
#
#   deploy/make-usb.sh 1.0.0
#   SKIP_BUILD=1 deploy/make-usb.sh 1.0.0   # reuse an existing release/kardex-1.0.0.zip
#
# Customer machine: Windows 10 Pro 22H2 -> PostgreSQL 17 (supported until 2029-11).
# On Windows Server 2012 use PG_VERSION=15.19-1: PostgreSQL 16+ requires Windows 10 / Server 2016.
#
# Installers are cached in release/downloads/ so the next version doesn't download ~390 MB again.
set -euo pipefail

VERSION="${1:?usage: deploy/make-usb.sh <version>   e.g. 1.0.0}"
PG_VERSION="${PG_VERSION:-17.11-1}"
PY_VERSION="3.12.10"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NAME="kardex-$VERSION"
USB="$ROOT/release/$NAME"
CACHE="$ROOT/release/downloads"
PG_FILE="postgresql-$PG_VERSION-windows-x64.exe"
PY_FILE="python-$PY_VERSION-amd64.exe"

if [ -z "${SKIP_BUILD:-}" ] || [ ! -f "$ROOT/release/$NAME.zip" ]; then
  "$ROOT/deploy/build-package.sh" "$VERSION"
fi

# download <url> <file>: resumable, then checks the size the server reports.
download() {
  local url="$1" file="$CACHE/$2"
  mkdir -p "$CACHE"
  local expected
  expected="$(curl -sIL "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{n=$2} END{print n}')"
  if [ -z "$expected" ]; then
    # Server doesn't report a size (nuget.org): download once, keep the cached copy.
    if [ -s "$file" ]; then echo "    cached $2"; else echo "    downloading $2"; curl -fsSL --retry 3 -o "$file" "$url"; fi
    return
  fi
  if [ -f "$file" ] && [ "$(wc -c < "$file" | tr -d ' ')" = "$expected" ]; then
    echo "    cached $2"
    return
  fi
  echo "    downloading $2 ($((expected / 1024 / 1024)) MB)"
  curl -fL --retry 3 -C - -o "$file" "$url"
  [ "$(wc -c < "$file" | tr -d ' ')" = "$expected" ] || { echo "!! size mismatch for $2"; exit 1; }
}

echo "==> Installers"
download "https://get.enterprisedb.com/postgresql/$PG_FILE" "$PG_FILE"
download "https://www.python.org/ftp/python/$PY_VERSION/$PY_FILE" "$PY_FILE"

# python.org signs its installers; verify when gpg is available.
if command -v gpg >/dev/null 2>&1; then
  curl -fsSL -o "$CACHE/$PY_FILE.asc" "https://www.python.org/ftp/python/$PY_VERSION/$PY_FILE.asc"
  # Thomas Wouters, release manager for 3.12
  gpg --batch -q --keyserver hkps://keys.openpgp.org --recv-keys 7169605F62C751356D054A26A821E680E5FA6305 >/dev/null 2>&1 || true
  if gpg --batch -q --verify "$CACHE/$PY_FILE.asc" "$CACHE/$PY_FILE" 2>/dev/null; then
    echo "    OK  $PY_FILE signature"
  else
    echo "!! could not verify $PY_FILE signature - check it manually"
  fi
fi

echo "==> Assembling $USB"
rm -rf "$USB"
mkdir -p "$USB"
cp "$ROOT/release/$NAME.zip" "$USB/"
cp "$CACHE/$PG_FILE" "$CACHE/$PY_FILE" "$USB/"
cp "$ROOT/deploy/windows/INSTALL.md" "$USB/INSTALL.md"
(cd "$USB" && shasum -a 256 "$NAME.zip" "$PG_FILE" "$PY_FILE" > SHA256SUMS.txt)

echo "Done: copy the folder release/$NAME/ onto the USB stick ($(du -sh "$USB" | cut -f1))"
ls -l "$USB"
