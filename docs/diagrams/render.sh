#!/usr/bin/env bash
# Render every *.d2 in this directory to a same-named *.svg.
# Requires d2 (https://d2lang.com). Run from anywhere.
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
opts=(--layout elk --theme 0 --pad 20)

shopt -s nullglob
for src in "$dir"/*.d2; do
  out="${src%.d2}.svg"
  d2 "${opts[@]}" "$src" "$out"
done
