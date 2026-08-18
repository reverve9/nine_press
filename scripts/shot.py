#!/usr/bin/env python3
"""면 단위 PNG 렌더. 재현본과 원본을 같은 조건으로 찍어 대조한다."""
import sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = (ROOT / "rules/fonts.css").read_text(encoding="utf-8")

# 원본 HTML 에는 @font-face 가 없다(사용자 머신에 설치된 폰트에 의존).
# 같은 폰트로 찍어야 대조가 성립하므로 주입한다.
INJ_FONT = FONTS.replace("../assets/fonts/", f"file://{ROOT}/assets/fonts/")

INJ_VIEW = """
body{padding:0!important;background:#fff!important}
.wrap{width:2340px!important;margin:0!important}
.cap{display:none!important}
.sheet{width:2340px!important;height:1654px!important;margin:0!important;overflow:hidden!important}
.sheet .page{transform:none!important;margin:0!important;box-shadow:none!important}
"""


def shots(url, outdir, prefix):
    outdir = pathlib.Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    out = []
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        p = b.new_context(viewport={"width": 2340, "height": 1654},
                          device_scale_factor=1).new_page()
        p.goto(url, wait_until="networkidle")
        p.add_style_tag(content=INJ_FONT)
        p.add_style_tag(content=INJ_VIEW)
        p.evaluate("document.fonts.ready")
        p.wait_for_timeout(1500)
        n = p.locator(".sheet").count()
        for i in range(n):
            f = outdir / f"{prefix}_{i:02d}.png"
            p.locator(".sheet").nth(i).screenshot(path=str(f))
            out.append(str(f))
        b.close()
    return out


if __name__ == "__main__":
    for f in shots(sys.argv[1], sys.argv[2], sys.argv[3]):
        print(f)
