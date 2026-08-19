#!/bin/sh
# 커밋 · 푸시 한 번에.  사용자 터미널에서만 쓴다.
#
#   sh scripts/save.sh "메시지"                       작업 트리 전체
#   sh scripts/save.sh "메시지" render/index.js …     준 경로만
#
# 챗 세션이 device_bash 로 git 을 돌리면 .git/*.lock 을 지우지 못해
# 다음 git 명령이 막힌다. 그 찌꺼기를 먼저 치우고 진행한다.

set -e
cd "$(dirname "$0")/.."

rm -f .git/*.lock .git/refs/heads/*.lock .git/objects/*/tmp_obj_* 2>/dev/null || true

MSG=${1:-"작업 저장 $(date '+%Y-%m-%d %H:%M')"}

if [ $# -gt 1 ]; then
  shift
  git add -- "$@"
else
  git add -A
fi
if git diff --cached --quiet; then
  echo "바뀐 것 없음"
else
  git commit -m "$MSG"
fi

if git remote | grep -q .; then
  git push -u origin "$(git branch --show-current)"
else
  echo "원격이 없다 — 커밋만 했다."
  echo "  git remote add origin git@github.com:reverve9/nine_press.git"
fi
