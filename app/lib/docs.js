// content/ 를 읽는다. 사업별 네임스페이스 — content/<사업>/<문서>.json
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

/** [{ slug:'sokcho/실행계획서', 사업:'sokcho', 이름:'실행계획서', 검사:false }]
 *
 *  `_` 로 시작하는 폴더는 **사업이 아니라 검사 문안**이다(`content/_check`).
 *  그냥 slug 로 정렬하면 `_check` 가 맨 앞에 와서 열세 개가 실제 문서 셋을 덮는다 —
 *  고르는 자리의 첫 줄이 늘 검사 문안이었다. **검사 문안은 뒤로 민다.** */
export function listDocs() {
  if (!fs.existsSync(CONTENT)) return [];
  const out = [];
  for (const 사업 of fs.readdirSync(CONTENT)) {
    const dir = path.join(CONTENT, 사업);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const 이름 = f.slice(0, -5);
      out.push({ slug: `${사업}/${이름}`, 사업, 이름, 검사: 사업.startsWith('_') });
    }
  }
  return out.sort((a, b) =>
    (a.검사 - b.검사) ||
    a.사업.localeCompare(b.사업, 'ko') ||
    a.이름.localeCompare(b.이름, 'ko'));
}

/** 앱을 열 때 앉을 자리 — **검사 문안이 아닌 첫 문서**다. 없으면 첫 줄. */
export function firstDoc(docs) {
  return docs.find((d) => !d.검사) ?? docs[0] ?? null;
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
