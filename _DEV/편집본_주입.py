# 빌드된 지면 HTML → 제자리 편집본
#   python3 _DEV/편집본_주입.py <입력.html> <출력.html>
import sys, io, re

주입 = r'''
<style id="ed-style">
#edbar{position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:8px;align-items:center;
 padding:8px 14px;background:rgba(20,20,20,.92);color:#fff;font:13px/1.4 Pretendard,sans-serif;
 backdrop-filter:blur(6px)}
#edbar b{font-weight:700;margin-right:6px}
#edbar button{font:inherit;padding:5px 12px;border:0;border-radius:5px;cursor:pointer;
 background:#3a3a3a;color:#fff}
#edbar button:hover{background:#4d4d4d}
#edbar button.on{background:#c8641e}
#edbar .sp{flex:1}
#edbar .cnt{opacity:.62;font-variant-numeric:tabular-nums}
body.ed-on{padding-top:44px!important}
body.ed-on [data-ed]{outline:1px dashed rgba(0,0,0,.16);outline-offset:2px;border-radius:2px}
body.ed-on [data-ed]:hover{outline-color:rgba(200,100,30,.55)}
body.ed-on [data-ed]:focus{outline:2px solid #c8641e;outline-offset:2px;background:rgba(200,100,30,.06)}
[data-ed].ed-dirty{background:rgba(255,214,0,.20)}
@media print{#edbar{display:none!important}
 body.ed-on{padding-top:0!important}
 body.ed-on [data-ed]{outline:0!important}
 [data-ed].ed-dirty{background:transparent!important}}
</style>
<div id="edbar">
 <b>과업수행계획서 편집본</b>
 <button id="ed-toggle" class="on">편집 켬</button>
 <button id="ed-mark" class="on">변경 표시</button>
 <button id="ed-save">HTML 저장</button>
 <button id="ed-print">인쇄 · PDF</button>
 <span class="sp"></span>
 <span class="cnt" id="ed-cnt">변경 0곳</span>
</div>
<script id="ed-script">
(function(){
 var SEL = '.bl,.li,.bd,.tx,.c,.goal,.meta,.hd,.cvt,.cx,.ck,.ci,.pt,.pl,.n';
 var KEEP = '.ar,.tbd,.num,.pgno,.shi';
 var body = document.body, nodes = [];

 function setup(){
  // 배지를 먼저 잠근다. 뒤에 잠그면 data-ed0 기준값과 어긋나 전부 변경으로 잡힌다
  document.querySelectorAll(KEEP).forEach(function(el){ el.setAttribute('contenteditable','false'); });
  document.querySelectorAll(SEL).forEach(function(el){
   if (el.closest('#edbar')) return;
   if (el.querySelector(SEL)) return;          // 잎사귀만
   el.setAttribute('data-ed','');
   nodes.push(el);
  });
  nodes.forEach(function(el){
   if (!el.hasAttribute('data-ed0')) el.setAttribute('data-ed0', el.innerHTML);
  });
 }
 function edit(on){
  nodes.forEach(function(el){ el.setAttribute('contenteditable', on ? 'true' : 'false'); });
  body.classList.toggle('ed-on', on);
 }
 function count(){
  var n = 0;
  nodes.forEach(function(el){
   var chg = el.innerHTML !== el.getAttribute('data-ed0');
   el.classList.toggle('ed-dirty', chg && mark);
   if (chg) n++;
  });
  document.getElementById('ed-cnt').textContent = '변경 ' + n + '곳';
 }
 var on = true, mark = true;
 setup(); edit(true); count();

 body.addEventListener('input', function(e){ if (e.target.closest('[data-ed]')) count(); });

 document.getElementById('ed-toggle').onclick = function(){
  on = !on; edit(on); this.classList.toggle('on', on);
  this.textContent = on ? '편집 켬' : '편집 끔';
 };
 document.getElementById('ed-mark').onclick = function(){
  mark = !mark; this.classList.toggle('on', mark);
  this.textContent = mark ? '변경 표시' : '표시 끔'; count();
 };
 document.getElementById('ed-print').onclick = function(){ window.print(); };
 document.getElementById('ed-save').onclick = function(){
  var was = on; if (was) edit(false);
  document.querySelectorAll('.ed-dirty').forEach(function(el){ el.classList.remove('ed-dirty'); });
  // 저장본에서는 원문 기준을 현재 내용으로 갱신 → 다시 열면 그 상태가 기준
  nodes.forEach(function(el){ el.setAttribute('data-ed0', el.innerHTML); });
  var html = '<!doctype html>\n' + document.documentElement.outerHTML;
  if (was) { edit(true); count(); }
  var d = new Date(), p = function(n){ return String(n).padStart(2,'0'); };
  var name = '과업수행계획서_v2_' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate())
           + '_' + p(d.getHours()) + p(d.getMinutes()) + '.html';
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
 };
 document.addEventListener('keydown', function(e){
  if ((e.metaKey||e.ctrlKey) && e.key === 's'){ e.preventDefault(); document.getElementById('ed-save').click(); }
 });
})();
</script>
'''

src, dst = sys.argv[1], sys.argv[2]
h = io.open(src, encoding='utf-8').read()
h = re.sub(r'<style id="ed-style">.*?</script>\s*', '', h, flags=re.S)   # 재주입 대비
if '</body>' not in h: raise SystemExit('</body> 를 못 찾았다')
h = h.replace('</body>', 주입 + '\n</body>')
io.open(dst, 'w', encoding='utf-8').write(h)
print(dst, f'{len(h)/1024:.0f}KB')
