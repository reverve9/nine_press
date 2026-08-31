// 인라인 표기 → HTML
//
//   **굵게**        → <b> · 굵기 700 + 강조색이 한 묶음이다
//   {TBD}           → 회색 점선 배지 · 수행사가 채운다
//   {TBD협의}       → 주황 점선 배지 · 주관기관 확인 후 확정
//   {→05}           → 페이지 연결 표기 (.ar) · 숫자만 오면 "→ p.05"
//   {강조|글자}      → 구간 스타일 · N-글자 d · 아래
//   줄바꿈(Enter)     → <br>
//
// 문자열은 이스케이프하지 않는다. 필요하면 HTML 을 그대로 써도 된다.
// 이 도구는 단독 사용이고 콘텐츠 작성자가 곧 운영자다.

/* ─────────────────── 구간 스타일 · N-글자 d ───────────────────
   **속성이 요소에 걸리면 문단 하나가 최소 단위다.** 드래그한 몇 글자만 바꾸려면
   값이 요소 열쇠가 아니라 **문자열 안 표기**로 앉아야 한다 · 사용자 판정.
   `**굵게**` 가 이미 그 물건이었고 · 어휘가 그것 하나뿐이었다. 여기서 넷으로 넓힌다.

     {결론|38억원}          색 하나
     {강조·29|세 축}        토큰을 `·` 로 겹친다 · 색 + 크기
     {결론|**38억**}        중첩된다 · `**` 는 따로 처리되므로 그대로 통과한다

   토큰 네 표는 **이름이 겹치지 않는다.** 그래서 접두 없이 한 자리에 섞어 쓴다.
   렌더는 `<span class="i-결론 i-29">` 이고 · 클래스 순서가 곧 적힌 순서다 —
   `원문()` 이 그 순서대로 되읽어야 roundtrip 이 맞는다.

   **크기 토큰만 격자와 싸운다.** 한 줄 안에 크기가 다른 글자가 섞이면 브라우저가
   기준선을 맞추느라 상자들의 합집합을 잡고 그 값이 line-height 를 넘는다
   (실측 · 42 줄에 29px 를 섞으면 44). `page.css ㊱` 이 크기 토큰에 `line-height:0` 을
   함께 준다 — 조각의 줄 상자 기여를 0 으로 만들어 부모의 42 스트럿만 남긴다.
   그러면 감기는 문단에서도 42 배수가 유지되고 기준선은 그냥 씌운 것과 같다 · 실측. */

const 구간색 = ['먹', '네이비', '강조', '결론', '부연', '출처'];
const 구간크기 = ['21', '24', '26', '29'];
const 구간굵기 = ['400', '700', '800'];
const 구간자간 = ['좁게', '보통', '넓게'];
export const 구간토큰 = { 색: 구간색, 크기: 구간크기, 굵기: 구간굵기, 자간: 구간자간 };
const 아는토큰 = new Set([...구간색, ...구간크기, ...구간굵기, ...구간자간]);

/* 열쇠 부분에 `|` · `{` · `}` 를 안 받고 · 몸에 중괄호를 안 받는다.
   그래서 {TBD} · {→05} 를 먼저 처리해 두면 그 결과(중괄호 없는 span)를 몸으로 삼킬 수 있다. */
const 구간꼴 = /\{([^|{}]+)\|([^{}]*)\}/g;

export function inline(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\{TBD협의\}/g, '<span class="tbd co">TBD · 협의</span>')
    .replace(/\{TBD\}/g, '<span class="tbd">TBD</span>')
    .replace(/\{→\s*([^}]+)\}/g,
      (_, x) => `<span class="ar">→ ${/^\d+$/.test(x) ? 'p.' + x : x}</span>`)
    /* 구간 스타일은 {TBD} · {→05} 뒤에 온다 — 그 둘이 먼저 span 으로 바뀌어야
       `{강조|{TBD}}` 처럼 안에 낀 것을 몸으로 받을 수 있다. */
    .replace(구간꼴, (전체, 열쇠, 몸) => {
      const 토큰 = String(열쇠).split('·').map((t) => t.trim()).filter(Boolean);
      const 모르는것 = 토큰.filter((t) => !아는토큰.has(t));
      if (모르는것.length) throw new Error(
        `구간 표기 ${전체} 의 "${모르는것.join(' · ')}" 를 모른다. ` +
        `쓸 수 있는 토큰은 ` +
        Object.entries(구간토큰).map(([이름, 목록]) => `${이름} ${목록.join('·')}`).join(' | ') +
        ` 이고 · 여럿을 겹치려면 "·" 로 잇는다 (예 {강조·29|세 축})`);
      return `<span class="${토큰.map((t) => `i-${t}`).join(' ')}">${몸}</span>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    // 줄바꿈 — 폼에서 Enter 를 치면 JSON 에 \n 이 들어온다. 마지막에 <br> 로 바꾼다.
    // 굵게·TBD·페이지연결·구간을 먼저 처리한 뒤에 해야 표기 안에 <br> 가 끼어들지 않는다.
    .replace(/\r\n?|\n/g, '<br>');
}

/* ─────────────────── 되읽기 · inline() 의 역함수 ───────────────────
   판면에서 그 덩이에 타이핑하면 결과는 HTML 이다. 그대로 저장하면 문안의 원본이
   HTML 이 되어 버린다. `**굵게**` · {TBD} · {→05} · 구간 표기 · 줄바꿈으로 되돌린다.

   **inline() 과 한 파일에 산다.** 둘은 역함수라 한쪽만 고치면 왕복이 깨진다 —
   `Shell.jsx` 와 `scripts/roundtrip.mjs` 가 사본을 따로 들고 있다가 실제로 갈라졌다
   (구간 표기를 inline() 에만 넣었더니 roundtrip 17건이 틀렸다) · N-글자 d.
   `roundtrip.mjs` 는 브라우저 안으로 못 가져가므로 이 함수를 문자열로 넣어 쓴다.

   DOM 을 읽지만 node 의존은 아니다 — 부르는 쪽이 언제나 브라우저다. */
export function 원문(node) {
  let s = '';
  for (const n of node.childNodes) {
    if (n.nodeType === 3) { s += n.nodeValue; continue; }
    const 이름 = n.nodeName;
    if (이름 === 'BR') { s += '\n'; continue; }
    const cl = n.classList;
    if (cl?.contains('tbd')) { s += cl.contains('co') ? '{TBD협의}' : '{TBD}'; continue; }
    if (cl?.contains('ar')) {
      s += '{→' + n.textContent.replace(/^\s*→\s*/, '').replace(/^p\./, '').trim() + '}';
      continue;
    }
    if (이름 === 'B' || 이름 === 'STRONG') { s += '**' + 원문(n) + '**'; continue; }
    /* 구간 스타일 · N-글자 d — `<span class="i-결론 i-29">` → `{결론·29|글}`.
       **클래스 순서를 그대로 쓴다** · classList 가 원본 순서를 지키므로
       적힌 순서로 되읽힌다 · 그래야 왕복이 문자 그대로 맞는다 */
    const 구간 = cl ? [...cl].filter((c) => c.startsWith('i-')) : [];
    if (구간.length) { s += `{${구간.map((c) => c.slice(2)).join('·')}|${원문(n)}}`; continue; }
    s += 원문(n);
  }
  return s;   // NBSP 는 그대로 둔다
}

// 속성 안에 들어가는 값을 다듬는다. 따옴표까지 막는다 — 안 막으면 이름 하나가
// data-k="…" 를 끊고 그 뒤를 통째로 속성으로 만든다
export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// data-k 속성. 이름이 없으면 붙이지 않는다.
export const dk = (name) => (name ? ` data-k="${esc(name)}"` : '');
