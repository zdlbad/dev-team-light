// 给 document、location 装个假的，把页面脚本跑一遍，各视图 render 一次；报错就说明页面会白板
// 后半截用机器上的 Edge（没有就找 Chrome）无头真排一次版：文件结构小样每行不出卡片、关系图上的字不压框、外面的框不重叠
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
const el = (id) => (els[id] ??= { innerHTML: '', hidden: false, addEventListener() {}, dataset: {}, className: '', style: {}, classList: { toggle() {} } });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, querySelectorAll: () => [], addEventListener() {} };
global.window = { addEventListener() {} };
global.location = { hash: '' };
const run = (hash, tail = '') => { global.location.hash = hash; els.main = undefined; els.nav = undefined; eval(script + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML };
// 关系图里的框：两两不重叠（外面的东西多于一样时竖着排，不叠在一处）
const rectsOf = (s) => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1, 5).map(Number));
const apart = (rs) => rs.every(([x, y, w, h], i) => rs.slice(i + 1).every(([x2, y2, w2, h2]) => x + w <= x2 || x2 + w2 <= x || y + h <= y2 || y2 + h2 <= y));
const SAMPLE_STRUCT = `${__dirname}/../样板项目/上下文/养老系统/代码/规范/结构设计.json`;
const cases = [
  ['#tree', (s) => s.includes('class="tree"') && s.includes('participant-file.ts') && s.includes('共 21 个文件') && s.includes('清单 <b>建档</b>') && s.includes('左边点一个文件') && s.split('<!--nav-->')[1].includes('技术选型') && !s.split('<!--nav-->')[1].includes('走通一段')],
  ['#spec/结构设计', (s) => s.includes('<svg class="arch"') && (s.match(/<rect x="200"/g) || []).length === 3 && (s.match(/marker-end/g) || []).length === 6 && s.includes('政府门户') && s.includes('>银行<') && rectsOf(s).length === 6 && apart(rectsOf(s)) && s.includes('class="code tree-sample"') && s.includes('<span class="p">in-memory-participant-file-repository.ts</span>') && s.includes('style="--ind:4ch"') && s.includes('2026-11-01 定下') && !s.includes('class="decide"'), 'delete STRUCTURE.modules; render()'],
  // 结构图：只画一个模块看结构（不出真主题名），ports/ 经端口指到「别的模块」；infras/ 里 http/、event-bus/，两条总线都在 event-bus/ 里；依赖箭头 11 条：层与层 3 条、bootstrap → module.ts、bootstrap → 模块间总线、module.ts → event-bus/、adapters/ → event-bus/、adapters/ → http/、ports/ → 别的模块、外面两样 → http/
  ['#spec/结构设计', (s) => s.includes('<svg class="struct"') && !s.includes('class="arch2"') && (s.match(/class="fr mod"/g) || []).length === 1 && s.includes('>&lt;模块&gt;/<') && s.includes('>一个主题一个模块，每个都这样摆<') && !s.includes('>g2 参与者档案与她名下的钱<') && !s.includes('还有 ') && s.includes('class="b rest" data-id="别的模块"') && s.includes('data-id="infras/http/"') && s.includes('class="fr ev" data-id="infras/event-bus/"') && s.includes('class="b bus" data-id="bus/模块内"') && s.includes('class="b bus" data-id="bus/模块间"') && s.indexOf('data-id="bus/模块间"') > s.indexOf('data-id="infras"') && (s.match(/<path class="e/g) || []).length === 11 && (s.match(/<path class="e x"/g) || []).length === 3 && s.includes('data-from="模块/adapters/" data-to="模块/application/"') && s.includes('data-from="模块/application/" data-to="模块/domain/"') && s.includes('data-from="模块/adapters/" data-to="模块/domain/"') && s.includes('data-from="bootstrap" data-to="模块/module.ts"') && s.includes('data-from="bootstrap" data-to="bus/模块间"') && s.includes('data-from="模块/module.ts" data-to="infras/event-bus/"') && s.includes('data-from="模块/adapters/" data-to="infras/http/"') && s.includes('data-from="模块/adapters/" data-to="infras/event-bus/"') && s.includes('data-from="模块/ports/" data-to="别的模块"') && s.includes('data-from="out/银行" data-to="infras/http/"') && s.includes('>端口<') && s.includes('class="code tree-sample"')],
  // 模块再多也只画一个，不列「还有几个」、不出主题名
  ['#spec/结构设计', (s) => (s.match(/class="fr mod"/g) || []).length === 1 && !s.includes('还有 ') && !s.includes('g9') && s.includes('data-to="别的模块"'), "STRUCTURE.modules = [1,2,3,4,5,6,7].map((i) => ({ topic: 'g' + i, dir: 'm' + i })); MODEL.aggs.push({ id: 'x', title: 'x', topic: 'g9', members: [] }); render()"],
  // 全局结构：左边栏顶上一条；按 kind 分行，外部在最右；虚框三个；定下按钮不带上下文
  ['#全局结构', (s) => s.includes('<svg class="glob"') && s.split('<!--nav-->')[1].includes('class="cx proj on" href="#全局结构"') && ['用户', '前端', '后端', '数据库与存储'].every((r) => s.includes('class="rw" x="14"') && s.includes('>' + r + '</text>')) && (s.match(/<g class="n /g) || []).length === 9 && (s.match(/ later"/g) || []).length === 3 && s.includes('原型没有：正式化时接') && (s.match(/class="pill"/g) || []).length === 4 && (s.match(/class="e"/g) || []).length === 8 && s.includes('data-kind="全局结构"') && s.includes('等你定') && !s.includes('class="badge">模板')],
  // 同一个上下文的前端、后端上下对齐；外部在最右一列
  ['#全局结构', (s) => { const xs = [...s.matchAll(/<g class="n k-([^ "]+)[^"]*"><rect class="b" x="([\d.]+)"/g)].map((m) => [m[1], +m[2]]); const web = xs.find((x) => x[0] === '前端')[1], api = xs.find((x) => x[0] === '后端')[1], gov = xs.find((x) => x[0] === '外部')[1]; return web === api && xs.every((x) => x[0] === '外部' || x[1] < gov) }],
  ['#全局结构', (s) => s.includes('定了 11-02') && !s.includes('data-kind="全局结构"') && s.includes('class="badge">模板'), 'GLOBAL.decidedAt = "2026-11-02"; GLOBAL.fromTemplate = true; render()'],
  // 样板项目的结构设计 outside 两条：两个框各在一处、各一条线
  ['#spec/结构设计', (s) => { const o = s.slice(s.indexOf('事件、查询')); return (o.match(/<rect /g) || []).length === 2 && apart(rectsOf(s)) && (o.match(/marker-end/g) || []).length === 2 && new Set(o.match(/<path d="M[\d.]+,[\d.]+/g)).size === 2 }, `delete STRUCTURE.modules; STRUCTURE.outside = JSON.parse(require('fs').readFileSync(${JSON.stringify(SAMPLE_STRUCT)}, 'utf8')).outside; render()`],
  ['#spec/文件命名', (s) => s.includes('class="code tree-sample"') && s.includes('class="g tee"') && s.includes('class="g end"') && s.includes('class="g bar"') && s.includes('class ParticipantFile<') && s.includes('in-memory-&lt;根&gt;-repository') && s.includes('2026-11-01 定下') && !s.includes('class="t qa"')],
  ['#tree/src/participant-file/participant-file.ts', (s) => s.includes('class="tree"') && s.includes('class="f on"') && s.includes('class="psrow"') && s.includes('class="code ps tests"') && s.includes('抛 通知书不全') && s.includes('给  通知书 编号为空') && s.includes('style="--ind:4ch">编号 ← 通知书.编号')],
  ['#tree/src/participant-file/register.ts', (s) => s.includes('参与者登记.查唯一')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('还没写伪代码')],
  // 文件树：默认只开当前文件那一串；点文件夹只开合；收起后同一个文件重画不撑开；换了文件那一串再开
  ['#tree', (s) => s.includes('data-tg="src" title="收起"') && s.includes('data-tg="src/participant-file" title="收起"') && s.includes('data-tg="src/fund" title="展开"') && !s.includes('data-path="src/fund/fund.ts"') && s.includes('class="card tree-box"')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="收起"') && s.includes('data-tg="src/participant-file" title="展开"') && s.includes('class="f on') && !s.includes('data-path="src/participant-file/register.ts"')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="展开"') && !s.includes('data-path="src/fund/fund.ts"'), "treeToggle('养老系统:src/fund'); render(); render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="收起"') && s.includes('data-path="src/fund/fund-account.ts"'), "treeToggle('养老系统:src/fund'); render(); view = 'tree/src/fund/fund-account.ts'; render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/participant-file" title="收起"') && s.includes('data-tg="src/fund" title="收起"'), "treeToggle('养老系统:src/participant-file'); render()"],
  // 树栏整栏收起：默认展开、头上有收起钮；收起后只剩窄边、记进本机；换文件仍收着；再展开回来
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col"') && s.includes('data-tree-hide') && s.includes('data-tree-show')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col hide"') && s.includes('<!--ls:1-->'), "globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null }, setItem(k, v) { this.m[k] = String(v) } }; treeHide(true); render(); els.main.innerHTML += '<!--ls:' + localStorage.m['dev-team-lite/编码/文件树收起'] + '-->'"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col hide"') && s.includes('class="f on') , "treeHide(true); view = 'tree/src/fund/fund-account.ts'; render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col"') && s.includes('<!--ls:0-->'), "globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null }, setItem(k, v) { this.m[k] = String(v) } }; treeHide(true); render(); treeHide(false); render(); els.main.innerHTML += '<!--ls:' + localStorage.m['dev-team-lite/编码/文件树收起'] + '-->'"],
  // 伪代码整份一起定：没定时页头一个定下钮、框头「未定」、左边栏「等你定」；定了变日期、框头「定了」；定下后改过的写「定下后改过」
  ['#tree/src/participant-file/participant-file.ts', (s) => s.includes('data-pseudo>定下</button>') && s.includes('<span class="todo">等你定</span>') && s.includes('>未定</span>') && s.split('<!--nav-->')[1].includes('<small class="wait">等你定</small>')],
  ['#tree/src/participant-file/participant-file.ts', (s) => !s.includes('data-pseudo') && s.includes('<span class="badge">2026-11-04 定下</span>') && s.includes('>定了</span>') && !s.includes('>未定</span>') && !s.split('<!--nav-->')[1].includes('class="wait"'), "STRUCT.decidedAt = '2026-11-04'; render()"],
  ['#tree/src/participant-file/participant-file.ts', (s) => s.includes('定下后改过，等你重定') && s.includes('data-pseudo>定下</button>'), "STRUCT.changedSince = '2026-11-03'; render()"],
  ['#spec/技术选型', (s) => s.includes('node:http') && s.includes('模板：Express') && s.includes('原型阶段没有前端') && s.split('<!--nav-->')[1].includes('class="sub on"')],
  ['#排版系统/spec/技术选型', (s) => s.includes('还没开始') && s.split('<!--nav-->')[1].includes('class="cx on" data-cx="排版系统"')],
];
let bad = 0;
for (const [h, ok, tail] of cases) {
  let out;
  try { out = run(h, tail) } catch (e) { console.log(h, 'ERROR', e.message); bad++; continue }
  const pass = out.length > 0 && ok(out);
  console.log(h, tail ? `(${tail.split(';')[0].slice(0, 40)})` : '', out.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}

// ---------- 定伪代码：页面钮和命令行共用 applyAction ----------
{
  const { applyAction, pageData } = require('../../lib/project.js')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-pseudo-'))
  const k = path.join(tmp, '上下文', '甲', '代码')
  const w = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)) }
  w(path.join(tmp, '项目.json'), { name: 't', contexts: [{ name: '甲' }], kernel: { concepts: [] } })
  w(path.join(k, '结构.json'), { lang: 'TypeScript', root: 'src', files: [{ path: 'src/a.ts', kind: '命令' }] })
  w(path.join(k, '伪代码', 'src', 'a.ts.json'), { file: 'src/a.ts', blocks: [{ name: '处理', steps: ['一'] }] })
  const errs = [], now = '2026-11-04T10:00'
  try {
    if (pageData(tmp, '编码').STRUCT?.decidedAt) errs.push('没定就带了 decidedAt')
    const r = applyAction(tmp, '定伪代码', { context: '甲' }, { now })
    const st = JSON.parse(fs.readFileSync(path.join(k, '结构.json'), 'utf8'))
    if (!r.ok || st.decidedAt !== '2026-11-04' || !st.decidedSig) errs.push('定下没写 decidedAt ' + JSON.stringify(r))
    const log = fs.readFileSync(path.join(tmp, '日志', '2026-11-04.jsonl'), 'utf8')
    if (!/"kind":"定下".*"page":"编码".*定下 甲 的文件结构与伪代码/.test(log)) errs.push('日志没记定下')
    if (pageData(tmp, '编码').STRUCT?.decidedAt !== '2026-11-04') errs.push('定下后页面数据不是定了')
    if (applyAction(tmp, '定伪代码', { context: '甲' }, { now }).ok) errs.push('定过了还能再定')
    w(path.join(k, '伪代码', 'src', 'a.ts.json'), { file: 'src/a.ts', blocks: [{ name: '处理', steps: ['一', '二'] }] })
    const d2 = pageData(tmp, '编码').STRUCT
    if (d2.decidedAt || d2.changedSince !== '2026-11-04') errs.push('改了伪代码还当定了 ' + JSON.stringify({ a: d2.decidedAt, c: d2.changedSince }))
    if (!applyAction(tmp, '定伪代码', { context: '甲' }, { now }).ok) errs.push('改过以后不能重定')
  } catch (e) { errs.push('出错 ' + e.message) } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
  console.log('定伪代码（临时项目）', errs.length ? 'FAIL' : 'ok'); errs.forEach((e) => console.log('   ', e)); if (errs.length) bad++
  if (!html.includes("post('定伪代码', { context })")) { console.log('定伪代码 页面钮没走 定伪代码 FAIL'); bad++ }
}

// ---------- 真排版 ----------
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' ];
const exe = BROWSERS.find((p) => fs.existsSync(p));
// 页面里量：小样每个格子的右边不出 pre 的内容框、pre 不横向滚；图上每个字要么整个在它落脚的框里，要么不碰任何框；框两两不重叠
const PROBE = `<script>(() => {
  const out = [], VIEWS = ['spec/结构设计', 'spec/文件命名', '全局结构']
  const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5
  const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5
  for (const v of VIEWS) {
    view = v; render()
    const main = document.getElementById('main')
    for (const pre of main.querySelectorAll('pre.tree-sample')) {
      const r = pre.getBoundingClientRect(), cs = getComputedStyle(pre)
      const right = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
      if (pre.scrollWidth > pre.clientWidth + 1) out.push(v + ' 小样横向溢出 ' + pre.scrollWidth + ' > ' + pre.clientWidth)
      pre.querySelectorAll('.ln').forEach((ln, i) => ln.querySelectorAll('span').forEach((e) => { const er = e.getBoundingClientRect(); if (er.right > right + 0.5) out.push(v + ' 第 ' + (i + 1) + ' 行「' + e.textContent.slice(0, 40) + '」出了卡片 ' + Math.round(er.right - right) + 'px') }))
    }
    // 结构图：不横向溢出；叶子格子两两不叠；线不穿过它两头以外的格子；字不压线（线上的小卡只跟别的线比）；格子里的字不出格子
    for (const svg of main.querySelectorAll('svg.struct')) {
      if (svg.getBoundingClientRect().width > svg.parentElement.clientWidth + 1) out.push(v + ' 结构图横向溢出')
      const leaf = [...svg.querySelectorAll('rect.b')].map((x) => ({ id: x.dataset.id, b: x.getBBox() }))
      leaf.forEach((a, i) => leaf.slice(i + 1).forEach((c) => { if (hit(a.b, c.b)) out.push(v + ' 结构图两个格子重叠 ' + a.id + ' 与 ' + c.id) }))
      const segs = [...svg.querySelectorAll('path.e')].flatMap((p) => { const pts = p.getAttribute('d').slice(1).split(' L').map((q) => q.split(',').map(Number)); return pts.slice(1).map((q, i) => ({ id: p.dataset.e, from: p.dataset.from, to: p.dataset.to, a: pts[i], b: q })) })
      const pts = (sg) => Array.from({ length: 61 }, (_, i) => i / 60).map((t) => [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t])
      const inR = (r, [x, y], m) => x > r.x + m && x < r.x + r.width - m && y > r.y + m && y < r.y + r.height - m
      for (const sg of segs) for (const l of leaf) if (l.id !== sg.from && l.id !== sg.to && pts(sg).some((q) => inR(l.b, q, 1))) out.push(v + ' 结构图的线 ' + sg.from + ' → ' + sg.to + ' 穿过 ' + l.id)
      // 两条线不叠成一段：同一条横线或竖线上重合超过 2px
      const ov = (a, b) => { const H = (sg) => sg.a[1] === sg.b[1], V = (sg) => sg.a[0] === sg.b[0], o = (p, q, r, t) => Math.min(Math.max(p, q), Math.max(r, t)) - Math.max(Math.min(p, q), Math.min(r, t))
        if (H(a) && H(b) && Math.abs(a.a[1] - b.a[1]) < 1) return o(a.a[0], a.b[0], b.a[0], b.b[0]) > 2
        if (V(a) && V(b) && Math.abs(a.a[0] - b.a[0]) < 1) return o(a.a[1], a.b[1], b.a[1], b.b[1]) > 2
        return false }
      segs.forEach((a, i) => segs.slice(i + 1).forEach((b) => { if (a.id !== b.id && ov(a, b)) out.push(v + ' 结构图两条线叠在一起 ' + a.from + ' → ' + a.to + ' 与 ' + b.from + ' → ' + b.to) }))
      // 模块的 ports/ 有虚线到「别的模块」
      for (const m of svg.querySelectorAll('rect.fr.mod')) if (!svg.querySelector('path.e.x[data-from="' + m.dataset.id + '/ports/"][data-to="别的模块"]')) out.push(v + ' 结构图 ' + m.dataset.id + ' 的 ports/ 没有虚线到别的模块')
      // 模块的 adapters/ 都指到总线那组和 http/
      const evId = svg.querySelector('rect.fr.ev')?.dataset.id, httpId = [...svg.querySelectorAll('rect.b')].map((x) => x.dataset.id).find((d) => d.startsWith('infras/http'))
      for (const m of svg.querySelectorAll('rect.fr.mod')) for (const to of [evId, httpId]) if (to && !segs.some((sg) => sg.from === m.dataset.id + '/adapters/' && sg.to === to)) out.push(v + ' 结构图 ' + m.dataset.id + ' 的 adapters/ 没有线到 ' + to)
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox(), own = t.dataset.for
        if (segs.some((sg) => sg.id !== own && pts(sg).some((q) => inR(b, q, 0.5)))) out.push(v + ' 结构图的字「' + t.textContent + '」压在线上')
        const host = leaf.find((l) => l.b.x <= b.x + 1 && b.x + 1 <= l.b.x + l.b.width && l.b.y <= b.y + b.height / 2 && b.y + b.height / 2 <= l.b.y + l.b.height)
        if (host ? !inside(b, host.b) : leaf.some((l) => hit(b, l.b))) out.push(v + ' 结构图的字「' + t.textContent + '」出了格子或压在格子上')
      }
      const vb = svg.viewBox.baseVal; svg.querySelectorAll('text').forEach((t) => { const b = t.getBBox(); if (b.x < 0 || b.x + b.width > vb.width + 0.5) out.push(v + ' 结构图的字「' + t.textContent + '」出了图') })
    }
    for (const svg of main.querySelectorAll('svg.glob')) {
      const host = svg.parentElement
      if (svg.getBoundingClientRect().width > host.clientWidth + 1) out.push(v + ' 全局结构横向溢出')
      const nodes = [...svg.querySelectorAll('rect.b')].map((x) => x.getBBox()), lbs = [...svg.querySelectorAll('rect.lb')].map((x) => x.getBBox())
      nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 全局结构两个框重叠') }))
      lbs.forEach((a, i) => { if (nodes.some((b) => hit(a, b))) out.push(v + ' 线上的字压在框上 @' + Math.round(a.x) + ',' + Math.round(a.y)); lbs.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 线上的字互相压着') }) })
      svg.querySelectorAll('g.n').forEach((g) => { const r = g.querySelector('rect.b').getBBox(); g.querySelectorAll('text').forEach((t) => { if (!inside(t.getBBox(), r)) out.push(v + ' 框里的字「' + t.textContent + '」出了框') }) })
      const vb = svg.viewBox.baseVal; lbs.forEach((l) => { if (l.x < 0 || l.y < 0 || l.x + l.width > vb.width + 0.5 || l.y + l.height > vb.height + 0.5) out.push(v + ' 线上的字出了图 @' + Math.round(l.x) + ',' + Math.round(l.y)) })
      svg.querySelectorAll('text.lt').forEach((t) => { const b = t.getBBox(); if (!lbs.some((l) => inside(b, l))) out.push(v + ' 线上的字「' + t.textContent + '」出了底') })
    }
    for (const svg of main.querySelectorAll('svg.arch')) {
      const rects = [...svg.querySelectorAll('rect')].map((x) => x.getBBox())
      rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 图上两个框重叠 @' + Math.round(a.x) + ',' + Math.round(a.y) + ' 与 ' + Math.round(b.x) + ',' + Math.round(b.y)) }))
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox(), host = rects.find((r) => r.x <= b.x + 1 && b.x + 1 <= r.x + r.width && r.y <= b.y + b.height / 2 && b.y + b.height / 2 <= r.y + r.height)
        if (host ? !inside(b, host) : rects.some((r) => hit(b, r))) out.push(v + ' 图上的字「' + t.textContent + '」压在框边上')
      }
    }
  }
  // 伪代码定下钮：在页头里，点了（写死的数据就地标上）钮没了、写日期，框头「定了」
  if (!LIVE && Object.keys(PSEUDO).length) {
    view = 'tree/' + Object.keys(PSEUDO)[0]; render()
    const b = document.querySelector('h1 button.decide[data-pseudo]')
    if (!b) out.push('伪代码 页头没有定下钮')
    else { b.click(); const h = document.querySelector('h1').textContent, cap = document.querySelector('.row2>.r .cap')?.textContent ?? ''
      if (document.querySelector('h1 button.decide') || !/定下/.test(h)) out.push('伪代码 点了定下钮没变成日期')
      if (!cap.includes('定了')) out.push('伪代码 定下后框头不是「定了」 ' + cap)
      delete STRUCT.decidedAt; render() }
  }
  // 文件树栏：固定高度、栏内滚，不撑长整页；文件名不横着出栏
  view = 'tree/' + STRUCT.files[STRUCT.files.length - 1].path; render()
  const box = document.querySelector('.tree-box')
  if (!box) out.push('文件树 没有树栏')
  else {
    const cs = getComputedStyle(box)
    if (!/auto|scroll/.test(cs.overflowY) || cs.maxHeight === 'none') out.push('文件树 树栏没有固定高度或不在栏内滚 ' + cs.overflowY + ' ' + cs.maxHeight)
    if (box.getBoundingClientRect().height > innerHeight - 40) out.push('文件树 树栏比一屏还高 ' + Math.round(box.getBoundingClientRect().height))
    if (box.scrollWidth > box.clientWidth + 1) out.push('文件树 文件名横着出了栏 ' + box.scrollWidth + ' > ' + box.clientWidth)
  }
  // 树栏整栏收起：点钮只剩窄边、右边变宽、记进本机；换文件仍收着；点窄边展开回来
  {
    const col = () => document.querySelector('.tree-col'), rw = () => document.querySelector('.row2>.r').getBoundingClientRect().width
    document.head.insertAdjacentHTML('beforeend', '<style>.tree-col{transition:none!important}</style>')
    const w0 = rw(), hb = document.querySelector('[data-tree-hide]')
    if (!hb) out.push('文件树 没有收起钮')
    else {
      hb.click()
      const cw = col().getBoundingClientRect().width
      if (!col().classList.contains('hide') || cw > 40) out.push('文件树 点收起后树栏没缩成窄边 ' + Math.round(cw))
      if (rw() < w0 + 300) out.push('文件树 收起后伪代码栏没变宽 ' + Math.round(w0) + ' → ' + Math.round(rw()))
      let saved = null; try { saved = localStorage.getItem('dev-team-lite/编码/文件树收起') } catch {}
      if (saved !== '1') out.push('文件树 收起没记进本机 ' + saved)
      view = 'tree/' + STRUCT.files[0].path; render()
      if (!col().classList.contains('hide')) out.push('文件树 换了文件树栏又展开了')
      if (!document.querySelector('.row2>.r .card')) out.push('文件树 收起后右边没有伪代码')
      document.querySelector('[data-tree-show]').click()
      if (col().classList.contains('hide') || col().getBoundingClientRect().width < 300) out.push('文件树 点窄边没展开')
      try { localStorage.removeItem('dev-team-lite/编码/文件树收起') } catch {}
    }
  }
  const p = document.createElement('pre'); p.id = '__layout'; p.textContent = JSON.stringify(out); document.body.appendChild(p)
})()</script>`;
function layout(data, width) {
  const page = html.replace('<head>', `<head><base href="${pathToFileURL(__dirname + '/').href}">${data ? `<script>window.DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}`).replace(/<\/body>/, PROBE + '</body>');
  const tmp = path.join(os.tmpdir(), `dtl-coding-check-${process.pid}.html`);
  fs.writeFileSync(tmp, page);
  try {
    const dom = execFileSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--window-size=${width},1000`, '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(tmp).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = dom.match(/<pre id="__layout">([\s\S]*?)<\/pre>/);
    if (!m) return ['没量到（页面脚本可能报错了）'];
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  } finally { fs.rmSync(tmp, { force: true }) }
}
if (!exe) console.log('真排版', '没找到 Edge 或 Chrome，跳过');
else {
  // 写死的数据；再换一份长的：模板默认、外面三样、一行特别长的文件名和说明
  const T = (k) => JSON.parse(fs.readFileSync(`${__dirname}/../../templates/${k}.json`, 'utf8'));
  const long = { line: '      tests/contexts/visit-and-assessment-application/domain/registration-form/aggregate-root.RegistrationFormAggregateRoot.test.ts', layer: '领域', note: '这一行故意很长：文件名本身就比卡片还宽，说明也写得很长很长，看它折行之后还能不能整行看全，不被右边截掉' };
  const struct = T('结构设计'), naming = T('文件命名');
  struct.outside = [...struct.outside, { name: '银行', how: '付款' }, { name: 'Services Australia 政府门户', how: '查补贴' }];
  struct.sample = [...struct.sample, long];
  naming.sample = [...naming.sample, { ...long, kind: '测试', exports: 'describe RegistrationFormAggregateRoot, describe RegistrationFormAggregateRoot.register' }];
  const eight = { ...struct, modules: ['visit-and-assessment-application', 'participant-file-and-agreements', 'services-and-price-list', 'funds', 'care-plans-and-budgets', 'service-records', 'monthly-statements', 'claims-and-payments'].map((dir, i) => ({ topic: 'g' + i, dir })) };
  const glong = T('全局结构');
  glong.nodes = [...glong.nodes, { id: 'm', name: '手机 app', kind: '前端', context: '沟通', holds: '老人和家属在手机上看余额、聊天、看月结单，一句故意写得很长的说明，看它在框里折行', later: '第三期' }, { id: 'mb', name: '沟通后端', kind: '后端', context: '沟通', holds: '消息、群聊' }, { id: 'gov', name: 'Services Australia 政府门户', kind: '外部', holds: '申报' }];
  glong.edges = [...glong.edges, { from: 'm', to: 'mb', label: 'HTTP' }, { from: 'mb', to: 'api', label: '查询：照护伙伴和名下老人、档案、照护计划；互发事件' }, { from: 'api', to: 'gov', label: '申报、付款对账' }];
  const sets = [['写死的', null], ['模板加长行、外面三样', { STRUCTURE: struct, NAMING: naming, GLOBAL: T('全局结构') }], ['八个模块、全局结构加长', { STRUCTURE: eight, NAMING: naming, GLOBAL: glong }]]
  if (process.env.CHECK_PROJECT) sets.push(['真项目 ' + path.basename(process.env.CHECK_PROJECT), require('../../lib/project.js').pageData(process.env.CHECK_PROJECT, '编码')])
  for (const [name, data] of sets) {
    for (const w of [1500, 1100]) {
      let errs;
      try { errs = layout(data, w) } catch (e) { errs = ['跑浏览器出错 ' + e.message] }
      console.log('真排版', name, w, errs.length ? 'FAIL' : 'ok');
      errs.forEach((e) => console.log('   ', e));
      if (errs.length) bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
