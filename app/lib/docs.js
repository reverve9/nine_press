// content/ 를 읽는다. 사업별 네임스페이스 — content/<사업>/<문서>.json
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
const CONTENT = path.join(ROOT, 'content');

/* 문서 유형 — **고르는 자리를 이걸로 묶는다.**
   사업(속초 · 강릉)으로 묶어 봤더니 묶음이 둘뿐이라 아무것도 안 갈렸다.
   갈리는 것은 문서의 성격이다 — 제안서와 브리프는 쓰는 법이 다르다.

   유형은 **이름 끝말로 정한다.** 파일 이름이 곧 유형이라 따로 적을 데를 안 만든다.
   새 유형이 생기면 아래 표에 한 줄을 넣는다. */
const 유형순서 = ['제안서', '브리프', '시뮬레이션', '그 밖', '검사 문안'];
const 끝말 = [
  [/브리프$/, '브리프'],
  [/시뮬레이션$/, '시뮬레이션'],
  [/(제안서|제안|계획서|기획서)$/, '제안서'],
];
/* 맥 파일 이름은 자모가 분해된 꼴(NFD)로 오기도 한다 — 이 레포에서도 `실행계획서` 하나만
   분해형이라 `/계획서$/` 가 빗나갔다. **비교하기 전에 합친다.**
   저장하는 이름과 slug 는 **읽은 그대로 둔다** — 그것으로 파일을 열어야 한다. */
const 합침 = (s) => s.normalize('NFC');
const 유형정하기 = (이름) => 끝말.find(([re]) => re.test(합침(이름)))?.[1] ?? '그 밖';

/** [{ slug:'sokcho/실행계획서', 사업:'sokcho', 이름:'실행계획서', 유형:'제안서' }]
 *
 *  `_` 로 시작하는 폴더는 **사업이 아니라 검사 문안**이다(`content/_check`).
 *  그냥 slug 로 정렬하면 `_check` 가 맨 앞에 와서 열세 개가 실제 문서 셋을 덮는다 —
 *  고르는 자리의 첫 줄이 늘 검사 문안이었다. **검사 문안은 제 유형으로 묶어 맨 뒤로 민다.** */
export function listDocs() {
  if (!fs.existsSync(CONTENT)) return [];
  const out = [];
  for (const 사업 of fs.readdirSync(CONTENT)) {
    const dir = path.join(CONTENT, 사업);
    if (!fs.statSync(dir).isDirectory()) continue;
    const 검사 = 사업.startsWith('_');
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const 이름 = f.slice(0, -5);
      out.push({ slug: `${사업}/${이름}`, 사업, 이름, 검사,
        유형: 검사 ? '검사 문안' : 유형정하기(이름) });
    }
  }
  return out.sort((a, b) =>
    (유형순서.indexOf(a.유형) - 유형순서.indexOf(b.유형)) ||
    합침(a.이름).localeCompare(합침(b.이름), 'ko') ||
    합침(a.사업).localeCompare(합침(b.사업), 'ko'));
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
