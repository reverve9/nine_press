// content/ 를 읽는다. 사업별 네임스페이스 — content/<사업>/<문서>.json
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

/** [{ slug:'sokcho/실행계획서', 사업:'sokcho', 이름:'실행계획서' }] */
export function listDocs() {
  if (!fs.existsSync(CONTENT)) return [];
  const out = [];
  for (const 사업 of fs.readdirSync(CONTENT)) {
    const dir = path.join(CONTENT, 사업);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const 이름 = f.slice(0, -5);
      out.push({ slug: `${사업}/${이름}`, 사업, 이름 });
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug, 'ko'));
}

export function loadDoc(slug) {
  const p = path.join(CONTENT, `${slug}.json`);
  if (!p.startsWith(CONTENT)) throw new Error('경로 이탈');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 문안 파일 경로 — content 밖으로 못 나간다 */
export function docPath(slug) {
  const p = path.join(CONTENT, `${slug}.json`);
  if (!p.startsWith(CONTENT)) throw new Error('경로 이탈');
  return p;
}

/** 수정 시각(ms). 화면이 들고 있던 값과 대조해 밖에서 바뀐 걸 잡는다 */
export function docMtime(slug) {
  return fs.statSync(docPath(slug)).mtimeMs;
}

/** 문안 저장 — 임시 파일에 쓰고 갈아끼운다. 쓰다 죽어도 원본이 반쪽으로 남지 않는다 */
export function saveDoc(slug, doc) {
  const p = docPath(slug);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
  return fs.statSync(p).mtimeMs;
}
