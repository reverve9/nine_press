#!/usr/bin/env bash
# 폰트 내려받기 — 최초 1회. 받고 나면 git 에 커밋해 둔다.
#
# ⚠ jsdelivr 은 403 이다. raw.githubusercontent 와 npm 은 된다.
set -e

DIR="$(cd "$(dirname "$0")/.." && pwd)/assets/fonts"
mkdir -p "$DIR"
cd "$DIR"

for w in 2ExtraLight 4Regular 6SemiBold 7Bold 8ExtraBold; do
  curl -sfL -o "Paperlogy-$w.woff2" \
    "https://raw.githubusercontent.com/fonts-archive/Paperlogy/main/Paperlogy-$w.woff2"
  echo "  Paperlogy-$w"
done

npm pack pretendard@1.3.9 --silent >/dev/null
tar xzf pretendard-1.3.9.tgz --strip-components=1 package/dist/web/static/woff2
find dist -name "Pretendard-*.woff2" -exec mv {} . \; 2>/dev/null || true
rm -rf dist pretendard-1.3.9.tgz
echo "  Pretendard 9종"

echo
echo "$DIR"
ls -1 *.woff2 | wc -l | xargs echo "폰트 파일:"
