#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROGRESS_DIR="$ROOT_DIR/progress"

BEFORE_CLIP="${1:?Usage: $0 <before.mov> <after.mov> [output.mp4]}"
AFTER_CLIP="${2:?Usage: $0 <before.mov> <after.mov> [output.mp4]}"
OUTPUT_PATH="${3:-$PROGRESS_DIR/before-after.mp4}"

FPS=60
TITLE_FONT_FILE="${TITLE_FONT_FILE:-/System/Library/Fonts/Avenir Next.ttc}"

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [[ ! -f "$TITLE_FONT_FILE" ]]; then
  echo "Missing title font file: $TITLE_FONT_FILE" >&2
  exit 1
fi

for f in "$BEFORE_CLIP" "$AFTER_CLIP"; do
  if [[ ! -f "$f" ]]; then
    echo "Missing clip: $f" >&2
    exit 1
  fi
done

width_before="$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "$BEFORE_CLIP")"
width_after="$(ffprobe -v quiet -select_streams v:0 -show_entries stream=width -of csv=p=0 "$AFTER_CLIP")"
WIDTH=$(( width_before < width_after ? width_before : width_after ))
# ensure even
WIDTH=$(( WIDTH / 2 * 2 ))

ffmpeg -y \
  -i "$BEFORE_CLIP" \
  -i "$AFTER_CLIP" \
  -filter_complex "
    [0:v]fps=$FPS,scale=$WIDTH:-2,setsar=1,format=yuv420p[before_scaled];
    [1:v]fps=$FPS,scale=$WIDTH:-2,setsar=1,format=yuv420p[after_scaled];
    [before_scaled]drawbox=x=0:y=h-120:w=iw:h=120:color=0x060708@0.44:t=fill[before_box];
    [before_box]drawtext=fontfile='$TITLE_FONT_FILE':text='BEFORE':x=(w-text_w)/2:y=h-120+((120-text_h)/2)-1:fontsize=68:fontcolor=white:borderw=2:bordercolor=0x000000@0.35:shadowcolor=0x000000@0.55:shadowx=0:shadowy=3[before_titled];
    [after_scaled]drawbox=x=0:y=h-120:w=iw:h=120:color=0x060708@0.44:t=fill[after_box];
    [after_box]drawtext=fontfile='$TITLE_FONT_FILE':text='AFTER':x=(w-text_w)/2:y=h-120+((120-text_h)/2)-1:fontsize=68:fontcolor=white:borderw=2:bordercolor=0x000000@0.35:shadowcolor=0x000000@0.55:shadowx=0:shadowy=3[after_titled];
    [before_titled][after_titled]vstack=inputs=2[outv]
  " \
  -map '[outv]' \
  -an \
  -r "$FPS" \
  -c:v libx264 \
  -pix_fmt yuv420p \
  -preset medium \
  -crf 18 \
  -movflags +faststart \
  "$OUTPUT_PATH"

echo "Written to $OUTPUT_PATH"
