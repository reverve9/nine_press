// 판본 iframe 이 부르는 곳.
// 산출 HTML 과 같은 render() 를 부른다 — 미리보기와 결과물이 다를 수 없다.
import { render } from '../../../render/index.js';
import { loadDoc, previewCss, onePage } from '../../lib/docs.js';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('doc');
  const i = Number(searchParams.get('i') ?? 0);

  if (!slug) return new Response('doc 없음', { status: 400 });

  try {
    const doc = loadDoc(slug);
    if (!doc.면?.[i]) return new Response('면 없음', { status: 404 });

    const html = render(onePage(doc, i), { css: previewCss(), 도구: true }).replace(
      '</head>',
      // 판본은 창에 맞춰 축소한다. 축척은 바깥(Shell)이 정한다
      `<style>
body{padding:0;margin:0;background:transparent;overflow:hidden}
.wrap{width:2340px;margin:0}
.sheet{width:2340px;height:1654px;margin:0;overflow:hidden}
.sheet .page{transform:none;box-shadow:none}
</style></head>`,
    );

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    });
  } catch (e) {
    return new Response(`<pre style="font:14px/1.6 ui-monospace;padding:24px;color:#b00">${e.message}</pre>`, {
      status: 500,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
}
