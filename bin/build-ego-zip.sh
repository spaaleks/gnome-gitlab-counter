#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DIST_DIR="$ROOT/dist"
STAGE_BASE="$ROOT/tmp/ego-build"

variants=("$@")
if [ "${#variants[@]}" -eq 0 ]; then
    variants=(esm legacy)
fi

rm -rf "$STAGE_BASE"
mkdir -p "$DIST_DIR" "$STAGE_BASE"

stage_variant() {
    local variant=$1
    local stage=$2
    mkdir -p "$stage/schemas"

    cp -r icons "$stage/"
    cp stylesheet.css labels.json "$stage/"
    cp schemas/*.gschema.xml "$stage/schemas/"
    glib-compile-schemas "$stage/schemas/"

    if [ "$variant" = "legacy" ]; then
        cp extension-legacy.js "$stage/extension.js"
        cp prefs-legacy.js "$stage/prefs.js"
        echo '["42","43","44"]'
    else
        cp extension.js "$stage/"
        cp prefs.js "$stage/"
        cp -r lib "$stage/"
        echo '["45","46","47","48","49","50"]'
    fi
}

for variant in "${variants[@]}"; do
    case "$variant" in
        esm|legacy) ;;
        *) echo "Unknown variant: $variant (expected esm|legacy)" >&2; exit 1 ;;
    esac
done

for variant in "${variants[@]}"; do
    stage="$STAGE_BASE/$variant"
    versions=$(stage_variant "$variant" "$stage")
    jq --argjson v "$versions" '.["shell-version"] = $v' metadata.json > "$stage/metadata.json"

    zip_path="$DIST_DIR/glcounter-$variant.zip"
    rm -f "$zip_path"
    (cd "$stage" && zip -qr "$zip_path" .)

    bytes=$(stat -c%s "$zip_path")
    echo "Built $zip_path ($bytes bytes)"
done
