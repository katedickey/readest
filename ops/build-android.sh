#!/usr/bin/env bash
#
# Build the Readest Android APK locally, mirroring the Android leg of
# .github/workflows/release.yml without the publish/signing steps.
#
# It reproduces the load-bearing icon ordering from CI:
#   tauri android init -> tauri icon -> git checkout . -> tauri android build
# The `git checkout .` after `tauri icon` is required: `tauri icon` overwrites
# the committed gen/android/.../mipmap-anydpi-v26/ic_launcher.xml (which carries
# a 22% adaptive-icon inset) with Tauri's default no-inset version, making the
# launcher icon render cropped/zoomed. Reverting keeps the freshly generated
# (gitignored) mipmap PNGs while restoring the correct XML.
#
# The script bootstraps itself into the `android` devshell from ops/flake.nix,
# so it can be run directly from outside a nix shell:
#
#   ops/build-android.sh                 # universal release APK
#   ops/build-android.sh aarch64         # arm64-only release APK
#   ops/build-android.sh universal aarch64   # both
#
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
APP_DIR="$REPO_ROOT/apps/readest-app"
ICON_SRC="$REPO_ROOT/data/icons/readest-book.png"
APK_OUT_DIR="src-tauri/gen/android/app/build/outputs/apk/universal/release"

# Re-exec inside the android devshell if the Android toolchain env isn't present.
if [ -z "${NDK_HOME:-}" ] && [ -z "${READEST_IN_ANDROID_SHELL:-}" ]; then
  echo "==> Entering ops#android devshell..."
  exec nix develop "$REPO_ROOT/ops#android" \
    --command env READEST_IN_ANDROID_SHELL=1 bash "$0" "$@"
fi

# Targets to build: default to a single universal APK.
targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=("universal")
fi

cd "$APP_DIR"

echo "==> Installing JS dependencies..."
pnpm install --frozen-lockfile --prefer-offline

echo "==> Copying vendored assets (pdfjs, simplecc, jieba)..."
pnpm --filter @readest/readest-app setup-vendors

echo "==> Regenerating gen/android..."
rm -rf src-tauri/gen/android
pnpm tauri android init
pnpm tauri icon "$ICON_SRC"
# Restore committed gen/android XML + desktop icons clobbered by `tauri icon`,
# keeping the generated (gitignored) launcher PNGs.
git -C "$REPO_ROOT" checkout -- \
  apps/readest-app/src-tauri/gen/android \
  apps/readest-app/src-tauri/icons

# Sign the release APK if a keystore is provided (matches release.yml).
# Without this Gradle produces an unsigned release build.
#   ANDROID_KEY_ALIAS / ANDROID_KEY_PASSWORD / ANDROID_KEYSTORE (path to .jks)
if [ -n "${ANDROID_KEYSTORE:-}" ]; then
  : "${ANDROID_KEY_ALIAS:?set ANDROID_KEY_ALIAS to sign}"
  : "${ANDROID_KEY_PASSWORD:?set ANDROID_KEY_PASSWORD to sign}"
  if [ ! -f "$ANDROID_KEYSTORE" ]; then
    echo "ANDROID_KEYSTORE not found: $ANDROID_KEYSTORE" >&2
    exit 1
  fi
  {
    echo "keyAlias=$ANDROID_KEY_ALIAS"
    echo "password=$ANDROID_KEY_PASSWORD"
    echo "storeFile=$(realpath "$ANDROID_KEYSTORE")"
  } > src-tauri/gen/android/keystore.properties
  echo "==> Signing enabled."
else
  echo "==> No ANDROID_KEYSTORE set; building UNSIGNED release APK." >&2
fi

for target in "${targets[@]}"; do
  case "$target" in
    universal)
      echo "==> Building universal APK..."
      pnpm tauri android build
      cp "$APK_OUT_DIR/app-universal-release.apk" "$REPO_ROOT/Readest_universal.apk"
      echo "    -> $REPO_ROOT/Readest_universal.apk"
      ;;
    aarch64|arm64)
      echo "==> Building arm64 APK..."
      pnpm tauri android build -t aarch64
      cp "$APK_OUT_DIR/app-universal-release.apk" "$REPO_ROOT/Readest_arm64.apk"
      echo "    -> $REPO_ROOT/Readest_arm64.apk"
      ;;
    *)
      echo "Unknown target: $target (expected 'universal' or 'aarch64')" >&2
      exit 1
      ;;
  esac
done

echo "==> Done."
