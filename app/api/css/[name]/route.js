// 판면 규칙을 미리보기 iframe 에 넘긴다. srcdoc 이 <link> 로 건다.
import fs from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { name } = await params;
  if (name !== 'fonts.css' && name !== 'page.css') {
    return new Response('없음', { status: 404 });
  }
  let css = fs.readFileSync(path.join(process.cwd(), 'rules', name), 'utf8');
  if (name === 'fonts.css') {
    // 폰트는 /api/font 로 돌린다 — 정적 중복을 만들지 않는다
    css = css.replaceAll("url('../assets/fonts/", "url('/api/font/");
  }
  return new Response(css, {
    headers: { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' },
  });
}
