// 给 document、location、window 装个假的，把页面脚本跑一遍；换地址、切视角、小样里跳屏（含交棒）、按定下各 render 一次；报错就说明页面会白板
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
const el = (id) => (els[id] ??= { innerHTML: '', srcdoc: '', handlers: {}, dataset: {}, className: '', addEventListener(k, f) { this.handlers[k] = f } });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, addEventListener(k, f) { (global.docH[k] ??= []).push(f) } };   // click 存下来，左边栏点三角用
global.window = { handlers: {}, addEventListener(k, f) { this.handlers[k] = f } };   // hashchange / message 存下来，tail 里能叫
global.location = { reload() {}, _h: '', get hash() { return this._h }, set hash(v) { this._h = v && !String(v).startsWith('#') ? '#' + v : v } };   // 真浏览器赋 hash 会补上 #
// tail：跑完页面脚本再接着跑的一句，比如 go('N-01/new') 再触发 hashchange
const run = (hash, tail = '', data) => { global.location.hash = hash; els.main = undefined; els.nav = undefined; global.window.handlers = {}; global.window.DATA = data; global.docH = {}; global.snap = []; global.posted = []; global.prompt = () => '另一个说法'; eval(script + '\n' + tail + '\n'); return { main: els.main.innerHTML, nav: els.nav.innerHTML, snap: global.snap } };
const count = (s, re) => (s.match(re) || []).length;
global.fetch = (url, opt) => { global.posted.push({ url, body: JSON.parse(opt.body) }); return Promise.resolve({ json: () => ({ ok: true }) }) };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// 左边栏点一下：tg 是点到的折/展开关的 dataset（key、open），没给就不是开关；href 是点到的链接
const navClick = (tg, href) => { const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, target: { closest: (q) => (q === '[data-tg]' && tg ? { dataset: tg } : q === 'a[href^="#"]' && href ? { getAttribute: () => href } : null) } }; for (const fn of global.docH.click ?? []) fn(ev) }
// 左边栏的三角，和页面里同一个样子
const TRI = (key, open) => '<span class="tri" data-tg="1" data-key="' + key + '" data-open="' + (open ? 1 : 0) + '" title="' + (open ? '收起' : '展开') + '">' + (open ? '▾' : '▸') + '</span>'
// 需求那行：正在看的（on）整行也是开关
const REQ = (cx, id, title, { on, open, n, dc }) => '<a href="#' + id + '" class="sub req' + (on ? ' on' : '') + '"' + (on ? ' data-tg="1" data-key="' + cx + '/' + id.split('/')[0] + '" data-open="' + (open ? 1 : 0) + '"' : '') + '>' + TRI(cx + '/' + id.split('/')[0], open) + '<span class="t">' + id.split('/')[0] + ' ' + title + '</span>' + (n ? '<i class="open" title="' + n + ' 条没答">' + n + '</i>' : '') + '<span class="dc" title="已定几屏">' + dc + '</span></a>'
const N01 = '给老人建档，记下支持计划和决定通知书', N03 = '录一笔服务记录，扣她的基金'
const GATE = '<span class="badge">未定</span><button class="act">定下</button>';
// 主区里点一下：sel 是 closest 要命中的选择器，go 是那个元素的 data-go
// 点问题卡上的按钮：d 是那个按钮的 dataset（screen、ask，加 opt 或 other）
const clickOpt = (d) => `els.main.handlers.click({ target: { closest: (s) => s === '.ask button.opt' ? { dataset: ${JSON.stringify(d)} } : null } })`;
const click = (sel, go) => `els.main.handlers.click({ target: { closest: (s) => s === ${JSON.stringify(sel)} ? { dataset: { go: ${JSON.stringify(go ?? '')} } } : null } })`;
// 工作台注入：N-01 对着流程 01-老人建档，屏带 step 和 stepTitle；问题在屏自己的 asks 上，一条没答、一条答了；open 是 DATA.OPEN
const WBDATA = (open) => ({ CONTEXTS: ['养老系统', '共享内核'], MOCKS: {}, WB: { base: '/sample-care', project: '养老', pages: ['业务', '界面'] }, ...(open ? { OPEN: open } : {}),
  REQS: { '养老系统': [{ req: 'N-01', title: '给老人建档', flow: '01-老人建档', views: [{ who: '照护伙伴', screens: [
    { id: 'notice', title: '照通知书填', file: 'notice.html', step: '3', stepTitle: '照护伙伴照通知书填分级', shows: ['分级'], does: [{ act: '下一步', to: '完' }],
      asks: [{ id: 'a-1', q: '分级下拉还是抄？', lean: '下拉', options: ['下拉', '照抄'] },
        { id: 'a-2', q: '优先级几档？', lean: '四档', options: ['四档', '三档'], answer: '照手册四档', answeredAt: '2026-11-02' }] }] }] }] } })
// 一条需求跨两段流程：flow 是数组，屏的 step 写「流程/步」，工作台给了 stepFlow、stepNo、stepTitle
const WBMULTI = () => ({ CONTEXTS: ['沟通 app', '共享内核'], MOCKS: {}, WB: { base: '/sample-care', project: '养老', pages: ['业务', '界面'] },
  REQS: { '沟通 app': [{ req: 'N-34', title: '拉群填表', flow: ['00-管理员找人建群', '01-群里发起登记表'], views: [{ who: '老人', screens: [
    { id: 'group', title: '拉群', file: 'group.html', step: '00-管理员找人建群/2', stepFlow: '管理员找人建群', stepNo: '2', stepTitle: '管理员拉群', shows: [], does: [{ act: '下一步', to: 'fill' }] },
    { id: 'fill', title: '填表', file: 'fill.html', step: '01-群里发起登记表/1', stepFlow: '群里发起登记表', stepNo: '1', stepTitle: '她自己填', shows: [], does: [{ act: '交', to: '完' }] }] }] }] } })
// 钉问题用的工作台数据：一屏四条问题，a-1、a-3 标在同一个下拉上，a-4 没标，a-2 答过了（页面当没有）；输入框标的 a-9 不是这一屏的问题
const WBPIN = () => ({ CONTEXTS: ['养老系统', '共享内核'], WB: { base: '/sample-care', project: '养老', pages: ['业务', '界面'] },
  MOCKS: { 'N-01/notice': '<h1>照通知书填</h1><select data-ask="a-1 a-3"><option>HCP 3 级</option></select><input data-ask="a-9"><a href="#go:完">下一步</a>' },
  REQS: { '养老系统': [{ req: 'N-01', title: '给老人建档', views: [{ who: '照护伙伴', screens: [
    { id: 'notice', title: '照通知书填', file: 'notice.html', shows: ['分级'], does: [{ act: '下一步', to: '完' }],
      asks: [{ id: 'a-1', q: '分级下拉还是抄？', lean: '下拉', options: ['下拉', '照抄'] },
        { id: 'a-2', q: '优先级几档？', lean: '四档', options: ['四档', '三档'], answer: '照手册四档', answeredAt: '2026-11-02' },
        { id: 'a-3', q: '过渡要单列吗？', lean: '单列' },
        { id: 'a-4', q: '这一屏算不算单独一屏？', lean: '算', options: ['算', '不算'] }] }] }] }] } })
// 小样里那段钉问题的脚本：从主区 srcdoc 里取出来，装个假的小样文档跑。带 data-ask 的元素从小样 html 里扫出来，位置照 rects（键是 data-ask 原文）；小样宽 W
const unesc = (x) => x.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
function pins(main, rects = {}, W = 600) {
  const src = unesc(main.match(/srcdoc="([^"]*)"/)[1])
  const mock = src.slice(0, src.indexOf('<script>'))
  if (src.split('<script>').length < 3) return null   // 只有跳屏那段，没钉问题
  const code = src.slice(src.lastIndexOf('<script>') + 8, src.lastIndexOf('</script>'))
  const tagged = [...mock.matchAll(/data-ask="([^"]+)"/g)].map((m) => ({ getAttribute: () => m[1], getBoundingClientRect: () => rects[m[1]] ?? { top: 100, right: 300 } }))
  const layer = { innerHTML: '' }, on = [], msgs = []
  const doc = { createElement: () => layer, body: { appendChild() {} }, documentElement: { clientWidth: W }, querySelectorAll: () => tagged, addEventListener: (k, fn) => { if (k === 'click') on.push(fn) } }
  new Function('document', 'window', 'parent', code)(doc, { pageXOffset: 0, pageYOffset: 0, addEventListener() {} }, { postMessage: (m) => msgs.push(m) })
  // 点小样里的东西：sel 是 closest 要命中的选择器，attrs 是那个元素的属性；sel 空就是点在别处
  const click = (sel, attrs = {}) => on.forEach((fn) => fn({ target: { closest: (q) => (sel && q === sel ? { getAttribute: (k) => attrs[k] ?? null } : null) }, preventDefault() {} }))
  // 圆点：{ id: { cls, at, left, top, n } }
  const list = () => Object.fromEntries([...layer.innerHTML.matchAll(/<span class="__pin([^"]*)" data-id="([^"]+)" data-at="(el|corner)" title="[^"]*" style="left:(\d+)px;top:(\d+)px">(\d+)<\/span>/g)].map((m) => [m[2], { cls: m[1], at: m[3], left: +m[4], top: +m[5], n: +m[6] }]))
  return { layer, click, msgs, list }
}
const clickMain = (sel, dataset) => els.main.handlers.click({ target: { closest: (q) => (q === sel ? { dataset } : null) } })
// 左边栏的红点
// 右边一栏一张问题卡的开头：cls 是 ask，pin 是 <屏 id>/<问题 id>，n 是它在那一屏没答的问题里的编号
const CARD = (cls, pin, n) => '<div class="' + cls + '" data-pin="' + pin + '" title="点一下，在小样上找到它"><span class="no">' + n + '</span>'
const DOT = (n) => `<i class="open" title="${n} 条没答">${n}</i>`
const cases = [
  ['首页 N-01 第一屏（案例经理视角，已定）', '', ({ main }) => main.includes('<iframe class="mock" title="老人列表" srcdoc="') && main.includes('案例经理&lt;/i&gt;老人列表') && main.includes('parent.postMessage') && main.includes('<span class="id">N-01</span> · 给老人建档，记下支持计划和决定通知书') && main.includes('<span class="cnt">已定 2/4 屏</span>')
    && !main.includes(GATE) && main.includes('<div class="scrhead"><span class="n">①</span>老人列表<span class="gate"><span class="badge ok">已定 2026-11-01</span></span></div>')
    && main.includes('class="vw on" data-go="list">案例经理<small>2/3</small>') && main.includes('class="vw" data-go="mine">老人/家属<small>0/1</small>') && count(main, /class="vw( on)?" data-go=/g) === 2
    && main.includes('<li>My Aged Care 编号</li>') && count(main, /class="ask"/g) === 3 && main.includes('偏向 <b>下拉选，手册 7 级 + 过渡</b>') && main.includes('class="scr">② 建档</span>') && main.includes('class="scr">老人/家属 · ① 我的档案</span><div class="q">家属能看到支持计划的金额吗？')
    && count(main, /class="step( on)?" data-go=/g) === 3 && main.includes('class="step on" data-go="list">① 老人列表') && main.includes('class="step end">完') && main.includes('建档 <span class="to">→ <b>建档</b>') && main.includes('需求候选</span><span>老人列表要能按状态筛') && main.includes('需求候选</span><span><span class="scr">老人/家属 · ① 我的档案</span>家属要有登录入口')
    && main.includes('disabled>‹ 上一屏</button>') && main.includes('data-go="new">下一屏 建档 ›')],
  ['切到第二屏（hash 规则）', '', ({ main }) => global.location.hash === '#养老系统/N-01/new' && main.includes('class="step on" data-go="new">② 建档') && main.includes('title="建档" srcdoc="') && main.includes('支持计划日期') && main.includes('data-go="list">‹ 上一屏 老人列表') && main.includes('data-go="file">下一屏 档案页 ›') && main.includes('取消 <span class="to">→ <b>老人列表</b>') && count(main, /class="ask"/g) === 3 && !main.includes('class="scr">② 建档') && main.includes('<span class="badge ok">已定 2026-11-02</span>'),
    "go('N-01/new'); window.handlers.hashchange()"],
  ['地址直接给第三屏：没定、交棒那条标视角、下一屏不跨视角', '#养老系统/N-01/file', ({ main }) => main.includes('class="step on" data-go="file">③ 档案页') && main.includes(GATE) && main.includes('<span class="n">③</span>档案页<span class="gate">')
    && main.includes('记签协议 <span class="to">→ <b>完</b></span> <span class="badge nt">下一条需求</span>') && main.includes('给家属看 <span class="to">→ <b>我的档案</b></span> <span class="hand">→ 老人/家属</span> <span class="badge nt">交棒</span>')
    && main.includes('disabled>下一屏 ›') && main.includes('data-go="new">‹ 上一屏 建档') && main.includes('class="scr">② 建档</span>')],
  ['视角切换：按「老人/家属」进那个视角第一屏', '#养老系统/N-01/file', ({ main, nav }) => global.location.hash === '#养老系统/N-01/mine' && main.includes('class="vw" data-go="list">案例经理') && main.includes('class="vw on" data-go="mine">老人/家属')
    && count(main, /class="step( on)?" data-go=/g) === 1 && main.includes('class="step on" data-go="mine">① 我的档案') && main.includes('class="step end">完') && main.includes('<h3>谁在用</h3><span class="who">老人/家属</span>') && main.includes('title="我的档案" srcdoc="') && main.includes('决定通知书')
    && main.includes('disabled>‹ 上一屏</button>') && main.includes('disabled>下一屏 ›') && main.includes('看通知书 <span class="to">→ <b>完</b></span></li>') && !main.includes('class="hand"')
    && main.includes(CARD('ask', 'mine/a-3', 1) + '<div class="q">家属能看到支持计划的金额吗？') && main.includes('class="scr">案例经理 · ② 建档</span>') && nav.includes('class="sub2 vw on">' + TRI('养老系统/N-01/老人/家属', 1) + '老人/家属</a>') && nav.includes('class="sub2 scr on"><small>①</small>我的档案' + DOT(1) + '</a>'),
    click('[data-go]', 'mine') + '; window.handlers.hashchange()'],
  ['本视角的上一屏 / 下一屏：从档案页按上一屏回建档，再按下一屏回来', '#养老系统/N-01/file', ({ main, snap }) => snap[0] === '#养老系统/N-01/new' && snap[1].includes('class="step on" data-go="new">② 建档') && global.location.hash === '#养老系统/N-01/file' && main.includes('class="step on" data-go="file">③ 档案页') && main.includes('class="vw on" data-go="list">案例经理'),
    click('[data-go]', 'new') + '; window.handlers.hashchange(); snap.push(location.hash, els.main.innerHTML); ' + click('[data-go]', 'file') + '; window.handlers.hashchange()'],
  ['小样里按「建档」跳屏', '', ({ main }) => global.location.hash === '#养老系统/N-01/new' && main.includes('class="step on" data-go="new">② 建档'),
    "window.handlers.message({ data: { go: 'new' } }); window.handlers.hashchange()"],
  ['小样里按「给家属看」交棒：切到老人/家属视角、选中我的档案', '#养老系统/N-01/file', ({ main, nav }) => global.location.hash === '#养老系统/N-01/mine' && main.includes('class="vw on" data-go="mine">老人/家属') && main.includes('class="vw" data-go="list">案例经理') && main.includes('class="step on" data-go="mine">① 我的档案') && main.includes('title="我的档案" srcdoc="') && main.includes('<h3>谁在用</h3><span class="who">老人/家属</span>') && nav.includes('class="sub2 scr on"><small>①</small>我的档案' + DOT(1) + '</a>') && nav.includes('class="sub2 scr"><small>③</small>档案页</a>'),
    "window.handlers.message({ data: { go: 'mine' } }); window.handlers.hashchange()"],
  ['小样里按到「完」', '#养老系统/N-01/file', ({ main }) => main.includes('class="step end on">完') && main.includes('案例经理 这一串按完了：N-01 到「记签协议」，下一条需求。') && main.includes('href="#N-01/list">回第一屏') && !main.includes('class="step on"'),
    "window.handlers.message({ data: { go: '完' } })"],
  ['N-03：三个视角，照护伙伴那串没有「完」', '', ({ main, nav }) => global.location.hash === '#养老系统/N-03/log' && main.includes('<span class="id">N-03</span> · 录一笔服务记录，扣她的基金') && main.includes('<span class="cnt">已定 0/4 屏</span>') && main.includes('照护伙伴&lt;/i&gt;录一笔服务')
    && count(main, /class="vw( on)?" data-go=/g) === 3 && main.includes('class="vw on" data-go="log">照护伙伴<small>0/2</small>') && main.includes('class="vw" data-go="review">案例经理') && main.includes('class="vw" data-go="balance">老人/家属')
    && count(main, /class="step( on)?" data-go=/g) === 2 && !main.includes('class="step end') && count(main, /class="ask"/g) === 2 && main.includes('偏向 <b>协议价</b>') && main.includes('class="scr">案例经理 · ① 待核的服务记录</span><div class="q">每笔都要核还是抽核？') && main.includes('<li>单价（自动带出）</li>')
    && main.includes('需求候选</span><span><span class="scr">老人/家属 · ① 我的基金余额</span>家属要收到扣款通知') && main.includes(GATE) && nav.includes('class="sub2 scr on"><small>①</small>录一笔服务'),
    "go('N-03/log'); window.handlers.hashchange()"],
  ['N-03 录完那屏：交棒给案例经理，下一屏不跨视角', '#养老系统/N-03/after', ({ main }) => main.includes('class="step on" data-go="after">② 录完') && main.includes('交给案例经理核 <span class="to">→ <b>待核的服务记录</b></span> <span class="hand">→ 案例经理</span> <span class="badge nt">交棒</span>') && main.includes('再录一笔 <span class="to">→ <b>录一笔服务</b></span></li>') && main.includes('data-go="log">下一屏 录一笔服务 ›') && !main.includes('data-go="review">下一屏') && main.includes('data-go="log">‹ 上一屏 录一笔服务')],
  ['N-03 小样里交棒：录完 → 待核，切到案例经理视角', '#养老系统/N-03/after', ({ main }) => global.location.hash === '#养老系统/N-03/review' && main.includes('class="vw on" data-go="review">案例经理') && main.includes('class="vw" data-go="log">照护伙伴') && count(main, /class="step( on)?" data-go=/g) === 1 && main.includes('class="step on" data-go="review">① 待核的服务记录') && main.includes('class="step end">完') && main.includes('案例经理&lt;/i&gt;待核的服务记录') && main.includes(CARD('ask', 'review/a-2', 1) + '<div class="q">每笔都要核还是抽核？') && main.includes('class="scr">照护伙伴 · ① 录一笔服务</span><div class="q">单价按协议价'),
    "window.handlers.message({ data: { go: 'review' } }); window.handlers.hashchange()"],
  ['聊天 app 没小样', '#聊天 app', ({ main, nav }) => main.includes('还没有小样') && !main.includes('<iframe') && nav.includes('class="cx on" data-cx="聊天 app"') && !nav.includes('聊天 app<small>')],
  ['左边栏：两条需求，默认只展开正在看的 N-01（两个视角、四屏），N-03 收起；定过的标 ✓', '', ({ nav }) => nav.includes('data-cx="养老系统"') && nav.includes('养老系统<small>2 条需求</small>')
    && nav.includes(REQ('养老系统', 'N-01/list', N01, { on: 1, open: 1, n: 3, dc: '2/4' })) && nav.includes(REQ('养老系统', 'N-03/log', N03, { open: 0, n: 2, dc: '0/4' }))
    && count(nav, /class="sub2 vw( on)?"/g) === 2 && nav.includes('href="#N-01/list" class="sub2 vw on">' + TRI('养老系统/N-01/案例经理', 1) + '案例经理</a>') && nav.includes('href="#N-01/mine" class="sub2 vw">' + TRI('养老系统/N-01/老人/家属', 1) + '老人/家属</a>') && !nav.includes('href="#N-03/review" class="sub2')
    && count(nav, /class="sub2 scr( on)?"/g) === 4 && nav.includes('href="#N-01/list" class="sub2 scr on"><small>①</small>老人列表<i title="已定 2026-11-01">✓ 11-01</i></a>') && nav.includes('href="#N-01/new" class="sub2 scr"><small>②</small>建档' + DOT(2) + '<i title="已定 2026-11-02">✓ 11-02</i></a>') && nav.includes('href="#N-01/file" class="sub2 scr"><small>③</small>档案页</a>') && !nav.includes('我的基金余额') && count(nav, /✓ /g) === 2],
  ['单开按定下：只定当前这一屏，计数加一，别的屏还是没定', '#养老系统/N-01/file', ({ main, nav, snap }) => !snap[0].includes(GATE) && /<span class="n">③<\/span>档案页<span class="gate"><span class="badge ok">已定 \d{4}-\d\d-\d\d<\/span>/.test(snap[0]) && snap[0].includes('<span class="cnt">已定 3/4 屏</span>') && snap[0].includes('案例经理<small>3/3</small>')
    && global.location.hash === '#养老系统/N-01/mine' && main.includes(GATE) && main.includes('<span class="n">①</span>我的档案<span class="gate">' + GATE) && main.includes('<span class="cnt">已定 3/4 屏</span>') && /href="#N-01\/file" class="sub2 scr"><small>③<\/small>档案页<i title="已定 \d{4}-\d\d-\d\d">✓ \d\d-\d\d<\/i>/.test(nav) && nav.includes('<small>①</small>我的档案' + DOT(1) + '</a>') && count(nav, /✓ /g) === 3,
    click('.gate button.act') + "; snap.push(els.main.innerHTML); go('N-01/mine'); window.handlers.hashchange()"],
  // ---- 问题在这一屏旁边答 ----
  ['样例：建档那屏对着流程第 5 步；没有「去流程页答」', '#养老系统/N-01/new', ({ main }) => main.includes('<span class="n">②</span>建档<span class="stp">对着流程第 5 步</span><span class="gate">') && !main.includes('toflow') && !main.includes('去流程页答') && !main.includes('<span class="n">①</span>老人列表<span class="stp">')],
  ['红框卡：问题、偏向、选项（第一个加粗）、另说；别的屏的问题按钮带那一屏，没有 options 的给「照偏向」', '#养老系统/N-01/new', ({ main }) => count(main, /class="ask"/g) === 3 && count(main, /class="ask done"/g) === 0 && count(main, /<button class="opt/g) === 8
    && main.includes(CARD('ask', 'new/a-1', 1) + '<div class="q">分级与路径是通知书上抄还是下拉选？</div><div class="lean">偏向 <b>下拉选，手册 7 级 + 过渡</b></div><div class="opts"><button class="opt b" data-screen="new" data-ask="a-1" data-opt="下拉选，手册 7 级 + 过渡">下拉选，手册 7 级 + 过渡</button><button class="opt" data-screen="new" data-ask="a-1" data-opt="照通知书原样抄">照通知书原样抄</button><button class="opt other" data-screen="new" data-ask="a-1" data-other="1">另说</button></div></div>')
    && main.includes('<div class="q">家属能看到支持计划的金额吗？</div><div class="lean">偏向 <b>能</b></div><div class="opts"><button class="opt b" data-screen="mine" data-ask="a-3" data-opt="能">照偏向</button><button class="opt other" data-screen="mine" data-ask="a-3" data-other="1">另说</button></div>')
    && main.includes('3 条，带着偏向')],
  ['工作台：屏上方「对着流程第 3 步：标题」；没答的红框带选项；答过的（带 answer）不列', '', ({ main }) => main.includes('<span class="stp">对着流程第 3 步：照护伙伴照通知书填分级</span>')
    && count(main, /class="ask"/g) === 1 && !main.includes('class="ask done"') && main.includes('<div class="q">分级下拉还是抄？</div><div class="lean">偏向 <b>下拉</b></div><div class="opts"><button class="opt b" data-screen="notice" data-ask="a-1" data-opt="下拉">下拉</button><button class="opt" data-screen="notice" data-ask="a-1" data-opt="照抄">照抄</button><button class="opt other" data-screen="notice" data-ask="a-1" data-other="1">另说</button></div>')
    && !main.includes('优先级几档') && !main.includes('照手册四档') && !main.includes('data-ask="a-2"') && !main.includes('toflow') && main.includes('1 条，带着偏向'), '', WBDATA()],
  ['工作台点一个选项：post 答，带需求、屏、问题、上下文和选的那句', '', ({ main }) => global.posted.length === 1 && global.posted[0].url === 'api/答'
    && same(global.posted[0].body, { mockup: 'N-01', screen: 'notice', ask: 'a-1', context: '养老系统', text: '照抄' }) && count(main, /class="ask"/g) === 1,
    clickOpt({ screen: 'notice', ask: 'a-1', opt: '照抄' }), WBDATA()],
  ['工作台按另说：prompt 里写的那句发出去；prompt 取消就不发', '', () => global.posted.length === 1 && same(global.posted[0].body, { mockup: 'N-01', screen: 'notice', ask: 'a-1', context: '养老系统', text: '另一个说法' }),
    clickOpt({ screen: 'notice', ask: 'a-1', other: '1' }) + '; prompt = () => null; ' + clickOpt({ screen: 'notice', ask: 'a-1', other: '1' }), WBDATA()],
  ['单开点选项：不发 post，本地记成答了，那条从一栏里拿掉，红点条数跟着少', '#养老系统/N-01/new', ({ main, nav }) => global.posted.length === 0
    && !main.includes('分级与路径是通知书上抄还是下拉选') && count(main, /class="ask"/g) === 2 && !main.includes('class="ask done"') && !main.includes('data-ask="a-1"') && main.includes('2 条，带着偏向')
    && nav.includes('N-01 ' + N01 + '</span>' + DOT(2) + '<span class="dc"') && nav.includes('<small>②</small>建档' + DOT(1) + '<i title="已定'),
    clickOpt({ screen: 'new', ask: 'a-1', opt: '照通知书原样抄' })],
  ['单开在建档屏答别的屏（我的档案）的问题：那条不列了，那一屏的红点没了', '#养老系统/N-01/new', ({ main, nav }) => !main.includes('家属能看到支持计划的金额吗？') && count(main, /class="ask"/g) === 2
    && nav.includes('<small>①</small>我的档案</a>') && nav.includes('N-01 ' + N01 + '</span>' + DOT(2) + '<span class="dc"'),
    clickOpt({ screen: 'mine', ask: 'a-3', other: '1' })],
  ['左边栏红点：需求那行是各屏之和（折着也有），屏那行是这一屏的，没有没答的不标', '', ({ nav }) => count(nav, /class="open"/g) === 4
    && nav.includes('<span class="t">N-01 ' + N01 + '</span>' + DOT(3)) && nav.includes('<span class="t">N-03 ' + N03 + '</span>' + DOT(2))
    && nav.includes('<small>②</small>建档' + DOT(2) + '<i title="已定 2026-11-02">') && nav.includes('<small>①</small>老人列表<i title="已定 2026-11-01">') && nav.includes('<small>①</small>我的档案' + DOT(1) + '</a>')
    && !nav.includes('<small>①</small>录一笔服务')],
  ['N-03 展开后屏那行各自的红点', '', ({ nav }) => nav.includes('<small>①</small>录一笔服务' + DOT(1) + '</a>') && nav.includes('<small>①</small>待核的服务记录' + DOT(1) + '</a>') && nav.includes('<small>②</small>录完</a>') && count(nav, /class="open"/g) === 6,
    "navClick({ key: '养老系统/N-03', open: '0' })"],
  ['工作台左边栏红点照 OPEN（键 上下文/需求编号/屏 id）', '', ({ nav }) => nav.includes(REQ('养老系统', 'N-01/notice', '给老人建档', { on: 1, open: 1, n: 1, dc: '0/1' })) && nav.includes('<small>①</small>照通知书填' + DOT(1) + '</a>') && !nav.includes('sub2 vw'), '', WBDATA({ '养老系统/N-01/notice': 1 })],
  ['工作台 OPEN 里没有的屏不标红点（不再从 REQS 数）', '', ({ nav }) => count(nav, /class="open"/g) === 0 && nav.includes('<small>①</small>照通知书填</a>'), '', WBDATA({})],
  // ---- 问题钉在小样上 ----
  ['钉问题：标了 data-ask 的元素右上角一个带编号的红点；同一处两条错开；没标的、指不到元素的摞在右上角；答过的不钉', '', () => {
    const p = pins(els.main.innerHTML, { 'a-1 a-3': { top: 200, right: 400 } }), L = p.list()
    return same(Object.keys(L), ['a-1', 'a-3', 'a-4']) && same(L['a-1'], { cls: '', at: 'el', left: 391, top: 191, n: 1 }) && same(L['a-3'], { cls: '', at: 'el', left: 369, top: 191, n: 2 })
      && same(L['a-4'], { cls: '', at: 'corner', left: 572, top: 6, n: 3 }) && !p.layer.innerHTML.includes('__bub')
  }, '', WBPIN()],
  ['样例：建档屏两条钉在编号输入框和分级下拉上；待核那屏的问题没标，在右上角；没问题的屏不注钉问题那段', '#养老系统/N-01/new', ({ main, snap }) => {
    const L = pins(main, { 'a-1': { top: 200, right: 400 }, 'a-2': { top: 60, right: 380 } }).list()
    const R = pins(snap[0]).list()
    return same(L['a-1'], { cls: '', at: 'el', left: 391, top: 191, n: 1 }) && same(L['a-2'], { cls: '', at: 'el', left: 371, top: 51, n: 2 }) && Object.keys(L).length === 2
      && same(R, { 'a-2': { cls: '', at: 'corner', left: 572, top: 6, n: 1 } }) && pins(snap[1]) === null && !snap[1].includes('__asks')
  }, "go('N-03/review'); window.handlers.hashchange(); snap.push(els.main.innerHTML); go('N-01/list'); window.handlers.hashchange(); snap.push(els.main.innerHTML); go('N-01/new'); window.handlers.hashchange()"],
  ['点圆点出气泡：问题、偏向、选项（第一个加粗）、另说；点气泡里不收，点外面收起，再点圆点也收起', '', () => {
    const p = pins(els.main.innerHTML)
    p.click('#__asks .__pin', { 'data-id': 'a-1' })
    const open1 = p.layer.innerHTML, on1 = p.list()['a-1'].cls
    p.click('#__asks .__bub'); const still = p.layer.innerHTML.includes('class="__bub"')
    p.click(''); const closed = !p.layer.innerHTML.includes('__bub')
    p.click('#__asks .__pin', { 'data-id': 'a-3' }); p.click('#__asks .__pin', { 'data-id': 'a-3' }); const toggled = !p.layer.innerHTML.includes('__bub')
    return open1.includes('<div class="__bub" data-id="a-1" style="left:') && open1.includes('<div class="__q">1. 分级下拉还是抄？</div><div class="__lean">偏向 <b>下拉</b></div><button class="__opt b" data-id="a-1" data-opt="下拉">下拉</button><button class="__opt" data-id="a-1" data-opt="照抄">照抄</button><button class="__opt" data-id="a-1" data-other="1">另说</button></div>')
      && on1 === ' on' && still && closed && toggled && (open1.match(/__bub/g) || []).length === 1
  }, '', WBPIN()],
  ['气泡里点选项：告诉外面，外面 post 答（需求、屏、问题、上下文、那句）；点另说走 prompt', '', () => {
    const p = pins(els.main.innerHTML)
    p.click('#__asks .__pin', { 'data-id': 'a-1' }); p.click('#__asks .__opt', { 'data-id': 'a-1', 'data-opt': '照抄' })
    p.click('#__asks .__pin', { 'data-id': 'a-3' }); p.click('#__asks .__opt', { 'data-id': 'a-3', 'data-other': '1' })
    const ok1 = same(p.msgs, [{ answer: { screen: 'notice', ask: 'a-1', opt: '照抄' } }, { answer: { screen: 'notice', ask: 'a-3', other: '1' } }])
    p.msgs.forEach((m) => window.handlers.message({ data: m }))
    return ok1 && same(global.posted.map((x) => [x.url, x.body]), [['api/答', { mockup: 'N-01', screen: 'notice', ask: 'a-1', context: '养老系统', text: '照抄' }], ['api/答', { mockup: 'N-01', screen: 'notice', ask: 'a-3', context: '养老系统', text: '另一个说法' }]])
  }, '', WBPIN()],
  ['单开在气泡里答：本地记上，重画后那个圆点不钉了、旁边一栏也不列，剩下的重新编号', '#养老系统/N-01/new', ({ main }) => {
    const p = pins(main); p.click('#__asks .__pin', { 'data-id': 'a-1' }); p.click('#__asks .__opt', { 'data-id': 'a-1', 'data-opt': '照通知书原样抄' })
    window.handlers.message({ data: p.msgs[0] })
    const after = els.main.innerHTML, L = pins(after).list()
    return global.posted.length === 0 && same(Object.keys(L), ['a-2']) && L['a-2'].n === 1 && !after.includes('分级与路径是通知书上抄还是下拉选') && count(after, /class="ask"/g) === 2 && after.includes(CARD('ask', 'new/a-2', 1))
  }],
  ['答过的不出现：带 answer 的不列、不钉、不占编号；没有「显示答过的」开关', '', ({ main }) => {
    const L = pins(main).list()
    return main.includes('<div class="pinbar">问题钉在小样上：3 条要问；没标位置的在右上角，点圆点答</div>') && !main.includes('showdone') && !main.includes('显示答过的') && !main.includes('class="ask done"')
      && !L['a-2'] && !main.includes('优先级几档') && !main.includes('data-pin="notice/a-2"') && count(main, /class="ask"/g) === 3 && main.includes('3 条，带着偏向')
      && main.includes(CARD('ask', 'notice/a-1', 1)) && main.includes(CARD('ask', 'notice/a-3', 2)) && main.includes(CARD('ask', 'notice/a-4', 3)) && L['a-3'].n === 2 && L['a-4'].n === 3
  }, '', WBPIN()],
  ['一条要问的都没有：「问了什么」写「没有要问的」，小样上方不出那一行', '', ({ main }) => main.includes('<h3>问了什么 <small></small></h3><span class="none">没有要问的</span>') && !main.includes('class="ask"') && !main.includes('pinbar'),
    '', (() => { const d = WBPIN(); for (const a of d.REQS['养老系统'][0].views[0].screens[0].asks) a.answer ??= '答了'; return d })()],
  ['旁边一栏点一条：那个圆点闪一下、弹出气泡；下一次重画不再闪也不弹', '', () => {
    clickMain('.ask[data-pin]', { pin: 'notice/a-3' })
    const p1 = pins(els.main.innerHTML), L1 = p1.list()
    clickMain('[data-go]', { go: 'notice' })   // 按序列里这一屏：原地重画
    const L2 = pins(els.main.innerHTML).list()
    return L1['a-3'].cls === ' on flash' && p1.layer.innerHTML.includes('<div class="__bub" data-id="a-3"') && p1.layer.innerHTML.includes('data-opt="单列">照偏向</button>') && L2['a-3'].cls === ''
  }, '', WBPIN()],
  ['样例：在建档屏点「我的档案」那条，切过去、那个圆点闪', '#养老系统/N-01/new', () => {
    clickMain('.ask[data-pin]', { pin: 'mine/a-3' }); window.handlers.hashchange()
    const L = pins(els.main.innerHTML).list()
    return global.location.hash === '#养老系统/N-01/mine' && L['a-3'].cls === ' on flash' && L['a-3'].at === 'el'
  }],
  // ---- 左边栏折叠 ----
  ['点 N-01 的三角收起：视角和屏都不见，需求那行红点和已定照旧；再点展开回来', '', ({ snap, nav }) => !snap[0].includes('class="sub2') && snap[0].includes(REQ('养老系统', 'N-01/list', N01, { on: 1, open: 0, n: 3, dc: '2/4' }))
    && snap[0].includes(REQ('养老系统', 'N-03/log', N03, { open: 0, n: 2, dc: '0/4' })) && !global.location.hash.includes('N-03')
    && count(nav, /class="sub2 scr( on)?"/g) === 4 && nav.includes(REQ('养老系统', 'N-01/list', N01, { on: 1, open: 1, n: 3, dc: '2/4' })),
    "navClick({ key: '养老系统/N-01', open: '1' }); snap.push(els.nav.innerHTML); navClick({ key: '养老系统/N-01', open: '0' })"],
  ['点没在看的 N-03 的三角：只展开它，不切过去，N-01 照旧展开', '', ({ nav }) => !global.location.hash.includes('N-03') && nav.includes(REQ('养老系统', 'N-03/log', N03, { open: 1, n: 2, dc: '0/4' }))
    && count(nav, /class="sub2 scr( on)?"/g) === 8 && count(nav, /class="sub2 vw( on)?"/g) === 5 && nav.includes('<small>①</small>我的基金余额</a>'),
    "navClick({ key: '养老系统/N-03', open: '0' })"],
  ['视角那层也能折：折起案例经理，它的三屏不见，那行带它们没答的红点；老人/家属照旧', '', ({ nav }) => nav.includes('class="sub2 vw on">' + TRI('养老系统/N-01/案例经理', 0) + '案例经理' + DOT(2) + '</a>')
    && !nav.includes('老人列表') && !nav.includes('>建档<') && nav.includes('<small>①</small>我的档案' + DOT(1) + '</a>') && count(nav, /class="sub2 scr( on)?"/g) === 1,
    "navClick({ key: '养老系统/N-01/案例经理', open: '1' })"],
  ['切需求：点 N-03 那行切过去，N-03 自动展开，没动过的 N-01 收起；手动开过的保持开', '', ({ nav, snap }) =>
    snap[0].includes(REQ('养老系统', 'N-03/log', N03, { on: 1, open: 1, n: 2, dc: '0/4' })) && snap[0].includes(REQ('养老系统', 'N-01/list', N01, { open: 0, n: 3, dc: '2/4' })) && count(snap[0], /class="sub2 scr( on)?"/g) === 4
    && global.location.hash === '#养老系统/N-03/after' && nav.includes(REQ('养老系统', 'N-01/list', N01, { open: 1, n: 3, dc: '2/4' })) && count(nav, /class="sub2 scr( on)?"/g) === 8,
    "navClick(null, '#N-03/log'); window.handlers.hashchange(); snap.push(els.nav.innerHTML); navClick({ key: '养老系统/N-01', open: '0' }); go('N-03/after'); window.handlers.hashchange()"],
  ['正在看的需求点那行本身也是折/展；手动折起后切走再切回来，又自动展开', '', ({ snap, nav }) => !snap[0].includes('class="sub2') && snap[0].includes(REQ('养老系统', 'N-01/list', N01, { on: 1, open: 0, n: 3, dc: '2/4' }))
    && !global.location.hash.includes('N-03') && nav.includes(REQ('养老系统', 'N-01/list', N01, { on: 1, open: 1, n: 3, dc: '2/4' })) && nav.includes(REQ('养老系统', 'N-03/log', N03, { open: 0, n: 2, dc: '0/4' })),
    "navClick({ key: '养老系统/N-01', open: '1' }); snap.push(els.nav.innerHTML); go('N-03/log'); window.handlers.hashchange(); go('N-01/list'); window.handlers.hashchange()"],
  ['一条需求只有一个视角：不出视角那一层，屏直接挂在需求下面', '', ({ nav }) => !nav.includes('sub2 vw') && nav.includes('<small>①</small>照通知书填') && nav.includes(TRI('养老系统/N-01', 1)), '', WBDATA()],
  ['一条需求跨两段流程：页头列两段，屏头写「对着流程「名」第几步：标题」', '#沟通 app/N-34/group', ({ main }) => main.includes('· 对着流程 00-管理员找人建群、01-群里发起登记表</span>')
    && main.includes('<span class="stp">对着流程「管理员找人建群」第 2 步：管理员拉群</span>') && !main.includes('第 00-管理员找人建群/2 步'), '', WBMULTI()],
  ['跨两段流程：另一段的屏写那一段的名字和步号', '#沟通 app/N-34/fill', ({ main }) => main.includes('<span class="stp">对着流程「群里发起登记表」第 1 步：她自己填</span>'), '', WBMULTI()],
];
// 工作台算 stepTitle、stepFlow、stepNo：临时项目里一条需求跨两段流程，一条只对一段（照旧写步号）
{
  const os = require('os'), path = require('path'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-flow-'))
  const put = (rel, data) => { const p = path.join(dir, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data)) }
  put('项目.json', { name: '临时', contexts: [{ name: '沟通 app' }], kernel: { concepts: [] } })
  put('上下文/沟通 app/业务/流程/00-管理员找人建群.json', { steps: [{ id: '1', title: '开账户' }, { id: '2', title: '管理员拉群' }] })
  put('上下文/沟通 app/业务/流程/01-群里发起登记表.json', { steps: [{ id: '1', title: '她自己填' }] })
  const scr = (id, step) => ({ id, title: id, step, shows: [], does: [] })
  put('上下文/沟通 app/界面/N-34.json', { req: 'N-34', title: '拉群填表', flow: ['00-管理员找人建群', '01-群里发起登记表'], views: [{ who: '老人', screens: [scr('group', '00-管理员找人建群/2'), scr('fill', '01-群里发起登记表/1'), scr('lost', '01-群里发起登记表/9')] }] })
  put('上下文/沟通 app/界面/N-21.json', { req: 'N-21', title: '群里说话', flow: '00-管理员找人建群', views: [{ who: '老人', screens: [scr('chat', '1')] }] })
  const d = require('../../lib/project.js').pageData(dir, '界面').REQS['沟通 app']
  const s = (req, id) => d.find((r) => r.req === req).views[0].screens.find((x) => x.id === id)
  const pass = s('N-34', 'group').stepTitle === '管理员拉群' && s('N-34', 'group').stepFlow === '管理员找人建群' && s('N-34', 'group').stepNo === '2'
    && s('N-34', 'fill').stepTitle === '她自己填' && s('N-34', 'fill').stepFlow === '群里发起登记表'
    && s('N-34', 'lost').stepTitle === undefined && s('N-21', 'chat').stepTitle === '开账户' && s('N-21', 'chat').stepFlow === undefined
  fs.rmSync(dir, { recursive: true, force: true })
  cases.push(['工作台：数组 flow 认「流程/步」、算出 stepFlow 和 stepNo；一段的照旧；指不到的步不给标题', '', () => pass, '', WBMULTI()])
}
let bad = 0;
for (const [name, hash, ok, tail, data] of cases) {
  let out;
  try { out = run(hash, tail, data) } catch (e) { console.log(name, 'ERROR', e.message); bad++; continue }
  const pass = out.main.length > 0 && ok(out);
  console.log(name, out.main.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
process.exit(bad ? 1 : 0);
