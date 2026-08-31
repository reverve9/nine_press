// 인라인 표기 → HTML
//
//   **굵게**        → <b>
//   {TBD}           → 회색 점선 배지 · 수행사가 채운다
//   {TBD협의}       → 주황 점선 배지 · 주관기관 확인 후 확정
//   {→05}           → 면 연결 표기 (.ar) · 숫자만 오면 "→ p.05"
//   줄바꿈(Enter)     → <br>
//
// 문자열은 이스케이프하지 않는다. 필요하면 HTML 을 그대로 써도 된다.
// 이 도구는 단독 사용이고 콘텐츠 작성자가 곧 운영자다.

export function inline(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\{TBD협의\}/g, '<span class="tbd co">TBD · 협의</span>')
    .replace(/\{TBD\}/g, '<span class="tbd">TBD</span>')
    .replace(/\{→\s*([^}]+)\}/g,
      (_, x) => `<span class="ar">→ ${/^\d+$/.test(x) ? 'p.' + x : x}</span>`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    // 줄바꿈 — 폼에서 Enter 를 치면 JSON 에 \n 이 들어온다. 마지막에 <br> 로 바꾼다.
    // 굵게·TBD·면연결을 먼저 처리한 뒤에 해야 표기 안에 <br> 가 끼어들지 않는다.
    .replace(/\r\n?|\n/g, '<br>');
}

// 속성 안에 들어가는 값을 다듬는다. 따옴표까지 막는다 — 안 막으면 이름 하나가
// data-k="…" 를 끊고 그 뒤를 통째로 속성으로 만든다
export const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// data-k 속성. 이름이 없으면 붙이지 않는다.
export const dk = (name) => (name ? ` data-k="${esc(name)}"` : '');
