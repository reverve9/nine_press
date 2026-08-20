# P2-f 구현 프롬프트 — 격자 확장

작성 2026-08-19 · 대상 `/Volumes/BridgeNine/NINE_DEV/PROJECT/NINE_press`
선행 **P2-e**(걸음 보정). **P2-e 를 아직 안 돌렸으면 그것부터 돌린다.**

---

## §0 역할

격자를 셋으로 넓힌다.

| | 무엇 | 성격 |
|---|---|---|
| ① | **12칸 세로 띠** — 페이지 위에서 아래까지 관통 | 고정 · 규칙이 정함 |
| ② | **여백 · 본문 경계** 네 선 | 고정 · 규칙이 정함 |
| ③ | **행 경계선** | 콘텐츠가 정함 · 참고선 |

지금은 ①이 `.bd` 안에만 있어 **헤더와 쪽번호 자리에 안 깔린다.** 그래서 헤더 요소와 블록의 세로 정렬을 못 본다.

**스위치는 하나다.** `⌘\` 로 셋이 함께 켜지고 꺼진다.

**이 프롬프트의 범위 밖을 건드리지 않는다.**

---

## §1 작업 범위 — `app/ui/Shell.jsx`

### 1-1. 격자 스타일 교체

`재기()` 가 주입하는 `<style>` 의 **격자 세 줄(358–363행 부근)을 아래로 갈음한다.**

```css
.gridov{position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:40;display:none}
html.gridon .gridov{display:block}
.gridov .c{position:absolute;top:0;bottom:0;background:rgba(200,0,120,.07)}
.gridov .v{position:absolute;top:0;bottom:0;width:3px;background:rgba(200,0,120,.5)}
.gridov .h{position:absolute;left:0;right:0;height:3px;background:rgba(200,0,120,.5)}
.gridov .r{position:absolute;left:0;right:0;height:2px;background:rgba(200,0,120,.28)}
```

**선을 3px 로 두는 이유** — 축척 30% 에서 화면 0.9px 이다. 1px 로 두면 화면에서 사라진다.

### 1-2. 격자 심기 교체

**P2-d 에서 `.bd` 에 심던 블록(448–461행 부근) 전체를 아래로 갈음한다.**

```js
// 격자 — 도구 전용. 판면에는 아무 영향이 없다.
//   .c 12칸 세로 띠   .v 좌우 여백   .h 본문 상하   .r 행 경계
// 페이지 전면에 깔아 헤더 · 쪽번호 자리와의 세로 정렬까지 본다.
const page = d.querySelector('.page');
const bd = d.querySelector('.page .bd');
if (page && !page.querySelector('.gridov')) {
  const ov = d.createElement('div');
  ov.className = 'gridov';
  if (bd) {
    const L = bd.offsetLeft, W = bd.offsetWidth;
    const T = bd.offsetTop,  H = bd.offsetHeight;
    const 걸음 = 92.73975 * uu;              // 180.75px
    const 칸폭 = (92.73975 - 14.879) * uu;   // 151.75px
    for (let k = 0; k < 12; k++) {
      const c = d.createElement('i');
      c.className = 'c';
      c.style.left = (L + k * 걸음) + 'px';
      c.style.width = 칸폭 + 'px';
      ov.appendChild(c);
    }
    for (const x of [L, L + W]) {
      const v = d.createElement('i');
      v.className = 'v';
      v.style.left = (x - 1.5) + 'px';
      ov.appendChild(v);
    }
    for (const y of [T, T + H]) {
      const h = d.createElement('i');
      h.className = 'h';
      h.style.top = (y - 1.5) + 'px';
      ov.appendChild(h);
    }
  }
  page.appendChild(ov);
}
```

**`.bd` 를 실측해서 쓴다.** 여백을 상수로 박지 않는다 — `.sim` 판면은 본문 시작이 다르다(`100u` 대 `121.6u`).

**표지 면(`.cvp`)에는 `.bd` 가 없다.** 그때는 오버레이만 빈 채로 붙고 아무것도 안 그려진다.

### 1-3. 행 경계선 — 폰트가 앉은 뒤에 그린다

위 블록 **바로 뒤**에 넣는다.

```js
// 행 경계는 콘텐츠가 정하므로 폰트가 앉은 뒤에 잰다.
// 행 하나에 위·아래 두 줄이 그어져 그 사이가 행 간격(29px)으로 보인다.
const 행선 = () => {
  const ov = d.querySelector('.gridov');
  const bd2 = d.querySelector('.page .bd');
  if (!ov || !bd2) return;
  ov.querySelectorAll('.r').forEach((x) => x.remove());
  bd2.querySelectorAll(':scope > .row, :scope > .foot').forEach((el) => {
    for (const y of [el.offsetTop, el.offsetTop + el.offsetHeight]) {
      const r = d.createElement('i');
      r.className = 'r';
      r.style.top = (bd2.offsetTop + y - 1) + 'px';
      ov.appendChild(r);
    }
  });
};
(d.fonts?.ready ?? Promise.resolve()).then(행선);
```

**`.row` 의 `offsetParent` 는 `.bd` 다**(`.bd{position:absolute}`). 그래서 `bd.offsetTop` 을 더해 페이지 기준으로 옮긴다.

### 1-4. 토글은 그대로

상태 · `격자ref` · 버튼 · `⌘\` 는 P2-d 그대로 둔다. `classList.toggle('gridon', …)` 두 자리도 그대로다.

---

## §2 금지 사항

| | |
|---|---|
| ① | **`rules/page.css` 를 건드리지 않는다.** 격자는 주입 `<style>` 에만 |
| ② | **`render/index.js` 를 건드리지 않는다.** 격자가 산출 HTML 에 들어가면 안 된다 |
| ③ | **`content/**` 를 건드리지 않는다** |
| ④ | 끌기 · 칩 · 열넣기 · 열빼기 로직을 건드리지 않는다 |
| ⑤ | 여백값 · 본문 시작값을 **상수로 박지 않는다.** `.bd` 를 잰다 |
| ⑥ | 스위치를 늘리지 않는다. **`⌘\` 하나로 셋이 함께** |
| ⑦ | 격자 상태를 파일이나 브라우저 저장소에 남기지 않는다 |
| ⑧ | `next build` 를 돌리지 않는다 |
| ⑨ | `git` 명령을 직접 쓰지 않는다. **`sh scripts/save.sh "메시지" <경로들>`** 만 쓴다 |

---

## §3 착수 전 확정 사항

| | 확정값 |
|---|---|
| Q1 · 범위 | **페이지 전면.** 띠가 위에서 아래까지 관통한다 |
| Q2 · 가로선 | **여백 · 본문 경계 넷 + 행 경계.** 행 경계는 더 옅게 |
| Q3 · 스위치 | **하나.** `⌘\` 로 셋이 함께 |
| Q4 · 세로 균등 눈금 | **안 그린다.** 세로에는 고정 격자가 없다 — 높이는 콘텐츠가 정한다 |
| Q5 · 선 굵기 | **고정선 3px · 행선 2px.** 축척 30% 에서 보이는 최소치 |
| Q6 · 여백값 | **`.bd` 실측.** `.sim` 판면은 본문 시작이 다르다 |

---

## §4 커밋

```
sh scripts/save.sh "P2-f · 격자를 페이지 전면으로 · 여백과 행 경계선" app/ui/Shell.jsx
```

---

## §5 관문

### 5-1. 왕복

```
node scripts/roundtrip.mjs content/sokcho/실행계획서.json
node scripts/roundtrip.mjs content/sokcho/사업장운영시뮬레이션.json
```

**`검사 1040개 · 불일치 0개` · `검사 600개 · 불일치 0개`.**

### 5-2. 산출 HTML 에 격자가 없는가

```
node scripts/build.js content/_check/폭조절.json --link
node scripts/build.js content/sokcho/사업장운영시뮬레이션.json --link
grep -c "gridov" out/html/폭조절.html out/html/사업장운영시뮬레이션.html
```

**둘 다 `0`.**

### 5-3. 걸음이 한 값인가

```
grep -n "92.73975" app/ui/Shell.jsx
```

**세 줄이 나와야 한다** — 끌기 `칸너비` · 격자 `걸음` · 격자 `칸폭`.
**`92.73975 + 14.879` 는 한 줄도 남으면 안 된다.**

### 5-4. 눈 검사는 사용자가 한다

dev 서버에 붙지 않는다.

---

## §6 핸드오프 예상 출력

| | |
|---|---|
| ① | 변경 파일과 `git show --stat` |
| ② | `roundtrip` 두 문서의 마지막 줄 |
| ③ | §5-2 `grep -c` 결과 |
| ④ | §5-3 grep 결과 전문 |
| ⑤ | 행 경계선을 그리는 코드가 어느 시점에 도는지 — 함수 이름과 행 번호 |
| ⑥ | 예상과 다른 것이 있으면 **고치지 말고 보고한다** |

---

## §7 다음 블록 예고

**P2 눈 검사** — 격자를 켠 채 `_check / 폭조절` 면01 에서 판정한다.
통과하면 **P3 · 블록 이동 드래그**.
**이번 턴에 미리 손대지 않는다.**
