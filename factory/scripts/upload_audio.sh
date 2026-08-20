#!/usr/bin/env bash
# Bulk-upload prebuilt clips to the mandarin-audio R2 bucket via wrangler
# (uses the existing OAuth token — no separate S3 credentials). Idempotent:
# re-running overwrites, which is a no-op for content-addressed keys.
set -uo pipefail

CORPUS_DIR="/Users/ethanadams/dev/mandarin-practice/factory/lessons/audio/corpus"
WRANGLER="/Users/ethanadams/dev/mandarin-practice/backend/node_modules/.bin/wrangler"
PAR="${1:-6}"

cd "$CORPUS_DIR" || exit 1
count=$(find clips -name '*.mp3' | wc -l | tr -d ' ')
echo "uploading $count clips with parallelism $PAR ..."

find clips -name '*.mp3' -print0 \
  | xargs -0 -P "$PAR" -I {} sh -c \
    '"$0" r2 object put "mandarin-audio/$1" --file "$1" --content-type audio/mpeg >/dev/null 2>&1 && printf . || printf "x"' \
    "$WRANGLER" {}

echo ""
echo "upload pass done."
