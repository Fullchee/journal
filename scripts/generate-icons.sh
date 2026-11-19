#!/usr/bin/env bash
# Renders the app icons from assets/icons/*.svg, copied from the journal repo. Needs `brew install librsvg`.
# Run from the repo root: ./scripts/generate-icons.sh
set -euo pipefail

CREAM='#f3eee2'
SRC=assets/icons
OUT=assets/images
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

sprout_body=$(sed '1d;$d' "$SRC/sprout.svg")

# Places the sprout at `scale` of a 512 square, on an optional plate with corner radius `rx`.
plate() {
	local fill=$1 rx=$2 scale=$3 body=$4 offset
	# Bash arithmetic is integer-only and scale is a fraction.
	offset=$(awk -v scale="$scale" 'BEGIN { print 256 - 256 * scale }')
	printf '%s\n' "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">
  <rect width=\"512\" height=\"512\" rx=\"$rx\" fill=\"$fill\"/>
  <g transform=\"translate($offset $offset) scale($scale)\">$body</g></svg>"
}

render() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }

plate "$CREAM" 113 1 "$sprout_body" >"$TMP/icon.svg"
render "$TMP/icon.svg" 1024 "$OUT/icon.png"

# The launcher masks the 108dp adaptive layer to the centre 72dp or less, so the sprout stays within it.
plate none 0 0.7 "$sprout_body" >"$TMP/foreground.svg"
render "$TMP/foreground.svg" 1024 "$OUT/android-icon-foreground.png"

# Android themes a monochrome icon by its alpha, so the paper fill and leaf veins would turn into blobs.
monochrome_body=$(printf '%s\n' "$sprout_body" | grep -v 'class="paper"\|class="vein"' | sed -E 's/(fill|stroke)="#[0-9a-f]+"/\1="#fff"/g')
plate none 0 0.7 "$monochrome_body" >"$TMP/monochrome.svg"
render "$TMP/monochrome.svg" 1024 "$OUT/android-icon-monochrome.png"

plate none 0 1 "$sprout_body" >"$TMP/splash.svg"
render "$TMP/splash.svg" 512 "$OUT/splash-icon.png"

render "$SRC/favicon.svg" 48 "$OUT/favicon.png"
