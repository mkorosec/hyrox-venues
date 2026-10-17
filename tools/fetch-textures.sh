#!/usr/bin/env bash
# Downloads the CC0 textures used by the "Realistic" look and adapts their colour to HYROX halls
# (pale grey concrete, charcoal carpet, black rubber). Needs curl, unzip and ImageMagick (convert).
# Usage: tools/fetch-textures.sh   -> writes assets/textures/*.jpg
set -euo pipefail
out="$(cd "$(dirname "$0")/.." && pwd)/assets/textures"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

ph() { curl -sfL -o "$tmp/$1_$2.jpg" "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/$1/$1_$2_1k.jpg"; }

# Hall floor: Poly Haven "concrete_floor" (CC0), desaturated and lightened to pale grey.
ph concrete_floor diff
ph concrete_floor nor_gl
convert "$tmp/concrete_floor_diff.jpg" -colorspace Gray -level 0%,85% -quality 82 "$out/concrete_color.jpg"
convert "$tmp/concrete_floor_nor_gl.jpg" -quality 82 "$out/concrete_normal.jpg"

# Station / athlete zones: Poly Haven "rubber_tiles" (CC0), used as is.
ph rubber_tiles diff
ph rubber_tiles nor_gl
convert "$tmp/rubber_tiles_diff.jpg" -quality 82 "$out/rubber_color.jpg"
convert "$tmp/rubber_tiles_nor_gl.jpg" -quality 82 "$out/rubber_normal.jpg"

# Run course / Roxzone: ambientCG "Carpet012" (CC0), turned charcoal grey.
curl -sfL -o "$tmp/carpet.zip" "https://ambientcg.com/get?file=Carpet012_1K-JPG.zip"
unzip -oq "$tmp/carpet.zip" -d "$tmp/carpet"
convert "$tmp/carpet/Carpet012_1K-JPG_Color.jpg" -colorspace Gray -level 0%,160% -quality 82 "$out/carpet_color.jpg"
convert "$tmp/carpet/Carpet012_1K-JPG_NormalGL.jpg" -quality 82 "$out/carpet_normal.jpg"

ls -la "$out"
