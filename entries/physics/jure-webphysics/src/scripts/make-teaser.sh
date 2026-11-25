#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROGRESS_DIR="$ROOT_DIR/progress"
OUTPUT_PATH="${1:-$PROGRESS_DIR/webphysics-teaser.mp4}"

WIDTH=1920
HEIGHT=1080
FPS=60
INTRO_DURATION=2.4
CLIP_DURATION=2.0
TITLE_FONT_FILE="${TITLE_FONT_FILE:-/System/Library/Fonts/Avenir Next.ttc}"
URL_FONT_FILE="${URL_FONT_FILE:-$TITLE_FONT_FILE}"
SLATE_LOGO_Y=100
SLATE_URL_Y=810
WATERMARK_X=10
WATERMARK_Y=10

LOGO_IMAGE="$PROGRESS_DIR/webphysics-logo-dark.png"

mkdir -p "$(dirname "$OUTPUT_PATH")"

if [[ ! -f "$TITLE_FONT_FILE" ]]; then
  echo "Missing title font file: $TITLE_FONT_FILE" >&2
  exit 1
fi

if [[ ! -f "$URL_FONT_FILE" ]]; then
  echo "Missing URL font file: $URL_FONT_FILE" >&2
  exit 1
fi

if [[ ! -f "$LOGO_IMAGE" ]]; then
  echo "Missing logo image asset: $LOGO_IMAGE" >&2
  exit 1
fi

shopt -s nullglob
clips=("$PROGRESS_DIR"/webphysics-*.mov)
shopt -u nullglob

if [[ ${#clips[@]} -eq 0 ]]; then
  echo "No source clips found at $PROGRESS_DIR/webphysics-*.mov" >&2
  exit 1
fi

clip_window_end="$(awk -v intro="$INTRO_DURATION" -v count="${#clips[@]}" -v clip="$CLIP_DURATION" 'BEGIN { printf "%.1f", intro + (count * clip) }')"

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/webphysics-teaser.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

filter_file="$work_dir/filter_complex.txt"

{
  printf '[%d:v]format=rgba,split=3[logo_intro_src][logo_outro_src][logo_small_src];\n' "${#clips[@]}"
  printf '[logo_intro_src]scale=1456:-1[logo_intro];\n'
  printf '[logo_outro_src]scale=1456:-1[logo_outro];\n'
  printf '[logo_small_src]crop=560:430:396:122,scale=210:-1[logo_small];\n'
  printf 'color=c=0x0b0e12:s=%dx%d:r=%d:d=%.1f,format=yuv420p[intro_bg];\n' "$WIDTH" "$HEIGHT" "$FPS" "$INTRO_DURATION"
  printf "[intro_bg][logo_intro]overlay=x=(W-w)/2:y=%d:shortest=1[intro_logo];\n" "$SLATE_LOGO_Y"
  printf "[intro_logo]drawtext=fontfile='%s':text='github.com/jure/webphysics':x=(w-text_w)/2:y=%d:fontsize=50:fontcolor=0xf1f5f9:borderw=1.4:bordercolor=0x050607@0.4:shadowcolor=0x000000@0.38:shadowx=0:shadowy=2[seg0];\n" "$URL_FONT_FILE" "$SLATE_URL_Y"

  seg_count=1
  clip_index=0
  for clip in "${clips[@]}"; do
    clip_base="$(basename "$clip" .mov)"
    clip_title="${clip_base#webphysics-???-}"
    clip_title="${clip_title//-/ }"
    clip_title="$(printf '%s' "$clip_title" | tr '[:lower:]' '[:upper:]')"

    title_file="$work_dir/title-$(printf '%02d' "$seg_count").txt"
    printf '%s\n' "$clip_title" > "$title_file"

    printf '[%d:v]fps=%d,scale=%d:%d:force_original_aspect_ratio=increase,crop=%d:%d,setsar=1,tpad=stop_mode=clone:stop_duration=1,trim=duration=%.1f,setpts=PTS-STARTPTS,format=yuv420p[clip%d];\n' \
      "$clip_index" "$FPS" "$WIDTH" "$HEIGHT" "$WIDTH" "$HEIGHT" "$CLIP_DURATION" "$seg_count"
    printf '[clip%d]drawbox=x=72:y=914:w=980:h=108:color=0x060708@0.44:t=fill[clip%d_box];\n' "$seg_count" "$seg_count"
    printf "[clip%d_box]drawtext=fontfile='%s':textfile='%s':x=96:y=914+((108-text_h)/2)-1:fontsize=58:fontcolor=white:borderw=2:bordercolor=0x000000@0.35:shadowcolor=0x000000@0.55:shadowx=0:shadowy=3[seg%d];\n" \
      "$seg_count" "$TITLE_FONT_FILE" "$title_file" "$seg_count"

    seg_count=$((seg_count + 1))
    clip_index=$((clip_index + 1))
  done

  printf 'color=c=0x0b0e12:s=%dx%d:r=%d:d=%.1f,format=yuv420p[outro_bg];\n' "$WIDTH" "$HEIGHT" "$FPS" "$INTRO_DURATION"
  printf "[outro_bg][logo_outro]overlay=x=(W-w)/2:y=%d:shortest=1[outro_logo];\n" "$SLATE_LOGO_Y"
  printf "[outro_logo]drawtext=fontfile='%s':text='github.com/jure/webphysics':x=(w-text_w)/2:y=%d:fontsize=50:fontcolor=0xf1f5f9:borderw=1.4:bordercolor=0x050607@0.4:shadowcolor=0x000000@0.38:shadowx=0:shadowy=2[seg%d];\n" "$URL_FONT_FILE" "$SLATE_URL_Y" "$seg_count"
  seg_count=$((seg_count + 1))

  for ((i = 0; i < seg_count; i += 1)); do
    printf '[seg%d]' "$i"
  done
  printf 'concat=n=%d:v=1:a=0[concat_video];\n' "$seg_count"
  printf "[concat_video][logo_small]overlay=x=%d:y=%d:shortest=1:enable='between(t,%.1f,%.1f)'[outv]\n" \
    "$WATERMARK_X" "$WATERMARK_Y" "$INTRO_DURATION" "$clip_window_end"
} > "$filter_file"

ffmpeg_args=(-y)
for clip in "${clips[@]}"; do
  ffmpeg_args+=(-i "$clip")
done
ffmpeg_args+=(
  -loop 1
  -framerate "$FPS"
  -i "$LOGO_IMAGE"
  -filter_complex_script "$filter_file"
  -map '[outv]'
  -an
  -r "$FPS"
  -c:v libx264
  -pix_fmt yuv420p
  -preset medium
  -crf 18
  -movflags +faststart
  "$OUTPUT_PATH"
)

ffmpeg "${ffmpeg_args[@]}"
