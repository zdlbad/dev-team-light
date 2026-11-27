// 给 document、location 装个假的，把页面脚本跑一遍，各视图各 render 一次；报错就说明页面会白板。
// 页面挂在 main、窗口那一层（#pop）、document 上的处理函数都记下来，断言里能模拟点一下、按一下键、拖一下
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {}, docOn = {};
const el = (id) => (els[id] ??= { innerHTML: '', hidden: false, on: {}, addEventListener(k, f) { (this.on[k] ??= []).push(f) }, dataset: {}, className: '', style: {} });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, addEventListener(k, f) { (docOn[k] ??= []).push(f) } };
global.window = { addEventListener() {} };
global.location = { hash: '' };
global.innerWidth = 1200; global.innerHeight = 800;
// tail：跑完页面脚本再接着跑的一句，用来模拟点了一个概念、答了一条问题；pre：页面画第一遍之前先跑的一句，用来换掉写死的样例。交回的一串分三截：主区、左边栏、开着的窗口（一个都没开就是空的）
const FIRST_DRAW = ";({ cx: context, v: view } = parseHash('map'))"
if (script.split(FIRST_DRAW).length !== 2) throw new Error('页面脚本里找不到画第一遍的那一句')
const run = (hash, tail = '', pre = '') => { global.location.hash = hash; for (const k of Object.keys(els)) delete els[k]; for (const k of Object.keys(docOn)) delete docOn[k]; eval(script.replace(FIRST_DRAW, () => pre + FIRST_DRAW) + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML + '\n<!--pop-->\n' + (els.pop && !els.pop.hidden ? els.pop.innerHTML : ''); };
// 画出来的每个矩形都得在画布里（translate 算进去）：没有遮挡裁掉的底线
const inBounds = (s) => {
  const m = s.match(/<svg width="([\d.]+)" height="([\d.]+)"[^>]*>/); if (!m) return false
  const svg = s.slice(m.index, s.indexOf('</svg>', m.index))
  const t = svg.match(/translate\(([-\d.]+) ([-\d.]+)\)/), dx = t ? +t[1] : 0, dy = t ? +t[2] : 0
  // 有 viewBox 的（整张缩过、或流程图裁掉顶上一截）按 viewBox 的坐标量
  const vb = m[0].match(/viewBox="[-\d.]+ ([-\d.]+) ([\d.]+) ([\d.]+)"/), oy = vb ? +vb[1] : 0
  const W = vb ? +vb[2] : +m[1], H = vb ? +vb[3] : +m[2]
  let n = 0
  for (const r of svg.matchAll(/<rect[^>]*? x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/g)) {
    const x = +r[1] + dx, y = +r[2] + dy - oy; n++
    if (x < 0 || y < 0 || x + +r[3] > W + 0.5 || y + +r[4] > H + 0.5) { console.log('   出界', r[0].slice(0, 80), { x, y, W, H }); return false }
  }
  return n > 0
}
const nav = (s) => s.split('<!--nav-->')[1].split('<!--pop-->')[0]
// 排版：主区宽 1240 时图框能用 1164；画布的 width 不许超过它（超了就该整张缩、带 viewBox）
const AVAIL = 1240 - 76
const svgW = (s) => { const m = s.match(/<svg width="([\d.]+)"/); return m ? +m[1] : Infinity }
// 主题框（全局图）、虚框（概念图）、主题框外框的位置
const topics = (s) => [...s.matchAll(/<g class="tp" data-g="([^"]+)"><rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => ({ id: m[1], x: +m[2], y: +m[3] }))
const stubs = (s) => Object.fromEntries([...s.matchAll(/<g class="stub"[^>]*data-n="([^"]+)"><rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [m[1], { x: +m[2], y: +m[3] }]))
const grp = (s) => { const m = s.match(/<g class="grp"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/); return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] } }
// 线不穿过两端以外的框：把每条线（M/L/C/Q）取点，落进别的数据框、虚框（往里缩 3）就记一条；两端是起点、终点贴着的框（往外放 8）
const through = (s) => {
  const rects = [...s.matchAll(/<g class="(?:nd[^"]*|stub)"[^>]*data-n="([^"]+)"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
  const bad = []
  for (const m of s.matchAll(/<g class="ed[^"]*" data-e="(\d+)"><path class="vis" d="([^"]+)"/g)) {
    const tok = m[2].trim().split(/[\s,]+/), pts = []
    let i = 0, cur = null
    while (i < tok.length) {
      const c = tok[i++]
      if (c === 'M' || c === 'L') { const p = { x: +tok[i++], y: +tok[i++] }; if (c === 'L' && cur) for (let t = 0; t <= 1; t += 0.02) pts.push({ x: cur.x + (p.x - cur.x) * t, y: cur.y + (p.y - cur.y) * t }); cur = p; pts.push(p) }
      else if (c === 'C') { const [p1, p2, p3] = [0, 1, 2].map(() => ({ x: +tok[i++], y: +tok[i++] })), p0 = cur
        for (let t = 0; t <= 1; t += 0.02) { const u = 1 - t; pts.push({ x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y }) }
        cur = p3 }
      else if (c === 'Q') { const [p1, p2] = [0, 1].map(() => ({ x: +tok[i++], y: +tok[i++] })), p0 = cur
        for (let t = 0; t <= 1; t += 0.02) { const u = 1 - t; pts.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y }) }
        cur = p2 }
    }
    if (!pts.length) continue
    const near = (r, p) => p.x >= r.x - 8 && p.x <= r.x + r.w + 8 && p.y >= r.y - 8 && p.y <= r.y + r.h + 8
    const ends = rects.filter((r) => near(r, pts[0]) || near(r, pts[pts.length - 1]))
    for (const r of rects) if (!ends.includes(r) && pts.some((p) => p.x > r.x + 3 && p.x < r.x + r.w - 3 && p.y > r.y + 3 && p.y < r.y + r.h - 3)) bad.push('线' + m[1] + '穿' + r.id)
  }
  if (bad.length) console.log('   穿框', bad.join('；'))
  return bad.length === 0
}
// 说明卡和它的角色标签不压框：每张卡（<g class="lb"> 里的卡、标签）不叠数据框、虚框、数据框头上的角色标签，也不叠别的卡
const covers = (s) => {
  const R = /<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.source
  const boxes = [...s.matchAll(new RegExp('<g class="(?:nd[^"]*|stub)"[^>]*data-n="([^"]+)">' + R, 'g'))].map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
  const cut = s.indexOf('<g class="lb">'), head = cut < 0 ? s : s.slice(0, cut)
  for (const m of head.matchAll(new RegExp('<g class="rl" data-r="([^"]+)">' + R, 'g'))) boxes.push({ id: '标签' + m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] })
  const ov = (r, b) => r.x < b.x + b.w - 1 && b.x < r.x + r.w - 1 && r.y < b.y + b.h - 1 && b.y < r.y + r.h - 1
  // 一张卡：从它的 <g class="lb"> 到卡和标签那两层 </g> 收尾
  const cards = s.split('<g class="lb">').slice(1).map((p) => [...p.split('</g></g>')[0].matchAll(new RegExp(R, 'g'))].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] })))
  const bad = []
  cards.forEach((rs, i) => {
    for (const b of boxes) if (rs.some((r) => ov(r, b))) bad.push('卡' + (i + 1) + '压' + b.id)
    cards.forEach((qs, j) => { if (j > i && rs.some((r) => qs.some((q) => ov(r, q)))) bad.push('卡' + (i + 1) + '叠卡' + (j + 1)) })
  })
  if (bad.length) console.log('   压框', bad.join('；'))
  return bad.length === 0
}
// sample-care 现在的 g6（照原样：标题、角色、线上的字、tree；定义换成占位）：主区 1172 宽时「报销 → 服务记录」那张卡曾压在「报销」上
const G6NOW = {"CONTEXTS":["样例系统"],"OPEN":{},"BIZ":{"样例系统":{"MAP":{"topics":[{"id":"g2","title":"建档与服务协议","c":2,"x":2,"y":0,"does":["d"],"concepts":["c"]},{"id":"g4","title":"老人名下的基金","c":4,"x":3,"y":0,"does":["d"],"concepts":["c"]},{"id":"g3","title":"服务清单与价目表","c":3,"x":1,"y":1,"does":["d"],"concepts":["c"]},{"id":"g6","title":"服务发生与扣费","c":2,"x":2,"y":1,"does":["d"],"concepts":["c"]},{"id":"g7","title":"月结单","c":3,"x":3,"y":1,"does":["d"],"concepts":["c"]},{"id":"g8","title":"申报与付款对账","c":4,"x":4,"y":1,"does":["d"],"concepts":["c"]}],"edges":[]},"CONCEPTS":{"g6":{"topic":"g6","title":"服务发生与扣费","summary":"s","concepts":[{"id":"rec","title":"服务记录","by":["照护伙伴"],"order":1,"definition":"d","source":"x"},{"id":"proof","title":"凭据","by":["支持工作者"],"order":2,"definition":"d","source":"x"},{"id":"gc","title":"政府补贴与共付","by":["照护伙伴"],"order":3,"definition":"d","source":"x"},{"id":"inv","title":"外部发票","by":["照护伙伴"],"order":4,"definition":"d","source":"x"},{"id":"reimb","title":"报销","by":["老人","照护伙伴"],"order":5,"definition":"d","source":"x"},{"id":"flow","title":"流转记录","by":["照护伙伴","财务"],"order":6,"definition":"d","source":"x"},{"id":"cm","title":"护理管理记录","by":["照护伙伴"],"order":7,"definition":"d","source":"x"}],"external":[{"id":"svc","title":"服务","topic":"g3"},{"id":"price","title":"协议价","topic":"g2"},{"id":"rate","title":"共付比例","topic":"g2"},{"id":"fund","title":"基金","topic":"g4"},{"id":"cma","title":"护理管理账户","topic":"g4"},{"id":"detail","title":"明细行","topic":"g7"},{"id":"claim","title":"申报行","topic":"g8"},{"id":"agree","title":"服务协议","topic":"g2"}],"edges":[{"id":"1","from":"svc","to":"rec","label":"选清单上她批了的一项","by":["照护伙伴"]},{"id":"2","from":"price","to":"rec","label":"单价照她的协议价取、不加附加费，附加费申报时定"},{"id":"3","from":"proof","to":"rec","label":"一条记录一份凭据","by":["支持工作者"]},{"id":"4","from":"rec","to":"gc","label":"按类别和她的比例拆成政府补的和她出的","by":["照护伙伴"]},{"id":"5","from":"rate","to":"gc","label":"她这类服务的比例"},{"id":"6","from":"rec","to":"fund","label":"写从哪笔扣，挂待申报","by":["照护伙伴"]},{"id":"7","from":"inv","to":"rec","label":"一行一项服务就是一条服务记录，标第三方做的","by":["照护伙伴"],"tree":true},{"id":"8","from":"inv","to":"flow","label":"收到、附件、改、批、付每一步留一条","by":["财务"],"tree":true},{"id":"15","from":"reimb","to":"flow","label":"收到、附件、改、批、付每一步留一条","by":["财务"],"tree":true},{"id":"9","from":"cm","to":"cma","label":"按小时从护理管理账户申报"},{"id":"10","from":"rec","to":"detail","label":"月结单一行一次"},{"id":"11","from":"rec","to":"claim","label":"没申报的一条写成一行","by":["财务"]},{"id":"12","from":"reimb","to":"rec","label":"一行一项服务就是一条服务记录，标第三方做的","by":["照护伙伴"],"tree":true},{"id":"14","from":"agree","to":"reimb","label":"哪些可以她先付再报、她的共付怎么付，照协议上写的"}]}},"FLOWS":[]}}}
// 两样并列的单据是上一层（tree），下一层两样；左边虚框只连第二样单据，主题框里第二样单据右边还连着自己的一样（照 sample-care 的 g6 搭的）；
// 再加一条：左边虚框连同一层右边那个（照 a1 的「照护伙伴 → 群」），排序挪不开，得绕
// 分了子主题：把 G6NOW 里的 g6 拆成两个子主题；g2 有一个虚框指进 g6、没写 sub
const SPLIT = (() => {
  const d = JSON.parse(JSON.stringify(G6NOW)), b = d.BIZ['样例系统'], g = b.CONCEPTS.g6
  const parts = { 'g6-1': ['rec', 'proof', 'gc', 'inv'], 'g6-2': ['reimb', 'flow', 'cm'] }
  const subOfId = (id) => Object.keys(parts).find((k) => parts[k].includes(id))
  for (const [k, ids] of Object.entries(parts)) {
    const edges = g.edges.filter((e) => ids.includes(e.from) || ids.includes(e.to)), ext = []
    for (const e of edges) for (const id of [e.from, e.to]) if (!ids.includes(id) && !ext.some((x) => x.id === id)) {
      const o = subOfId(id)
      ext.push(o ? { id, title: g.concepts.find((n) => n.id === id).title, topic: 'g6', sub: o } : g.external.find((n) => n.id === id))
    }
    b.CONCEPTS['g6/' + k] = { topic: 'g6', sub: k, title: k, summary: '子主题 ' + k, concepts: g.concepts.filter((n) => ids.includes(n.id)), external: ext, edges }
  }
  b.CONCEPTS.g6 = { topic: 'g6', title: g.title, summary: '拆成两段', subs: [{ id: 'g6-1', title: '服务发生', x: 0, y: 0, does: ['记下做了的服务'], concepts: ['服务记录'] }, { id: 'g6-2', title: '报销', x: 1, y: 0, does: ['她先付再报'], concepts: ['报销'] }], edges: [{ from: 'g6-2', to: 'g6-1', label: '报销的一行就是一条服务记录' }] }
  b.CONCEPTS.g2 = { topic: 'g2', title: '建档与服务协议', summary: 's', concepts: [{ id: 'agree', title: '服务协议', by: [], order: 1, definition: 'd', source: 'x' }], external: [{ id: 'reimb', title: '报销', topic: 'g6' }], edges: [{ id: '1', from: 'agree', to: 'reimb', label: '照协议上写的' }] }
  return d
})()
// 流程按主题、按阶段切：g6-01 的出口接 g6-02 的入口；g6-02 里一段 opt、一段 alt（两支各一步，步号 2a、2b）；数据卡「报销」在 g6、「服务协议」在 g2
const STAGES = (() => {
  const d = JSON.parse(JSON.stringify(G6NOW)), b = d.BIZ['样例系统']
  const parties = [{ id: 'cp', title: '照护伙伴' }, { id: 'old', title: '老人' }]
  b.FLOWS = [
    { file: 'g6-01-报销', title: '报销', topic: 'g6', summary: 's', parties, exits: [{ text: '交上去了等核', step: 2, flow: 'g6-02-核报销' }],
      steps: [{ id: 1, from: 'old', to: 'cp', title: '她先付了钱', data: ['报销', '服务协议'] }, { id: 2, from: 'cp', to: 'cp', title: '照护伙伴交上去' }] },
    { file: 'g6-02-核报销', title: '核报销', topic: 'g6', summary: 's', parties, entries: [{ text: '交上来了', step: 1, flow: 'g6-01-报销' }], exits: [{ text: '核完了', step: 3 }],
      steps: [{ id: 1, from: 'cp', to: 'cp', title: '核一遍', opt: '票据看不清' }, { id: '1a', from: 'cp', to: 'old', title: '请她重拍', opt: '票据看不清' },
        { id: '2a', from: 'cp', to: 'old', title: '告诉她批了', alt: '批不批', case: '批了' }, { id: '2b', from: 'cp', to: 'old', title: '告诉她不批、为什么', alt: '批不批', case: '不批' },
        { id: 3, from: 'cp', to: 'cp', title: '记下核完' }] },
    { file: '99-旧的', title: '旧的', summary: 's', parties, steps: [{ id: 1, from: 'cp', to: 'old', title: 'x' }] }]
  b.MODULES = { g6: { topic: 'g6', title: '服务发生与扣费', summary: '模块',
    groups: [{ title: '报销', functions: [
      { id: 'f-1', title: '登记老人先付的报销', called: '报销', intent: '她先垫了钱，记下来等核', subject: { title: '报销', to: '待核' }, in: ['外部发票'], out: [], uses: [{ flow: 'g6-01-报销', step: 2 }] },
      { id: 'f-2', title: '核准报销并记成服务记录', intent: '核过了，这一笔算一条服务', subject: { title: '报销', from: '待核', to: '已核' }, in: [], out: [{ kind: '新记录', title: '服务记录', when: '一行一条' }], rules: ['只核她签了协议的服务'] }] },
      { title: '服务记录', functions: [{ id: 'f-3', title: '作废服务记录', intent: '记错了', subject: { title: '服务记录', from: '记下', to: '作废' }, in: [], out: [] }] }],
    chains: [{ id: 'c-1', title: '报销核过以后', after: { title: '报销', from: '待核', to: '已核' }, then: [{ kind: '新记录', title: '服务记录', when: '一行一条' }, { kind: '状态改变', title: '基金', from: '余额', to: '扣过' }] }],
    workflows: [{ id: 'w-1', title: '报销', states: [{ id: 'a', title: '待核' }, { id: 'b', title: '已核' }, { id: 'c', title: '已扣款', called: '完成' }], moves: [{ from: 'a', to: 'b', label: '核过' }, { from: 'b', to: 'c', label: '扣了款' }, { from: 'a', to: 'c', label: '小额直接扣' }, { from: 'b', to: 'a', label: '退回重核' }] }],
    asks: [{ id: 'q-1', q: '报销要不要她签字？', lean: '要', options: ['要', '不要'], sig: 'abc' }, { id: 'q-2', q: '多久内交？', answer: '一个月', answeredAt: '2026-11-18' }] } }
  // 同样两样数据之间两条线（一来一回）：画成一条，两句话接起来
  b.CONCEPTS.g2 = { topic: 'g2', title: '建档与服务协议', summary: 's', concepts: [{ id: 'agree', title: '服务协议', by: [], order: 1, definition: 'd', source: 'x' }, { id: 'file', title: '档案', by: [], order: 2, definition: 'd', source: 'x' }],
    external: [], edges: [{ id: '1', from: 'agree', to: 'file', label: '签了记进档案', by: ['照护伙伴'] }, { id: '2', from: 'file', to: 'agree', label: '档案上写着协议号', by: ['老人'] }] }
  d.OPEN = { '样例系统/module/g6': 1 }
  return d
})()
const DOCS = { CONTEXTS: ['样例系统'], OPEN: {}, BIZ: { '样例系统': {
  MAP: { topics: [{ id: 'g6', title: '服务发生与扣费', c: 2, x: 0, y: 0, does: ['录'], concepts: ['外部发票'] }, { id: 'g2', title: '建档与服务协议', c: 1, x: 1, y: 0, does: ['签'], concepts: ['服务协议'] }], edges: [] },
  CONCEPTS: { g6: { topic: 'g6', title: '服务发生与扣费', summary: 's',
    concepts: [['inv', '外部发票'], ['reimb', '报销'], ['exp', 'Expense'], ['flow', '流转记录'], ['rec', '服务记录'], ['one', '一对一'], ['grp', '群']].map(([id, title], i) => ({ id, title, by: ['照护伙伴'], order: i + 1, definition: 'd', source: 'x' })),
    external: [{ id: 'agree', title: '服务协议', topic: 'g2' }, { id: 'carer', title: '照护伙伴', topic: '共享内核' }],
    edges: [['inv', 'exp', 1], ['reimb', 'exp', 1], ['inv', 'flow', 1], ['reimb', 'flow', 1], ['exp', 'rec'], ['agree', 'reimb'], ['carer', 'one'], ['carer', 'grp'], ['one', 'grp']]
      .map(([from, to, tree], i) => ({ id: String(i + 1), from, to, label: '线' + (i + 1), ...(tree ? { tree: true } : { by: ['照护伙伴'] }) })) } },
  FLOWS: [] } } }
// 答的时候 post 出去的 body 记下来看（不真发）
global.fetch = (u, o) => { global.__posted = JSON.parse(o.body); return new Promise(() => {}) }
// 一排三个主题（主区放不下）；一个主题只有一个自己的概念、虚框大多只连虚框（照沟通 app 的 a2 搭的）
const ROW3 = { CONTEXTS: ['沟通 app', '共享内核'], OPEN: {}, BIZ: { '沟通 app': {
  MAP: { topics: ['聊天与群', '看她的档案、计划、钱和月结单', '传收据、审收据'].map((title, i) => ({ id: 'a' + (i + 1), title, c: 3 + i, x: i, y: 0, does: ['老人和家属在 app 里看她批了哪一级哪些服务，照护伙伴看到的是同一份', '月结单出了收到一条通知，点开看'], concepts: ['一', '二'] })),
    edges: [{ from: 'a1', to: 'a2', label: '开进 app 的老人和她点头的家属才看得到' }, { from: 'a3', to: 'a2', label: '批了的收据进样例系统' }] },
  CONCEPTS: { a2: { topic: 'a2', title: '看她的档案', summary: 's', concepts: [{ id: 'notice', title: '月结单通知', by: ['老人'], order: 1, definition: 'd', source: 'x' }],
    external: [['file', 'g2'], ['notice-doc', 'g1'], ['plan', 'g1'], ['careplan', 'g5'], ['fund', 'g4'], ['bal', 'g4'], ['stmt', 'g7'], ['detail', 'g7']].map(([id, topic]) => ({ id, title: id, topic, context: '样例系统' }))
      .concat([{ id: 'old', title: '老人', topic: '共享内核' }, { id: 'fam', title: '家属', topic: '共享内核' }]),
    edges: [['old', 'file'], ['file', 'notice-doc'], ['file', 'plan'], ['old', 'careplan'], ['fund', 'bal', 1], ['old', 'bal'], ['stmt', 'notice'], ['notice', 'fam'], ['stmt', 'detail', 1], ['old', 'fam']]
      .map(([from, to, tree], i) => ({ id: String(i + 1), from, to, label: '线' + (i + 1) + '的说明', ...(tree ? { tree: true } : { by: ['老人'] }) })) } },
  FLOWS: [] } } }
// 上下文地图：两个上下文之间 8 条来往（照 sample-care 搭的），样例系统「管什么」一长句
const CX8 = { CONTEXTS: ['样例系统', '沟通 app', '共享内核'], OPEN: {}, BIZ: {}, USES: { c1: ['老人', '家属', '照护伙伴'], c2: ['老人', '家属', '照护伙伴'] }, PROGRESS: {},
  PROJECT: { name: 'AgedCareProvider', kernel: { concepts: ['老人', '家属', '照护伙伴'] }, contexts: [
    { id: 'c1', name: '样例系统', c: 2, role: '管一位老人从评估批下来到月结与申报的全程：建档签协议、记名下的基金、排照护计划与预算、录每一笔服务并算政府补贴与共付、出月结单、向 Services Australia 申报并对付款单' },
    { id: 'c2', name: '沟通 app', c: 3, role: '老人/家属和照护伙伴在手机上聊天、看余额和计划、做简单操作' }] },
  EDGES: [['c1', 'c2', '事件', '服务协议签了'], ['c2', 'c1', '查询', '她的照护伙伴是谁、照护伙伴名下有哪几位老人'], ['c2', 'c1', '查询', '她的档案'], ['c2', 'c1', '查询', '她现在的照护计划'],
    ['c2', 'c1', '查询', '她名下每笔基金的余额'], ['c2', 'c1', '事件', '收据批了'], ['c1', 'c2', '事件', '月结单出了'], ['c2', 'c1', '查询', '她的一份月结单']].map(([from, to, kind, name]) => ({ from, to, kind, name })) }
const NUM = '([0-9.-]+)'
const cxCards = (s) => [...s.matchAll(new RegExp('<g class="(?:evt|qry)"><rect x="' + NUM + '" y="' + NUM + '" width="' + NUM + '" height="' + NUM + '"', 'g'))].map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }))
const cxLines = (s) => [...s.matchAll(new RegExp('<g class="ed"><path d="M ' + NUM + ' ' + NUM + ' L ' + NUM + ' ' + NUM + '"', 'g'))].map((m) => ({ x1: Math.min(+m[1], +m[3]), x2: Math.max(+m[1], +m[3]), y: +m[2] }))
// 卡两两不重叠、上下至少隔 8；每张卡不压别的线（别的线的高度不落在卡的上下边之间）
const cardsClear = (s) => { const c = cxCards(s), l = cxLines(s)
  const apart = c.every((a, i) => c.every((b, j) => i === j || a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h + 8 <= b.y || b.y + b.h + 8 <= a.y))
  const offLines = c.every((a) => l.filter((x) => x.y >= a.y - 1 && x.y <= a.y + a.h + 1 && x.x1 < a.x + a.w && x.x2 > a.x).length === 1)
  return c.length === 8 && apart && offLines }
// 框里的字不截：「管什么」那几行连起来就是整句，最后一行在框里
const cxBox = (s, id) => { const m = s.match(new RegExp('<g class="sp[^"]*" data-cx="' + id + '"><rect x="' + NUM + '" y="' + NUM + '" width="' + NUM + '" height="' + NUM + '"[^]*?</g>')); return m && { x: +m[1], y: +m[2], w: +m[3], h: +m[4], html: m[0] } }
const boxText = (s, id, role) => { const b = cxBox(s, id); if (!b) return false
  const lines = [...b.html.matchAll(new RegExp('<text class="d" x="' + NUM + '" y="' + NUM + '">([^<]*)</text>', 'g'))]
  const bare = (t) => t.split(' ').join('')   // 折行处的空格会被去掉，比的时候都不算空格
  return bare(lines.map((m) => m[3]).join('')) === bare(role) &&lines.every((m) => +m[2] + 4 <= b.y + b.h) }
// 流程：4 个参与方、问题卡带长选项（照 sample-care 的 00 搭的）
const FLOW4 = { CONTEXTS: ['样例系统', '共享内核'], OPEN: {}, BIZ: { '样例系统': { MAP: { topics: [], edges: [] }, CONCEPTS: {}, FLOWS: [{ file: '00-x', title: '老人来到公司：填登记表', summary: 's',
  parties: [{ id: 'old', title: '长者', sub: '或她的代理人' }, { id: 'cp', title: '照护伙伴', sub: '公司里接待她、帮她申请' }, { id: 'rn', title: '注册护士', sub: '护理人员' }, { id: 'gov', title: '政府', sub: 'My Aged Care、评估机构' }],
  steps: [{ id: '1', from: 'old', to: 'cp', title: '长者（或代理人陪着）第一次来到公司，想请这家帮她', date: '第 1 天', note: '两种情况：还没申请的往下走第 2～7 步；已经获批、拿着决定通知书和支持计划来的，填完表直接到流程 01 第 2 步。',
    rules: [{ id: 'r-1', text: '从没注册过的老人要填首次来访登记表。', status: '定了' }],
    asks: [{ id: 'a-1', q: '「从没注册过」是指在这家公司没有她的记录，还是指她没注册过 My Aged Care？', lean: '指在这家公司还没有她的记录', options: ['在这家公司还没有她的记录', '没注册过 My Aged Care', '两样都没有的才填'] },
      { id: 'a-2', q: '已经获批的老人来了，第一、二部分也填吗？', lean: '也填', options: ['也填第一、二部分，三、四部分随她', '整张都填', '不填，建档时照护伙伴照通知书和她口述记'] }] },
    { id: '2', from: 'rn', to: 'gov', title: '注册护士做快速风险评估，交给评估机构', date: '第 2 天' }] }] } } }
// 流程右边的框：一步一个，顶边、高；往下一个个排，上一个的底不压下一个的顶
const sides = (s) => [...s.matchAll(/<g class="qa side [a-z]+ [a-z]+" data-step="([^"]+)"><path class="lead" d="M [0-9.-]+ [0-9.-]+ L [0-9.-]+ ([0-9.-]+)"[^>]*\/>(?:<rect class="bg" x="[^"]+" y="([0-9.-]+)" width="[^"]+" height="([0-9.-]+)"\/>)?(?:<g class="note"><rect x="[^"]+" y="([0-9.-]+)" width="[^"]+" height="([0-9.-]+)")?/g)]
  .map((m) => ({ step: m[1], y: +m[2], top: +(m[3] ?? m[5]), h: +(m[4] ?? m[6]) }))
const sidesClear = (s) => { const b = sides(s); return b.length > 0 && b.every((x) => x.h > 0) && b.every((x, i) => i === 0 || (b[i - 1].top + b[i - 1].h + 10 <= x.top && b[i - 1].y < x.y)) && new Set(b.map((x) => x.step)).size === b.length }
const hdAligned = (s) => { const hd = [...s.matchAll(/class="hd[^"]*" style="left:([0-9.-]+)px;width:([0-9.]+)px"/g)].map((m) => +m[1] + +m[2] / 2), life = [...s.matchAll(/<line class="life" x1="([0-9.]+)"/g)].map((m) => +m[1])
  return hd.length === 4 && life.length === 4 && hd.every((x, i) => Math.abs(x - life[i]) < 0.5) }
// 工作台注入的两个上下文：样例系统、沟通 app；沟通 app 的概念图连着样例系统的主题、共享内核，还有一个主题号跟本上下文撞上的；流程上有 UI 设计问的问题
const TWO = { CONTEXTS: ['样例系统', '沟通 app', '共享内核'], OPEN: { '沟通 app/01-x': 2 },
  SCREENS: { 'N-01/notice': { title: '照决定通知书填', context: '样例系统' } }, WB: { base: '/sample-care', project: '养老', pages: ['业务', '界面'] },
  BIZ: {
    '样例系统': { MAP: { topics: [{ id: 'g1', title: '评估与通知书', c: 2, x: 0, y: 0, does: ['评估批下来'], concepts: ['通知书'] }], edges: [] },
      CONCEPTS: { g1: { topic: 'g1', title: '评估与通知书', summary: 's', concepts: [{ id: 'n', title: '通知书', order: 1, definition: 'd', source: 'x' }], external: [], edges: [] } }, FLOWS: [] },
    '沟通 app': { MAP: { topics: [{ id: 'a1', title: '聊天与群', c: 3, x: 0, y: 0, does: ['一对一聊'], concepts: ['消息'] }], edges: [] },
      CONCEPTS: { a1: { topic: 'a1', title: '聊天与群', summary: 's', concepts: [{ id: 'msg', title: '消息', order: 1, definition: 'd', source: 'x' }],
        external: [{ id: 'notice', title: '通知书', topic: 'g1', context: '样例系统' }, { id: 'old', title: '老人', topic: '共享内核' }, { id: 'x', title: '撞号的', topic: 'a1', context: '样例系统' }],
        edges: [{ id: '1', from: 'notice', to: 'msg', label: '通知书到了发一条' }, { id: '2', from: 'old', to: 'msg', label: '她发的' }, { id: '3', from: 'msg', to: 'x', label: '撞号' }] } },
      FLOWS: [{ file: '01-x', title: '聊一句：老人发一句', summary: 's', parties: [{ id: 'o', title: '老人' }, { id: 'c', title: '照护伙伴' }],
        steps: [{ id: '1', from: 'o', to: 'c', title: '发一句', asks: [
          { id: 'a-1', q: '能发语音吗？', lean: '能', options: ['能', '不能'], by: 'UI 设计', screen: 'N-01/notice' },
          { id: 'a-2', q: '能撤回吗？', by: 'UI 设计', screen: 'N-02/zz' }] }] }] } } }
// ---- 主题页（一个主题的「业务」那一页）用的 ----
// 主区、开着的窗口各自的内容；主题页的某一块（从它的开头到下一块之前）
const mainHtml = (s) => s.split('\n<!--nav-->\n')[0]
const popup = (s) => s.split('<!--pop-->\n')[1] ?? ''
const secOf = (s, k) => { const m = mainHtml(s), a = m.indexOf('<div class="sec', Math.max(0, m.indexOf('data-sec="' + k + '"') - 40)), b = m.indexOf('<div class="sec', a + 10); return m.indexOf('data-sec="' + k + '"') < 0 ? '' : m.slice(a, b < 0 ? undefined : b) }
const count = (s, t) => s.split(t).length - 1
// 跑完页面再接着跑的一句：把这个主题的几块展开、重画
const open = (t, ...ks) => ks.map((k) => `secOpen['样例系统/${t}/${k}'] = true`).join('; ') + '; render()'
const ALL = ['intro', 'tours', 'core', 'purposes', 'asks']
// 断言要改动注入的数据时，给它一份抄出来的，改动不带到后面的断言里
const fresh = (d) => JSON.parse(JSON.stringify(d))
// 模拟点一下、按一下键：页面挂在 main、窗口、document 上的处理函数照样跑；at 造一个「点中了什么」的目标
const fire = (list, ev) => (list ?? []).forEach((f) => f(ev))
const at = (map) => ({ closest: (q) => map[q] ?? null })
// 流程速览那张图：一步一个框，框的位置
const tourBoxes = (s) => [...s.matchAll(/<g class="tb[^"]*" data-step="(\d+)"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => ({ n: +m[1], x: +m[2], y: +m[3], w: +m[4], h: +m[5] }))
// 一个主题、三层上下层（单据装着明细，明细装着批注），还有一样资料连在明细上：照它一层层缩进、一层层套
const DEEP = { CONTEXTS: ['样例系统'], OPEN: {}, BIZ: { '样例系统': {
  MAP: { topics: [{ id: 'g1', title: '单据', c: 2, x: 0, y: 0, does: ['开单'], concepts: ['单据'] }, { id: 'g2', title: '库房', c: 3, x: 1, y: 0, does: ['收货'], concepts: ['货'] }], edges: [] },
  CONCEPTS: {
    g1: { topic: 'g1', title: '单据', summary: 's',
      concepts: [{ id: 'doc', title: '单据', order: 1, definition: '一张单据。第二句不出现在主题页上。', source: '原料一', fields: ['单号', '日期'] }, { id: 'row', title: '明细', order: 1, definition: '单据上的一行。', source: '原料二', fields: ['数量'] },
        { id: 'memo', title: '批注', order: 1, definition: '明细上的一句话。', source: '原料三' }, { id: 'tpl', title: '模板', order: 2, definition: '开单用的模板。', source: '原料四' }, { id: 'lone', title: '流水号', order: 3, definition: '给单据编号用的。', source: '原料五' }],
      external: [{ id: 'goods', title: '货', topic: 'g2' }],
      edges: [{ id: '1', from: 'doc', to: 'row', label: '一张几行', tree: true }, { id: '2', from: 'row', to: 'memo', label: '一行几句', tree: true }, { id: '3', from: 'tpl', to: 'row', label: '照模板抄' }, { id: '4', from: 'doc', to: 'goods', label: '照单据收货' }] },
    g2: { topic: 'g2', title: '库房', summary: 's', concepts: [{ id: 'goods', title: '货', order: 1, definition: '收进库房的货。别的不写。', source: '原料六' }], external: [], edges: [] } },
  FLOWS: [],
  MODULES: { g1: { topic: 'g1', title: '单据', summary: '开单据',
    core: [{ title: '单据', why: '留下的就是单据', parts: ['明细', '批注'], sources: [], targets: [{ op: '创建', by: '照单据收货', fn: 'f-1', data: '货', topic: '库房' }, { op: '创建', by: '照单据收货', fn: 'f-1', data: '货', topic: '库房' }, { op: '更新', by: '告诉外面', fn: 'f-1', data: '对账单', topic: '对账（财务系统）' }] }],
    uses: [{ title: '模板', note: '开单照它抄。' }, { title: '名录', note: '没连到哪一样核心数据的资料。' }],
    purposes: [], groups: [{ title: '单据', functions: [{ id: 'f-1', title: '开单据', intent: '开一张', subject: { title: '已发邮件（消息通知）', op: '创建', to: '发了' }, in: [], out: [] }] }],
    chains: [], workflows: [{ id: 'w-1', title: '明细', states: [{ id: 'a', title: '有' }], moves: [] }, { id: 'w-2', title: '对不上名字的', states: [{ id: 'a', title: '有' }, { id: 'b', title: '无' }], moves: [], note: '这一份的名字不是概念' }] } } } } }
// g2 没拆以前的那一份模块业务（没有顶层 rules，功能带 subject.edits、顺带留下的）：没拆的主题功能的窗口照旧的样子画，拿它来看
const G2OLD = {"topic":"g2","title":"参与者档案与她名下的钱","summary":"注册服务方替每位老人留一份档案，并管着政府开在她名下的钱。","tours":[{"title":"一位老人从建档到分到资金","note":"照护伙伴替一位新来的老人建档；她签了服务协议、分到资金以后，钱开在她名下，后面做的服务才有钱可扣。","steps":[{"by":"老人","text":"评估批下来以后，把政府发的决定通知书和支持计划交给注册服务方。评估在「评估与分资金」里办。","concepts":["决定通知书","支持计划"]},{"by":"照护伙伴","text":"照决定通知书给她建立参与者档案，记下她批到的分级和路径。","concepts":["参与者档案","批到的分级和路径"],"fns":["f-1"]},{"by":"老人","text":"和注册服务方签服务协议。签协议在「服务方与协议」里办。","concepts":["服务协议"]},{"by":"照护伙伴","text":"在她的档案上记下她签了哪一份服务协议、哪天签的。","concepts":["签了的服务协议"],"fns":["f-2"]},{"by":"卫生部","text":"来信通知她分到了资金。排队和分资金在「评估与分资金」里办。","concepts":["分资金的信"]},{"by":"照护伙伴","text":"记下分到资金的那天，开出她名下的基金；批了几类服务，就开几个基金账户。","concepts":["她名下的基金","基金账户"],"fns":["f-3"]}]},{"title":"做了服务以后从基金账户扣款","note":"服务做了、申报通过以后，这一行申报的钱从她名下对应的基金账户里扣掉。","steps":[{"by":"财务","text":"照服务记录写出申报行报给政府，政府审核通过。申报在「服务发生与申报」里办。","concepts":["申报行"]},{"by":"财务","text":"照审核通过的申报行，从她名下对应这一类服务的基金账户扣款，余额跟着减少。","concepts":["基金账户","余额"],"fns":["f-4"]}]}],"core":[{"title":"参与者档案","why":"注册服务方替一位老人做的每一件事都记在她的档案上：签了什么协议、分到了什么钱，后面的服务和扣款都照这份档案来。","parts":["批到的分级和路径","签了的服务协议"],"sources":[{"steps":[{"data":"决定通知书","op":"创建","by":"照通知书上批下来的内容建立档案","fn":"f-1"}]}],"targets":[{"op":"创建","by":"记下分到资金的那天，开出她名下的基金","fn":"f-3","data":"她名下的基金"},{"op":"创建","by":"批了几类服务，就开几个基金账户","fn":"f-3","data":"基金账户"}]},{"title":"基金账户","why":"分到的钱开在她名下的基金账户里，一类服务一个账户。账户有自己的余额，每一次扣款都照账户办。","parts":["余额"],"sources":[{"steps":[{"data":"参与者档案","op":"创建","by":"记下分到资金的那天，批了几类服务就开几个账户","fn":"f-3"}]}],"targets":[{"op":"更新","by":"扣成了，把这一行申报行记成已扣","fn":"f-4","data":"申报行","topic":"服务发生与申报"}]}],"purposes":[{"text":"随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。","from":"钱开在她名下，做了服务从账户里扣","source":"人 2026-11-24 说：要有个地方管理资金，把资金的出入都放在这里管理","needs":[{"aim":"分到的钱和扣掉的钱，每一笔都查得到。","text":"钱的每一笔进出都记在基金账户上：分到资金时开出账户，每扣一笔就从余额里减一笔。","source":"手册 v4.4 §9.2 行 1290","cores":["基金账户"],"data":["余额"],"fns":["f-3","f-4"],"chains":["c-1"]},{"aim":"同一笔钱只有一处说了算。","text":"别的业务要动钱，都到这里来办，不各自去改余额。","source":"人 2026-11-24 说：把资金的出入都放在这里管理","cores":["基金账户"],"fns":["f-4"]}]},{"text":"后面的服务有一份说了算的依据：她批到了什么、签了什么协议。","from":"注册服务方替她建档","needs":[{"aim":"她批到了什么，以政府发的决定通知书为准。","text":"批下来的内容照决定通知书记进档案。","source":"手册 v4.4 §6.6 行 562–568","cores":["参与者档案"],"data":["批到的分级和路径"],"fns":["f-1"]},{"aim":"看档案就知道她签没签服务协议、签的是哪一份。","text":"签了的服务协议记在档案上。","cores":["参与者档案"],"data":["签了的服务协议"],"fns":["f-2"]}]}],"intro":{"context":"政府批给老人的钱开在她名下，由 Services Australia 保管；注册服务方替她建档，做了服务以后从她名下的账户里扣。","duty":["管每位老人的档案和她名下的基金、账户：建档，记下她签了协议、分到了资金，按申报从账户扣款。","不管评估怎么做、服务怎么排、发票怎么开。"],"concepts":[{"title":"参与者档案","note":"注册服务方替一位老人留的记录，写着她批了什么、走到了哪一步。"},{"title":"她名下的基金","note":"政府开在老人名下、替她保管的一笔钱。"},{"title":"基金账户","note":"一笔基金按批了的服务类型分开的账户，扣款只从对应的那一个扣。"}],"users":[{"who":"照护伙伴","aim":"替老人把档案建好、记准，钱到了就能开始用","steps":["照决定通知书给她建档","她签了服务协议，在档案上记下来","分到资金那天记下来，开出她名下的基金"]},{"who":"财务","aim":"服务做完、申报以后，把钱从对的账户里扣掉","steps":["照申报行从基金账户扣款"]}],"usual":["照护伙伴照决定通知书给老人建档","她签了服务协议，档案上记下","卫生部来信说分到了资金，开出她名下的基金和账户","做了服务、申报以后，从对应的账户扣款"]},"groups":[{"title":"参与者档案","functions":[{"id":"f-1","title":"照决定通知书建立参与者档案","called":"建档","does":"照决定通知书记下她批了哪一级、哪条路径","intent":"老人交来决定通知书，给她留一份档案，以后签协议、分资金、记服务都记在这一份上。","subject":{"title":"这位老人的参与者档案","op":"创建","to":"档案建好了，记着她批到的分级和路径","edits":["My Aged Care 编号：照决定通知书上印的编号记下","批到的分级和路径：照决定通知书记下","批到的分级和路径 › 路径：只记通知书上批的那一条，不替她另选"]},"in":[{"title":"决定通知书","by":"老人交来的","note":"政府评估后发给她的那一份，上面写着分级和路径"},{"title":"支持计划","by":"老人交来的","note":"同一次评估一起发的，写着批了她哪些服务类型"},{"title":"分级","by":"政府批的","note":"通知书上批给她的那一级，一共八级"}],"out":[],"rules":["一位老人只有一份档案，按 My Aged Care 编号认"],"uses":[{"flow":"01-老人注册","step":5}],"source":"手册 v4.4 §3 Participant"},{"id":"f-2","title":"在参与者档案上记下签了的服务协议","does":"记下她跟哪家签了协议、哪天签的","intent":"她跟注册服务方签了服务协议，档案上要看得出她已经签了、签的是哪一份。","subject":{"title":"这位老人档案上签了的服务协议","op":"创建","from":"档案建好了，还没记她签协议","to":"档案上记着她签了哪一份服务协议、哪天签的","edits":["签的协议：记下她签的是哪一份服务协议","签约日期：记下协议上写的那一天"]},"in":[{"title":"参与者档案","note":"记在哪一位老人的档案上"},{"title":"服务协议","by":"老人签的","note":"她跟注册服务方签的那一份"},{"title":"签约日期","by":"照护伙伴填的","note":"协议上写的签约那一天，日/月/年"}],"out":[{"kind":"事件","title":"协议已签","when":"记下以后告知聊天 app，给她开聊天"}],"uses":[{"flow":"01-老人注册","step":6}]},{"id":"f-3","title":"记下分到资金并开出她名下的基金","does":"记下分到资金那天和分到的是全额还是一部分，开出她名下的基金","intent":"卫生部来信说她分到了资金，从这一天起钱开在她名下，后面的服务才能从这笔钱里扣。","subject":{"title":"这位老人的参与者档案","op":"更新","from":"档案上记着她签了协议，还没分到资金","to":"档案上记着她哪天分到资金、分到的是全额还是一部分","edits":["分到的资金：记下哪天分到、分到的是全额还是一部分"]},"in":[{"title":"参与者档案","note":"哪一位老人分到了资金"},{"title":"分资金的信","by":"卫生部发的","note":"写着分到资金的日期，分到的是全额还是一部分"}],"out":[{"kind":"新记录","title":"她名下的基金"},{"kind":"新记录","title":"基金账户","when":"批了几类服务就开几个"}],"uses":[{"flow":"01-老人注册","step":8}]}]},{"title":"基金账户","functions":[{"id":"f-4","title":"照申报行从基金账户扣款","does":"按申报行上她的编号和服务类型，从对应的账户扣","intent":"服务做了、申报了，这一行的钱要从她名下对应的那个账户里扣掉。","subject":{"title":"她名下这一类服务的基金账户","op":"更新","from":"账户里是扣款之前的余额","to":"账户里扣掉了这一行申报的金额","edits":["余额：减去这一行申报的金额"]},"in":[{"title":"基金账户","note":"她名下对着这一类服务的那一个"},{"title":"申报行","by":"政府审核通过的","note":"要扣的是哪一行：带着她的编号、服务类型和金额（澳元）"}],"out":[{"kind":"状态改变","title":"申报行","when":"扣成了就记成已扣"}],"rules":["只能扣她批了的那一类服务的账户"]}]}],"chains":[{"id":"c-1","title":"分到资金以后","after":{"title":"参与者档案","from":"已签协议","to":"分到资金"},"then":[{"kind":"新记录","title":"她名下的基金","to":"开着"},{"kind":"新记录","title":"基金账户","to":"可以扣款","when":"批了几类服务就开几个","note":"一笔基金一个账户"}]}],"workflows":[{"id":"w-1","title":"参与者档案","states":[{"id":"s-1","title":"已建档"},{"id":"s-2","title":"已签协议"},{"id":"s-3","title":"分到资金"},{"id":"s-4","title":"已停用","called":"离开"}],"moves":[{"from":"s-1","to":"s-2","label":"签了服务协议"},{"from":"s-2","to":"s-3","label":"卫生部来信分到资金"},{"from":"s-1","to":"s-3","label":"还没签协议就分到资金"},{"from":"s-3","to":"s-4","label":"她走了或者换了注册服务方"}],"note":"档案停用以后不删，留着查"}],"asks":[{"id":"q-1","q":"档案上的分级、路径跟决定通知书不一样时，是不让建，还是先建了再标出来？","lean":"不让建，等通知书改了再建","options":["不让建","先建了再标出来"]},{"id":"q-2","q":"「后面的服务有一份说了算的依据」这条业务目的是推出来的，原料没有写为什么要替老人建档。建档是为了这个吗？","lean":"是这个目的","options":["是这个目的","建档只是为了记下她是谁"]},{"id":"q-3","q":"「看档案就知道她签没签服务协议、签的是哪一份」这条更细的目的是推出来的，原料只写了签了协议要记进档案，没有写记下来是为了什么。记下来是为了这个吗？","lean":"是这个目的","options":["是这个目的","记下来只是为了留一份底"]}]}
const OLD = 'MODULES.g2 = fresh(G2OLD); '
// g5 没拆以前的那一份模块业务和概念（没有顶层 rules，目的没写 id，功能带 subject.edits，栏上没有 for）：样例里的 g5 现在也是拆过的，
// 凡是看「没拆的主题照旧显示」的断言，先把 g5 换回这一份再看；别的项目里还有没拆的主题，旧画法的覆盖不能丢
const G5OLD = {"topic":"g5","title":"服务发生与申报","summary":"注册服务方把做了的每一次服务记成服务记录，再照服务记录向政府申报。","tours":[{"title":"外部服务方做的服务：从发票到申报、月结单","note":"请外部服务方做的服务，从发票登记进来，核对后记成服务记录，写成申报行报给政府，月底列进月结单。","steps":[{"by":"照护伙伴","text":"外部服务方开来发票，把发票上的每一行登记成发票行。","concepts":["发票行"],"fns":["f-2"]},{"by":"照护伙伴","text":"对着老人签的服务协议核对发票行，核对无误的一行记成一条服务记录。","concepts":["服务协议","服务记录","凭据"],"fns":["f-3"]},{"by":"财务","text":"把还没申报的服务记录写成申报行，报给政府。","concepts":["申报行"],"fns":["f-5"]},{"by":"财务","text":"政府审核完，记下每一行申报行是通过还是被退回。","concepts":["申报行"],"fns":["f-8"]},{"by":"财务","text":"审核通过的一行，从老人名下的基金账户扣款。扣款在「参与者档案与她名下的钱」里办。","concepts":["基金账户"]},{"by":"财务","text":"月底把这个月的服务记录和照护管理记录汇总成月结单，发给老人。","concepts":["月结单","月结单明细"],"fns":["f-6"]}]},{"title":"自己做的服务、老人先付的钱和照护管理","note":"另外三种情形各记各的：自己的工作者做的服务直接记，老人先付的钱照收据记，照护伙伴做的照护管理单独记。","steps":[{"by":"照护伙伴","text":"自己的工作者上门做了一次服务，照服务清单选出做的是哪一项，记下一条服务记录。","concepts":["服务清单","服务记录"],"fns":["f-1"]},{"by":"照护伙伴","text":"老人自己先付了钱、交来收据的，核对收据以后记成服务记录。","concepts":["服务记录","凭据"],"fns":["f-4"]},{"by":"照护伙伴","text":"替老人做了一次照护管理，记下一条照护管理记录。","concepts":["照护管理记录"],"fns":["f-7"]}]}],"core":[{"title":"服务记录","why":"这块业务最后要留下的是「做了哪一次服务」。发票和收据是凭据，处理它们是为了把服务记录记准；申报、扣款和月结单都从服务记录开始。","parts":["凭据"],"sources":[{"steps":[{"data":"自己的工作者做了一次服务","event":true,"op":"创建","by":"直接记下这一次服务","fn":"f-1"}]},{"steps":[{"data":"外部服务方开来一张发票","event":true,"op":"创建","by":"把发票一行一行登记下来","fn":"f-2"},{"data":"发票行","op":"创建","by":"核对无误，一行记成一条","fn":"f-3"}]},{"steps":[{"data":"老人交来先付的收据","event":true,"op":"创建","by":"核对收据，照它记下","fn":"f-4"}]}],"targets":[{"op":"创建","by":"一条写成一行，报给政府","fn":"f-5","data":"申报行"},{"op":"创建","by":"按月汇总，发给老人","fn":"f-6","data":"月结单"}]},{"title":"照护管理记录","why":"照护伙伴替老人做的照护管理也要留下记录：这个月做没做、做了多久，照这些记录来看，月结单上也要列出来。","sources":[{"steps":[{"data":"照护伙伴做了一次照护管理","event":true,"op":"创建","by":"记下这一次照护管理","fn":"f-7"}]}],"targets":[{"op":"创建","by":"按月汇总，发给老人","fn":"f-6","data":"月结单"}]},{"title":"申报行","why":"向政府申报是一行一行办的：报上去、通过或者退回，通过了才扣款，每一步都照申报行办。","sources":[{"steps":[{"data":"服务记录","op":"创建","by":"一条写成一行，报给政府","fn":"f-5"}]}],"targets":[{"op":"更新","by":"审核通过的一行交去扣款","fn":"f-8","data":"基金账户","topic":"参与者档案与她名下的钱"}]},{"title":"月结单","why":"月结单出了以后是留下来的一份：发给老人，老人照它付自己该付的钱，有异议也照它更正。","parts":["月结单明细"],"sources":[{"steps":[{"data":"服务记录","op":"创建","by":"按月汇总，发给老人","fn":"f-6"}]},{"steps":[{"data":"照护管理记录","op":"创建","by":"按月汇总，发给老人","fn":"f-6"}]}],"targets":[]}],"uses":[{"title":"服务清单","note":"政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。"},{"title":"服务协议","note":"老人跟注册服务方签的那一份；核对一项服务在不在她签的协议里，照它查。"}],"purposes":[{"text":"交给政府的申报行要通得过政府的审核。","from":"政府审核通过才付钱","source":"人 2026-11-24 说：系统要提供出符合政府审核的申报项","needs":[{"aim":"报上去的每一行都对得上一次真做了的服务。","text":"申报行只能从服务记录写出来，一条服务记录对一行。","source":"申报格式 v1.14 第 4 节","cores":["申报行"],"fns":["f-5"]},{"aim":"不报政府不认的服务。","text":"申报的服务要是批给这位老人的服务类型，并且在她签的协议里。","source":"手册 v4.4 §10.1 行 1466","cores":["服务记录"],"data":["服务清单","服务协议"],"fns":["f-1"]},{"aim":"政府审核的结果有着落：通过的扣款，被退回的改了重报。","text":"审核结果记在申报行上；审核通过的一行交去从老人名下的基金账户扣款。","source":"申报格式 v1.14 第 6 节","cores":["申报行"],"fns":["f-8"],"chains":["c-2"]}]},{"text":"每一次服务都照政府的要求留痕，查的时候拿得出依据。","from":"先把服务做了再申报；有的服务是请外部服务方做的","source":"人 2026-11-24 说：按照要求为服务留痕","needs":[{"aim":"做了的服务一次不漏。","text":"服务不管从哪里来，都要落成服务记录。","source":"人 2026-11-24 说：按照要求为服务留痕","cores":["服务记录"],"fns":["f-1","f-3","f-4"],"chains":["c-1"]},{"aim":"每条服务记录都指得出它的依据。","text":"外部来的服务要留下凭据：发票一行一行录进来，核对过才记成服务记录，每条服务记录都指得出它的凭据是哪一行。","source":"手册 v4.4 §10.3 行 1520","data":["发票行","凭据"],"fns":["f-2","f-3","f-4"]},{"aim":"照护伙伴做的照护管理也查得到。","text":"照护管理也要留记录。","source":"手册 v4.4 §8.4 行 960","cores":["照护管理记录"],"fns":["f-7"]}]},{"text":"每个月向老人交代清楚：用了哪些服务、花了多少钱。","from":"政府出钱替老人买居家照护服务","needs":[{"aim":"老人每个月看得到自己用了哪些服务、每一项花了多少钱。","text":"月底把这个月的服务记录和照护管理记录汇总成月结单，一条记录列一行，发给老人。","cores":["月结单"],"data":["月结单明细"],"fns":["f-6"]}]}],"intro":{"context":"政府出钱替老人买居家照护服务：注册服务方先把服务做了，或者请外部服务方做，再向政府申报，政府审核通过才付钱。","duty":["管服务记录和照它做的申报：把做了的服务记准，登记和核对外面开来的发票，向政府申报，按月给老人出月结单。","不管钱从哪个账户扣、协议怎么签。"],"concepts":[{"title":"服务记录","note":"做了一次服务记一条：哪天、哪项服务、多少、多少钱。"},{"title":"发票行","note":"外部服务方开来的发票上的一行，对着一次服务。"},{"title":"申报行","note":"向政府申报的一行，对着一条服务记录。"},{"title":"月结单","note":"每月给老人的一份清单，列着这个月的服务和花的钱。"},{"title":"照护管理记录","note":"照护伙伴替老人做一次照护管理记一条：哪天、做了多久、做了什么。"}],"users":[{"who":"照护伙伴","aim":"把做了的服务记准","steps":["记下自己的工作者做的服务","登记外部服务方开来的发票，核对以后记成服务记录","核对老人交来的收据，记成服务记录","记下做了的照护管理"]},{"who":"财务","aim":"照服务记录向政府申报，按月给老人出清单","steps":["把服务记录写成申报行","记下政府对申报行的审核结果","出月结单"]}],"usual":["做了一次服务，记下一条服务记录","外面开来的发票登记、核对，记成服务记录","财务照服务记录写申报行，报给政府","政府审核通过的申报行交去扣款","月底给老人出月结单"]},"groups":[{"title":"服务记录","functions":[{"id":"f-1","title":"记下自己的工作者做的一次服务","does":"记下哪天、哪项服务、做了多少","intent":"自己的工作者上门做了一次服务，要有一条记录，后面才能申报。","subject":{"title":"这一次服务的服务记录","op":"创建","to":"服务记录记下了，等着申报","edits":["服务项：做的是服务清单上的哪一项","数量：做了多少","日期：哪天做的"]},"in":[{"title":"参与者档案","note":"给哪一位老人做的"},{"title":"服务项","by":"照护伙伴选的","note":"做的是服务清单上的哪一项"},{"title":"数量","by":"工作者报的","note":"做了几小时，或者做了几次"}],"out":[]},{"id":"f-4","title":"核对老人先付的收据并记成服务记录","does":"核对收据上的服务和金额，照它记下服务记录","intent":"老人自己先付了钱，交来收据；核对无误才记成服务记录，后面照它申报、把钱退给她。","subject":{"title":"这张收据对着的服务记录","op":"创建","to":"服务记录记下了，等着申报","edits":["服务项：照收据上写的服务记下","金额：照收据上写的金额记下","凭据：记下这一条是照哪一张收据记的"]},"in":[{"title":"参与者档案","note":"哪一位老人交来的收据"},{"title":"收据","by":"老人交来的","note":"她付款的凭据，写着哪天、哪项服务、付了多少（澳元）"}],"out":[]}]},{"title":"发票行","functions":[{"id":"f-2","title":"登记外部服务方开来的发票行","does":"把发票上的每一行登记下来，等着核对","intent":"外部服务方做了服务、开来发票；先一行一行登记下来，核对以后才能记成服务记录。","subject":{"title":"这张发票上的每一行发票行","op":"创建","to":"发票行登记了，等着核对","edits":["发票行：照发票一行记一条"]},"in":[{"title":"发票","by":"外部服务方开的","note":"开来的那一张，附上图片或 PDF"}],"out":[]},{"id":"f-3","title":"核对发票行并记成服务记录","does":"核对发票行和实际做的服务对不对得上，对得上的一行记成一条服务记录","intent":"登记了的发票行要有人核对过才算数，核对无误的才落成服务记录。","subject":{"title":"这一行发票行","op":"更新","from":"发票行登记了，等着核对","to":"发票行核对过了","edits":["状态：等着核对 → 核对过了"]},"in":[{"title":"发票行","note":"核对的是哪一行"},{"title":"服务协议","by":"老人签的","note":"看这项服务在不在她签的协议里"}],"out":[{"kind":"新记录","title":"服务记录","when":"核对无误的一行记一条"}]}]},{"title":"申报行","functions":[{"id":"f-5","title":"把服务记录写成申报行并报给政府","does":"一条服务记录写成一行申报行，报给政府","intent":"政府照申报付钱，所以每一条服务记录都要写成申报行报上去。","subject":{"title":"新写出的这一行申报行","op":"创建","to":"申报行写好了，报给了政府","edits":["服务类型：照服务记录上的服务项写","申报的金额：照服务记录写"]},"in":[{"title":"服务记录","by":"系统带出的","note":"还没申报的那几条"}],"out":[{"kind":"状态改变","title":"服务记录","when":"从等着申报变成已申报"}]},{"id":"f-8","title":"记下政府对申报行的审核结果","does":"记下这一行是通过了还是被退回；通过的交去扣款","intent":"政府审核完一行申报，结果要记在申报行上：通过的才能从老人名下的账户扣款，被退回的要有人改了重新报。","subject":{"title":"政府回了结果的那一行申报行","op":"更新","from":"申报行报给了政府，等着审核","to":"申报行上记着审核通过，或者被退回和退回的原因","edits":["状态：已报给政府 → 审核通过，或者被退回","退回的原因：被退回的才记"]},"in":[{"title":"申报行","note":"政府回了结果的那一行"},{"title":"审核结果","by":"政府回的","note":"通过，或者退回；退回的带着原因"}],"out":[{"kind":"事件","title":"申报行审核通过","when":"通过的那一行交给「参与者档案与她名下的钱」扣款"}]}]},{"title":"月结单","functions":[{"id":"f-6","title":"出这个月的月结单","does":"把这个月的服务记录和照护管理记录汇总成一份月结单，发给老人","intent":"老人每个月要看到自己用了哪些服务、花了多少钱。","subject":{"title":"这位老人这个月的月结单","op":"创建","to":"月结单出好了，发给了老人","edits":["月结单明细：这个月的每条服务记录、每条照护管理记录各列一行","月结单明细 › 金额：照那一条记录上的金额写"]},"in":[{"title":"参与者档案","note":"给哪一位老人出"},{"title":"服务记录","by":"系统带出的","note":"这位老人这个月的每一条"},{"title":"照护管理记录","by":"系统带出的","note":"这位老人这个月的每一条"}],"out":[]}]},{"title":"照护管理记录","functions":[{"id":"f-7","title":"记下一次照护管理","does":"记下哪天、做了多久、做了什么","intent":"照护伙伴替老人联系、安排了一次，要有一条记录，月底才看得出这个月做没做。","subject":{"title":"这一次照护管理的照护管理记录","op":"创建","to":"照护管理记录记下了","edits":["日期：哪天做的","做了多久：照护伙伴填的分钟数","做了什么：用一两句话写"]},"in":[{"title":"参与者档案","note":"替哪一位老人做的"},{"title":"做了多久","by":"照护伙伴填的","note":"这一次花的时间，按分钟记"}],"out":[]}]}],"chains":[{"id":"c-1","title":"发票行核对过以后","after":{"title":"发票行","from":"等着核对","to":"核对过了"},"then":[{"kind":"新记录","title":"服务记录","to":"等着申报","when":"核对无误的一行一条"}]},{"id":"c-2","title":"申报行审核通过以后","after":{"title":"申报行","from":"已报给政府","to":"审核通过"},"then":[{"kind":"状态改变","title":"基金账户","to":"扣掉这一行申报的金额","note":"在「参与者档案与她名下的钱」里办"},{"kind":"状态改变","title":"申报行","from":"审核通过","to":"已扣款","when":"扣成了"}]}],"workflows":[{"id":"w-1","title":"服务记录","states":[{"id":"s-1","title":"等着申报"},{"id":"s-2","title":"已申报"}],"moves":[{"from":"s-1","to":"s-2","label":"写成申报行报给了政府"}]},{"id":"w-2","title":"发票行","states":[{"id":"s-1","title":"等着核对"},{"id":"s-2","title":"核对过了"}],"moves":[{"from":"s-1","to":"s-2","label":"核对无误"}]},{"id":"w-3","title":"申报行","states":[{"id":"s-1","title":"已报给政府"},{"id":"s-2","title":"被退回"},{"id":"s-3","title":"审核通过"},{"id":"s-4","title":"已扣款"}],"moves":[{"from":"s-1","to":"s-3","label":"政府审核通过"},{"from":"s-1","to":"s-2","label":"政府退回，带着原因"},{"from":"s-2","to":"s-1","label":"改了以后重新报上去"},{"from":"s-3","to":"s-4","label":"从老人名下的基金账户扣成了"}],"stages":[{"title":"申报和审核","states":["s-1","s-2"]},{"title":"通过以后","states":["s-3","s-4"]}],"note":"被退回的申报行改了以后重新报，不另写一行。"}],"asks":[{"id":"q-1","q":"「每个月向老人交代清楚用了哪些服务、花了多少钱」这条业务目的是推出来的，原料没有写为什么要出月结单。出月结单是为了这个吗？","lean":"是这个目的","options":["是这个目的","月结单不该放在这个主题里"]},{"id":"q-2","q":"「老人每个月看得到自己用了哪些服务、每一项花了多少钱」这条更细的目的是推出来的，原料只写了每月要出月结单，没有写月结单要列到每一项服务。月结单要一条记录列一行吗？","lean":"是，一条记录列一行","options":["是，一条记录列一行","只列这个月的合计"]}]}
const G5OLDC = {"topic":"g5","title":"服务发生与申报","summary":"这一块管做了的服务怎么留下记录、怎么报给政府：每一次服务记成一条服务记录，外面开来的发票先登记、核对；照服务记录写申报行，月底汇总成月结单发给老人。","concepts":[{"id":"inv","title":"发票行","by":["照护伙伴"],"order":1,"fields":["发票号","服务项","数量","金额"],"definition":"外部服务方开来的发票上的一行，对着一次服务。先登记下来，核对无误才记成服务记录。","source":"手册 v4.4 §10.3 行 1512"},{"id":"rec","title":"服务记录","by":["照护伙伴"],"order":1,"fields":[{"title":"老人","ref":"参与者档案","topic":"参与者档案与她名下的钱","note":"这一次服务是给哪一位老人做的。"},{"title":"日期","note":"这一次服务是哪天做的。"},{"title":"服务项","ref":"服务","topic":"服务清单","note":"做的是服务清单上的哪一项。"},"数量","金额",{"title":"做服务的人","note":"自己的工作者，或者外部服务方。"},{"title":"凭据","ref":"凭据"}],"definition":"做了一次服务记一条：哪天、哪项服务、做了多少、多少钱。申报、扣款和月结单都从它开始。","source":"手册 v4.4 §10.1 行 1466"},{"id":"proof","title":"凭据","order":2,"fields":[{"title":"凭据的种类","note":"发票上的一行，或者老人交来的收据。"},{"title":"发票行","ref":"发票行","note":"照发票记下的，写它对着发票上的哪一行。"},{"title":"收据","note":"照收据记下的，写它对着老人交来的哪一张收据。"}],"definition":"一条服务记录是照什么记下的：发票上的哪一行，或者老人交来的哪一张收据。自己的工作者做的服务没有凭据。","source":"手册 v4.4 §10.3 行 1520"},{"id":"cm","title":"照护管理记录","by":["照护伙伴"],"order":2,"fields":["日期","做了多久","做了什么"],"definition":"照护伙伴替老人做一次照护管理记一条：哪天、做了多久、做了什么。","source":"手册 v4.4 §8.4 行 960"},{"id":"claim","title":"申报行","by":["财务"],"order":1,"fields":[{"title":"服务记录","ref":"服务记录","note":"这一行申报的是哪一条服务记录。"},{"title":"老人的编号","note":"她的 My Aged Care 编号，政府按它从她名下扣款。"},"服务类型","申报的金额","状态",{"title":"退回的原因","note":"被政府退回的申报行才有。"}],"definition":"向政府申报的一行，对着一条服务记录。报上去以后政府审核，通过了才从老人名下的基金账户扣款，被退回的改了重新报。","source":"申报格式 v1.14 第 4 节"},{"id":"stmt","title":"月结单","by":["财务"],"order":2,"fields":["月份","合计"],"definition":"每月给老人的一份清单，列着这个月的服务和花的钱。出了以后留着，老人照它付自己该付的钱。","source":"手册 v4.4 §11.2 行 1630"},{"id":"line","title":"月结单明细","order":3,"fields":["对着哪一条记录","金额"],"definition":"月结单上的一行：这个月的一条服务记录，或者一条照护管理记录，带着金额。","source":"手册 v4.4 §11.2 行 1634"}],"external":[{"id":"list","title":"服务清单","topic":"g4"},{"id":"agree","title":"服务协议","topic":"g3"},{"id":"acct","title":"基金账户","topic":"g2"}],"edges":[{"id":"1","from":"rec","to":"proof","label":"照哪一份凭据记下的","tree":true},{"id":"2","from":"stmt","to":"line","label":"一条记录列一行","tree":true},{"id":"3","from":"inv","to":"rec","label":"核对无误的一行记成一条","by":["照护伙伴"]},{"id":"4","from":"rec","to":"claim","label":"一条写成一行，报给政府","by":["财务"]},{"id":"5","from":"rec","to":"stmt","label":"按月汇总"},{"id":"6","from":"cm","to":"stmt","label":"这个月的照护管理也列上"},{"id":"7","from":"list","to":"rec","label":"做的是清单上的哪一项，照它查"},{"id":"8","from":"agree","to":"inv","label":"核对这项服务在不在她签的协议里"},{"id":"9","from":"claim","to":"acct","label":"审核通过的一行，从她的账户扣"}]}
const OLD5 = 'MODULES.g5 = fresh(G5OLD); CONCEPTS.g5 = fresh(G5OLDC); '
// 样例里的 g2、g5 现在是新写法的主题（写了 goals：目的的树、各角色要办成的事、流程表）。改成新写法以前的那两份（写 purposes、拆过、行为和服务带 for、概念的栏带 for 和 why）留在这里：
// cases 里 NEW 这个记号以前的断言都是对着写 purposes 的写法写的，跑它们的时候，页面画第一遍之前先把 g2、g5 的模块业务和概念换回这四份（见 PRE），守住没写 goals 的主题一处没变。
// 记号以后的断言看的才是新写法。别的项目里还有没写 goals 的主题，旧画法的覆盖不能丢
const G2PUR = {"topic":"g2","title":"参与者档案与她名下的钱","summary":"注册服务方替每位老人留一份档案，并管着政府开在她名下的钱。","tours":[{"title":"一位老人从建档到分到资金","note":"照护伙伴替一位新来的老人建档；她签了服务协议、分到资金以后，钱开在她名下，后面做的服务才有钱可扣。","steps":[{"by":"老人","text":"评估批下来以后，把政府发的决定通知书和支持计划交给注册服务方。评估在「评估与分资金」里办。","concepts":["决定通知书","支持计划"]},{"by":"照护伙伴","text":"照决定通知书给她建立参与者档案，记下她批到的分级和路径。","concepts":["参与者档案","批到的分级和路径"],"fns":["f-1"]},{"by":"老人","text":"和注册服务方签服务协议。签协议在「服务方与协议」里办。","concepts":["服务协议"]},{"by":"照护伙伴","text":"在她的档案上记下她签了哪一份服务协议、哪天签的。","concepts":["签了的服务协议"],"fns":["f-2"]},{"by":"卫生部","text":"来信通知她分到了资金。排队和分资金在「评估与分资金」里办。","concepts":["分资金的信"]},{"by":"照护伙伴","text":"记下分到资金的那天，开出她名下的基金；批了几类服务，就开几个基金账户。","concepts":["她名下的基金","基金账户"],"fns":["f-3"]}]},{"title":"做了服务以后从基金账户扣款","note":"服务做了、申报通过以后，这一行申报的钱从她名下对应的基金账户里扣掉。","steps":[{"by":"财务","text":"照服务记录写出申报行报给政府，政府审核通过。申报在「服务发生与申报」里办。","concepts":["申报行"]},{"by":"财务","text":"照审核通过的申报行，从她名下对应这一类服务的基金账户扣款，余额跟着减少。","concepts":["基金账户","余额"],"fns":["f-4"]}]}],"core":[{"title":"参与者档案","why":"注册服务方替一位老人做的每一件事都记在她的档案上：签了什么协议、分到了什么钱，后面的服务和扣款都照这份档案来。","parts":["批到的分级和路径","签了的服务协议"],"sources":[{"steps":[{"data":"决定通知书","op":"创建","by":"照通知书上批下来的内容建立档案","fn":"f-1"}]}],"targets":[{"op":"创建","by":"记下分到资金的那天，开出她名下的基金","fn":"f-3","data":"她名下的基金"},{"op":"创建","by":"批了几类服务，就开几个基金账户","fn":"f-3","data":"基金账户"}],"keeps":["r-2"],"actions":[{"id":"act-1","title":"建档","to":"已建档","for":"p-2.1","why":"她批到了什么要照决定通知书记进档案，后面的服务都照这一份。","does":"照决定通知书和支持计划建立一份参与者档案。","rules":["r-5"],"in":[{"title":"决定通知书","note":"写着她的编号、批到的分级和路径"},{"title":"支持计划","note":"写着批了她哪几类服务"}],"edits":["My Aged Care 编号：照决定通知书上印的编号记下","决定通知书：记下这份档案是照哪一份决定通知书建的","批到的分级和路径：照决定通知书记下，路径只记通知书上批的那一条","批了的服务类型：照支持计划记下","建档日期：记下建档的这一天","她在哪一段：新建的档案是「已建档」"],"out":[{"kind":"事件","title":"参与者档案已建：带着她的 My Aged Care 编号和批到的分级"}],"steps":[{"text":"照决定通知书记下她的编号、批到的分级和路径","on":["My Aged Care 编号","决定通知书","批到的分级和路径"]},{"text":"照支持计划记下批了的服务类型","on":["批了的服务类型"]},{"text":"记下建档日期，状态记成「已建档」","on":["建档日期","她在哪一段"]},{"text":"发出事件","on":["参与者档案已建"]}]},{"id":"act-2","title":"记签协议","from":"已建档","to":"已签协议","for":"p-2.2","why":"她签了服务协议，要在档案上看得出签了、签的是哪一份。","does":"在档案上记下她签的是哪一份服务协议、哪天签的。","rules":["r-6"],"in":[{"title":"服务协议","note":"她签的是哪一份"},{"title":"签约日期","note":"协议上写的签约那一天"}],"edits":["签了的服务协议：记下她签的是哪一份、哪天签的","她在哪一段：已建档 → 已签协议"],"out":[{"kind":"事件","title":"协议已签：带着她的 My Aged Care 编号和签约日期","when":"聊天 app 收到以后给她开聊天"}],"steps":[{"text":"记下她签的是哪一份服务协议、哪天签的","on":["签了的服务协议"]},{"text":"更新状态：「已建档」→「已签协议」","on":["她在哪一段"]},{"text":"发出事件","on":["协议已签"]}]},{"id":"act-3","title":"记分到资金","from":"已建档、已签协议或分到资金","to":"分到资金","for":"p-1.1","why":"从分到资金的那一天起钱开在她名下，哪天分到、分到多少要记在档案上。","does":"照分资金的信记下哪天分到资金、分到的是全额还是一部分。","rules":["r-7","r-8"],"in":[{"title":"分资金的信","note":"写着分到资金的日期，分到的是全额资金还是过渡资金"}],"edits":["分到的资金：记下哪天分到、分到的是全额还是一部分","她在哪一段：变成「分到资金」"],"out":[{"kind":"事件","title":"资金已分到：带着她的 My Aged Care 编号、分到的日期、分到的是全额还是一部分"}],"steps":[{"text":"记下哪天分到资金、分到的是全额还是一部分","on":["分到的资金"]},{"text":"更新状态：变成「分到资金」","on":["她在哪一段"]},{"text":"发出事件","on":["资金已分到"]}]}]},{"title":"基金账户","why":"分到的钱开在她名下的基金账户里，一类服务一个账户。账户有自己的余额，每一次扣款都照账户办。","parts":["余额"],"sources":[{"steps":[{"data":"参与者档案","op":"创建","by":"记下分到资金的那天，批了几类服务就开几个账户","fn":"f-3"}]}],"targets":[{"op":"更新","by":"扣成了，发出「已扣款」，那边照它把这一行申报行记成已扣款","fn":"f-4","data":"申报行","topic":"服务发生与申报"}],"keeps":["r-3","r-4"],"actions":[{"id":"act-4","title":"开立","to":"可用","for":"p-1.1","why":"分到的钱要开在她名下的账户里，一类服务一个账户。","does":"照她批到的分级和路径，给她开出基金账户。","rules":["r-9"],"in":[{"title":"批到的分级和路径","note":"她的参与者档案上记着的"},{"title":"这一次分到多少钱","note":"分到资金以后定出来的"}],"edits":["她名下的基金：记下这个账户是从哪一笔基金里分出来的","服务类型：记下这个账户对着哪一类服务","余额：记成这个账户分到的钱"],"out":[{"kind":"事件","title":"基金账户已开：带着她的 My Aged Care 编号和开了哪几个账户"}],"steps":[{"text":"一类服务开一个账户，记下它属于哪一笔基金、对着哪一类服务","on":["她名下的基金","服务类型"]},{"text":"把这个账户分到的钱记成余额","on":["余额"]},{"text":"发出事件","on":["基金账户已开"]}]},{"id":"act-5","title":"扣","for":"p-1.1","why":"做了的服务从她名下对着这一类服务的账户里出钱，每扣一笔都查得到。","does":"从这个基金账户的余额里扣掉一笔。","rules":["r-10","r-11"],"in":[{"title":"金额","note":"要扣多少，澳元"},{"title":"服务类型","note":"这一笔是哪一类服务的钱"},{"title":"申报行","note":"这一笔是照哪一行申报行扣的"}],"edits":["余额：减去这一笔的金额"],"out":[{"kind":"事件","title":"已扣款：带着是照哪一行申报行扣的、她的 My Aged Care 编号、服务类型、扣了多少、还剩多少"}],"steps":[{"text":"从余额里减去这一笔的金额","on":["余额"]},{"text":"发出事件","on":["已扣款"]}]},{"id":"act-6","title":"补足额度","for":"p-1.1","why":"先分到一部分、后来补到全额的，账户上的钱要跟着补上。","does":"把先前只分到一部分的账户补到全额。","rules":["r-15"],"in":[{"title":"这一次分到多少钱","note":"分到资金以后定出来的，是这一级的全额"}],"edits":["余额：加上全额和先前分到的那一部分的差"],"steps":[{"text":"把补的钱加到余额上","on":["余额"]}]}]}],"purposes":[{"id":"p-1","text":"随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。","from":"钱开在她名下，做了服务从账户里扣","source":"人 2026-11-24 说：要有个地方管理资金，把资金的出入都放在这里管理","needs":[{"id":"p-1.1","aim":"分到的钱和扣掉的钱，每一笔都查得到。","text":"钱的每一笔进出都记在基金账户上：分到资金时开出账户，每扣一笔就从余额里减一笔。","source":"手册 v4.4 §9.2 行 1290","cores":["基金账户"],"data":["余额"],"fns":["f-3","f-4","f-6"],"chains":["c-1"]},{"id":"p-1.2","aim":"同一笔钱只有一处说了算。","text":"别的业务要动钱，都到这里来办，不各自去改余额。","source":"人 2026-11-24 说：把资金的出入都放在这里管理","cores":["基金账户"],"fns":["f-4"]}]},{"id":"p-2","text":"后面的服务有一份说了算的依据：她批到了什么、签了什么协议。","from":"注册服务方替她建档","needs":[{"id":"p-2.1","aim":"她批到了什么，以政府发的决定通知书为准。","text":"批下来的内容照决定通知书记进档案。","source":"手册 v4.4 §6.6 行 562–568","cores":["参与者档案"],"data":["批到的分级和路径"],"fns":["f-1"]},{"id":"p-2.2","aim":"看档案就知道她签没签服务协议、签的是哪一份。","text":"签了的服务协议记在档案上。","cores":["参与者档案"],"data":["签了的服务协议"],"fns":["f-2","f-5"]}]}],"rules":[{"id":"r-1","kind":"做之前要满足的","short":"检查 My Aged Care 编号，还没有建过档案才能建档","text":"同一个 My Aged Care 编号只有一份参与者档案：这个编号已经有档案的，不再建第二份。","source":"手册 v4.4 §3 Participant","for":"p-2.1","why":"一位老人只有一份档案，后面的服务才有唯一的一份依据。","examples":[{"given":"编号 AC-1001 已经有一份参与者档案","when":"照护伙伴又拿这个编号建档","then":"被拒绝，不建第二份档案"},{"given":"编号 AC-1002 还没有档案","when":"照护伙伴拿这个编号建档","then":"核对通过，可以建档"}]},{"id":"r-2","kind":"一直要守的","short":"批到的分级和路径一直和决定通知书上批的一样","text":"参与者档案上批到的分级和路径只照决定通知书记，不能手改；政府发了新的决定通知书，才照新的那一份整个换掉。","source":"手册 v4.4 §6.6 行 562–568","for":"p-2.1","why":"她批到了什么以决定通知书为准，档案上记的不能和它不一样。","covers":["批到的分级和路径","参与者档案 › 决定通知书"],"examples":[{"given":"决定通知书上批的是第四级","when":"有人要把档案上的分级改成第五级","then":"不能改，档案上仍然是第四级"}],"doubt":"分级、路径和决定通知书不一样时，是不让建档，还是先建了再标出来，待定 q-1 还没有答。"},{"id":"r-3","kind":"一直要守的","short":"一个基金账户只能买她批了的那一类服务","text":"每个基金账户对着一类服务，只能买她批了的这一类服务；别的类的服务不能从这个账户扣。","source":"手册 v4.4 §9.2 行 1290","for":"p-1.2","why":"钱只能花在批给她的服务上，账户和服务类型一一对着才管得住。","covers":["基金账户 › 服务类型","参与者档案 › 批了的服务类型"],"examples":[{"given":"她名下有一个持续服务的基金账户","when":"有人要从这个账户扣一笔辅助技术的钱","then":"不能扣"}]},{"id":"r-4","kind":"一直要守的","short":"她名下各个账户的余额加起来，不超过这一季分到的钱","text":"一位老人名下各个基金账户的余额加起来，不超过她这一季分到的钱。","source":"手册 v4.4 §9.2 行 1290","for":"p-1.1","why":"账户上的钱和政府分给她的钱对得上，每一笔才说得清。","covers":["基金账户 › 余额","她名下的基金"],"examples":[{"given":"她这一季分到 2,000 澳元，名下有两个账户","when":"把两个账户的余额加起来","then":"不超过 2,000 澳元"}]},{"id":"r-5","kind":"做之前要满足的","short":"检查决定通知书，编号和分级都写着才能建档","text":"决定通知书上的内容不全的，不能照它建档。","items":["My Aged Care 编号必须写着。","批到的分级必须写着。"],"source":"手册 v4.4 §6.6 行 562–568","for":"p-2.1","why":"档案是照决定通知书建的，通知书不全就没有依据。","examples":[{"given":"决定通知书上没有写批到的分级","when":"照护伙伴照它建档","then":"被拒绝：通知书不全，不建档"}]},{"id":"r-6","kind":"状态能不能走","short":"检查档案状态，处于「已建档」才能记签协议","text":"只有处于「已建档」的参与者档案才能记下签了的服务协议；已经记过签协议的不再记。","source":"手册 v4.4 §7.1 行 676","for":"p-2.2","why":"一份档案只记一次签协议，看档案才分得清她签没签。","examples":[{"given":"档案已经是「已签协议」","when":"照护伙伴再记一次签协议","then":"被拒绝，档案不变"}]},{"id":"r-7","kind":"状态能不能走","short":"检查档案状态，还没有停用才能记分到资金","text":"参与者档案处于「已建档」「已签协议」或「分到资金」时才能记下分到资金；已经停用的档案不能再记。","source":"手册 v4.4 §6.8 行 592","for":"p-1.1","why":"分到的钱只开在还在这里的老人名下。","examples":[{"given":"档案已经是「已停用」","when":"照护伙伴照分资金的信记下分到资金","then":"被拒绝，档案不变"}],"doubt":"建模那边写的是只有已签协议的档案才能记分到资金；状态转换流程上还没签协议也能分到资金。以哪一个为准还没有定。"},{"id":"r-8","kind":"怎么算的","short":"定出分到的是全额还是一部分，照分资金的信","text":"分到的是全额还是一部分，照卫生部分资金的信上写的定，不由照护伙伴另选。","cases":["信上写的是全额资金：记成全额。","信上写的是过渡资金：记成一部分。"],"source":"手册 v4.4 §6.8.1.1 行 613–615","for":"p-1.1","why":"分到多少钱要查得到，全额和一部分开出来的钱不一样。","examples":[{"given":"分资金的信上写的是过渡资金","when":"照护伙伴照这封信记下分到资金","then":"档案上记成分到一部分"}]},{"id":"r-9","kind":"怎么算的","short":"定出开哪几个账户，照她批到的分级和路径","text":"她名下开哪几个基金账户，照决定通知书上批到的分级和路径定。","cases":["持续服务：照她批到的分级开一个账户。","批了辅助技术、家居改造、复健或临终这几条路径的：每条路径各多开一个账户。"],"source":"手册 v4.4 §9.2 行 1290","for":"p-1.1","why":"批了几类服务就有几个账户，每一类的钱分开记。","examples":[{"given":"她批到第四级的持续服务，另批了辅助技术这条路径","when":"分到资金以后开账户","then":"开两个账户：持续服务一个，辅助技术一个"}]},{"id":"r-10","kind":"做之前要满足的","short":"检查余额，够扣这一笔才能扣","text":"基金账户的余额不少于要扣的金额才能扣；不够的整笔不扣，余额不会扣成负数。","source":"手册 v4.4 §9.2 行 1290","for":"p-1.1","why":"账户里有多少钱才能花多少钱，余额才一直说得清。","examples":[{"given":"账户余额是 50 澳元","when":"要扣一笔 80 澳元","then":"被拒绝：余额不足，余额仍是 50 澳元"}]},{"id":"r-11","kind":"做之前要满足的","short":"检查服务类型，是这个账户对着的那一类才能扣","text":"要扣的这一笔的服务类型，必须是这个基金账户对着的那一类。","source":"申报格式 v1.14 第 4 节第 9 项","for":"p-1.2","why":"一类服务的钱只从对着它的那一个账户出。","examples":[{"given":"这个账户对着的是持续服务","when":"要扣的这一笔是辅助技术的钱","then":"被拒绝：服务类型不许"}]},{"id":"r-12","kind":"做之前要满足的","short":"检查申报行，政府审核通过、还没有扣过才能扣款","text":"只有政府审核通过、而且还没有扣过款的申报行才能拿来扣款；被退回的、已经扣过的都不扣。","source":"申报格式 v1.14 第 4 节","for":"p-1.2","why":"同一行申报只扣一次，没有通过的不动她的钱。","examples":[{"given":"一行申报行已经扣过款","when":"财务再拿这一行来扣款","then":"被拒绝，账户不变"},{"given":"一行申报行被政府退回","when":"财务拿这一行来扣款","then":"被拒绝，账户不变"}]},{"id":"r-13","kind":"怎么算的","short":"定出从哪个账户扣，照申报行上的编号和服务类型","text":"从哪个基金账户扣，照申报行上她的 My Aged Care 编号和服务类型定：她名下对着这一类服务的那一个。","source":"申报格式 v1.14 第 4 节第 9 项","for":"p-1.2","why":"别的业务要动钱都到这里来办，由这里定从哪个账户出。","examples":[{"given":"申报行上写着编号 AC-1001，服务类型是持续服务","when":"财务照这一行扣款","then":"找到 AC-1001 名下持续服务的那个账户"}]},{"id":"r-14","kind":"怎么算的","short":"定出这一次分到多少钱，照她批到的分级和分到的是全额还是一部分","text":"这一次分到多少钱，照她批到的分级算：分到全额的，是这一级一季的全额；分到一部分的，是这一级过渡资金的数。","source":"手册 v4.4 §6.8.1 行 597–624","for":"p-1.1","why":"开账户和补额度的钱数有一处说了算。","examples":[{"given":"她批到第四级，分到的是过渡资金","when":"分到资金以后开账户","then":"账户里记的是第四级过渡资金的数"}]},{"id":"r-15","kind":"怎么算的","short":"定出补多少，照全额和先前分到的那一部分的差","text":"补足额度时补的钱，是这一级一季的全额减去先前已经分到的那一部分。","source":"手册 v4.4 §6.8.1.1 行 613–615","for":"p-1.1","why":"先分到一部分、后来补到全额，加起来正好是全额。","examples":[{"given":"先前分到的一部分是 600 澳元，这一级的全额是 2,000 澳元","when":"补足额度","then":"账户的余额加上 1,400 澳元"}]},{"id":"r-16","kind":"怎么算的","short":"定出这个账户还能用多少，照它现在的余额","text":"一个基金账户还能用多少，就是它现在的余额：开立时记下的分到的钱，加上后来补足的额度，减去已经扣掉的每一笔。","for":"p-1.1","why":"看到的数和账户上记着的每一笔进出对得上。","examples":[{"given":"一个基金账户开立时分到 2,000 澳元，后来扣过 300 澳元和 450 澳元两笔","when":"照护伙伴查看这个账户还能用多少","then":"看到的是 1,250 澳元"}],"doubt":"这个算法是照基金账户的三个行为（开立、扣、补足额度）怎么改余额推出来的，原料里没有写「还能用多少」怎么算，所以没有出处。服务已经做了、申报行还没有扣款的那些钱，这里没有先减掉；要不要先减掉，还没有问过做业务的人。"}],"intro":{"context":"政府批给老人的钱开在她名下，由 Services Australia 保管；注册服务方替她建档，做了服务以后从她名下的账户里扣。","duty":["管每位老人的档案和她名下的基金、账户：建档，记下她签了协议、分到了资金，按申报从账户扣款。","不管评估怎么做、服务怎么排、发票怎么开。"],"concepts":[{"title":"参与者档案","note":"注册服务方替一位老人留的记录，写着她批了什么、走到了哪一步。"},{"title":"她名下的基金","note":"政府开在老人名下、替她保管的一笔钱。"},{"title":"基金账户","note":"一笔基金按批了的服务类型分开的账户，扣款只从对应的那一个扣。"}],"users":[{"who":"照护伙伴","aim":"替老人把档案建好、记准，钱到了就能开始用","steps":["照决定通知书给她建档","她签了服务协议，在档案上记下来","分到资金那天记下来，开出她名下的基金"]},{"who":"财务","aim":"服务做完、申报以后，把钱从对的账户里扣掉","steps":["照申报行从基金账户扣款"]}],"usual":["照护伙伴照决定通知书给老人建档","她签了服务协议，档案上记下","卫生部来信说分到了资金，开出她名下的基金和账户","做了服务、申报以后，从对应的账户扣款"]},"groups":[{"title":"参与者档案","functions":[{"id":"f-1","title":"照决定通知书建立参与者档案","called":"建档","does":"照决定通知书记下她批了哪一级、哪条路径","intent":"老人交来决定通知书，给她留一份档案，以后签协议、分资金、记服务都记在这一份上。","who":"照护伙伴","subject":{"title":"这位老人的参与者档案","op":"创建","to":"档案建好了，记着她批到的分级和路径"},"in":[{"title":"决定通知书","by":"老人交来的","note":"政府评估后发给她的那一份，上面写着编号、分级和路径"},{"title":"支持计划","by":"老人交来的","note":"同一次评估一起发的，写着批了她哪些服务类型"}],"out":[],"rules":[],"services":["s-1"],"calls":["act-1"],"steps":[{"text":"照决定通知书和支持计划，读出她的编号、批到的分级和路径、批了的服务类型。"},{"fn":"f-2","after":true,"text":"她交来决定通知书时已经签了服务协议的，接着记下签了的服务协议。"}],"returns":"新建的参与者档案","uses":[{"flow":"01-老人注册","step":5}],"source":"手册 v4.4 §3 Participant"},{"id":"f-2","title":"在参与者档案上记下签了的服务协议","does":"记下她跟哪家签了协议、哪天签的","intent":"她跟注册服务方签了服务协议，档案上要看得出她已经签了、签的是哪一份。","who":"照护伙伴","subject":{"title":"这位老人档案上签了的服务协议","op":"创建","to":"档案上记着她签了哪一份服务协议、哪天签的"},"in":[{"title":"参与者档案","note":"记在哪一位老人的档案上"},{"title":"服务协议","by":"老人签的","note":"她跟注册服务方签的那一份"}],"out":[],"rules":[],"calls":["act-2"],"steps":[{"call":{"topic":"服务方与协议","title":"查一份服务协议"},"text":"取回这份服务协议上的签约日期，和它现在是不是还有效。"}],"uses":[{"flow":"01-老人注册","step":6}]},{"id":"f-3","title":"记下分到资金并开出她名下的基金","does":"记下分到资金那天和分到的是全额还是一部分，开出她名下的基金","intent":"卫生部来信说她分到了资金，从这一天起钱开在她名下，后面的服务才能从这笔钱里扣。","who":"照护伙伴","subject":{"title":"这位老人的参与者档案","op":"更新","to":"档案上记着她哪天分到资金、分到的是全额还是一部分"},"in":[{"title":"参与者档案","note":"哪一位老人分到了资金"},{"title":"分资金的信","by":"卫生部发的","note":"写着分到资金的日期，分到的是全额还是一部分"}],"out":[],"rules":[],"calls":["act-3"],"uses":[{"flow":"01-老人注册","step":8}]},{"id":"f-5","title":"查看一位老人的档案","does":"照 My Aged Care 编号看她的档案：批到的分级和路径、她在哪一段","intent":"照护伙伴替一位老人办事之前，先看清她批到了什么、签没签服务协议，再接着往下办。","who":"照护伙伴","subject":{"title":"这位老人的参与者档案","op":"查看"},"in":[{"title":"My Aged Care 编号","note":"要看的是哪一位老人的档案"}],"rules":[],"calls":[],"steps":[{"text":"照 My Aged Care 编号找到她的参与者档案。"}],"returns":"她的参与者档案、批到的分级和路径、她在哪一段"}]},{"title":"基金账户","functions":[{"id":"f-4","title":"照申报行从基金账户扣款","does":"按申报行上她的编号和服务类型，从对应的账户扣","intent":"服务做了、申报了，这一行的钱要从她名下对应的那个账户里扣掉。","who":"财务","subject":{"title":"她名下这一类服务的基金账户","op":"更新","to":"账户里扣掉了这一行申报的金额"},"in":[{"title":"基金账户","note":"她名下对着这一类服务的那一个"},{"title":"申报行","by":"政府审核通过的","note":"要扣的是哪一行：带着她的编号、服务类型和金额（澳元）"}],"out":[],"rules":["r-12"],"services":["s-2"],"calls":["act-5"]},{"id":"f-6","title":"查看基金账户还能用多少","does":"看她名下对着一类服务的基金账户现在还能用多少钱","intent":"照护伙伴替老人安排服务之前，要知道她名下这一类服务的基金账户还能用多少钱。","who":"照护伙伴","subject":{"title":"她名下这一类服务的基金账户","op":"查看"},"in":[{"title":"基金账户","note":"她名下对着这一类服务的那一个"}],"rules":["r-16"],"calls":[],"steps":[{"text":"读出这个基金账户现在的余额。"}],"returns":"这个基金账户还能用多少钱（澳元）"}]}],"services":[{"id":"s-1","title":"参与者登记：核对这个编号还没有建过档案","does":"在全部参与者档案里找这个 My Aged Care 编号，没有才让建档。一份档案看不到别的档案，所以这件事不放在参与者档案自己的行为里。","for":"p-2.1","why":"一位老人只有一份档案。","in":[{"title":"My Aged Care 编号","note":"决定通知书上印的"}],"rules":["r-1"],"steps":[{"text":"在全部参与者档案里找这个编号"}],"returns":"这个编号还没有档案，可以建档"},{"id":"s-2","title":"找到要扣的基金账户","does":"在她名下的全部基金账户里，找出对着这一类服务的那一个。要看她名下的全部账户才找得到，所以不放在基金账户自己的行为里。","for":"p-1.2","why":"别的业务要动钱都到这里来办，由这里找到该扣的那一个账户。","in":[{"title":"My Aged Care 编号","note":"申报行上写的"},{"title":"服务类型","note":"申报行上写的"}],"rules":["r-13"],"steps":[{"text":"照编号找到她名下的全部基金账户"},{"text":"照服务类型挑出对着这一类服务的那一个"}],"returns":"要扣的那一个基金账户"}],"chains":[{"id":"c-1","title":"分到资金以后","after":{"title":"参与者档案","to":"分到资金","when":"参与者档案发出「资金已分到」"},"rules":["r-14"],"calls":["act-4","act-6"],"alt":true,"callsWhen":{"act-4":"她名下还没有基金账户","act-6":"她名下已经有基金账户：先前分到的是一部分，这一次补到全额"}}],"workflows":[{"id":"w-1","title":"参与者档案","states":[{"id":"s-1","title":"已建档"},{"id":"s-2","title":"已签协议"},{"id":"s-3","title":"分到资金"},{"id":"s-4","title":"已停用","called":"离开"}],"moves":[{"from":"s-1","to":"s-2","label":"签了服务协议","act":"act-2"},{"from":"s-2","to":"s-3","label":"卫生部来信分到资金","act":"act-3"},{"from":"s-1","to":"s-3","label":"还没签协议就分到资金","act":"act-3"},{"from":"s-3","to":"s-4","label":"她走了或者换了注册服务方"}],"note":"档案停用以后不删，留着查"}],"asks":[{"id":"q-1","q":"档案上的分级、路径跟决定通知书不一样时，是不让建，还是先建了再标出来？","lean":"不让建，等通知书改了再建","options":["不让建","先建了再标出来"]},{"id":"q-2","q":"「后面的服务有一份说了算的依据」这条业务目的是推出来的，原料没有写为什么要替老人建档。建档是为了这个吗？","lean":"是这个目的","options":["是这个目的","建档只是为了记下她是谁"]},{"id":"q-3","q":"「看档案就知道她签没签服务协议、签的是哪一份」这条更细的目的是推出来的，原料只写了签了协议要记进档案，没有写记下来是为了什么。记下来是为了这个吗？","lean":"是这个目的","options":["是这个目的","记下来只是为了留一份底"]},{"id":"q-4","q":"参与者档案上的「共付比例」这一栏是为了什么？原料里写了它定了每次服务老人自己付几成，没有写这一栏在这个主题里给谁用，现在没有哪一条更细的目的落到它上面。","lean":"为了申报时分出政府补多少、老人自己付多少，这里只替「服务发生与申报」记着","options":["为了申报时分出政府补多少、老人自己付多少，这里只替「服务发生与申报」记着","为了说得清她名下的钱，归到「分到的钱和扣掉的钱，每一笔都查得到」","是为了别的，另写一条目的"]},{"id":"q-5","q":"参与者档案上的「建档日期」这一栏是为了什么？原料里没有写记下建档的那一天给谁用，现在没有哪一条更细的目的落到它上面。","lean":"只是留一份底，不为哪一条目的","options":["只是留一份底，不为哪一条目的","为了查的时候说得清她从哪一天起由这家注册服务方照护"]}]}
const G2PURC = {"topic":"g2","title":"参与者档案与她名下的钱","summary":"这一块管两件事：注册服务方替老人留的档案，和政府开在她名下、替她保管的钱。评估批了什么、她跟哪家签了协议、共付比例多少，都记在档案上；后面每一笔钱怎么花、怎么报都照着来。","concepts":[{"id":"file","title":"参与者档案","by":["注册服务方"],"order":1,"fields":[{"title":"My Aged Care 编号","note":"政府给每位老人编的号，申报和扣款都按它认人。","for":"p-1.1","why":"申报和扣款都按这个编号找到她名下的账户。"},{"title":"决定通知书","ref":"决定通知书","topic":"评估与分资金","note":"这份档案是照哪一份决定通知书建立的。","for":"p-2.1","why":"她批到了什么以这一份为准，要查得到照的是哪一份。"},{"title":"批到的分级和路径","ref":"批到的分级和路径"},"签了的服务协议",{"title":"批了的服务类型","ref":"服务类型","topic":"服务清单","note":"支持计划批给她的那几类服务，基金只能买这几类。","for":"p-2.1","why":"开哪几个账户、能扣哪一类服务的钱，都照它。"},"共付比例",{"title":"分到的资金","note":"哪天分到资金，分到的是全额还是一部分。","for":"p-1.1","why":"分到多少钱、从哪天起可以用，要查得到。"},"建档日期",{"title":"她在哪一段","note":"档案走到了哪一步，见它的状态转换。","for":"p-2.2","why":"看一眼档案就知道她签没签协议、分没分到资金。"}],"definition":"注册服务方从老人第一次联系起替她留的一份记录：批了哪一级、哪条路径、允许的服务类型、共付比例、她在哪一段。","source":"手册 v4.4 §3 Participant；§6.6 行 562–568"},{"id":"level","title":"批到的分级和路径","order":1,"fields":[{"title":"分级","for":"p-2.1","why":"分到多少钱照这一级算。"},{"title":"路径","for":"p-2.1","why":"批了哪条路径，就多开哪一个账户。"}],"definition":"决定通知书上批给她的那一级和那条路径。建档时照通知书记进档案，以后每季分多少钱照这一级算。","source":"§6.6 行 562–568"},{"id":"signed","title":"签了的服务协议","order":2,"fields":[{"title":"签的协议","ref":"服务协议","topic":"服务方与协议","note":"她签的是哪一份服务协议。","for":"p-2.2","why":"看档案就知道她签的是哪一份。"},{"title":"签约日期","for":"p-2.2","why":"看档案就知道她是哪天签的。"}],"definition":"档案上记着的一笔：她跟注册服务方签的是哪一份服务协议、哪天签的。","source":"§7.1 行 676"},{"id":"fund","title":"她名下的基金","by":["Services Australia"],"order":2,"definition":"政府开在老人名下、替她保管的钱。持续服务按分级每季一笔；批了辅助技术、家居改造、复健、临终的各多一笔。","source":"§9.2 行 1290"},{"id":"acct","title":"基金账户","order":3,"fields":[{"title":"她名下的基金","ref":"她名下的基金","note":"这个账户是从哪一笔基金里分出来的。","for":"p-1.1","why":"账户上的钱查得到是哪一笔基金分来的。"},{"title":"服务类型","ref":"服务类型","topic":"服务清单","note":"这个账户只能买这一类服务。","for":"p-1.2","why":"扣款时照它找到该扣的那一个账户。"},{"title":"余额","ref":"余额"}],"definition":"一笔基金一个账户，只能买她批了的服务类型；申报行按她的编号从对应的账户扣。","source":"§9.2 行 1290；申报格式 v1.14 第 4 节第 9 项"},{"id":"bal","title":"余额","order":3,"definition":"基金账户里还剩多少钱（澳元）。分到资金时记上，每扣一笔就减一笔。","source":"§9.2 行 1290"}],"external":[{"id":"notice","title":"决定通知书","topic":"g1"},{"id":"plan","title":"支持计划","topic":"g1"},{"id":"letter","title":"分资金的信","topic":"g1"},{"id":"agree","title":"服务协议","topic":"g3"},{"id":"cp","title":"照护计划与预算","topic":"g3"},{"id":"claim","title":"申报行","topic":"g5"}],"edges":[{"id":"1","from":"notice","to":"file","label":"写着她批了哪一级、哪条路径","by":["照护伙伴"],"source":"§6.6 行 563–568"},{"id":"2","from":"plan","to":"file","label":"批了她能用的服务类型","source":"§6.5 行 549–556"},{"id":"3","from":"letter","to":"fund","label":"分到资金那天起，钱开在她名下","source":"§6.8.1 行 597–624"},{"id":"4","from":"agree","to":"file","label":"签了协议、报了入场记进档案","by":["注册服务方"],"source":"§7.1 行 676"},{"id":"5","from":"file","to":"fund","label":"名下有几笔，通知书定的","by":["Services Australia"],"source":"§9.2 行 1290"},{"id":"6","from":"fund","to":"acct","label":"一笔一个账户","tree":true},{"id":"7","from":"file","to":"cp","label":"照护伙伴照档案替她排","by":["照护伙伴"],"source":"§8.5 行 992"},{"id":"8","from":"claim","to":"acct","label":"写她的编号，从账户扣","source":"申报格式 v1.14 第 4 节第 9 项"},{"id":"9","from":"file","to":"level","label":"记着她批到哪一级、哪条路径","tree":true},{"id":"10","from":"file","to":"signed","label":"记着她签了哪一份","tree":true},{"id":"11","from":"acct","to":"bal","label":"账户里还剩多少","tree":true}]}
const G5PUR = {"topic":"g5","title":"服务发生与申报","summary":"注册服务方把做了的每一次服务记成服务记录，再照服务记录向政府申报。","tours":[{"title":"外部服务方做的服务：从发票到申报、月结单","note":"请外部服务方做的服务，从发票登记进来，核对后记成服务记录，写成申报行报给政府，月底列进月结单。","steps":[{"by":"照护伙伴","text":"外部服务方开来发票，把发票上的每一行登记成发票行。","concepts":["发票行"],"fns":["f-2"]},{"by":"照护伙伴","text":"对着老人签的服务协议核对发票行，核对无误的一行记成一条服务记录。","concepts":["服务协议","服务记录","凭据"],"fns":["f-3"]},{"by":"财务","text":"把还没申报的服务记录写成申报行，报给政府。","concepts":["申报行"],"fns":["f-5"]},{"by":"财务","text":"政府审核完，记下每一行申报行是通过还是被退回。","concepts":["申报行"],"fns":["f-8"]},{"by":"财务","text":"审核通过的一行，从老人名下的基金账户扣款。扣款在「参与者档案与她名下的钱」里办。","concepts":["基金账户"]},{"by":"财务","text":"月底把这个月的服务记录和照护管理记录汇总成月结单，发给老人。","concepts":["月结单","月结单明细"],"fns":["f-6"]}]},{"title":"自己做的服务、老人先付的钱和照护管理","note":"另外三种情形各记各的：自己的工作者做的服务直接记，老人先付的钱照收据记，照护伙伴做的照护管理单独记。","steps":[{"by":"照护伙伴","text":"自己的工作者上门做了一次服务，照服务清单选出做的是哪一项，记下一条服务记录。","concepts":["服务清单","服务记录"],"fns":["f-1"]},{"by":"照护伙伴","text":"老人自己先付了钱、交来收据的，核对收据以后记成服务记录。","concepts":["服务记录","凭据"],"fns":["f-4"]},{"by":"照护伙伴","text":"替老人做了一次照护管理，记下一条照护管理记录。","concepts":["照护管理记录"],"fns":["f-7"]}]}],"core":[{"title":"服务记录","why":"这块业务最后要留下的是「做了哪一次服务」。发票和收据是凭据，处理它们是为了把服务记录记准；申报、扣款和月结单都从服务记录开始。","parts":["凭据"],"sources":[{"steps":[{"data":"自己的工作者做了一次服务","event":true,"op":"创建","by":"直接记下这一次服务","fn":"f-1"}]},{"steps":[{"data":"外部服务方开来一张发票","event":true,"op":"创建","by":"把发票一行一行登记下来","fn":"f-2"},{"data":"发票行","op":"创建","by":"核对无误，一行记成一条","fn":"f-3"}]},{"steps":[{"data":"老人交来先付的收据","event":true,"op":"创建","by":"核对收据，照它记下","fn":"f-4"}]}],"targets":[{"op":"创建","by":"一条写成一行，报给政府","fn":"f-5","data":"申报行"},{"op":"创建","by":"按月汇总，发给老人","fn":"f-6","data":"月结单"}],"keeps":["r-1"],"actions":[{"id":"act-1","title":"记下一次服务","to":"等着申报","for":"p-2.1","why":"做了的服务不管从哪里来，都要落成一条服务记录。","does":"记下一次做了的服务：给哪一位老人、哪天、哪项服务、做了多少、多少钱、谁做的，有凭据的带上凭据。","rules":["r-2","r-3"],"in":[{"title":"老人","note":"这一次服务是给哪一位老人做的"},{"title":"这一次服务从哪里来","note":"自己的工作者做的、外部服务方做的，或者老人自己先付了钱的"},{"title":"日期","note":"这一次服务是哪天做的"},{"title":"服务项","note":"做的是服务清单上的哪一项"},{"title":"数量","note":"做了几小时，或者做了几次"},{"title":"金额","note":"这一次服务多少钱，澳元"},{"title":"凭据","note":"核对过的那一行发票行，或者老人交来的那张收据；自己的工作者做的服务没有"},{"title":"服务协议上的服务项","note":"老人签的服务协议里有哪几项服务，由叫这个行为的功能取回来"}],"edits":["老人：记下这一次服务是给哪一位老人做的","日期：记下这一次服务是哪天做的","服务项：记下做的是服务清单上的哪一项","数量：记下做了多少","金额：记下这一次服务多少钱","做服务的人：记下是自己的工作者，还是外部服务方","凭据：有凭据的，记下这一条是照哪一行发票行或者哪一张收据记的","状态：新记下的服务记录是「等着申报」"],"out":[{"kind":"事件","title":"服务记录已记下：带着是哪一位老人、哪天、哪项服务和金额"}],"steps":[{"text":"记下这一次服务是给哪一位老人、哪天做的","on":["老人","日期"]},{"text":"记下做的是哪一项服务、做了多少、多少钱","on":["服务项","数量","金额"]},{"text":"照这一次服务从哪里来，记下做服务的人和凭据","on":["做服务的人","凭据"]},{"text":"状态记成「等着申报」","on":["状态"]},{"text":"发出事件","on":["服务记录已记下"]}],"doubt":"自己的工作者做的服务，金额从哪里来，原料里没有写：功能「记下自己的工作者做的一次服务」现在只带进服务项和数量。"},{"id":"act-2","title":"记成已申报","from":"等着申报","to":"已申报","for":"p-1.1","why":"一条服务记录只写成一行申报行，写过的不再写。","does":"这一条服务记录写成申报行报给政府以后，把它记成「已申报」。","rules":["r-4"],"edits":["状态：等着申报 → 已申报"],"steps":[{"text":"更新状态：「等着申报」→「已申报」","on":["状态"]}]}]},{"title":"照护管理记录","why":"照护伙伴替老人做的照护管理也要留下记录：这个月做没做、做了多久，照这些记录来看，月结单上也要列出来。","sources":[{"steps":[{"data":"照护伙伴做了一次照护管理","event":true,"op":"创建","by":"记下这一次照护管理","fn":"f-7"}]}],"targets":[{"op":"创建","by":"按月汇总，发给老人","fn":"f-6","data":"月结单"}],"actions":[{"id":"act-3","title":"记下一次照护管理","for":"p-2.3","why":"照护伙伴替老人做的照护管理也要留下记录，月底看得出这个月做没做、做了多久。","does":"记下一次照护管理：替哪一位老人、哪天、做了多久、做了什么。","rules":[],"in":[{"title":"老人","note":"这一次照护管理是替哪一位老人做的"},{"title":"日期","note":"哪天做的"},{"title":"做了多久","note":"这一次花的时间，按分钟记"},{"title":"做了什么","note":"照护伙伴用一两句话写的"}],"edits":["老人：记下是替哪一位老人做的","日期：记下哪天做的","做了多久：记下照护伙伴填的分钟数","做了什么：记下照护伙伴写的一两句话"],"out":[{"kind":"事件","title":"照护管理已记下：带着是哪一位老人、哪天、做了多久"}],"steps":[{"text":"记下老人、日期、做了多久和做了什么","on":["老人","日期","做了多久","做了什么"]},{"text":"发出事件","on":["照护管理已记下"]}]}]},{"title":"申报行","why":"向政府申报是一行一行办的：报上去、通过或者退回，通过了才扣款，每一步都照申报行办。","sources":[{"steps":[{"data":"服务记录","op":"创建","by":"一条写成一行，报给政府","fn":"f-5"}]}],"targets":[{"op":"更新","by":"审核通过的一行交去扣款","fn":"f-8","data":"基金账户","topic":"参与者档案与她名下的钱"}],"keeps":["r-6"],"actions":[{"id":"act-4","title":"写出并报给政府","to":"已报给政府","for":"p-1.1","why":"报上去的每一行都从一条服务记录写出来，对得上一次真做了的服务。","does":"照一条服务记录写出一行申报行，报给政府。","rules":["r-7"],"in":[{"title":"服务记录","note":"照哪一条服务记录写"},{"title":"服务类型","note":"服务记录上的服务项在服务清单上属于哪一类，由叫这个行为的功能取回来"}],"edits":["服务记录：记下这一行申报的是哪一条服务记录","老人的编号：照服务记录上那位老人的 My Aged Care 编号写","服务类型：照服务记录上的服务项属于哪一类写","申报的金额：照服务记录上的金额写","状态：新写出的申报行是「已报给政府」"],"out":[{"kind":"事件","title":"申报行已报给政府：带着老人的编号、服务类型和申报的金额"}],"steps":[{"text":"记下这一行申报的是哪一条服务记录","on":["服务记录"]},{"text":"照服务记录写上老人的编号、服务类型和申报的金额","on":["老人的编号","服务类型","申报的金额"]},{"text":"状态记成「已报给政府」","on":["状态"]},{"text":"发出事件","on":["申报行已报给政府"]}]},{"id":"act-5","title":"记下审核结果","from":"已报给政府","to":"审核通过或被退回","for":"p-1.3","why":"政府审核的结果要记在申报行上：通过的才能扣款，被退回的要有人改了重新报。","does":"照政府回的结果，把申报行记成审核通过，或者记成被退回并记下退回的原因。","rules":["r-8","r-9"],"in":[{"title":"审核结果","note":"政府回的：通过，或者退回；退回的带着原因"}],"edits":["状态：已报给政府 → 审核通过，或者被退回","退回的原因：被退回的才记下"],"out":[{"kind":"事件","title":"申报行审核通过：带着老人的编号、服务类型和申报的金额","when":"政府回的是通过才发"}],"steps":[{"text":"照审核结果更新状态","on":["状态"]},{"text":"被退回的，记下退回的原因","on":["退回的原因"]},{"text":"审核通过的，发出事件","on":["申报行审核通过"]}]},{"id":"act-6","title":"记成已扣款","from":"审核通过","to":"已扣款","for":"p-1.3","why":"审核通过的那一行扣了款，申报行上要看得出这一行已经办完。","does":"这一行的钱从老人名下的基金账户扣成了以后，把申报行记成「已扣款」。","rules":["r-10"],"edits":["状态：审核通过 → 已扣款"],"steps":[{"text":"更新状态：「审核通过」→「已扣款」","on":["状态"]}]}]},{"title":"月结单","why":"月结单出了以后是留下来的一份：发给老人，老人照它付自己该付的钱，有异议也照它更正。","parts":["月结单明细"],"sources":[{"steps":[{"data":"服务记录","op":"创建","by":"按月汇总，发给老人","fn":"f-6"}]},{"steps":[{"data":"照护管理记录","op":"创建","by":"按月汇总，发给老人","fn":"f-6"}]}],"targets":[],"keeps":["r-11"],"actions":[{"id":"act-7","title":"汇总成月结单并出给老人","for":"p-3.1","why":"老人每个月要看得到自己用了哪些服务、每一项花了多少钱。","does":"把一位老人一个月的服务记录和照护管理记录汇总成一份月结单，出给老人。","rules":["r-12"],"in":[{"title":"老人","note":"给哪一位老人出"},{"title":"月份","note":"出的是哪一个月的"},{"title":"服务记录","note":"这位老人这个月的每一条"},{"title":"照护管理记录","note":"这位老人这个月的每一条"}],"edits":["老人：记下这一份月结单是出给哪一位老人的","月份：记下是哪一个月的","月结单明细：带进来的每一条记录各列一行，金额照那一条记录上的金额写","合计：把各行明细的金额加起来"],"out":[{"kind":"事件","title":"月结单已出：带着是哪一位老人、哪个月的"}],"steps":[{"text":"记下老人和月份","on":["老人","月份"]},{"text":"把带进来的每一条记录各列成一行明细","on":["月结单明细"]},{"text":"把各行明细的金额加起来，记成合计","on":["合计"]},{"text":"发出事件，月结单照它发给老人","on":["月结单已出"]}]}]}],"concepts":[{"title":"发票行","actions":[{"id":"act-8","title":"登记并等着核对","to":"等着核对","for":"p-2.2","why":"外部服务方做的服务要留下凭据，发票上的每一行都登记成一条发票行。","does":"照发票上的一行登记一条发票行：在哪一张发票上、哪项服务、做了多少、多少钱，登记了就等着核对。","rules":[],"in":[{"title":"发票","note":"这一行在哪一张发票上"},{"title":"发票上的一行","note":"这一行写的服务项、数量和金额"}],"edits":["发票号：记下这一行在哪一张发票上","服务项：照发票上这一行写的记下","数量：照发票上这一行写的记下","金额：照发票上这一行写的记下","状态：新登记的发票行是「等着核对」"],"steps":[{"text":"记下这一行在哪一张发票上","on":["发票号"]},{"text":"照发票上这一行记下服务项、数量和金额","on":["服务项","数量","金额"]},{"text":"状态记成「等着核对」","on":["状态"]}]},{"id":"act-9","title":"记成核对过了","from":"等着核对","to":"核对过了","for":"p-2.2","why":"发票行要核对过才算数，核对过没核对过在发票行上看得出，核对过的才记成服务记录。","does":"这一行发票行核对无误以后，把它记成「核对过了」。","rules":["r-5"],"in":[{"title":"服务协议上的服务项","note":"老人签的服务协议里有哪几项服务，由叫这个行为的功能取回来"}],"edits":["状态：等着核对 → 核对过了"],"out":[{"kind":"事件","title":"发票行已核对：带着这一行发票行和服务协议上的服务项"}],"steps":[{"text":"更新状态：「等着核对」→「核对过了」","on":["状态"]},{"text":"发出事件；服务记录由响应「发票行核对过以后」接着记下。","on":["发票行已核对"]}]}]}],"uses":[{"title":"服务清单","note":"政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。"},{"title":"服务协议","note":"老人跟注册服务方签的那一份；核对一项服务在不在她签的协议里，照它查。"}],"purposes":[{"id":"p-1","text":"交给政府的申报行要通得过政府的审核。","from":"政府审核通过才付钱","source":"人 2026-11-24 说：系统要提供出符合政府审核的申报项","needs":[{"id":"p-1.1","aim":"报上去的每一行都对得上一次真做了的服务。","text":"申报行只能从服务记录写出来，一条服务记录对一行。","source":"申报格式 v1.14 第 4 节","cores":["申报行"],"fns":["f-5"]},{"id":"p-1.2","aim":"不报政府不认的服务。","text":"申报的服务要是批给这位老人的服务类型，并且在她签的协议里。","source":"手册 v4.4 §10.1 行 1466","cores":["服务记录"],"data":["服务清单","服务协议"],"fns":["f-1"]},{"id":"p-1.3","aim":"政府审核的结果有着落：通过的扣款，被退回的改了重报。","text":"审核结果记在申报行上；审核通过的一行交去从老人名下的基金账户扣款。","source":"申报格式 v1.14 第 6 节","cores":["申报行"],"fns":["f-8"],"chains":["c-2"]}]},{"id":"p-2","text":"每一次服务都照政府的要求留痕，查的时候拿得出依据。","from":"先把服务做了再申报；有的服务是请外部服务方做的","source":"人 2026-11-24 说：按照要求为服务留痕","needs":[{"id":"p-2.1","aim":"做了的服务一次不漏。","text":"服务不管从哪里来，都要落成服务记录。","source":"人 2026-11-24 说：按照要求为服务留痕","cores":["服务记录"],"fns":["f-1","f-3","f-4"],"chains":["c-1"]},{"id":"p-2.2","aim":"每条服务记录都指得出它的依据。","text":"外部来的服务要留下凭据：发票一行一行录进来，核对过才记成服务记录，每条服务记录都指得出它的凭据是哪一行。","source":"手册 v4.4 §10.3 行 1520","data":["发票行","凭据"],"fns":["f-2","f-3","f-4"]},{"id":"p-2.3","aim":"照护伙伴做的照护管理也查得到。","text":"照护管理也要留记录。","source":"手册 v4.4 §8.4 行 960","cores":["照护管理记录"],"fns":["f-7"]}]},{"id":"p-3","text":"每个月向老人交代清楚：用了哪些服务、花了多少钱。","from":"政府出钱替老人买居家照护服务","needs":[{"id":"p-3.1","aim":"老人每个月看得到自己用了哪些服务、每一项花了多少钱。","text":"月底把这个月的服务记录和照护管理记录汇总成月结单，一条记录列一行，发给老人。","cores":["月结单"],"data":["月结单明细"],"fns":["f-6"]}]}],"rules":[{"id":"r-1","kind":"一直要守的","short":"凭据记下以后不换、不改","text":"一条服务记录的凭据记下以后不换、不改：它是照哪一行发票行、哪一张收据记的，以后一直是那一份。","source":"手册 v4.4 §10.3 行 1520","for":"p-2.2","why":"查的时候每条服务记录都指得出它当初的依据。","covers":["服务记录 › 凭据","凭据"],"examples":[{"given":"一条服务记录的凭据是发票 INV-208 的第 2 行","when":"有人要把它的凭据换成这张发票的第 3 行","then":"不能换，凭据仍是第 2 行"}],"doubt":"建模那边的聚合把凭据写成「签到记录或照片，附上就不改」。「附上就不改」两边一样；凭据是什么两边不一样：业务这边的凭据是发票上的一行或者老人交来的收据，自己的工作者做的服务没有凭据。以哪一边为准还没有定。"},{"id":"r-2","kind":"做之前要满足的","short":"检查服务项，在她签的服务协议里才能记下","text":"服务记录上的服务项必须是老人签的服务协议里有的一项；协议里没有的服务不记成服务记录。","source":"手册 v4.4 §10.1 行 1466","for":"p-1.2","why":"政府不认协议以外的服务，记下来的每一条都要报得上去。","examples":[{"given":"她签的服务协议里有家务清洁，没有园艺","when":"照护伙伴记下一次园艺服务","then":"被拒绝：这项服务不在她签的服务协议里，不记服务记录"},{"given":"她签的服务协议里有家务清洁","when":"照护伙伴记下一次家务清洁","then":"核对通过，可以记下"}],"doubt":"这条目的的做法还写着「要是批给这位老人的服务类型」。批了哪几类记在「参与者档案与她名下的钱」的参与者档案上，那个主题现在没有可以调用来查它的功能，这一半还没有落成规则。"},{"id":"r-3","kind":"怎么算的","short":"定出服务记录的凭据和做服务的人，照这一次服务从哪里来","text":"一条服务记录的凭据是哪一份、做服务的人记成谁，照这一次服务从哪里来定。","cases":["自己的工作者做的：做服务的人记成自己的工作者，没有凭据。","外部服务方做的：做服务的人记成外部服务方，凭据是核对过的那一行发票行，一行发票行记一条服务记录。","老人自己先付了钱的：凭据是她交来的那张收据。"],"source":"手册 v4.4 §10.3 行 1520","for":"p-2.2","why":"外面来的服务，每一条都指得出它的凭据是哪一份。","examples":[{"given":"发票 INV-208 的第 2 行核对过了","when":"照这一行记下服务记录","then":"这条服务记录的凭据是 INV-208 的第 2 行，做服务的人是外部服务方"},{"given":"自己的工作者上门做了一次家务清洁","when":"照护伙伴记下这一次服务","then":"这条服务记录没有凭据，做服务的人是自己的工作者"}]},{"id":"r-4","kind":"状态能不能走","short":"检查服务记录的状态，等着申报才能记成已申报","text":"只有处于「等着申报」的服务记录才能写成申报行、记成「已申报」；已经申报过的不再写第二行。","source":"申报格式 v1.14 第 4 节","for":"p-1.1","why":"一条服务记录只对着一行申报行，同一次服务不报两次。","examples":[{"given":"一条服务记录已经是「已申报」","when":"财务又拿它写申报行","then":"被拒绝，不写第二行申报行"}]},{"id":"r-5","kind":"状态能不能走","short":"检查发票行的状态，等着核对才能核对","text":"只有处于「等着核对」的发票行才能核对；已经核对过的不再核对，也不再记第二条服务记录。","source":"手册 v4.4 §10.3 行 1512","for":"p-2.2","why":"一行发票行只记成一条服务记录，凭据和服务记录一行对一条。","examples":[{"given":"发票 INV-208 的第 2 行已经是「核对过了」","when":"照护伙伴再核对一次这一行","then":"被拒绝，不记第二条服务记录"}]},{"id":"r-6","kind":"一直要守的","short":"一行申报行一直对着同一条服务记录","text":"一行申报行从写出来起就对着一条服务记录，以后不换；被退回的申报行改了以后重新报，还是这一行，不另写一行。","source":"申报格式 v1.14 第 4 节","for":"p-1.1","why":"报上去的每一行什么时候查，都对得上那一次真做了的服务。","covers":["申报行 › 服务记录"],"examples":[{"given":"一行申报行是照 10 月 3 日那条家务清洁的服务记录写出来的，被政府退回了","when":"财务改了以后重新报上去","then":"报的仍是这一行，它对着的仍是 10 月 3 日那条服务记录"}]},{"id":"r-7","kind":"怎么算的","short":"定出申报行上写什么，照它对着的那一条服务记录","text":"申报行上的老人的编号、服务类型和申报的金额，都照它对着的那一条服务记录写，不由财务另填。","items":["老人的编号：服务记录上那位老人的 My Aged Care 编号。","服务类型：服务记录上的服务项在服务清单上属于的那一类。","申报的金额：服务记录上的金额。"],"source":"申报格式 v1.14 第 4 节","for":"p-1.1","why":"申报行只能从服务记录写出来，报的内容和记下的那一次服务一样。","examples":[{"given":"一条服务记录记着老人 AC-1001、家务清洁、80 澳元；家务清洁在服务清单上属于日常生活这一类","when":"财务照它写申报行","then":"申报行上写着编号 AC-1001、服务类型日常生活、申报的金额 80 澳元"}]},{"id":"r-8","kind":"状态能不能走","short":"检查申报行的状态，已报给政府才能记审核结果","text":"只有处于「已报给政府」的申报行才能记审核结果；已经记过结果的不再记。","source":"申报格式 v1.14 第 6 节","for":"p-1.3","why":"一行申报行报一次只有一个审核结果。","examples":[{"given":"一行申报行已经是「审核通过」","when":"财务又给它记一次审核结果","then":"被拒绝，申报行不变"}]},{"id":"r-9","kind":"怎么算的","short":"定出申报行走到哪个状态，照政府回的审核结果","text":"申报行记成审核通过还是被退回，照政府回的审核结果定，不由财务另选。","cases":["政府回的是通过：记成「审核通过」。","政府回的是退回：记成「被退回」，同时记下退回的原因。"],"source":"申报格式 v1.14 第 6 节","for":"p-1.3","why":"通过的才能扣款，被退回的要看得到原因才能改了重新报。","examples":[{"given":"政府对一行申报行回的是退回，原因是服务类型填错","when":"财务记下审核结果","then":"申报行记成「被退回」，退回的原因记着「服务类型填错」"},{"given":"政府对一行申报行回的是通过","when":"财务记下审核结果","then":"申报行记成「审核通过」"}]},{"id":"r-10","kind":"状态能不能走","short":"检查申报行的状态，审核通过才能记成已扣款","text":"只有处于「审核通过」的申报行才能记成「已扣款」；还没有通过的、被退回的、已经扣过款的都不能记。","source":"申报格式 v1.14 第 6 节","for":"p-1.3","why":"通过的才扣款，同一行只记一次已扣款。","examples":[{"given":"一行申报行是「被退回」","when":"要把它记成已扣款","then":"被拒绝，申报行不变"}]},{"id":"r-11","kind":"一直要守的","short":"月结单出了以后留着，不改","text":"月结单出给老人以后留着，上面的明细和金额不再改。","source":"手册 v4.4 §11.2 行 1630","for":"p-3.1","why":"老人手里的那一份和这里留着的那一份一直是同一份，她照它付自己该付的钱。","covers":["月结单","月结单明细"],"examples":[{"given":"十月的月结单已经出给老人","when":"有人要改上面一行明细的金额","then":"不能改，月结单仍是出给她的那一份"}],"doubt":"老人对月结单有异议、要更正的时候怎么办，原料里没有写。"},{"id":"r-12","kind":"怎么算的","short":"定出月结单上的明细，照带进来的每一条记录","text":"月结单上的明细照带进来的记录列：一条服务记录、一条照护管理记录各列一行，金额照那一条记录上的金额写。","source":"手册 v4.4 §11.2 行 1634","for":"p-3.1","why":"老人看得到每一项服务花了多少钱，不只是一个总数。","examples":[{"given":"一位老人十月有 3 条服务记录、1 条照护管理记录","when":"财务出十月的月结单","then":"月结单上列 4 行明细，每一行的金额和那一条记录上的一样"}],"doubt":"一条记录列一行是推出来的，待定 q-2 还没有答。照护管理记录上现在没有金额这一栏，它那一行的金额从哪里来，原料里没有写。"},{"id":"r-13","kind":"怎么算的","short":"定出这一次申报哪几条服务记录，照服务记录的状态","text":"这一次申报的是全部处于「等着申报」的服务记录；已申报的不再带出来。","source":"申报格式 v1.14 第 4 节","for":"p-1.1","why":"申报行只从还没有报过的服务记录写出来。","examples":[{"given":"有 5 条服务记录，其中 2 条已申报，3 条等着申报","when":"财务写申报行","then":"带出来的是等着申报的那 3 条"}]},{"id":"r-14","kind":"怎么算的","short":"定出月结单上列哪几条记录，照老人和月份","text":"一份月结单上列的是这一位老人在这一个月里的全部服务记录和照护管理记录；一条记录属于哪个月，照它上面的日期定。","source":"手册 v4.4 §11.2 行 1630","for":"p-3.1","why":"老人看到的是她自己这个月用了的全部服务，不多也不少。","examples":[{"given":"一位老人有一条 10 月 31 日的服务记录和一条 11 月 1 日的服务记录","when":"财务出她十月的月结单","then":"带出来的是 10 月 31 日那一条，11 月 1 日那一条留到十一月的月结单"}]}],"intro":{"context":"政府出钱替老人买居家照护服务：注册服务方先把服务做了，或者请外部服务方做，再向政府申报，政府审核通过才付钱。","duty":["管服务记录和照它做的申报：把做了的服务记准，登记和核对外面开来的发票，向政府申报，按月给老人出月结单。","不管钱从哪个账户扣、协议怎么签。"],"concepts":[{"title":"服务记录","note":"做了一次服务记一条：哪天、哪项服务、多少、多少钱。"},{"title":"发票行","note":"外部服务方开来的发票上的一行，对着一次服务。"},{"title":"申报行","note":"向政府申报的一行，对着一条服务记录。"},{"title":"月结单","note":"每月给老人的一份清单，列着这个月的服务和花的钱。"},{"title":"照护管理记录","note":"照护伙伴替老人做一次照护管理记一条：哪天、做了多久、做了什么。"}],"users":[{"who":"照护伙伴","aim":"把做了的服务记准","steps":["记下自己的工作者做的服务","登记外部服务方开来的发票，核对以后记成服务记录","核对老人交来的收据，记成服务记录","记下做了的照护管理"]},{"who":"财务","aim":"照服务记录向政府申报，按月给老人出清单","steps":["把服务记录写成申报行","记下政府对申报行的审核结果","出月结单"]}],"usual":["做了一次服务，记下一条服务记录","外面开来的发票登记、核对，记成服务记录","财务照服务记录写申报行，报给政府","政府审核通过的申报行交去扣款","月底给老人出月结单"]},"groups":[{"title":"服务记录","functions":[{"id":"f-1","title":"记下自己的工作者做的一次服务","does":"记下哪天、哪项服务、做了多少","intent":"自己的工作者上门做了一次服务，要有一条记录，后面才能申报。","who":"照护伙伴","subject":{"title":"这一次服务的服务记录","op":"创建","to":"服务记录记下了，等着申报"},"in":[{"title":"参与者档案","note":"给哪一位老人做的"},{"title":"服务项","by":"照护伙伴选的","note":"做的是服务清单上的哪一项"},{"title":"数量","by":"工作者报的","note":"做了几小时，或者做了几次"}],"out":[],"rules":[],"calls":["act-1"],"steps":[{"call":{"topic":"服务方与协议","title":"查一份服务协议"},"text":"取回这位老人签的服务协议里有哪几项服务。"}]},{"id":"f-4","title":"核对老人先付的收据并记成服务记录","does":"核对收据上的服务和金额，照它记下服务记录","intent":"老人自己先付了钱，交来收据；核对无误才记成服务记录，后面照它申报、把钱退给她。","who":"照护伙伴","subject":{"title":"这张收据对着的服务记录","op":"创建","to":"服务记录记下了，等着申报"},"in":[{"title":"参与者档案","note":"哪一位老人交来的收据"},{"title":"收据","by":"老人交来的","note":"她付款的凭据，写着哪天、哪项服务、付了多少（澳元）"}],"out":[],"rules":[],"calls":["act-1"],"steps":[{"call":{"topic":"服务方与协议","title":"查一份服务协议"},"text":"取回这位老人签的服务协议里有哪几项服务。"},{"text":"照护伙伴核对收据上的服务和金额，核对无误才往下记。"}]}]},{"title":"发票行","functions":[{"id":"f-2","title":"登记外部服务方开来的发票行","does":"把发票上的每一行登记下来，等着核对","intent":"外部服务方做了服务、开来发票；先一行一行登记下来，核对以后才能记成服务记录。","who":"照护伙伴","subject":{"title":"这张发票上的每一行发票行","op":"创建","to":"发票行登记了，等着核对"},"in":[{"title":"发票","by":"外部服务方开的","note":"开来的那一张，附上图片或 PDF"}],"out":[],"rules":[],"calls":["act-8"],"steps":[{"text":"附上发票的图片或 PDF，把发票上的每一行各登记一次。"}]},{"id":"f-3","title":"核对发票行并记成服务记录","does":"核对发票行和实际做的服务对不对得上，对得上的一行记成一条服务记录","intent":"登记了的发票行要有人核对过才算数，核对无误的才落成服务记录。","who":"照护伙伴","subject":{"title":"这一行发票行","op":"更新","to":"发票行核对过了"},"in":[{"title":"发票行","note":"核对的是哪一行"},{"title":"服务协议","by":"老人签的","note":"看这项服务在不在她签的协议里"}],"out":[],"rules":[],"calls":["act-9"],"steps":[{"call":{"topic":"服务方与协议","title":"查一份服务协议"},"text":"取回这位老人签的服务协议里有哪几项服务。"},{"text":"照护伙伴对着服务协议和实际做的服务核对这一行，核对无误的才往下办。"}]}]},{"title":"申报行","functions":[{"id":"f-5","title":"把服务记录写成申报行并报给政府","does":"一条服务记录写成一行申报行，报给政府","intent":"政府照申报付钱，所以每一条服务记录都要写成申报行报上去。","who":"财务","subject":{"title":"新写出的这一行申报行","op":"创建","to":"申报行写好了，报给了政府"},"in":[{"title":"服务记录","by":"系统带出的","note":"还没申报的那几条"}],"out":[],"rules":[],"services":["s-1"],"calls":["act-4","act-2"],"steps":[{"call":{"topic":"服务清单","title":"查一项服务"},"text":"取回服务清单上每一项服务属于哪一类服务类型，写申报行时照它写。"}]},{"id":"f-8","title":"记下政府对申报行的审核结果","does":"记下这一行是通过了还是被退回；通过的交去扣款","intent":"政府审核完一行申报，结果要记在申报行上：通过的才能从老人名下的账户扣款，被退回的要有人改了重新报。","who":"财务","subject":{"title":"政府回了结果的那一行申报行","op":"更新","to":"申报行上记着审核通过，或者被退回和退回的原因"},"in":[{"title":"申报行","note":"政府回了结果的那一行"},{"title":"审核结果","by":"政府回的","note":"通过，或者退回；退回的带着原因"}],"out":[],"rules":[],"calls":["act-5"],"steps":[{"call":{"topic":"参与者档案与她名下的钱","title":"照申报行从基金账户扣款"},"after":true,"text":"审核通过的这一行，交去从老人名下的基金账户扣款；被退回的不交。"}]}]},{"title":"月结单","functions":[{"id":"f-6","title":"出这个月的月结单","does":"把这个月的服务记录和照护管理记录汇总成一份月结单，发给老人","intent":"老人每个月要看到自己用了哪些服务、花了多少钱。","who":"财务","subject":{"title":"这位老人这个月的月结单","op":"创建","to":"月结单出好了，发给了老人"},"in":[{"title":"参与者档案","note":"给哪一位老人出"},{"title":"服务记录","by":"系统带出的","note":"这位老人这个月的每一条"},{"title":"照护管理记录","by":"系统带出的","note":"这位老人这个月的每一条"}],"out":[],"rules":[],"services":["s-2"],"calls":["act-7"]}]},{"title":"照护管理记录","functions":[{"id":"f-7","title":"记下一次照护管理","does":"记下哪天、做了多久、做了什么","intent":"照护伙伴替老人联系、安排了一次，要有一条记录，月底才看得出这个月做没做。","who":"照护伙伴","subject":{"title":"这一次照护管理的照护管理记录","op":"创建","to":"照护管理记录记下了"},"in":[{"title":"参与者档案","note":"替哪一位老人做的"},{"title":"做了多久","by":"照护伙伴填的","note":"这一次花的时间，按分钟记"}],"out":[],"rules":[],"calls":["act-3"]}]}],"services":[{"id":"s-1","title":"找出还没有申报的服务记录","does":"在全部服务记录里找出还等着申报的那几条。要看全部服务记录才找得到，所以这件事不放在服务记录自己的行为里。","for":"p-1.1","why":"申报行只从服务记录写出来，这一次写哪几条由这里找。","rules":["r-13"],"steps":[{"text":"在全部服务记录里找出状态是「等着申报」的"}],"returns":"还没有申报的那几条服务记录"},{"id":"s-2","title":"找出一位老人一个月里的记录","does":"在全部服务记录和照护管理记录里，找出这一位老人这一个月的每一条。要看全部记录才找得到，所以这件事不放在哪一条记录自己的行为里。","for":"p-3.1","why":"月结单上列哪几条记录，由这里找。","in":[{"title":"老人","note":"给哪一位老人出月结单"},{"title":"月份","note":"出的是哪一个月的"}],"rules":["r-14"],"steps":[{"text":"照老人找出她的全部服务记录和照护管理记录"},{"text":"照记录上的日期挑出这一个月的"}],"returns":"这位老人这个月的服务记录和照护管理记录"}],"chains":[{"id":"c-1","title":"发票行核对过以后","after":{"title":"发票行","from":"等着核对","to":"核对过了","when":"发票行的行为「记成核对过了」发出「发票行已核对」"},"then":[{"kind":"新记录","title":"服务记录","to":"等着申报","when":"核对无误的一行一条"}],"rules":[],"calls":["act-1"]},{"id":"c-2","title":"申报行审核通过以后","after":{"title":"申报行","from":"已报给政府","to":"审核通过","when":"「参与者档案与她名下的钱」的基金账户发出「已扣款」，扣的是这一行申报行"},"then":[{"kind":"状态改变","title":"基金账户","to":"扣掉这一行申报的金额","note":"在「参与者档案与她名下的钱」里办"},{"kind":"状态改变","title":"申报行","from":"审核通过","to":"已扣款","when":"扣成了"}],"rules":[],"calls":["act-6"]}],"workflows":[{"id":"w-1","title":"服务记录","states":[{"id":"s-1","title":"等着申报"},{"id":"s-2","title":"已申报"}],"moves":[{"from":"s-1","to":"s-2","label":"写成申报行报给了政府","act":"act-2"}]},{"id":"w-2","title":"发票行","states":[{"id":"s-1","title":"等着核对"},{"id":"s-2","title":"核对过了"}],"moves":[{"from":"s-1","to":"s-2","label":"核对无误","act":"act-9"}]},{"id":"w-3","title":"申报行","states":[{"id":"s-1","title":"已报给政府"},{"id":"s-2","title":"被退回"},{"id":"s-3","title":"审核通过"},{"id":"s-4","title":"已扣款"}],"moves":[{"from":"s-1","to":"s-3","label":"政府审核通过","act":"act-5"},{"from":"s-1","to":"s-2","label":"政府退回，带着原因","act":"act-5"},{"from":"s-2","to":"s-1","label":"改了以后重新报上去"},{"from":"s-3","to":"s-4","label":"从老人名下的基金账户扣成了","act":"act-6"}],"stages":[{"title":"申报和审核","states":["s-1","s-2"]},{"title":"通过以后","states":["s-3","s-4"]}],"note":"被退回的申报行改了以后重新报，不另写一行。"}],"asks":[{"id":"q-1","q":"「每个月向老人交代清楚用了哪些服务、花了多少钱」这条业务目的是推出来的，原料没有写为什么要出月结单。出月结单是为了这个吗？","lean":"是这个目的","options":["是这个目的","月结单不该放在这个主题里"]},{"id":"q-2","q":"「老人每个月看得到自己用了哪些服务、每一项花了多少钱」这条更细的目的是推出来的，原料只写了每月要出月结单，没有写月结单要列到每一项服务。月结单要一条记录列一行吗？","lean":"是，一条记录列一行","options":["是，一条记录列一行","只列这个月的合计"]},{"id":"q-3","q":"服务记录上的「做服务的人」这一栏是为了什么？原料里只写了要记下是自己的工作者还是外部服务方，没有写记下来给谁用，现在没有哪一条更细的目的落到它上面。","lean":"为了查的时候说得清这一次服务是谁做的","options":["为了查的时候说得清这一次服务是谁做的","为了分清这一条服务记录要不要带凭据","为了给外部服务方结账，那是别的主题的事"]},{"id":"q-4","q":"月结单上的「合计」这一栏是为了什么？原料里没有写它是这个月花掉的总数，还是老人自己该付的数，现在没有哪一条更细的目的落到它上面。","lean":"这个月花掉的总数","options":["这个月花掉的总数","老人自己该付的数"]}]}
const G5PURC = {"topic":"g5","title":"服务发生与申报","summary":"这一块管做了的服务怎么留下记录、怎么报给政府：每一次服务记成一条服务记录，外面开来的发票先登记、核对；照服务记录写申报行，月底汇总成月结单发给老人。","concepts":[{"id":"inv","title":"发票行","by":["照护伙伴"],"order":1,"fields":[{"title":"发票号","note":"这一行在哪一张发票上。","for":"p-2.2","why":"查的时候找得到这一行是外部服务方开来的哪一张发票上的。"},{"title":"服务项","for":"p-1.2","why":"核对的时候照它看这项服务在不在老人签的服务协议里。"},{"title":"数量","for":"p-2.1","why":"核对无误以后照它记下做了多少。"},{"title":"金额","for":"p-2.1","why":"核对无误以后照它记下这一次服务多少钱。"},{"title":"状态","note":"等着核对，或者核对过了，见它的状态转换。","for":"p-2.2","why":"核对过的发票行才算数，核对没核对要看得出。"}],"definition":"外部服务方开来的发票上的一行，对着一次服务。先登记下来，核对无误才记成服务记录。","source":"手册 v4.4 §10.3 行 1512"},{"id":"rec","title":"服务记录","by":["照护伙伴"],"order":1,"fields":[{"title":"老人","ref":"参与者档案","topic":"参与者档案与她名下的钱","note":"这一次服务是给哪一位老人做的。","for":"p-2.1","why":"每一次服务都说得清是给哪一位老人做的。"},{"title":"日期","note":"这一次服务是哪天做的。","for":"p-2.1","why":"每一次服务都说得清是哪天做的，月结单也照它算这一条属于哪个月。"},{"title":"服务项","ref":"服务","topic":"服务清单","note":"做的是服务清单上的哪一项。","for":"p-1.2","why":"照它看这项服务在不在她签的服务协议里，申报时照它定服务类型。"},{"title":"数量","for":"p-2.1","why":"这一次服务做了多少要留下来。"},{"title":"金额","for":"p-1.1","why":"申报的金额照它写。"},{"title":"做服务的人","note":"自己的工作者，或者外部服务方。"},{"title":"凭据","ref":"凭据"},{"title":"状态","note":"等着申报，或者已申报，见它的状态转换。","for":"p-1.1","why":"一条服务记录只写成一行申报行，报过没报过要看得出。"}],"definition":"做了一次服务记一条：哪天、哪项服务、做了多少、多少钱。申报、扣款和月结单都从它开始。","source":"手册 v4.4 §10.1 行 1466"},{"id":"proof","title":"凭据","order":2,"fields":[{"title":"凭据的种类","note":"发票上的一行，或者老人交来的收据。","for":"p-2.2","why":"查的时候先知道该去找发票还是找收据。"},{"title":"发票行","ref":"发票行","note":"照发票记下的，写它对着发票上的哪一行。","for":"p-2.2","why":"外部服务方做的服务，指得出它的依据是哪一行。"},{"title":"收据","note":"照收据记下的，写它对着老人交来的哪一张收据。","for":"p-2.2","why":"老人先付的服务，指得出它的依据是哪一张收据。"}],"definition":"一条服务记录是照什么记下的：发票上的哪一行，或者老人交来的哪一张收据。自己的工作者做的服务没有凭据。","source":"手册 v4.4 §10.3 行 1520"},{"id":"cm","title":"照护管理记录","by":["照护伙伴"],"order":2,"fields":[{"title":"老人","ref":"参与者档案","topic":"参与者档案与她名下的钱","note":"这一次照护管理是替哪一位老人做的。","for":"p-2.3","why":"查得到替每一位老人做了哪几次照护管理。"},{"title":"日期","for":"p-2.3","why":"看得出这个月做没做。"},{"title":"做了多久","note":"这一次花的时间，按分钟记。","for":"p-2.3","why":"看得出这个月一共做了多久。"},{"title":"做了什么","for":"p-2.3","why":"查的时候说得清这一次替她办了什么。"}],"definition":"照护伙伴替老人做一次照护管理记一条：哪天、做了多久、做了什么。","source":"手册 v4.4 §8.4 行 960"},{"id":"claim","title":"申报行","by":["财务"],"order":1,"fields":[{"title":"服务记录","ref":"服务记录","note":"这一行申报的是哪一条服务记录。","for":"p-1.1","why":"报上去的每一行都对得上一次真做了的服务。"},{"title":"老人的编号","note":"她的 My Aged Care 编号，政府按它从她名下扣款。","for":"p-1.3","why":"审核通过以后按这个编号找到她名下的账户扣款。"},{"title":"服务类型","for":"p-1.3","why":"审核通过以后从对着这一类服务的账户扣款。"},{"title":"申报的金额","for":"p-1.1","why":"报的钱数和那一条服务记录上的一样。"},{"title":"状态","for":"p-1.3","why":"看得出这一行是通过了、被退回了，还是已经扣了款。"},{"title":"退回的原因","note":"被政府退回的申报行才有。","for":"p-1.3","why":"被退回的要看得到原因，才能改了重新报。"}],"definition":"向政府申报的一行，对着一条服务记录。报上去以后政府审核，通过了才从老人名下的基金账户扣款，被退回的改了重新报。","source":"申报格式 v1.14 第 4 节"},{"id":"stmt","title":"月结单","by":["财务"],"order":2,"fields":[{"title":"老人","ref":"参与者档案","topic":"参与者档案与她名下的钱","note":"这一份月结单是出给哪一位老人的。","for":"p-3.1","why":"每位老人看到的是她自己的那一份。"},{"title":"月份","for":"p-3.1","why":"一个月出一份，看得出是哪一个月的。"},"合计"],"definition":"每月给老人的一份清单，列着这个月的服务和花的钱。出了以后留着，老人照它付自己该付的钱。","source":"手册 v4.4 §11.2 行 1630"},{"id":"line","title":"月结单明细","order":3,"fields":[{"title":"对着哪一条记录","note":"这一行列的是哪一条服务记录，或者哪一条照护管理记录。","for":"p-3.1","why":"老人看得到这一行是哪一次服务。"},{"title":"金额","for":"p-3.1","why":"老人看得到这一项花了多少钱。"}],"definition":"月结单上的一行：这个月的一条服务记录，或者一条照护管理记录，带着金额。","source":"手册 v4.4 §11.2 行 1634"}],"external":[{"id":"list","title":"服务清单","topic":"g4"},{"id":"agree","title":"服务协议","topic":"g3"},{"id":"acct","title":"基金账户","topic":"g2"}],"edges":[{"id":"1","from":"rec","to":"proof","label":"照哪一份凭据记下的","tree":true},{"id":"2","from":"stmt","to":"line","label":"一条记录列一行","tree":true},{"id":"3","from":"inv","to":"rec","label":"核对无误的一行记成一条","by":["照护伙伴"]},{"id":"4","from":"rec","to":"claim","label":"一条写成一行，报给政府","by":["财务"]},{"id":"5","from":"rec","to":"stmt","label":"按月汇总"},{"id":"6","from":"cm","to":"stmt","label":"这个月的照护管理也列上"},{"id":"7","from":"list","to":"rec","label":"做的是清单上的哪一项，照它查"},{"id":"8","from":"agree","to":"inv","label":"核对这项服务在不在她签的协议里"},{"id":"9","from":"claim","to":"acct","label":"审核通过的一行，从她的账户扣"}]}
const PRE = 'SAMPLE_MODULES.g2 = fresh(G2PUR); SAMPLE_MODULES.g5 = fresh(G5PUR); SAMPLE_CONCEPTS.g2 = fresh(G2PURC); SAMPLE_CONCEPTS.g5 = fresh(G5PURC); '
const NEW = '以下的断言看新写法的主题'
// ---- 新写法的主题（写了 goals）用的 ----
// 跑完页面再接着跑的一句：展开「业务目的及模型」（all：树上的节点全展开）；展开「业务方案」看角色视角（r：哪个角色的页签，不给就是头一个）
const tree = (t, all) => `secOpen['样例系统/${t}/model'] = true; ${all ? `for (const x of goalNodes(MODULES.${t})) goalOpen['样例系统/${t}/' + x.n.id] = true; ` : ''}render()`
const roleV = (t, r) => `secOpen['样例系统/${t}/plan'] = true; planTab['样例系统/${t}'] = 'role'; ${r ? `roleTab['样例系统/${t}'] = '${r}'; ` : ''}render()`
// 树上一个节点自己的那一段（到下一个节点之前）；角色视角里一步的那两格（到这一行结束）；一段里能点了跳到树上的目的的号、能点了跳到角色视角的步骤的号
const nodeOf = (s, id) => { const m = mainHtml(s), a = m.indexOf('data-goal-node="' + id + '"'); if (a < 0) return ''; const b = m.indexOf('data-goal-node="', a + 10); return m.slice(a, b < 0 ? undefined : b) }
const stepRow = (s, id) => { const m = mainHtml(s), a = m.indexOf('data-step-row="' + id + '"'); return a < 0 ? '' : m.slice(a, m.indexOf('</tr>', a)) }
const goalIds = (h) => [...h.matchAll(/data-goal="([^"]+)"/g)].map((m) => m[1]).join()
const stepIds = (h) => [...h.matchAll(/data-jstep="([^"]+)"/g)].map((m) => m[1]).join()
// 模拟在主区、在窗口里点一下
const tapMain = (sel, dataset) => `fire(els.main.on.click, { target: at({ '${sel}': { dataset: ${JSON.stringify(dataset)} } }) })`
const tapPop = (sel, dataset) => `fire(els.pop.on.click, { target: at({ '${sel}': { dataset: ${JSON.stringify(dataset)} } }) })`
// 窗口上面「达成的目的」「用在」那一行
const lineOf = (p, k) => { const a = p.indexOf('<div class="am"><i>' + k + '</i>'); return a < 0 ? '' : p.slice(a, p.indexOf('</div>', a)) }
// 步骤图要宽一点的窗口才看得出一排四格：先把窗口放宽，开了窗口再放回去
const WIDE = (open) => `innerWidth = 1600; ${open}; innerWidth = 1200`
// 分叉的三种写法，各用嵌进去的小数据看：都改在 g2 的「记下分到资金并开出她名下的基金」（f-3）和「分到资金以后」（c-1）上
const ROADS = `{ const f = allFns(MODULES.g2).find((x) => x.id === 'f-3'); f.calls = ['act-3']; f.branches = [{ when: '她名下还没有基金账户', calls: ['act-4', { text: '告诉照护伙伴开了哪几个账户', only: '开了两个以上' }] }, { when: '先前分到的是一部分', calls: [], callsWhen: { 'act-6': '补的钱大于零' } }] } `
const EACH = `{ const c = MODULES.g2.chains[0]; delete c.alt; c.calls = ['act-4']; c.callsWhen = { 'act-4': '她名下还没有基金账户', 'act-6': '先前分到的是一部分' } } `
// 流程图里的框：种类（chk 检查、dec 定出、step 步骤、act 行为、svc 查询、call 调用、fn 接着办的功能、event 什么事发生了）、点了开什么、号、位置
const flowBoxes = (p) => [...p.matchAll(/<g class="sb (\w+)"(?: data-pop="([^"]+)")?(?: data-id="([^"]+)")?><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => ({ type: m[1], pop: m[2] ?? '', id: m[3] ?? '', x: +m[4], y: +m[5], w: +m[6], h: +m[7] }))
// 各步下面挂的副作用一共几条；右边「副作用汇总」里几条
const fxUnder = (p) => [...p.matchAll(/<g class="sx" data-fx="(\d+)"/g)].reduce((t, m) => t + +m[1], 0)
const fxSum = (p) => +(p.match(/<g class="so sum" data-fx="(\d+)"/) ?? [0, -1])[1]
// 开着的窗口，从下到上
const winKeys = (p) => [...p.matchAll(/<div class="wn" data-win="([^"]+)"/g)].map((m) => m[1]).join()
const cases = [
  ['#map', (s) => s.includes('<svg') && s.includes('参与者档案与她名下的钱')],
  ['#concepts/g2', (s) => s.includes('<svg') && s.includes('class="stub"') && s.includes('class="nd"')],
  ['#concepts/g2', (s) => s.includes('class="side"') && s.includes('出处：'), "selected = 'file'; render()"],
  ['#concepts/g1', (s) => s.includes('还没写')],
  ['#聊天 app/map', (s) => s.includes('还没整理') && nav(s).includes('class="cx on" data-cx="聊天 app"')],
  ['#共享内核/kernel', (s) => s.includes('只在这里写一遍') && nav(s).includes('照护伙伴')],
  ['#map', (s) => nav(s).includes('▾</span>样例系统') && nav(s).includes('▸</span>共享内核')],
  ['#cxmap', (s) => s.includes('class="diagram cxmap"') && s.includes('class="kn"') && s.includes('协议已签') && s.includes('<td class="n">共享内核</td>') && nav(s).includes('class="cx proj on"')],
  ['#cxmap', (s) => s.includes('class="sp sel"') && s.includes('<tr class="sel" data-cx="care">'), "selected = 'care'; render()"],
  ['#flow/01-老人注册', (s) => s.includes('<svg') && s.includes('class="note"') && s.includes('class="data"')],
  // 排版：画出来的矩形不出画布
  ['#map', inBounds],
  ['#concepts/g2', inBounds],
  ['#flow/01-老人注册', inBounds],
  // 流程：参与方那一排在单独的 sticky 容器里，列数和 parties 一样；生命线在 svg 里
  ['#flow/01-老人注册', (s) => s.includes('<div class="heads"') && (s.match(/class="hd/g) ?? []).length === 3 && (s.match(/class="life"/g) ?? []).length === 3 && s.indexOf('class="heads"') < s.indexOf('<svg')],
  // 规则与问题：每步右边一个框、一条虚线（第 3、5、8 步各一个）；框里一条一行，待定的红、定了的灰；答了的问题不画
  ['#flow/01-老人注册', (s) => s.includes('class="it rule pending"') && s.includes('class="it rule done"') && s.includes('class="it ask pending"') && !s.includes('class="it ask done"') && (s.match(/class="lead"/g) ?? []).length === 3 && (s.match(/class="qa side/g) ?? []).length === 3 && s.includes('>待定<') && s.includes('>定了<') && !s.includes('协议记作废') && !s.includes('退出期内她退出了')],
  // 待定卡上一排按钮：options 各一个、第一个加粗是偏向、再一个「另说」
  ['#flow/01-老人注册', (s) => s.includes('class="btn b" data-flow="01-老人注册" data-step="5" data-kind="rule" data-id="r-1" data-opt="照护伙伴照通知书为准，不让手改"'.replace('照护伙伴照通知书为准，不让手改', '照通知书为准，不让手改')) && s.includes('data-kind="ask" data-id="a-1" data-other="1"') && s.includes('>另说<')],
  // 点一个答法＝答了：规则 status 变定了、卡变灰、answer 记下；左边栏条数跟着减
  ['#flow/01-老人注册', (s) => !s.includes('class="it rule pending"') && (s.match(/class="it rule done"/g) ?? []).length === 2 && !s.includes('答：') && !s.includes('允许手改，记下为什么') && s.includes('<!--status:定了-->') && nav(s).includes('<i class="open">1</i>'),
    "answerQa({ flow: '01-老人注册', step: '5', kind: 'rule', id: 'r-1', opt: '允许手改，记下为什么' }); els.main.innerHTML += '<!--status:' + FLOWS[0].steps[4].rules[0].status + '-->'"],
  // 左边栏：流程那一行红点带条数（1 条待定规则 + 1 个没答的问题 = 2），上下文那行汇总（再加 g2 业务上 5 条待定、g5 业务上 4 条待定 = 11）
  ['#map', (s) => nav(s).includes('老人注册<i class="open">2</i>') && nav(s).includes('<small>11 条没答</small>')],
  // 工作台注入 DATA.OPEN 时按它算
  ['#map', (s) => nav(s).includes('老人注册<i class="open">7</i>') && nav(s).includes('<small>9 条没答</small>'), '', { OPEN: { '样例系统/01-老人注册': 7, '样例系统/02-x': 2, '聊天 app/y': 5 } }],
  // 左边栏的组：默认折叠；当前这页所在的组展开；流程组折叠时组名右边是合计的红点
  ['#map', (s) => nav(s).includes('data-g="样例系统/map"><span class="tri">▾</span>全局</div><div class="gb">') && nav(s).includes('data-g="样例系统/concepts"><span class="tri">▸</span>概念 · 按主题</div><div class="gb" hidden>') && nav(s).includes('data-g="样例系统/flows"><span class="tri">▸</span>流程<i class="open">7</i></div><div class="gb" hidden>'), '', { OPEN: { '样例系统/01-老人注册': 7, '样例系统/02-x': 2, '聊天 app/y': 5 } }],
  ['#flow/01-老人注册', (s) => nav(s).includes('data-g="样例系统/flows"><span class="tri">▾</span>流程</div><div class="gb">') && nav(s).includes('data-g="样例系统/map"><span class="tri">▸</span>全局</div><div class="gb" hidden>')],
  ['#concepts/g2', (s) => nav(s).includes('data-g="样例系统/concepts"><span class="tri">▾</span>概念 · 按主题</div><div class="gb">') && nav(s).includes('href="#样例系统/concepts/g2" class="sub on"')],
  ['#共享内核/kernel', (s) => nav(s).includes('data-g="共享内核/concepts"><span class="tri">▾</span>概念</div><div class="gb">')],
  // ---- 多个上下文 ----
  // 单开的样例有两个上下文画了业务：两段都展开时各列各的全局图、概念、流程；红点按各自的流程
  ['#map', (s) => nav(s).includes('href="#样例系统/concepts/g2"') && nav(s).includes('href="#排版系统/map"') && nav(s).includes('href="#排版系统/concepts/p1"') && nav(s).includes('href="#排版系统/flow/01-排申报表" class="sub">排申报表<i class="open">1</i>') && nav(s).includes('排版系统<small>1 条没答</small>') && nav(s).includes('老人注册<i class="open">2</i>'), "Shell.show('排版系统'); render()"],
  // hash 带上下文切过去：主区画排版系统的全局图，左边栏它那一行亮、展开
  ['#排版系统/map', (s) => s.includes('申报表排版') && !s.includes('参与者档案与她名下的钱') && nav(s).includes('class="cx on" data-cx="排版系统"') && nav(s).includes('▾</span>排版系统') && nav(s).includes('href="#排版系统/map" class="sub on"')],
  ['#排版系统/map', inBounds],
  // 跨上下文的虚框：标题照自己的，小字标出处；不抛错
  ['#排版系统/concepts/p1', (s) => s.includes('>申报行</text>') && s.includes('样例系统 · g5 ›') && s.includes('共享内核 ›') && s.includes('data-cx="样例系统"') && s.includes('data-cx="共享内核"')],
  ['#排版系统/concepts/p1', inBounds],
  // 点虚框：别的上下文的跳到那边那张概念图，共享内核的跳共享内核那页，本上下文的照旧
  ['#排版系统/concepts/p1', (s) => s.includes('<!--h1:样例系统/concepts/g5-->') && s.includes('<!--h2:共享内核/kernel-->') && s.includes('<!--h3:排版系统/concepts/p1-->'),
    "openStub({ cx: '样例系统', g: 'g5' }); els.main.innerHTML += '<!--h1:' + location.hash + '-->'; openStub({ cx: '共享内核', g: '共享内核' }); els.main.innerHTML += '<!--h2:' + location.hash + '-->'; openStub({ g: 'p1' }); els.main.innerHTML += '<!--h3:' + location.hash + '-->'"],
  // 没画业务的上下文：还没画
  ['#聊天 app/map', (s) => s.includes('还没画') && nav(s).includes('业务还没画')],
  // 地址里的主题号、流程名这个上下文没有：说一句，不抛错
  ['#排版系统/concepts/g2', (s) => s.includes('排版系统 里没有主题 g2')],
  ['#排版系统/flow/01-老人注册', (s) => s.includes('排版系统 里没有流程 01-老人注册')],
  // 工作台注入 BIZ：旧 hash 落到第一个上下文
  ['#map', (s) => s.includes('评估与通知书') && !s.includes('聊天与群') && nav(s).includes('class="cx on" data-cx="样例系统"'), '', TWO],
  ['#concepts/g1', (s) => s.includes('评估与通知书') && s.includes('class="nd"') && nav(s).includes('class="cx on" data-cx="样例系统"'), '', TWO],
  ['', (s) => s.includes('评估与通知书') && nav(s).includes('href="#样例系统/map" class="sub on"'), '', TWO],
  // 注入的沟通 app：跨上下文虚框用那边主题的颜色、标出处；主题号撞上本上下文的不当成自己的、那边找不到主题就灰框；共享内核灰框
  ['#沟通 app/concepts/a1', (s) => s.includes('样例系统 · g1 ›') && s.includes('共享内核 ›') && s.includes('样例系统 · a1 ›') && s.includes('fill:var(--c2)') && (s.match(/class="nd/g) ?? []).length === 1 && (s.match(/class="stub"/g) ?? []).length === 3 && nav(s).includes('class="cx on" data-cx="沟通 app"') && nav(s).includes('href="#沟通 app/flow/01-x" class="sub">聊一句<i class="open">2</i>'), '', TWO],
  ['#沟通 app/concepts/a1', inBounds, '', TWO],
  // 答的时候 context 是当前上下文
  ['#沟通 app/flow/01-x', (s) => s.includes('"context":"沟通 app"') && s.includes('"flow":"01-x"') && s.includes('"ask":"a-1"') && s.includes('"text":"能"'),
    "answerQa({ flow: '01-x', step: '1', kind: 'ask', id: 'a-1', opt: '能' }); els.main.innerHTML += '<!--posted:' + JSON.stringify(__posted) + '-->'", TWO],
  // UI 设计问的问题：小字「UI 设计问 · N-01 屏名」，链到界面页那一屏；屏名找不到照 screen 原文
  ['#沟通 app/flow/01-x', (s) => s.includes('<a class="scr" href="/sample-care/%E7%95%8C%E9%9D%A2#样例系统/N-01/notice"><text class="s by"') && s.includes('UI 设计问 · N-01 照决定通知书填') && s.includes('UI 设计问 · N-02/zz') && s.includes('href="/sample-care/%E7%95%8C%E9%9D%A2#沟通 app/N-02/zz"'), '', TWO],
  ['#沟通 app/flow/01-x', inBounds, '', TWO],
  // 单开：样例排版系统流程上的问题指旁边界面那份小样
  ['#排版系统/flow/01-排申报表', (s) => s.includes('UI 设计问 · N-09/form') && s.includes('href="../界面/小样.html#排版系统/N-09/form"') && s.includes('class="it ask pending"')],
  // ---- 排版：不截、不横着滚 ----
  // 全局图：一排三个主题放不下，蛇形折成两行（第三个在第二个正下方），画布不比主区宽
  ['#沟通 app/map', (s) => { const t = topics(s), by = Object.fromEntries(t.map((x) => [x.id, x])); return t.length === 3 && by.a1.y === by.a2.y && by.a3.y > by.a2.y && by.a3.x === by.a2.x && svgW(s) <= AVAIL && !/<svg[^>]*viewBox/.test(s) }, '', ROW3],
  ['#沟通 app/map', inBounds, '', ROW3],
  // 人排了好几排、又比主区宽的（样例三列两排）：整张等比缩到主区宽，带 viewBox
  ['#map', (s) => svgW(s) <= AVAIL && /<svg width="\d+" height="\d+" viewBox="0 0 \d+ \d+">/.test(s)],
  // 概念图：只连虚框的虚框挨着它连的那一头、同一侧。月结单（连进主题框）在左、明细行（它的下一层）紧贴在它正下方；
  // 老人只连别的虚框，放右边；它连的档案、计划、余额在它右边一列；档案连的两份文件再往右一列；基金和余额（上下层）同一列、余额在下；
  // 共享内核的老人、家属同一出处，同一列上下挨着；右边整片往上收，老人跟主题框齐平，不吊在下面
  ['#沟通 app/concepts/a2', (s) => { const p = stubs(s), f = grp(s), right = f.x + f.w
    return p.stmt.x < f.x && p.detail.x === p.stmt.x && p.detail.y > p.stmt.y && p.old.x > right && p.file.x > p.old.x && p.careplan.x === p.file.x && p.bal.x === p.file.x
      && p['notice-doc'].x > p.file.x && p.plan.x === p['notice-doc'].x && p.fund.x === p.bal.x && p.bal.y > p.fund.y && p.fam.x === p.old.x && p.fam.y > p.old.y && p.old.y < f.y + f.h && svgW(s) <= AVAIL }, '', ROW3],
  ['#沟通 app/concepts/a2', inBounds, '', ROW3],
  // ---- 线不穿过两端以外的框 ----
  // 两样单据并列在上、下一层两样在下；左边虚框连的那样单据排到左边，线直接进、不横穿另一样；同一层右边那个绕开左边那个
  ['#concepts/g6', (s) => { const n = Object.fromEntries([...s.matchAll(/<g class="nd[^"]*" data-n="([^"]+)"><rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [m[1], { x: +m[2], y: +m[3] }]))
    return through(s) && n.inv.y === n.reimb.y && n.exp.y > n.inv.y && n.flow.y === n.exp.y && n.reimb.x < n.inv.x }, '', DOCS],
  ['#concepts/g6', inBounds, '', DOCS],
  ['#concepts/g2', through],
  ['#沟通 app/concepts/a1', through, '', TWO],
  ['#沟通 app/concepts/a2', through, '', ROW3],
  ['#排版系统/concepts/p1', through],
  // ---- 说明卡、角色标签不压框，也不叠别的卡 ----
  ['#concepts/g6', (s) => covers(s) && through(s), "document.getElementById('main').clientWidth = 1172; render()", G6NOW],
  ['#concepts/g6', (s) => covers(s) && through(s), '', G6NOW],
  ['#concepts/g6', covers, '', DOCS],
  ['#concepts/g2', covers],
  // 概念带对照表：图下面一张表，列名一行、一行一个 tr，缺的格补空、字照样转义；没带表的概念不画
  ['#concepts/g2', (s) => { const t = s.slice(s.indexOf('<div class="ctbl"'))
    return (s.match(/class="ctbl"/g) ?? []).length === 1 && t.includes('data-n="file"') && (t.match(/<th>/g) ?? []).length === 3 && (t.match(/<tr>/g) ?? []).length === 3 && t.includes('<td>a&lt;b</td>') && t.includes('<td></td>') && s.indexOf('class="legend"') < s.indexOf('class="ctbl"') },
    "CONCEPTS.g2.concepts[0].table = { columns: ['角色', '登进来先到', '做得了的事'], rows: [['照护伙伴', '首页', 'a<b'], ['老人', '我的群']] }; render()"],
  ['#沟通 app/concepts/a1', covers, '', TWO],
  ['#沟通 app/concepts/a2', covers, '', ROW3],
  ['#排版系统/concepts/p1', covers],
  // ---- 上下文地图：线按条数撑开，卡不重叠、不压别的线，框里的字不截，不出画布 ----
  ['#cxmap', (s) => cardsClear(s) && cxLines(s).length === 8 && svgW(s) <= AVAIL, '', CX8],
  ['#cxmap', inBounds, '', CX8],
  ['#cxmap', (s) => boxText(s, 'c1', CX8.PROJECT.contexts[0].role) && boxText(s, 'c2', CX8.PROJECT.contexts[1].role), '', CX8],
  // 框高盖住所有线的出入点；事件在上、查询在下
  ['#cxmap', (s) => { const b = cxBox(s, 'c1'), l = cxLines(s), cs = [...s.matchAll(/<g class="(evt|qry)"><rect x="[^"]+" y="([^"]+)"/g)].map((x) => [x[1], +x[2]])
    return l.length === 8 && l.every((x) => x.y > b.y && x.y < b.y + b.h) && Math.max(...cs.filter((x) => x[0] === 'evt').map((x) => x[1])) < Math.min(...cs.filter((x) => x[0] === 'qry').map((x) => x[1])) }, '', CX8],
  // ---- 答过的不出现 ----
  // 答了一个问题：那一条不画了，左边栏少一条；这一步还有待定的规则，框照旧展开（虚线还是一步一条）
  ['#flow/01-老人注册', (s) => !s.includes('class="it ask') && !s.includes('能，标待核') && (s.match(/class="lead"/g) ?? []).length === 3 && s.includes('class="qa side open pending" data-step="5"') && s.includes('▾ 说明 · 规则 2 条 · 待定 1<') && nav(s).includes('老人注册<i class="open">1</i>'),
    "answerQa({ flow: '01-老人注册', step: '5', kind: 'ask', id: 'a-1', opt: '能，标待核' })"],
  // 旧数据：规则有 answer 但 status 还是待定，照定了的画（灰卡、没有选项、不出答），也不算没答
  ['#flow/01-老人注册', (s) => !s.includes('class="it rule pending"') && (s.match(/class="it rule done"/g) ?? []).length === 2 && !s.includes('data-kind="rule"') && !s.includes('旧答法') && nav(s).includes('老人注册<i class="open">1</i>'),
    "FLOWS[0].steps[4].rules[0].answer = '旧答法'; render()"],
  // ---- 右边框：展开、折叠 ----
  // 有待定的规则、没答的问题：默认展开，标题 ▾ 写条数；来源小字在那条底下；只有说明的第 3、8 步不折、没有标题
  ['#flow/01-老人注册', (s) => s.includes('class="qa side open pending" data-step="5"') && s.includes('▾ 说明 · 规则 2 条 · 待定 1 · 问 1') && s.includes('档案是以后一切的底') && s.includes('来源：§6.6 行 562–568') && s.includes('class="qa side only done" data-step="3"') && (s.match(/class="tog"/g) ?? []).length === 1 && sidesClear(s)],
  // 全定了：默认折起来，只露标题 ▸，单子（连说明）不画
  ['#flow/01-老人注册', (s) => s.includes('class="qa side shut done" data-step="5"') && s.includes('▸ 说明 · 规则 2 条') && !s.includes('class="it') && !s.includes('档案是以后一切的底') && !s.includes('data-kind=') && sidesClear(s),
    "answerQa({ flow: '01-老人注册', step: '5', kind: 'rule', id: 'r-1', opt: '照通知书为准，不让手改' }); answerQa({ flow: '01-老人注册', step: '5', kind: 'ask', id: 'a-1', opt: '能，标待核' })"],
  // 点标题：展开的折起来，框变矮、下面的步往上收，不相压；再点又展开
  ['#flow/01-老人注册', (s) => { const [a, b] = s.split('<!--2-->'), sa = sides(a), sb = sides(b)
    return a.includes('class="qa side shut pending" data-step="5"') && a.includes('▸ 说明 · 规则 2 条 · 待定 1 · 问 1') && !a.includes('class="it') && sidesClear(a)
      && b.includes('class="qa side open pending" data-step="5"') && b.includes('class="it rule pending"') && sidesClear(b) && sa[2].top < sb[2].top && sa[1].h < sb[1].h },
    "toggleSide({ flow: '01-老人注册', step: '5', open: '1', pend: '1' }); const a = els.main.innerHTML; toggleSide({ flow: '01-老人注册', step: '5', open: '0', pend: '1' }); els.main.innerHTML = a + '<!--2-->' + els.main.innerHTML"],
  // 全定了的点开：单子出来，定了的灰、没有按钮；画布不出界
  ['#flow/01-老人注册', (s) => s.includes('class="qa side open done" data-step="5"') && (s.match(/class="it rule done"/g) ?? []).length === 2 && !s.includes('data-kind=') && sidesClear(s) && inBounds(s),
    "answerQa({ flow: '01-老人注册', step: '5', kind: 'rule', id: 'r-1', opt: '照通知书为准，不让手改' }); answerQa({ flow: '01-老人注册', step: '5', kind: 'ask', id: 'a-1', opt: '能，标待核' }); toggleSide({ flow: '01-老人注册', step: '5', open: '0', pend: '0' })"],
  // 折着的时候有了要答的（这里是把记下的「折」当成全定了时点的）：不作数，照默认展开
  ['#flow/01-老人注册', (s) => s.includes('class="qa side open pending" data-step="5"'),
    "toggleSide({ flow: '01-老人注册', step: '5', open: '1', pend: '0' })"],
  // ---- 流程：参与方多也不截、不横滚 ----
  // 主区 1280：收窄泳道就放得下，不缩；名牌跟生命线对齐；问题卡和 8 个选项按钮都在画布里
  ['#flow/00-x', (s) => svgW(s) <= 1280 - 76 && +s.match(/<div class="heads" style="width:([0-9]+)px/)[1] <= 1280 - 76 && !s.includes('class="hds"') && hdAligned(s) && (s.match(/class="btn/g) ?? []).length === 8,
    "document.getElementById('main').clientWidth = 1280; render()", FLOW4],
  ['#flow/00-x', inBounds, "document.getElementById('main').clientWidth = 1280; render()", FLOW4],
  // 主区 980（1280 宽的屏）：泳道收到最窄还放不下，整张等比缩；名牌那一排包一层、用同一个比例缩，列位还跟生命线对齐
  ['#flow/00-x', (s) => { const k = s.match(/<div class="hds"[^>]*transform:scale[(]([0-9.]+)[)]/), hw = s.match(/<div class="heads" style="width:([0-9]+)px;height:([0-9]+)px"/), vb = s.match(/<svg width="([0-9]+)" height="[0-9]+" viewBox="[0-9.]+ [0-9.]+ ([0-9.]+) /)
    return !!k && !!hw && !!vb && svgW(s) <= 980 - 76 && +hw[1] === +vb[1] && Math.abs(+vb[1] / +vb[2] - +k[1]) < 0.01 && hdAligned(s) && (s.match(/class="btn/g) ?? []).length === 8 },
    "document.getElementById('main').clientWidth = 980; render()", FLOW4],
  ['#flow/00-x', inBounds, "document.getElementById('main').clientWidth = 980; render()", FLOW4],
  // 子主题：分了子主题的主题先画子主题图（画法同全局图），两个子主题框、一条线，不出画布
  ['#样例系统/concepts/g6', (s) => topics(s).map((t) => t.id).join() === 'g6-1,g6-2' && s.includes('2 个子主题') && s.includes('报销的一行') && inBounds(s), '', SPLIT],
  // 左边栏：子主题缩进列在主题下面
  ['#样例系统/concepts/g6', (s) => /服务发生与扣费<\/a><a [^>]*class="sub2[^"]*"[^>]*>服务发生<\/a><a [^>]*class="sub2[^"]*"[^>]*>报销<\/a>/.test(nav(s)), '', SPLIT],
  // 子主题的概念图：路径写 全局图 › 主题 › 子主题；自己的数据是实框，另一个子主题的是虚框，小字写「主题 · 子主题」，点了进那个子主题
  ['#样例系统/concepts/g6/g6-1', (s) => s.includes('<a href="#concepts/g6">服务发生与扣费</a><span class="sep">›</span>服务发生</h1>') && s.includes('data-n="rec"') && Object.keys(stubs(s)).includes('reimb') && s.includes('data-s="g6-2"') && s.includes('服务发生与扣费 · 报销 ›') && inBounds(s), '', SPLIT],
  ['#样例系统/concepts/g6/g6-1', (s) => s.includes('concepts/g6/g6-2-->'), "openStub({ g: 'g6', s: 'g6-2' }); els.main.innerHTML += '<!--h:' + location.hash + '-->'", SPLIT],
  // 别的主题指进来、没写 sub：照数据在哪一份找到子主题
  ['#样例系统/concepts/g2', (s) => s.includes('data-s="g6-2"') && s.includes('服务发生与扣费 · 报销 ›'), '', SPLIT],
  // 子主题图上指着线：底下那几条从两份子主题概念图里找
  ['#样例系统/concepts/g6', (s) => s.includes('<!--fine:2-->'), "els.main.innerHTML += '<!--fine:' + fineSubEdges('g6', 'g6-1', 'g6-2').length + '-->'", SPLIT],
  // 地址里的子主题没有：说一句，不抛错
  ['#样例系统/concepts/g6/g6-9', (s) => s.includes('里没有子主题 g6-9'), '', SPLIT],
  // ---- 业务（模块业务）的主题页：从上到下五块，每块能收起 ----
  // 五块的顺序和标题；默认都收着：每块只有一行（三角、标题、一句提示），没有展开的内容、没有「收起」，窗口关着
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s), hs = [...m.matchAll(/<div class="sec[^"]*" data-sec="([a-z]+)"><div class="sh" data-sec-toggle="样例系统\/g2\/[a-z]+"><span class="tri">(.)<\/span><b>([^<]+)<\/b><span class="hint">/g)]
    return hs.map((x) => x[1]).join() === 'intro,tours,core,purposes,asks' && hs.map((x) => x[3]).join() === '业务概述,主要流程速览,核心数据和概念,业务目的及方案,待定' && hs.every((x) => x[2] === '▸')
      && !m.includes('class="sb"') && !m.includes('收起') && popup(s) === '' && s.includes('参与者档案与她名下的钱 <span class="kind">· 业务</span></h1>') }],
  // 收着时的那句提示：业务概述是一句简介，别的是数出来的；待定有没答的标红
  ['#样例系统/module/g2', (s) => secOf(s, 'intro').includes('<span class="hint">注册服务方替每位老人留一份档案，并管着政府开在她名下的钱。</span>') && secOf(s, 'tours').includes('<span class="hint">最常走的 2 条流程：谁做了什么、碰到哪些概念</span>')
    && secOf(s, 'core').includes('<span class="hint">2 样核心数据，1 份状态转换流程</span>') && secOf(s, 'purposes').includes('<span class="hint">2 条业务目的</span>') && secOf(s, 'asks').includes('<div class="sec red" data-sec="asks">') && secOf(s, 'asks').includes('<span class="hint">5 条没答</span>')],
  ['#样例系统/module/g5', (s) => secOf(s, 'core').includes('<span class="hint">4 样核心数据，3 份状态转换流程</span>') && secOf(s, 'purposes').includes('<span class="hint">3 条业务目的</span>') && secOf(s, 'asks').includes('<span class="hint">4 条没答</span>')],
  // 展开一块：三角朝下、右上角有「收起」、内容出来；别的块照旧收着。展开的是哪几块只记在内存里，页面不往本机存
  ['#样例系统/module/g2', (s) => secOf(s, 'core').includes('<div class="sec open" data-sec="core">') && secOf(s, 'core').includes('<span class="tri">▾</span>') && secOf(s, 'core').includes('<span class="fold">▾ 收起</span></div><div class="sb">')
    && count(mainHtml(s), 'class="sb"') === 1 && count(mainHtml(s), '<span class="tri">▸</span>') === 4 && !html.includes("'dev-team-lite/业务/业务概述'"), open('g2', 'core')],
  // 点一块的标题行：收着的展开，再点收起
  ['#样例系统/module/g2', (s) => { const [a, b] = mainHtml(s).split('<!--2-->'); return a.includes('<div class="sec open" data-sec="tours">') && !b.includes('<div class="sec open"') },
    "fire(els.main.on.click, { target: at({ '[data-sec-toggle]': { dataset: { secToggle: '样例系统/g2/tours' } } }) }); const a = els.main.innerHTML; fire(els.main.on.click, { target: at({ '[data-sec-toggle]': { dataset: { secToggle: '样例系统/g2/tours' } } }) }); els.main.innerHTML = a + '<!--2-->' + els.main.innerHTML"],
  // 页面上不再有功能、内部流程、工作流程三个页签；「工作流程」一律叫「状态转换流程」
  ['#样例系统/module/g5', (s) => !mainHtml(s).includes('工作流程') && !mainHtml(s).includes('class="mtabs') && mainHtml(s).includes('状态转换'), open('g5', ...ALL)],
  // 写着锁的：标题下面说一句谁正在改
  ['#样例系统/module/g2', (s) => mainHtml(s).includes('<p class="lock">业务正在改这一份（补功能）。') && mainHtml(s).indexOf('class="lock"') < mainHtml(s).indexOf('class="sec'), "MODULES.g2.locked = { role: '业务', step: '补功能' }; render(); delete MODULES.g2.locked"],
  // 没写业务的主题、没有的主题：说一句
  ['#样例系统/module/g2', (s) => s.includes('这个主题的业务还没写'), '', STAGES],
  ['#样例系统/module/g9', (s) => s.includes('里没有主题 g9'), '', STAGES],
  // 旧写法的数据（没有概述、流程速览、核心数据、业务目的）：五块照出，空的那几块提示还没写、展开了也说一句
  ['#样例系统/module/g6', (s) => count(mainHtml(s), '<div class="sec') === 5 && secOf(s, 'intro').includes('<span class="hint">还没写</span>') && secOf(s, 'intro').includes('业务概述还没写。') && secOf(s, 'tours').includes('主要流程速览还没写。')
    && secOf(s, 'core').includes('<span class="hint">0 样核心数据，1 份状态转换流程</span>') && secOf(s, 'purposes').includes('<span class="hint">还没写</span>') && secOf(s, 'asks').includes('<span class="hint">1 条没答</span>'), open('g6', ...ALL), STAGES],

  // ---- 第一块：业务概述，三个页签 ----
  // 默认看模块职责：最上面先放背景，下面职责一条一行
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'intro')
    return t.includes('<div class="stabs"><button data-intro-tab="duty" data-key="样例系统/g2" class="on">模块职责</button><button data-intro-tab="users" data-key="样例系统/g2">使用模块的角色</button><button data-intro-tab="usual" data-key="样例系统/g2">典型流程</button></div>')
      && count(t, 'data-intro-tab=') === 3 && t.includes('<div class="lab">背景</div><div class="bg">政府批给老人的钱开在她名下，由 Services Australia 保管；')
      && t.includes('<ul class="duty"><li>管每位老人的档案和她名下的基金、账户：建档，记下她签了协议、分到了资金，按申报从账户扣款。</li><li>不管评估怎么做、服务怎么排、发票怎么开。</li></ul>') && t.indexOf('class="bg"') < t.indexOf('class="duty"') }, open('g2', 'intro')],
  // 使用模块的角色：一人一张卡；这一栏不放背景
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'intro'); return t.includes('<button data-intro-tab="users" data-key="样例系统/g2" class="on">使用模块的角色</button>') && t.includes('<div class="who"><div><b>照护伙伴</b><div class="aim">替老人把档案建好、记准，钱到了就能开始用</div><ol><li>照决定通知书给她建档</li>') && !t.includes('class="bg"') },
    "introTab['样例系统/g2'] = 'users'; " + open('g2', 'intro')],
  // 点页签换一栏：典型流程一步一行
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'intro'); return t.includes('<button data-intro-tab="usual" data-key="样例系统/g2" class="on">典型流程</button>') && t.includes('<ol><li>照护伙伴照决定通知书给老人建档</li>') },
    open('g2', 'intro') + "; fire(els.main.on.click, { target: at({ '[data-intro-tab]': { dataset: { key: '样例系统/g2', introTab: 'usual' } } }) })"],
  // 模块职责还是一段话的：按句号、分号拆开；背景没写的不出那一段
  ['#样例系统/module/g2', (s) => secOf(s, 'intro').includes('<div class="io"><ul class="duty"><li>甲；</li><li>乙。</li></ul></div>'), "MODULES.g2.intro.duty = '甲；乙。'; delete MODULES.g2.intro.context; " + open('g2', 'intro')],

  // ---- 第二块：主要流程速览 ----
  // 有几条流程就几个页签，下面一句说明，再下面是流程图：一步一个带编号的动作框，角色在框上方
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'), bs = tourBoxes(t)
    return t.includes('<div class="ptabs"><button data-tour-tab="0" data-key="样例系统/g2" class="on">一位老人从建档到分到资金</button><button data-tour-tab="1" data-key="样例系统/g2">做了服务以后从基金账户扣款</button></div><p class="tn">照护伙伴替一位新来的老人建档；')
      && count(t, '<svg') === 1 && bs.map((b) => b.n).join() === '1,2,3,4,5,6' && [1, 2, 3, 4, 5, 6].every((n) => t.includes('<text class="no"') && new RegExp('<text class="no"[^>]*>' + n + '</text>').test(t))
      && count(t, '<g class="tr">') === 6 && t.includes('>卫生部</text>') && bs.every((b) => new RegExp('<g class="tr"><rect x="' + (b.x + 16) + '" y="' + (b.y - 22) + '"').test(t)) }, open('g2', 'tours')],
  // 用到的功能是框下面的标签，画了 rect 来接点击，点了看功能图解；没写功能的那一步（别的主题办的）是灰色虚线框、下面没有标签
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'), bs = tourBoxes(t), tag = t.match(/<g class="tg" data-pop="fn:f-1"><rect x="([-\d.]+)" y="([-\d.]+)" width="[\d.]+" height="20" rx="6"\/><text [^>]*>f-1 照决定通知书建立参与者档案<\/text><\/g>/)
    return !!tag && +tag[1] === bs[1].x && +tag[2] > bs[1].y + bs[1].h && count(t, '<g class="tg"') === 3 && count(t, '<g class="tb ext"') === 3 && /<g class="tb ext" data-step="1">/.test(t) && /<g class="tb" data-step="2">/.test(t) && html.includes('.tf .tb.ext rect{fill:var(--area);stroke:var(--ink-3);stroke-dasharray:5 4}') && html.includes('svg text{font:12px') && html.includes('pointer-events:none') }, open('g2', 'tours')],
  // 这一步碰到的概念骑在它和下一步之间的线上（在这一步的框右边、下一步的框左边）；核心数据和它装着的概念能点
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'), bs = tourBoxes(t), c = t.match(/<g class="tc core" data-pop="core:0"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="22" rx="4"\/><text [^>]*>参与者档案<\/text>/)
    return !!c && +c[1] > bs[1].x + bs[1].w && +c[1] + +c[3] < bs[2].x && Math.abs(+c[2] + 11 - (bs[1].y + bs[1].h / 2)) < 30 && t.includes('<g class="tc" data-pop="core:0:批到的分级和路径"><rect') && />决定通知书<\/text>/.test(t) && /<g class="tc"><rect[^>]*\/><text [^>]*>决定通知书/.test(t) && count(t, 'class="tl"') === 6 && count(t, 'marker-end="url(#a)"') === 5 }, open('g2', 'tours')],
  // 流程图不出横向滚动：放不下就换到下一行接着排，画布不比这一块里能用的宽度宽（主区 1240 时是 1132），画的东西都在画布里；窄了行更多
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'), bs = tourBoxes(t), rows = new Set(bs.map((b) => b.y)).size
    return svgW(t) <= 1240 - 68 - 40 && rows === 2 && bs[3].y > bs[2].y && bs[3].x === bs[0].x && !/<svg[^>]*viewBox/.test(t) && inBounds(t) && html.includes('.tour .tf{overflow:hidden}') && !t.includes('overflow') }, open('g2', 'tours')],
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'), bs = tourBoxes(t); return svgW(t) <= 820 - 68 - 40 && new Set(bs.map((b) => b.y)).size > 2 && bs.length === 6 && bs.every((b) => b.x + b.w <= 820 - 68 - 40) && inBounds(t) },
    "document.getElementById('main').clientWidth = 820; " + open('g2', 'tours')],
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'tours'); return svgW(t) <= 1240 - 68 - 40 && inBounds(t) && tourBoxes(t).length === 6 && count(t, '<g class="tb ext"') === 1 }, open('g5', 'tours')],
  // 换一条流程：点页签
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'tours'); return t.includes('<button data-tour-tab="1" data-key="样例系统/g2" class="on">做了服务以后从基金账户扣款</button>') && tourBoxes(t).length === 2 && t.includes('data-pop="fn:f-4"') && t.includes('data-pop="core:1:余额"') },
    open('g2', 'tours') + "; fire(els.main.on.click, { target: at({ '[data-tour-tab]': { dataset: { key: '样例系统/g2', tourTab: '1' } } }) })"],

  // ---- 第三块：核心数据和概念 ----
  // 照核心数据分组，一组一样核心数据；它装着的概念缩进排在下面。名字后面的标签：有同名状态图的带「状态转换 · N 个状态」，每组顶头那一行带「概念图」，别的行没有；写了栏的概念，标签最后是灰色的「N 栏」，默认收着
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'), g = t.split('<div class="cg">').slice(1)
    return g.length === 6 && g[0].startsWith('<div class="cr" style="padding-left:0px"><span class="chip core" data-pop="core:0">服务记录</span><span class="chip wf" data-pop="wf:w-1">状态转换 · 2 个状态</span><span class="chip cm" data-pop="concept:服务记录">概念图</span><span class="chip fc" data-fields="样例系统/g5/服务记录">6 栏 ▸</span><span class="nt">做了一次服务记一条：哪天、哪项服务、多少、多少钱。</span></div>')
      && g[0].includes('<div class="cr" style="padding-left:24px"><span class="chip part" data-pop="core:0:凭据">凭据</span><span class="chip fc" data-fields="样例系统/g5/凭据">3 栏 ▸</span><span class="nt">一条服务记录是照什么记下的：发票上的哪一行，或者老人交来的哪一张收据。</span></div>')
      && g[1].startsWith('<div class="cr" style="padding-left:0px"><span class="chip core" data-pop="core:1">照护管理记录</span><span class="chip cm" data-pop="concept:照护管理记录">概念图</span>')
      && g[2].includes('data-pop="core:2">申报行</span><span class="chip wf" data-pop="wf:w-3">状态转换 · 4 个状态</span><span class="chip cm"') && g[3].includes('data-pop="core:3:月结单明细">月结单明细</span><span class="chip fc" data-fields="样例系统/g5/月结单明细">2 栏 ▸</span><span class="nt">')
      && count(t, 'class="chip cm"') === 4 && count(t, 'class="chip wf"') === 3 && count(t, 'class="chip fc"') === 7 && !t.includes('<div class="fd"') && html.includes('.chip.fc{') }, OLD5 + open('g5', 'core')],
  // 每组最后：「记住对方ID」是概念图上和这样核心数据（或它装着的概念）连着线的资料；「被对方记住ID」是去处里带主题的数据，点了去那个主题
  ['#样例系统/module/g5', (s) => { const g = secOf(s, 'core').split('<div class="cg">').slice(1)
    return g[0].includes('<div class="cr" style="padding-left:24px"><i class="ld">记住对方ID</i><span class="chip res">服务清单</span><span class="nt">政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。</span></div>') && !g[0].includes('服务协议') && count(g.join(''), '<i class="ld">记住对方ID</i>') === 1
      && g[2].includes('<div class="cr" style="padding-left:24px"><i class="ld">被对方记住ID</i><a class="chip ext" href="#module/g2">基金账户<small>参与者档案与她名下的钱</small></a><span class="nt">一笔基金按批了的服务类型分开的账户，扣款只从对应的那一个扣。</span></div>') && count(g.join(''), '<i class="ld">被对方记住ID</i>') === 1 }, open('g5', 'core')],
  // 最下面的组，有才出：没连到哪一样核心数据的资料、不归哪一样核心数据的概念（也带状态转换标签）；样例里没有名字对不上概念的状态转换流程
  ['#样例系统/module/g5', (s) => { const g = secOf(s, 'core').split('<div class="cg">').slice(1)
    return g[4].startsWith('<div class="gl">用到的资料</div><div class="cr" style="padding-left:0px"><span class="chip res">服务协议</span><span class="nt">老人跟注册服务方签的那一份；')
      && g[5].startsWith('<div class="gl">不归哪一样核心数据的</div><div class="cr" style="padding-left:0px"><span class="chip part" data-pop="concept:发票行">发票行</span><span class="chip wf" data-pop="wf:w-2">状态转换 · 2 个状态</span><span class="chip fc" data-fields="样例系统/g5/发票行">4 栏 ▸</span><span class="nt">外部服务方开来的发票上的一行，对着一次服务。</span>') && !secOf(s, 'core').includes('名字对不上概念的状态转换流程') }, OLD5 + open('g5', 'core')],
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core'); return t.includes('<div class="gl">不归哪一样核心数据的</div><div class="cr" style="padding-left:0px"><span class="chip part" data-pop="concept:她名下的基金">她名下的基金</span><span class="nt">政府开在老人名下、替她保管的一笔钱。</span>')
    && t.includes('<i class="ld">被对方记住ID</i><a class="chip ext" href="#module/g5">申报行<small>服务发生与申报</small></a><span class="nt">向政府申报的一行，对着一条服务记录。</span>') && !t.includes('<div class="gl">用到的资料</div>') && !t.includes('<i class="ld">记住对方ID</i>') && count(t, '<div class="cg">') === 3 }, open('g2', 'core')],
  // 状态转换流程的名字对不上概念：那个概念后面没有标签，状态图列到最下面那一组
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'); return t.includes('data-pop="core:0">服务记录</span><span class="chip cm"') && t.includes('<div class="gl">名字对不上概念的状态转换流程</div><div class="cr" style="padding-left:0px"><b class="wn">服务记录的状态</b><span class="chip wf" data-pop="wf:w-1">状态转换 · 2 个状态</span>') },
    "MODULES.g5.workflows[0].title = '服务记录的状态'; " + open('g5', 'core')],
  // 三层上下层：一层缩进一格；资料连在装着的概念上也算这样核心数据用到的；去处里同一样数据、同一个主题只列一行；那个主题没写业务的，点了去它的概念图；说明取那边概念定义的头一句
  ['#样例系统/module/g1', (s) => { const t = secOf(s, 'core')
    return t.includes('style="padding-left:24px"><span class="chip part" data-pop="core:0:明细">明细</span><span class="chip wf" data-pop="wf:w-1">状态转换 · 1 个状态</span><span class="chip fc" data-fields="样例系统/g1/明细">1 栏 ▸</span><span class="nt">单据上的一行。</span>') && t.includes('style="padding-left:48px"><span class="chip part" data-pop="core:0:批注">批注</span><span class="nt">明细上的一句话。</span>')
      && t.includes('<span class="chip cm" data-pop="concept:单据">概念图</span><span class="chip fc" data-fields="样例系统/g1/单据">2 栏 ▸</span><span class="nt">一张单据。</span>') && t.includes('<i class="ld">记住对方ID</i><span class="chip res" data-pop="concept:模板">模板</span><span class="nt">开单照它抄。</span>')
      && count(t, '<i class="ld">被对方记住ID</i>') === 2 && t.includes('<a class="chip ext" href="#concepts/g2">货<small>库房</small></a><span class="nt">收进库房的货。</span>') && t.includes('<span class="chip ext">对账单<small>对账（财务系统）</small></span><span class="nt">告诉外面</span>')
      && t.includes('<div class="gl">用到的资料</div><div class="cr" style="padding-left:0px"><span class="chip res">名录</span>') && t.includes('<div class="gl">不归哪一样核心数据的</div><div class="cr" style="padding-left:0px"><span class="chip part" data-pop="concept:流水号">流水号</span>')
      && t.includes('<div class="gl">名字对不上概念的状态转换流程</div>') && t.includes('<b class="wn">对不上名字的</b><span class="chip wf" data-pop="wf:w-2">状态转换 · 2 个状态</span><span class="nt">这一份的名字不是概念</span>') }, open('g1', 'core'), DEEP],
  // 概念图上没连下来、parts 里写了的概念：接在第一层
  ['#样例系统/module/g1', (s) => secOf(s, 'core').includes('style="padding-left:24px"><span class="chip part" data-pop="core:0:没画的那一样">没画的那一样</span>'), "MODULES.g1.core[0].parts.push('没画的那一样'); " + open('g1', 'core'), fresh(DEEP)],
  // 没写核心数据的主题：概念图上的概念都列在「不归哪一样核心数据的」那一组，有同名状态图的照样带标签
  ['#样例系统/module/g6', (s) => { const t = secOf(s, 'core'); return count(t, '<div class="cg">') === 1 && t.includes('<div class="cg"><div class="gl">不归哪一样核心数据的</div>') && t.includes('<span class="chip part" data-pop="concept:报销">报销</span><span class="chip wf" data-pop="wf:w-1">状态转换 · 3 个状态</span>') && !t.includes('class="chip cm"') }, open('g6', 'core'), STAGES],
  // ---- 第三块里的栏：名字那一行后面的灰色标签「N 栏」----
  // 点「N 栏」：这一行下面一栏一行展开，标签上的三角朝下；再点收起。展开的是哪几个只记在内存里，页面不往本机存
  ['#样例系统/module/g5', (s) => { const [a, b] = mainHtml(s).split('<!--2-->')
    return a.includes('<span class="chip fc" data-fields="样例系统/g5/服务记录">6 栏 ▾</span>') && count(a, '<div class="fd"') === 6 && count(a, '栏 ▾</span>') === 1 && !b.includes('<div class="fd"') && b.includes('data-fields="样例系统/g5/服务记录">6 栏 ▸</span>') && !html.includes("'dev-team-lite/业务/栏") },
    OLD5 + open('g5', 'core') + "; const tap = () => fire(els.main.on.click, { target: at({ '[data-fields]': { dataset: { fields: '样例系统/g5/服务记录' } } }) }); tap(); const a = els.main.innerHTML; tap(); els.main.innerHTML = a + '<!--2-->' + els.main.innerHTML"],
  // 展开的一行：栏名加粗；写了 ref 的，后面蓝色小字「→ 数据名 · 主题名」，再后面灰字是 note；只有名字的只有栏名。缩进比它那个概念多一格
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core')
    return t.includes('<div class="fd" style="padding-left:24px"><b>老人</b><span class="rf">→ 参与者档案 · 参与者档案与她名下的钱</span><span class="nt">这一次服务是给哪一位老人做的。</span></div>')
      && t.includes('<div class="fd" style="padding-left:24px"><b>日期</b><span class="nt">这一次服务是哪天做的。</span></div>') && t.includes('<div class="fd" style="padding-left:24px"><b>数量</b></div>')
      // 指着的数据在同一个主题里、只写了 ref 的：只有「→ 数据名」
      && t.includes('<div class="fd" style="padding-left:48px"><b>发票行</b><span class="rf">→ 发票行</span><span class="nt">照发票记下的，写它对着发票上的哪一行。</span></div>') && html.includes('.fd .rf{font-size:11.5px;color:var(--accent-ink,var(--accent))}') },
    OLD5 + "fieldsOpen['样例系统/g5/服务记录'] = fieldsOpen['样例系统/g5/凭据'] = true; " + open('g5', 'core')],
  // 标签上的数和展开出来的行数一样：两个样例主题里带栏的概念全展开，一个一个数
  ...['g2', 'g5'].map((g) => ['#样例系统/module/' + g, (s) => { const rows = secOf(s, 'core').split('<div class="cr"').slice(1).filter((r) => r.includes('class="chip fc"'))
    return rows.length === (g === 'g2' ? 4 : 7) && rows.every((r) => +r.match(/>(\d+) 栏 ▾<\/span>/)[1] === count(r, '<div class="fd"')) },
    "for (const t of topicInfo('" + g + "').names) fieldsOpen['样例系统/" + g + "/' + t] = true; " + open(g, 'core')]),
  // 一栏指着的正是它下面装着的概念：不列，也不计入 N。指着谁看 ref，没写 ref 的看栏名：参与者档案的「批到的分级和路径」（写了 ref）「签了的服务协议」（只有栏名）、基金账户的「余额」都不列
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core')
    return t.includes('data-fields="样例系统/g2/参与者档案">7 栏 ▾</span>') && t.includes('data-fields="样例系统/g2/基金账户">2 栏 ▾</span>') && !t.includes('<b>批到的分级和路径</b>') && !t.includes('<b>签了的服务协议</b>') && !t.includes('<b>余额</b>')
      && t.includes('<b>她名下的基金</b><span class="rf">→ 她名下的基金</span>') && t.includes('<b>批了的服务类型</b><span class="rf">→ 服务类型 · 服务清单</span>')
      // 没有栏的概念不出标签
      && t.includes('data-pop="core:1:余额">余额</span><span class="nt">') && t.includes('data-pop="concept:她名下的基金">她名下的基金</span><span class="nt">') },
    "fieldsOpen['样例系统/g2/参与者档案'] = fieldsOpen['样例系统/g2/基金账户'] = true; " + open('g2', 'core')],
  ['#样例系统/module/g5', (s) => !secOf(s, 'core').includes('<b>凭据</b>') && secOf(s, 'core').includes('<b>凭据的种类</b>'), "fieldsOpen['样例系统/g5/服务记录'] = fieldsOpen['样例系统/g5/凭据'] = true; " + open('g5', 'core')],
  // 下面装着的概念照上下层的线一层层往下算（单据装着明细，明细装着批注）；核心数据 parts 里写了、概念图上没连下来的也算
  ['#样例系统/module/g1', (s) => { const t = secOf(s, 'core'); return t.includes('data-fields="样例系统/g1/单据">2 栏 ▾</span>') && count(t, '<div class="fd"') === 2 && t.includes('<b>单号</b>') && t.includes('<b>日期</b>') && !t.includes('<b>明细</b>') && !t.includes('<b>哪一句批注</b>') && !t.includes('<b>没画的那一样</b>') },
    "CONCEPTS.g1.concepts[0].fields.push({ title: '明细', ref: '明细' }, { title: '哪一句批注', ref: '批注' }, '没画的那一样'); MODULES.g1.core[0].parts.push('没画的那一样'); fieldsOpen['样例系统/g1/单据'] = true; " + open('g1', 'core'), fresh(DEEP)],

  // ---- 第四块：业务目的及方案 ----
  // 每条业务目的默认收着，标题行右边写有几条更细的目的；有「全部展开」「全部收起」；没写出处的标「推出来的，等你确认」；样例里没有要提醒的
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return count(t, '<div class="pu">') === 3 && !t.includes('<table>') && t.includes('<span class="no">p-1</span><span class="tx">交给政府的申报行要通得过政府的审核。</span><span class="cnt">3 条更细的目的</span>')
      && t.includes('<button data-purposes-all="1" data-key="样例系统/g5">全部展开</button><button data-purposes-all="0" data-key="样例系统/g5">全部收起</button>')
      && t.includes('每个月向老人交代清楚：用了哪些服务、花了多少钱。<span class="guess">推出来的，等你确认</span></span><span class="cnt">1 条更细的目的</span>') && count(t, 'class="guess"') === 1 && !t.includes('class="warn"') }, open('g5', 'purposes')],
  // 展开一条：先一行对着背景哪一句和出处，再一张表，一行一条更细的目的：左边是它的编号（目的自己带的固定的号）、更细的目的加粗、下面小字「做法」，右边是标签
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return count(t, '<div class="pu open">') === 1 && count(t, '<tr>') === 3 && t.includes('<div class="pf">背景里对着：政府审核通过才付钱　出处：人 2026-11-24 说：系统要提供出符合政府审核的申报项</div><table><tr><td><i class="nn">p-1.1</i><b>报上去的每一行都对得上一次真做了的服务。</b><div class="how"><i>做法</i>申报行只能从服务记录写出来，一条服务记录对一行。</div><div class="ns">出处：申报格式 v1.14 第 4 节</div></td><td><div class="tags">')
      // 标签：核心数据实心、别的数据空心、功能、响应（样式和功能分开），能点的带 data-pop
      && t.includes('<div class="tags"><span class="chip core" data-pop="core:2">申报行</span><span class="chip fn" data-pop="fn:f-5">f-5 把服务记录写成申报行并报给政府</span><span class="chip sv" data-pop="svc:s-1">s-1 找出还没有申报的服务记录</span></div>')
      && t.includes('<span class="chip core" data-pop="core:0">服务记录</span><span class="chip part">服务清单</span><span class="chip part">服务协议</span><span class="chip fn" data-pop="fn:f-1">')
      && t.includes('<span class="chip fn" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</span><span class="chip ch" data-pop="chain:c-2">c-2 申报行审核通过以后</span>') && html.includes('.chip.ch{') && html.includes('.chip.fn{') }, "purposeOpen['样例系统/g5/0'] = true; " + open('g5', 'purposes')],
  // 别的数据：装在核心数据里的点了看那样核心数据（那一格标黄），概念图上有的点了看概念图
  ['#样例系统/module/g5', (s) => secOf(s, 'purposes').includes('<div class="tags"><span class="chip part" data-pop="concept:发票行">发票行</span><span class="chip part" data-pop="core:0:凭据">凭据</span><span class="chip fn" data-pop="fn:f-2">'), "purposeOpen['样例系统/g5/1'] = true; " + open('g5', 'purposes')],
  // 点标题行展开、再点收起；全部展开、全部收起
  ['#样例系统/module/g5', (s) => { const [a, b, c, d] = mainHtml(s).split('<!--next-->'); return count(a, '<div class="pu open">') === 1 && count(b, '<div class="pu open">') === 0 && count(c, '<div class="pu open">') === 3 && count(c, '<tr>') === 7 && count(d, '<div class="pu open">') === 0 },
    open('g5', 'purposes') + "; const out = [], click = (map) => { fire(els.main.on.click, { target: at(map) }); out.push(els.main.innerHTML) }; click({ '[data-purpose]': { dataset: { key: '样例系统/g5', purpose: '1' } } }); click({ '[data-purpose]': { dataset: { key: '样例系统/g5', purpose: '1' } } }); click({ '[data-purposes-all]': { dataset: { key: '样例系统/g5', purposesAll: '1' } } }); click({ '[data-purposes-all]': { dataset: { key: '样例系统/g5', purposesAll: '0' } } }); els.main.innerHTML = out.join('<!--next-->')"],
  // 没写 aim 的旧写法：左边只有那一句，不出「做法」；这一条也没写 id，编号照先后数；没写对着背景哪一句、也没写出处的不出那一行
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'); return t.includes('</div><table><tr><td><i class="nn">1.1</i>只有一句的旧写法</td><td><div class="tags"><span class="chip core" data-pop="core:1">基金账户</span>') && !t.includes('class="pf"') },
    "const p = MODULES.g2.purposes[0]; delete p.from; delete p.source; p.needs = [{ text: '只有一句的旧写法', cores: ['基金账户'] }]; purposeOpen['样例系统/g2/0'] = true; " + open('g2', 'purposes')],
  // 最下面三行提醒，有才出：没有目的落到它上面的核心数据（指到待定）、没挂到目的上的功能、没挂到目的上的响应，都能点
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return t.includes('<div class="warn"><span>没有目的落到它上面的核心数据：</span><span class="chip core" data-pop="core:3">月结单</span><span>它是为了什么，见<a href="#module/g5/待定">待定</a>。</span></div>')
      && t.includes('<div class="warn"><span>没有挂到哪一条目的上的功能：</span><span class="chip fn" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</span><span class="chip fn" data-pop="fn:f-6">f-6 出这个月的月结单</span></div>') && t.includes('<div class="warn"><span>没有挂到哪一条目的上的响应：</span><span class="chip ch" data-pop="chain:c-2">c-2 申报行审核通过以后</span></div>') && count(t, 'class="warn"') === 3 },
    "MODULES.g5.purposes.pop(); MODULES.g5.purposes[0].needs.pop(); " + open('g5', 'purposes')],
  // 业务目的还没写的主题：说一句；功能和响应照样列在下面，点得开
  ['#样例系统/module/g6', (s) => { const t = secOf(s, 'purposes'); return t.includes('<p class="none">业务目的还没写。</p>') && !t.includes('全部展开') && t.includes('<span class="chip fn" data-pop="fn:f-1">f-1 登记老人先付的报销</span><span class="chip fn" data-pop="fn:f-2">') && t.includes('<span class="chip fn" data-pop="fn:f-3">f-3 作废服务记录</span>') && t.includes('<span class="chip ch" data-pop="chain:c-1">c-1 报销核过以后</span>') && !t.includes('没有目的落到它上面的核心数据') },
    open('g6', 'purposes'), STAGES],
  // 更细的目的写了出处的：做法下面一行小字写出处，不标；没写出处的：旁边标「推出来的」，没有出处那一行
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return count(t, '<tr>') === 7 && count(t, '<div class="ns">出处：') === 6 && count(t, '<span class="guess">推出来的</span>') === 1
      && t.includes('<tr><td><i class="nn">p-3.1</i><b>老人每个月看得到自己用了哪些服务、每一项花了多少钱。</b><span class="guess">推出来的</span><div class="how"><i>做法</i>月底把这个月的服务记录和照护管理记录汇总成月结单，一条记录列一行，发给老人。</div></td>')
      && t.includes('<b>做了的服务一次不漏。</b><div class="how"><i>做法</i>服务不管从哪里来，都要落成服务记录。</div><div class="ns">出处：人 2026-11-24 说：按照要求为服务留痕</div></td>') && html.includes('.pu .ns{') },
    "for (const i of [0, 1, 2]) purposeOpen['样例系统/g5/' + i] = true; " + open('g5', 'purposes')],
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'); return count(t, '<span class="guess">推出来的</span>') === 1 && t.includes('<b>看档案就知道她签没签服务协议、签的是哪一份。</b><span class="guess">推出来的</span><div class="how">') && count(t, '<div class="ns">出处：') === 3 },
    "for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'purposes')],

  // ---- 第五块：待定 ----
  // 展开：没答的红框带偏向和按钮，答了的灰框写答案
  ['#样例系统/module/g6', (s) => { const t = secOf(s, 'asks'); return t.includes('class="mask pending"') && t.includes('偏向：要') && t.includes('class="mask done"') && t.includes('答：一个月') && t.includes('data-module="g6" data-ask="q-1" data-opt="要"') && t.includes('data-other="1">另说</button>') }, open('g6', 'asks'), STAGES],
  // 从别处点待定的链接过来（地址带 /待定）：替人把待定那一块展开一次，别的块照旧收着，地址换成主题页的；人收起以后重画不再自己展开
  ['#样例系统/module/g2/待定', (s) => { const m = mainHtml(s); return secOf(s, 'asks').includes('<div class="sec open red" data-sec="asks">') && count(m, '<div class="sec open') === 1 && count(m, 'class="mask pending"') === 5 && m.includes('<!--at:#样例系统/module/g2,module/g2-->') },
    "els.main.innerHTML += '<!--at:' + location.hash + ',' + view + '-->'"],
  ['#样例系统/module/g2/待定', (s) => !mainHtml(s).includes('<div class="sec open'), "fire(els.main.on.click, { target: at({ '[data-sec-toggle]': { dataset: { secToggle: '样例系统/g2/asks' } } }) }); render()"],
  // 单开时点一个答法：只改内存里的那条、重画成答了，提示里的条数跟着减
  ['#样例系统/module/g2', (s) => count(secOf(s, 'asks'), 'class="mask pending"') === 4 && secOf(s, 'asks').includes('答：不让建') && secOf(s, 'asks').includes('<span class="hint">4 条没答</span>'), open('g2', 'asks') + "; answerModule({ module: 'g2', ask: 'q-1', opt: '不让建' })"],
  // 全答了：不标红，提示写都答了
  ['#样例系统/module/g5', (s) => secOf(s, 'asks').includes('<div class="sec" data-sec="asks">') && secOf(s, 'asks').includes('<span class="hint">4 条都答了</span>'), "answerModule({ module: 'g5', ask: 'q-1', opt: '是这个目的' }); answerModule({ module: 'g5', ask: 'q-2', opt: '是，一条记录列一行' }); answerModule({ module: 'g5', ask: 'q-3', opt: '为了查的时候说得清这一次服务是谁做的' }); answerModule({ module: 'g5', ask: 'q-4', opt: '这个月花掉的总数' })"],
  // 工作台上点：post 答，带主题、待定号、上下文、记号
  ['#样例系统/module/g6', (s) => s.includes('<!--posted:{"module":"g6","context":"样例系统","ask":"q-1","text":"要","sig":"abc"}-->'),
    "answerModule({ module: 'g6', ask: 'q-1', opt: '要' }); els.main.innerHTML += '<!--posted:' + JSON.stringify(__posted) + '-->'", { ...STAGES, WB: { project: 'x' } }],

  // ---- 窗口：点标签开一个 ----
  // 点主区里带 data-pop 的标签：开一个窗口；点窗口外面的空白、点它右上角的「关闭」、按 Esc 都关掉
  ['#样例系统/module/g2', (s) => { const [a, b, c, d] = s.split('<!--next-->'); return a.includes('<div class="pw" data-kind="fn">') && a.includes('<button class="x" data-pop-close="1">关闭 ✕</button>') && b === 'shut' && c === 'shut' && d.startsWith('shut') },
    "const out = [], see = () => out.push(els.pop.hidden ? 'shut' : els.pop.innerHTML), tap = () => fire(els.main.on.click, { target: at({ '[data-pop]': { dataset: { pop: 'fn:f-1' } } }) }); tap(); see(); fire(els.pop.on.click, { target: els.pop }); see(); tap(); fire(els.pop.on.click, { target: at({ '[data-pop-close]': {} }) }); see(); tap(); fire(docOn.keydown, { key: 'Escape' }); see(); els.main.innerHTML = out.join('<!--next-->')"],
  // 窗口只属于打开它的那个主题页：还在这一页重画（比如答了一条待定）照旧开着；换了页就关掉
  ['#样例系统/module/g2', (s) => popup(s).includes('data-kind="fn"') && popup(s).includes('照决定通知书建立参与者档案'), "popFrom('fn:f-1'); answerModule({ module: 'g2', ask: 'q-1', opt: '不让建' })"],
  ['#样例系统/module/g2', (s) => popup(s) === '' && s.includes('<svg'), "popFrom('fn:f-1'); view = 'map'; render()"],
  // 指不到东西的（功能号没有）：不开
  ['#样例系统/module/g2', (s) => popup(s) === '', "popFrom('fn:f-99')"],

  // ---- 窗口一：核心数据的看板 ----
  // 左边来路、中间核心数据、右边去处，下面一行用到的资料；几样核心数据排成页签，一次看一样。服务记录三条来路、两个去处，去处本身是另一样核心数据的，那个框能点
  ['#样例系统/module/g5', (s) => { const p = popup(s)
    return p.includes('<div class="pw" data-kind="core"><div class="ph"><b>服务记录</b><span class="in">核心数据</span>') && p.includes('<div class="ch">核心数据 <span>4 样，一次看一样</span></div><div class="ptabs"><button data-pop-tab="core:0" class="on">服务记录</button><button data-pop-tab="core:1">照护管理记录</button>')
      && count(p, '<div class="row">') === 5 && p.includes('<div class="d ev">外部服务方开来一张发票</div>') && !p.includes('class="d ext"') && p.includes('<div class="d  go" data-pop="core:2"><i>也是核心数据 ›</i><b>申报行</b>') && p.includes('<div class="d  go" data-pop="core:3"><i>也是核心数据 ›</i><b>月结单</b>')
      // 线上标创建、更新、删除；是哪项功能做的，点了看功能图解
      && p.includes('<span><u class="op new">创建</u>直接记下这一次服务<em class="lk" data-pop="fn:f-1">f-1 记下自己的工作者做的一次服务</em></span>')
      // 记住对方ID 的资料：只列概念图上和这样核心数据连着线的
      && p.includes('<div class="cu"><span>记住对方ID</span><b title="政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。">服务清单</b></div>') }, "popFrom('core:0')"],
  // 中间的框是类图的画法：核心数据的框里列出栏（写了 fields 的），套着它装着的概念，概念也列栏。
  // 栏照「核心数据和概念」那一块的规矩：指着下面装着的概念的不列（服务记录的「凭据」那一栏）；带说明或指向的，栏名加粗、后面是指向、下面一行小字是说明；只有名字的只写名字
  ['#样例系统/module/g5', (s) => { const p = popup(s)
    return p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>服务记录</div><div class="cb"><div class="fl"><b>老人</b><span class="rf">→ 参与者档案 · 参与者档案与她名下的钱</span><div class="fn">这一次服务是给哪一位老人做的。</div></div><div class="fl"><b>日期</b><div class="fn">这一次服务是哪天做的。</div></div><div class="fl"><b>服务项</b><span class="rf">→ 服务 · 服务清单</span><div class="fn">做的是服务清单上的哪一项。</div></div><div class="fl">数量</div><div class="fl">金额</div><div class="fl"><b>做服务的人</b><div class="fn">自己的工作者，或者外部服务方。</div></div>'
        + '<div class="kids"><div class="cls part"><div class="ct">凭据</div><div class="cb"><div class="fl"><b>凭据的种类</b><div class="fn">发票上的一行，或者老人交来的收据。</div></div><div class="fl"><b>发票行</b><span class="rf">→ 发票行</span><div class="fn">照发票记下的，写它对着发票上的哪一行。</div></div><div class="fl"><b>收据</b><div class="fn">照收据记下的，写它对着老人交来的哪一张收据。</div></div></div></div></div></div></div>')
      && !p.includes('<div class="fl"><b>凭据</b>') && !p.includes('<div class="fl">凭据</div>') && !p.includes('class="cls part hi"') }, OLD5 + "popFrom('core:0')"],
  // 没写 ref、栏名等于下面装着的概念的也不列：参与者档案的看板上没有「批到的分级和路径」「签了的服务协议」这两栏，这两个概念套在框里
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>参与者档案</div>') && count(p.split('<div class="kids">')[0], '<div class="fl">') === 7 && !p.includes('<div class="fl"><b>批到的分级和路径</b>') && !p.includes('<div class="fl">签了的服务协议</div>')
    && p.includes('<div class="kids"><div class="cls part"><div class="ct">批到的分级和路径</div>') && p.includes('<div class="cls part"><div class="ct">签了的服务协议</div><div class="cb"><div class="fl"><b>签的协议</b><span class="rf">→ 服务协议 · 服务方与协议</span>') }, "popFrom('core:0')"],
  // 栏多的排成几列：6 栏以上 2 列，11 栏以上 3 列，16 栏以上 4 列，框上带 cols2、cols3、cols4；不到 6 栏的不分列。装着的概念那一排占满整行
  ['#样例系统/module/g5', (s) => s.includes('<!--cols:cls core|cls core cols2|cls core cols2|cls core cols3|cls core cols3|cls core cols4|cls core cols4-->')
    && html.includes('.cf .cls.cols2>.cb{grid-template-columns:repeat(2,auto)}.cf .cls.cols3>.cb{grid-template-columns:repeat(3,auto)}.cf .cls.cols4>.cb{grid-template-columns:repeat(4,auto)}') && html.includes('.cf .cls.cols4>.cb>.kids{grid-column:1/-1}'),
    "const out = []; for (const n of [5, 6, 10, 11, 15, 16, 30]) { CONCEPTS.g5.concepts[1].fields = Array.from({ length: n }, (_, i) => '栏' + i); popFrom('core:0'); out.push(els.pop.innerHTML.match(/class=.(cls core[a-z0-9 ]*).><div class=.ct.><i>核心数据<.i>服务记录/)[1]) } els.main.innerHTML += '<!--cols:' + out.join('|') + '-->'"],
  // 分列只数列出来的栏：指着下面装着的概念的那一栏不算（5 栏再加一栏「凭据」还是不分列）
  ['#样例系统/module/g5', (s) => popup(s).includes('<div class="cls core"><div class="ct"><i>核心数据</i>服务记录</div>'), "CONCEPTS.g5.concepts[1].fields = ['一', '二', '三', '四', '五', { title: '凭据', ref: '凭据' }]; popFrom('core:0')"],
  // 看板这一种窗口最宽 1880、四周留白小一些，字和间距比别的窗口小一号；别的窗口照旧最宽 1400。每个窗口上记着它是哪一种
  ['#样例系统/module/g5', (s) => s.includes('<!--kinds:core,fn-->') && html.includes('.pop .pw[data-kind="core"]{max-width:min(calc(100vw - 24px),1880px);padding:12px 16px 14px}') && html.includes('max-width:min(calc(100vw - 48px),1400px);padding:16px 22px 20px;')
    && html.includes('.cf .cls .fl{font-size:11.5px;') && html.includes('.cls .fl{font-size:12.5px;'),
    "popFrom('core:0'); popFrom('fn:f-1'); els.main.innerHTML += '<!--kinds:' + [...els.pop.innerHTML.matchAll(/<div class=.pw. data-kind=.([a-z]+)./g)].map((m) => m[1]).join() + '-->'"],
  // 点的是装着的概念：标题写「X　装在核心数据「Y」里」，下面是它的完整定义，图上那一格标黄
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="ph"><b>凭据</b><span class="in">装在核心数据「服务记录」里，下面图上标黄的那一格就是它</span>') && p.includes('<p class="pd">一条服务记录是照什么记下的：发票上的哪一行，或者老人交来的哪一张收据。自己的工作者做的服务没有凭据。</p>') && count(p, '<div class="cls part hi"><div class="ct">凭据</div>') === 1 && html.includes('.cls.hi{') }, "popFrom('core:0:凭据')"],
  // 概念里再套下一层：三层一层套一层；同一层横着排、放不下换行（kids 是能换行的一排）
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="kids"><div class="cls part"><div class="ct">明细</div><div class="cb"><div class="fl">数量</div><div class="kids"><div class="cls part hi"><div class="ct">批注</div></div></div></div></div></div>') && html.includes('.cls .kids{display:flex;flex-wrap:wrap;'), "popFrom('core:0:批注')", DEEP],
  // 看板里点页签：就在这个窗口里换到那一样。去处是别的主题的数据：画成别的主题的虚框，线上是这里办这件事的那项功能；没有连着线的资料就没有那一行
  ['#样例系统/module/g5', (s) => { const p = popup(s); return winKeys(p) === 'core:2' && p.includes('<button data-pop-tab="core:2" class="on">申报行</button>') && p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>申报行</div>') && count(p, '<div class="row">') === 2
    && p.includes('<u class="op upd">更新</u>审核通过的一行交去扣款<em class="lk" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</em></span></div><div class="tip"></div><div class="dw"><div class="d ext"><i>别的主题：参与者档案与她名下的钱</i><b>基金账户</b>') && !p.includes('class="cu"') },
    "popFrom('core:0'); fire(els.pop.on.click, { target: at({ '[data-pop-tab]': { dataset: { popTab: 'core:2' } } }) })"],
  // 只有一样核心数据：不出页签。这个主题还没有概念图的：用到的资料都列上，装着的概念照 parts
  ['#样例系统/module/g5', (s) => { const p = popup(s); return !p.includes('class="ptabs"') && p.includes('<div class="kids"><div class="cls part"><div class="ct">凭据</div></div></div>') && p.includes('<b title="老人跟注册服务方签的那一份；核对一项服务在不在她签的协议里，照它查。">服务协议</b>') },
    "MODULES.g5.core.length = 1; delete CONCEPTS.g5; popFrom('core:0')"],
  // 来路写了 heads：两个起点先各画一行、并到一起，再画后面只写一遍的站
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="d ev">起点甲</div>') && p.includes('<div class="d ev">起点乙</div>') && count(p, '<b>汇合的那一站</b>') === 1 && p.includes('<div class="row"><div class="col in fork">') },
    "MODULES.g5.core[0].sources.unshift({ heads: [{ steps: [{ data: '起点甲', event: true, by: '甲交来' }] }, { steps: [{ data: '起点乙', event: true, by: '乙交来' }] }], steps: [{ data: '汇合的那一站', by: '照它记下' }] }); popFrom('core:0')"],
  // 来路的起点是别的主题里发生的一件事：画成别的主题的虚框；线上的删除；旧数据里标着 change 的来路不画
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="d ext"><i>别的主题：上游的主题</i>上游那边一件事成了</div>') && p.includes('<u class="op del">删除</u>整份撤掉') && !p.includes('改了已有的那一条') },
    "const c = MODULES.g5.core[0]; c.sources.unshift({ steps: [{ data: '上游那边一件事成了', event: true, topic: '上游的主题', by: '照它记下' }] }); c.targets.unshift({ op: '删除', by: '整份撤掉', data: '草稿' }); c.sources.push({ change: true, steps: [{ data: '改了已有的那一条', event: true, by: '改' }] }); popFrom('core:0')"],

  // ---- 窗口二：没拆的功能（照旧的样子画）。g2 现在是拆过的，这几条先把它换回没拆的那一份（G2OLD）再看 ----
  // 标题、号、页面上的叫法、一句做了什么。左边一列：操作意图的卡片（下面列着对着的目的）；其余输入各一个框，框里上面一行灰字是谁给的、下面是名字，说明在框左边的小卡上
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="pw" data-kind="fn"><div class="ph"><b>照决定通知书建立参与者档案</b><span class="in">f-1 · 功能 · 页面上叫「建档」</span>') && p.includes('<p class="pd">照决定通知书记下她批了哪一级、哪条路径</p>')
      && p.includes('<div class="fg"><div class="lc"><div class="mc intent"><div class="mk">操作意图</div>老人交来决定通知书，给她留一份档案，以后签协议、分资金、记服务都记在这一份上。<div class="fup"><i>对着的目的</i>她批到了什么，以政府发的决定通知书为准。</div></div>')
      && p.includes('<div class="fi"><span class="nt">政府评估后发给她的那一份，上面写着分级和路径</span><span class="bx"><i>老人交来的</i><b>决定通知书</b></span></div>') && count(p, 'class="bx"') === 3 && !p.includes('class="idt"') }, OLD + "popFrom('fn:f-1')"],
  // 中间是类图画法的框：蓝色的头是主数据（从业务数据的名字里认出来的概念），新建的标出来；被动到的每一项一行：前面标创建，名字，下面一句「记下：…」
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="mid"><div class="cls core"><div class="ct"><i>核心数据</i><u class="op new">创建</u>参与者档案</div><div class="cb"><div class="sn">这位老人的参与者档案</div><div class="ft">新记下 → 档案建好了，记着她批到的分级和路径</div><div class="ei"><u class="op new">创建</u><b>My Aged Care 编号</b><div class="el">记下：照决定通知书上印的编号记下</div></div>')
      // 是业务概念的那一项画成一格，里面一栏一行，每栏下面写它的逻辑：写了「概念 › 栏：逻辑」的照它；没写的，栏名和某项输入同名就写「照」加那项输入是谁给的
      && p.includes('<div class="ei"><div class="cls part"><div class="ct"><u class="op new">创建</u>批到的分级和路径<div class="el">记下：照决定通知书记下</div></div><div class="cb"><div class="fl"><b>分级</b><div class="el">照政府批的</div></div><div class="fl"><b>路径</b><div class="el">只记通知书上批的那一条，不替她另选</div></div></div></div></div>')
      // 图下面：规则、用在流程的哪一步、出处；没有顺带留下的就没有右边那一列
      && p.includes('<div class="mcap">规则</div><ul><li>一位老人只有一份档案，按 My Aged Care 编号认</li></ul>') && p.includes('<div class="mcap">用在流程的哪一步</div><ul><li><a href="#flow/01-老人注册">老人注册</a> 第 5 步</li></ul>') && p.includes('<div class="mcap">出处</div>手册 v4.4 §3 Participant') && !p.includes('顺带留下的') }, OLD + "popFrom('fn:f-1')"],
  // 动的是核心数据里装着的概念：头写核心数据（不标），里面套一个绿色的格子写这个概念（新建的标出来）；指明办的是哪条记录的输入（没写 by）画成一个 ID 标签
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="cls core"><div class="ct"><i>核心数据</i>参与者档案</div><div class="cb"><div class="cls part main"><div class="ct"><u class="op new">创建</u>签了的服务协议</div><div class="cb"><div class="sn">这位老人档案上签了的服务协议</div>')
      && p.includes('<div class="ei"><u class="op new">创建</u><b>签约日期</b><div class="el">记下：记下协议上写的那一天</div></div>') && p.includes('<div class="fi"><span class="nt">记在哪一位老人的档案上</span><span class="idt"><u>ID</u>参与者档案</span></div>') && count(p, 'class="idt"') === 1 && count(p, 'class="bx"') === 2
      // 右边：顺带留下的，按新记录、状态改变、事件分组，每组一根线指过去
      && p.includes('<div class="rc"><div class="mcap">顺带留下的</div><div class="og"><span class="arr"></span><div class="oc"><div class="ok">事件</div><div class="mc out"><b>协议已签</b><div class="when">记下以后告知聊天 app，给她开聊天</div></div></div></div></div>') && html.includes('.cls.part>.ct{background:var(--data)}') }, OLD + "popFrom('fn:f-2')"],
  // 主数据只是更新的：头上不标；每一项前面标更新，下面一句「会改：…」；同一种顺带留下的并成一组、一根线
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="cls core"><div class="ct"><i>核心数据</i>参与者档案</div><div class="cb"><div class="sn">这位老人的参与者档案</div><div class="ft">档案上记着她签了协议，还没分到资金 → ') && p.includes('<div class="ei"><u class="op upd">更新</u><b>分到的资金</b><div class="el">会改：记下哪天分到、分到的是全额还是一部分</div></div>')
    && count(p, 'class="og"') === 1 && p.includes('<div class="ok">新记录</div><div class="mc out"><b>她名下的基金</b></div><div class="mc out"><b>基金账户</b><div class="when">批了几类服务就开几个</div></div>') }, OLD + "popFrom('fn:f-3')"],
  // 被动到的那一项是装着的概念、没有栏：画成一格、里面没有栏的那几行
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="ei"><div class="cls part"><div class="ct"><u class="op upd">更新</u>余额<div class="el">会改：减去这一行申报的金额</div></div></div></div>') && count(p, 'class="og"') === 1 && p.includes('<div class="ok">状态改变</div><div class="mc out"><b>申报行</b><div class="when">扣成了就记成已扣</div></div>') && p.includes('<div class="mcap">规则</div><ul><li>只能扣她批了的那一类服务的账户</li></ul>') }, OLD + "popFrom('fn:f-4')"],
  // 主数据是删除的：头上标出来，每一项下面一句「去掉：…」；几种顺带留下的各一组，照新记录、状态改变、事件的先后排
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="ct"><i>核心数据</i><u class="op del">删除</u>基金账户</div>') && p.includes('<u class="op del">删除</u>余额<div class="el">去掉：减去这一行申报的金额</div>') && count(p, 'class="og"') === 3 && p.indexOf('<div class="ok">新记录</div>') < p.indexOf('<div class="ok">状态改变</div>') && p.indexOf('<div class="ok">状态改变</div>') < p.indexOf('<div class="ok">事件</div>') },
    OLD + "const f = MODULES.g2.groups[1].functions[0]; f.subject.op = '删除'; f.out.push({ kind: '事件', title: '已扣款' }, { kind: '新记录', title: '扣款记录' }); popFrom('fn:f-4')"],
  // 业务数据归别的主题（名字末尾括号里是那个主题）：认不出这个主题的概念，头照名字写、不标核心数据；末尾括号里的名字不拿来认
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="cls core"><div class="ct"><u class="op new">创建</u>已发邮件（消息通知）</div><div class="cb"><div class="ft">新记下 → 发了</div></div></div>'), "popFrom('fn:f-1')", DEEP],
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="ct"><u class="op new">创建</u>已发邮件（单据）</div>') && !popup(s).includes('<i>核心数据</i>'), "MODULES.g1.groups[0].functions[0].subject.title = '已发邮件（单据）'; popFrom('fn:f-1')", fresh(DEEP)],
  // 名字里带着的两个概念名一个包着另一个（月结单、月结单明细）：认长的那个；它装在月结单里，头写月结单、里面一格写月结单明细
  ['#样例系统/module/g5', (s) => popup(s).includes('<div class="cls core"><div class="ct"><i>核心数据</i>月结单</div><div class="cb"><div class="cls part main"><div class="ct"><u class="op new">创建</u>月结单明细</div><div class="cb"><div class="sn">这个月新添的月结单明细</div>'), OLD5 + "MODULES.g5.groups[3].functions[0].subject.title = '这个月新添的月结单明细'; popFrom('fn:f-6')"],
  // 旧写法：要用到的数据只写名字、业务数据没写 op 和 edits，照样画得出
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<b>登记老人先付的报销</b><span class="in">f-1 · 功能 · 页面上叫「报销」</span>') && p.includes('<div class="fi"><span class="idt"><u>ID</u>外部发票</span></div>') && p.includes('<div class="cls core"><div class="ct">报销</div><div class="cb"><div class="ft">新记下 → 待核</div></div></div>') && p.includes('href="#flow/g6-01-报销">报销</a> 第 2 步') }, "popFrom('fn:f-1')", STAGES],
  // 概念的栏写成对象的：格子里的栏名取它的 title；「概念 › 栏：逻辑」照栏名对上，不多出一行。并写的两栏拆成了一栏一条
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="cls part"><div class="ct"><u class="op new">创建</u>凭据<div class="el">记下：记下这一条是照哪一张收据记的</div></div><div class="cb"><div class="fl"><b>凭据的种类</b></div><div class="fl"><b>发票行</b></div><div class="fl"><b>收据</b><div class="el">写上是老人交来的哪一张</div></div></div></div>')
    && !p.includes('[object Object]') && p.includes('<b>服务项</b><div class="el">记下：照收据上写的服务记下</div>') && p.includes('<b>金额</b><div class="el">记下：照收据上写的金额记下</div>') },
    OLD5 + "allFns(MODULES.g5).find((f) => f.id === 'f-4').subject.edits.push('凭据 › 收据：写上是老人交来的哪一张'); popFrom('fn:f-4')"],

  // ---- 窗口三：没拆的响应（沿用原来的画法）----
  // 起因一个框，后面几个数据变化框，箭头上是条件
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<div class="pw" data-kind="chain"><div class="ph"><b>报销核过以后</b><span class="in">c-1 · 响应：一样数据变了，接着哪几样怎么变</span>') && p.includes('class="mchain"') && p.includes('起因') && p.includes('<i>一行一条</i>') && p.includes('余额 → 扣过') && count(p, 'class="mc ') === 3 }, "popFrom('chain:c-1')", STAGES],

  // ---- 窗口四：状态转换流程（沿用原来的状态图）----
  // 三个状态、四条线（往后、隔一个、往回），不出画布；没分段的没有页签
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<div class="pw" data-kind="wf"><div class="ph"><b>状态转换流程 · 报销</b><span class="in">w-1 · 3 个状态</span>') && count(p, '<g class="st">') === 3 && count(p, 'class="mv"') === 4 && p.includes('页面上叫完成') && p.includes('退回重核') && !p.includes('class="ptabs"') && inBounds(p) }, "popFrom('wf:w-1')", STAGES],
  // 分了段的：上面一排页签，一次看一段，没有「全部」；这一段的状态是实框，同它们有线连着的别的段的状态是虚线框，只画碰到这一段的线
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<span class="in">w-3 · 4 个状态，分 2 段，一次看一段</span>') && p.includes('<div class="ptabs"><button data-pop-stage="0" class="on">申报和审核</button><button data-pop-stage="1">通过以后</button></div>') && !p.includes('全部')
    && count(p, '<g class="st">') === 2 && count(p, '<g class="st ext">') === 1 && />已报给政府<\/text>/.test(p) && />被退回<\/text>/.test(p) && /<g class="st ext"><rect[^>]*\/><text[^>]*>审核通过<\/text>/.test(p) && !p.includes('已扣款') && count(p, 'class="mv"') === 3 && p.includes('被退回的申报行改了以后重新报，不另写一行。') && inBounds(p) && html.includes('.wf .st.ext rect{') }, OLD5 + "popFrom('wf:w-3')"],
  // 点页签换一段
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<button data-pop-stage="1" class="on">通过以后</button>') && count(p, '<g class="st">') === 2 && /<g class="st ext"><rect[^>]*\/><text[^>]*>已报给政府<\/text>/.test(p) && p.includes('已扣款') && !p.includes('被退回</text>') && count(p, 'class="mv"') === 2 && inBounds(p) },
    "popFrom('wf:w-3'); fire(els.pop.on.click, { target: at({ '[data-pop-stage]': { dataset: { popStage: '1' } } }) })"],

  // ---- 窗口五：概念图 ----
  // 只画点开的那一样数据的一块：它自己、它装着的概念、同这些直接连着线的概念，连同线上的话；不搬整张图。下面先写它自己的完整定义和出处
  ['#样例系统/module/g2', (s) => { const p = popup(s), ids = [...p.matchAll(/<g class="(?:nd[^"]*|stub)"[^>]*data-n="([^"]+)"/g)].map((m) => m[1]).sort().join()
    return p.includes('<div class="pw" data-kind="concept"><div class="ph"><b>基金账户</b><span class="in">概念图 · 只画它和它装着的概念、同它们直接连着的概念</span>') && ids === 'acct,bal,claim,fund' && count(p, '<g class="ed') === 3 && p.includes('<g class="nd sel" data-n="acct">')
      && p.includes('写她的编号，') && p.includes('<div class="cdef"><b>基金账户</b>一笔基金一个账户，只能买她批了的服务类型；申报行按她的编号从对应的账户扣。<div class="src">出处：§9.2 行 1290；申报格式 v1.14 第 4 节第 9 项</div></div>') && svgW(p) <= 1200 - 48 - 64 && inBounds(p) && through(p) }, "popFrom('concept:基金账户')"],
  // 一层层往下：单据装着明细，明细装着批注，连在明细上的模板、连在单据上的别的主题的货都带上；没连着的流水号不画
  ['#样例系统/module/g1', (s) => { const p = popup(s), ids = [...p.matchAll(/<g class="(?:nd[^"]*|stub)"[^>]*data-n="([^"]+)"/g)].map((m) => m[1]).sort().join(); return ids === 'doc,goods,memo,row,tpl' && inBounds(p) }, "popFrom('concept:单据')", DEEP],
  // 点图上一个概念：下面换成它的完整定义和出处，图上它亮着
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<g class="nd sel" data-n="bal">') && !p.includes('<g class="nd sel" data-n="acct">') && p.includes('<div class="cdef"><b>余额</b>基金账户里还剩多少钱（澳元）。分到资金时记上，每扣一笔就减一笔。<div class="src">出处：§9.2 行 1290</div></div>') },
    "popFrom('concept:基金账户'); fire(els.pop.on.click, { target: at({ '.nd': { dataset: { n: 'bal' } } }) })"],
  // 这个主题的概念图上没有的数据：到别的主题的概念图上找，标题旁说明画在哪个主题的概念图上
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<b>基金账户</b><span class="in">概念图 · 只画它和它装着的概念、同它们直接连着的概念；画在主题「参与者档案与她名下的钱」的概念图上</span>') && p.includes('<g class="nd sel" data-n="acct">') && p.includes('参与者档案与她名下的钱</text>') }, "popFrom('concept:基金账户')"],
  // 哪张概念图上都没有的：说一句，不抛错
  ['#样例系统/module/g5', (s) => popup(s).includes('这个上下文的概念图上还没有画「服务清单」。'), "popFrom('concept:服务清单')"],
  // 点窗口里概念图上的虚框：窗口都关掉，去那个主题的概念图
  ['#样例系统/module/g2', (s) => s.includes('<!--to:样例系统/concepts/g5,shut-->'), "popFrom('concept:基金账户'); fire(els.pop.on.click, { target: at({ '.stub[data-g]': { dataset: { g: 'g5', n: 'claim' } } }) }); els.main.innerHTML += '<!--to:' + location.hash + ',' + (els.pop.hidden ? 'shut' : 'open') + '-->'"],

  // ---- 拆过的主题（g2 写了顶层 rules）：功能、响应、行为、服务都画成同一种流程图 ----
  // 行为：输入一个框；规则一条一个框，「检查」不满足时有一条红虚线到「抛出错误」，「定出」没有；步骤一步一个框，头上写「步骤 k / n」；没写 returns 的是「空结果（无返回）」
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<div class="pw" data-kind="act"><div class="ph"><b>记分到资金</b><span class="in">act-3 · 参与者档案的行为 · 已建档、已签协议或分到资金 → 分到资金 · 从左到右：输入、规则、步骤；')
      && bs.map((b) => b.type + ':' + b.id).join() === 'chk:r-7,dec:r-8,step:,step:,step:' && bs.every((b, i) => !i || b.x > bs[i - 1].x) && new Set(bs.map((b) => b.y + b.h / 2)).size === 1
      && />检查<\/text><text class="no"[^>]*>r-7<\/text>/.test(p) && />定出<\/text><text class="no"[^>]*>r-8<\/text>/.test(p) && ['步骤 1 / 3', '步骤 2 / 3', '步骤 3 / 3'].every((t) => p.includes('>' + t + '</text>'))
      && count(p, '<g class="se">') === 1 && count(p, '<path class="el"') === 1 && p.includes('>不满足</text>') && p.includes('>抛出错误，什么都不改</text>')
      && count(p, '<g class="si">') === 1 && p.includes('<text class="r none"') && p.includes('>空结果（无返回）</text>') && inBounds(p) }, "innerWidth = 1900; popFrom('act:act-3'); innerWidth = 1200"],
  // 「抛出错误」的框就在那条「检查」的正下面，「定出」下面什么都没有
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p), chk = bs.find((b) => b.type === 'chk'), err = p.match(/<g class="se"><rect x="([-\d.]+)" y="([-\d.]+)"/), dec = bs.find((b) => b.type === 'dec')
    return !!err && +err[1] === chk.x && +err[2] > chk.y + chk.h && ![...p.matchAll(/<g class="sx" data-fx="\d+"><rect x="([-\d.]+)"/g)].some((m) => +m[1] === dec.x) }, "innerWidth = 1900; popFrom('act:act-3'); innerWidth = 1200"],
  // 一直要守的规则不进流程，单放一张「做的时候守着」的卡；业务目的写在图的最上面，下面一行是它对着的那条更细的目的；行为这里不列谁会叫它
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="kc"><b>做的时候守着</b>') && p.includes('<div><code>r-2</code>批到的分级和路径一直和决定通知书上批的一样<span class="kv">管着：批到的分级和路径、参与者档案 › 决定通知书</span></div>') && !flowBoxes(p).some((b) => b.id === 'r-2') && p.indexOf('class="kc"') > p.indexOf('</svg>')
      && p.includes('<div class="am"><i>业务目的</i><b>从分到资金的那一天起钱开在她名下，哪天分到、分到多少要记在档案上。</b></div><div class="am2">对着目的 p-1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && p.indexOf('class="am"') < p.indexOf('<svg')
      && !p.includes('谁会叫它') && !p.includes('f-3') && !p.includes('data-pop="fn:') }, "popFrom('act:act-3')"],
  // 副作用挂在引起它的那一步下面；右边「副作用汇总」和各步下面的加起来一样；名字只显示冒号前面的
  ['#样例系统/module/g2', (s) => { const p = popup(s), under = [...p.matchAll(/<g class="sx" data-fx="(\d+)"><rect x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => ({ n: +m[1], x: +m[2], y: +m[3] })), steps = flowBoxes(p).filter((b) => b.type === 'step')
    return under.length === 4 && under.map((u) => u.n).join() === '3,1,2,1' && under.every((u, i) => u.x === steps[i].x && u.y > steps[i].y + steps[i].h) && fxUnder(p) === 7 && fxSum(p) === 7
      && p.includes('>参与者档案已建</text>') && !p.includes('>参与者档案已建：') && /<text class="ct ev"[^>]*>事件<\/text><text class="nm"[^>]*>参与者档案已建<\/text>/.test(p) && inBounds(p) }, "popFrom('act:act-1')"],
  // 图下面两块能折叠，标题上带条数，默认都收着；点了展开、再点收起，只动这一个窗口
  ['#样例系统/module/g2', (s) => { const [a, b, c] = popup(s).split('<!--next-->')
    return a.includes('<div class="fo" data-fo="fx"><div class="foh" data-pop-fold="fx"><span class="tri">▸</span>副作用列表<span class="cn">3 样</span></div></div><div class="fo" data-fo="rules"><div class="foh" data-pop-fold="rules"><span class="tri">▸</span>每条规则细说<span class="cn">3 条</span></div></div>') && !a.includes('class="fxt"') && !a.includes('class="rd"')
      // 副作用列表：一张表，冒号后面的放进「怎么改的、带着什么」那一列
      && b.includes('<div class="fo open" data-fo="fx">') && count(b, '<tr><td') === 3 && b.includes('<tr><th></th><th>是什么</th><th>怎么改的、带着什么</th></tr>') && b.includes('<tr><td class="ev">事件</td><td><b>资金已分到</b></td><td>带着她的 My Aged Care 编号、分到的日期、分到的是全额还是一部分</td></tr>') && !b.includes('class="rd"')
      // 每条规则细说：规则的全话、为了什么、对着哪条目的、几种情形、例子（前提、做了什么、结果）、疑点；连「做的时候守着」的那一条一共三条
      && c.includes('<div class="fo open" data-fo="rules">') && count(c, '<div class="rd" data-rule="') === 3 && c.includes('<div class="rd" data-rule="r-7"><div class="rh"><code>r-7</code><b>检查档案状态，还没有停用才能记分到资金</b><span class="rk">状态能不能走</span></div><div class="rt">参与者档案处于「已建档」「已签协议」或「分到资金」时才能记下分到资金；已经停用的档案不能再记。</div>')
      && c.includes('<div class="rw"><i>为了什么</i>分到的钱只开在还在这里的老人名下。</div><div class="rf2">对着目的 p-1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && c.includes('<tr><th></th><th>前提</th><th>做了什么</th><th>结果</th></tr><tr><td>例 1</td><td>档案已经是「已停用」</td>')
      && c.includes('<div class="dbt">疑点：建模那边写的是只有已签协议的档案才能记分到资金') && c.includes('<div class="rc2"><i>几种情形</i><ul><li>信上写的是全额资金：记成全额。</li>') && c.includes('data-rule="r-2"') && !c.includes('class="fxt"') },
    "const out = [], tap = (k) => { fire(els.pop.on.click, { target: at({ '[data-pop-fold]': { dataset: { popFold: k } } }) }); out.push(els.pop.innerHTML) }; popFrom('act:act-3'); out.push(els.pop.innerHTML); tap('fx'); tap('fx'); tap('rules'); out.splice(2, 1); els.pop.innerHTML = out.join('<!--next-->')"],
  // 规则的出处写在 source 里：细说里显示「出处：……」；只写 from 的旧数据也照样显示；两样都没写的不出那一行
  ['#样例系统/module/g2', (s) => { const [a, b, c] = popup(s).split('<!--next-->'), line = '<div class="rf2">出处：手册 v4.4 §6.8 行 592</div>', cut = (p) => p.split('data-rule="r-7"')[1].split('data-rule="')[0]
    return cut(a).includes(line) && cut(b).includes('<div class="rf2">出处：旧数据写在 from 里的出处</div>') && !cut(c).includes('出处：') && !html.slice(html.indexOf('const SAMPLE_MODULES = '), html.indexOf('// 工作台给 BIZ')).includes('"from":"手册') },
    "const out = [], r = MODULES.g2.rules.find((x) => x.id === 'r-7'), see = () => { drawPop(); out.push(els.pop.innerHTML) }; popFrom('act:act-3'); wins[0].open.rules = true; see(); delete r.source; r.from = '旧数据写在 from 里的出处'; see(); delete r.from; see(); els.pop.innerHTML = out.join('<!--next-->')"],
  // 并着几小条的规则：细说里列出那几小条
  ['#样例系统/module/g2', (s) => popup(s).includes('<div class="rt">决定通知书上的内容不全的，不能照它建档。</div><ul class="ri"><li>My Aged Care 编号必须写着。</li><li>批到的分级必须写着。</li></ul>'), "popFrom('act:act-1'); wins[0].open.rules = true; drawPop()"],
  // 行为没写 for：最上面说一句「还没有写它为了哪条业务目的」
  ['#样例系统/module/g2', (s) => popup(s).includes('<div class="am2 none">还没有写它为了哪条业务目的</div>') && !popup(s).includes('对着目的'), "delete MODULES.g2.core[0].actions[2].for; popFrom('act:act-3')"],
  // 功能：没写 after 的步骤、查询（服务）、它叫的行为、写了 after 的步骤，照这个先后排；行为、查询、接着办的功能带 data-pop；写了 returns 的照它写
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<div class="pw" data-kind="fn"><div class="ph"><b>照决定通知书建立参与者档案</b><span class="in">f-1 · 功能 · 页面上叫「建档」 · 从左到右：') && bs.map((b) => b.type + ':' + b.pop).join() === 'step:,svc:svc:s-1,act:act:act-1,fn:fn:f-2'
      && p.includes('>步骤 1 / 4</text>') && p.includes('>查询</text>') && p.includes('>参与者档案的行为</text>') && p.includes('>接着办本主题的功能</text>') && />返回结果<\/text><text class="r"[^>]*>新建的参与者档案<\/text>/.test(p) && !p.includes('空结果')
      && count(p, '<g class="si">') === 2 && count(p, '<g class="se">') === 0 && fxUnder(p) === 7 && fxSum(p) === 7 && inBounds(p)
      // 图上面：业务目的（操作意图）和它对着的那条更细的目的、做什么、主要动的；图下面：谁能做、用在流程的哪一步、出处
      && p.includes('<div class="am"><i>业务目的</i><b>老人交来决定通知书，给她留一份档案，以后签协议、分资金、记服务都记在这一份上。</b></div><div class="am2">对着目的 p-2.1：她批到了什么，以政府发的决定通知书为准。</div>')
      && p.includes('<div class="am"><i>主要动的</i><span><u class="op new">创建</u>这位老人的参与者档案：档案建好了，记着她批到的分级和路径</span></div>') && p.includes('<div class="mcap">谁能做</div>照护伙伴</div>') && p.includes('<a href="#flow/01-老人注册">老人注册</a> 第 5 步') && !p.includes('class="fg"') }, "popFrom('fn:f-1')"],
  // 调用别的主题的功能：虚线框，头上写「调用 · 某主题」，点不开；那边发生的事不算这里的副作用
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return bs.map((b) => b.type).join() === 'call,act' && p.includes('<g class="sb call"><rect') && p.includes('>调用 · 服务方与协议</text>') && />查一份服务协议<\/text>/.test(p) && bs[0].pop === '' && bs[1].pop === 'act:act-2'
      && html.includes('.sf .sb.call rect{fill:var(--badge);stroke:var(--badge-ink);stroke-dasharray:6 4}') && fxSum(p) === 3 && p.includes('>空结果（无返回）</text>') && inBounds(p) }, "popFrom('fn:f-2')"],
  // 入口自己的规则排在最前面，再是查询、它叫的行为。扣成了以后别的主题要跟着办的事不写成这里的一步调用：行为发出「已扣款」，那边的响应接着办
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return bs.map((b) => b.type + ':' + (b.id || b.pop)).join() === 'chk:r-12,svc:s-2,act:act-5' && count(p, '<g class="se">') === 1 && !p.includes('>调用 · ') && !p.includes('把申报行记成已扣') && /<text class="ct ev"[^>]*>事件<\/text><text class="nm"[^>]*>已扣款<\/text>/.test(p) && p.includes('<div class="fo" data-fo="rules"><div class="foh" data-pop-fold="rules"><span class="tri">▸</span>每条规则细说<span class="cn">1 条</span>') && inBounds(p) }, "popFrom('fn:f-4')"],
  // 响应：图和功能一个样子，「什么事发生了」放在中间当头一步；分叉时几个行为叠在一列，线上写各自的情形
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p), acts = bs.filter((b) => b.type === 'act')
    return p.includes('<div class="pw" data-kind="chain"><div class="ph"><b>分到资金以后</b><span class="in">c-1 · 响应：一件事发生以后跟着办的 · 从左到右：') && bs.map((b) => b.type + ':' + (b.id || b.pop)).join() === 'event:,dec:r-14,act:act-4,act:act-6'
      && p.includes('>什么事发生了</text>') && acts[0].x === acts[1].x && acts[1].y > acts[0].y + acts[0].h && acts.every((b) => b.pop === 'act:' + b.id)
      && count(p, '<g class="wl">') === 2 && p.includes('>她名下还没有基金账户</text>') && p.includes('>她名下已经有基金账</text>') && count(p, '<g class="si">') === 0
      && fxUnder(p) === 5 && fxSum(p) === 5 && p.includes('<div class="am2">对着目的 p-1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && inBounds(p) }, "popFrom('chain:c-1')"],
  // 没写 alt 的响应：它叫的行为一个接一个排成一行
  ['#样例系统/module/g2', (s) => { const acts = flowBoxes(popup(s)).filter((b) => b.type === 'act'); return acts.length === 2 && acts[1].x > acts[0].x && acts[0].y + acts[0].h / 2 === acts[1].y + acts[1].h / 2 && count(popup(s), '<g class="wl">') === 0 }, "delete MODULES.g2.chains[0].alt; delete MODULES.g2.chains[0].callsWhen; popFrom('chain:c-1')"],
  // 服务：输入、它的规则、它的步骤、返回
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<div class="pw" data-kind="svc"><div class="ph"><b>参与者登记：核对这个编号还没有建过档案</b><span class="in">s-1 · 服务：要看这一类数据的全体才能做的事，功能来用它 · 从左到右：') && bs.map((b) => b.type + ':' + b.id).join() === 'chk:r-1,step:'
      && count(p, '<g class="se">') === 1 && />返回结果<\/text><text class="r" /.test(p) && !p.includes('空结果') && p.includes('>没有副作用</text>') && fxSum(p) === 0 && p.includes('<div class="am2">对着目的 p-2.1：') && inBounds(p) }, "popFrom('svc:s-1')"],
  // ---- 标「查看」的功能：只是看、不改数据 ----
  // 拆过的主题里照别的功能一样画流程图：图上面那一行写「看的是」，标签是「查看」；右边「返回结果」显示 returns，「副作用汇总」里写「不改数据」
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<div class="pw" data-kind="fn"><div class="ph"><b>查看一位老人的档案</b><span class="in">f-5 · 功能 · 从左到右：') && bs.map((b) => b.type + ':' + b.id).join() === 'step:' && count(p, '<g class="si">') === 1
      && p.includes('<div class="am"><i>看的是</i><span><u class="op view">查看</u>这位老人的参与者档案</span></div>') && !p.includes('主要动的')
      && />返回结果<\/text><text class="r"[^>]*>她的参与者档案、<\/text>/.test(p) && !p.includes('空结果')
      && /<g class="so sum" data-fx="0"><rect[^>]*\/><text class="t"[^>]*>副作用汇总<\/text><text class="r none"[^>]*>不改数据<\/text><\/g>/.test(p) && !p.includes('>没有副作用</text>') && fxUnder(p) === 0
      && p.includes('<div class="am2">对着目的 p-2.2：看档案就知道她签没签服务协议、签的是哪一份。</div>') && p.includes('<div class="mcap">谁能做</div>照护伙伴</div>') && !p.includes('class="fg"') && !p.includes('还没有拆出') && inBounds(p) }, "popFrom('fn:f-5')"],
  // 标「查看」的功能带一条「怎么算的」规则：规则照样画成「定出」的框，排在步骤前面；细说里有这条规则
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p)
    return bs.map((b) => b.type + ':' + b.id).join() === 'dec:r-16,step:' && />定出<\/text><text class="no"[^>]*>r-16<\/text>/.test(p) && count(p, '<g class="se">') === 0
      && p.includes('<div class="am"><i>看的是</i><span><u class="op view">查看</u>她名下这一类服务的基金账户</span></div>') && />返回结果<\/text><text class="r"[^>]*>这个基金账户还能<\/text>/.test(p) && p.includes('>不改数据</text>')
      && p.includes('<div class="rd" data-rule="r-16"><div class="rh"><code>r-16</code><b>定出这个账户还能用多少，照它现在的余额</b><span class="rk">怎么算的</span></div>') && !p.includes('class="rcv"') && inBounds(p) }, "popFrom('fn:f-6'); wins[0].open.rules = true; drawPop()"],
  // 别的功能照旧：图上面写「主要动的」；没有副作用的写「没有副作用」，不写「不改数据」
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="am"><i>主要动的</i><span><u class="op upd">更新</u>') && !p.includes('看的是') && !p.includes('不改数据') }, "popFrom('fn:f-4')"],
  ['#样例系统/module/g2', (s) => popup(s).includes('>没有副作用</text>') && !popup(s).includes('不改数据'), "popFrom('svc:s-1')"],
  // 「查看」的标签的颜色和创建、更新、删除都不一样
  ['#map', () => { const m = html.match(/\.op\.new\{background:([^;}]+)\}\.op\.upd\{background:([^;}]+);[^}]*\}\.op\.del\{background:([^;}]+)\}\.op\.view\{background:([^;}]+)\}/); return !!m && new Set(m.slice(1)).size === 4 }],
  // 更细的目的那一行列出挂着的查看功能，和别的功能一样能点开
  ['#样例系统/module/g2', (s) => s.includes('<span class="chip fn" data-pop="fn:f-2">f-2 在参与者档案上记下签了的服务协议</span><span class="chip fn" data-pop="fn:f-5">f-5 查看一位老人的档案</span>') && s.includes('<span class="chip fn" data-pop="fn:f-6">f-6 查看基金账户还能用多少</span>'),
    "secOpen['样例系统/g2/purposes'] = true; purposeOpen['样例系统/g2/0'] = purposeOpen['样例系统/g2/1'] = true; render()"],
  // 没拆的主题里的旧功能图：中间那一栏只显示「查看」的标签和它看的是哪样数据，没有「从什么变成什么」、没有被动到的每一项（哪怕文件里写了 from、to、edits）；看到的是什么列在图下面
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="mid"><div class="cls core"><div class="ct"><i>核心数据</i><u class="op view">查看</u>参与者档案</div><div class="cb"><div class="sn">这位老人的参与者档案</div></div></div></div>') && !p.includes('class="ft"') && !p.includes('class="ei"') && !p.includes('class="rc"')
      && p.includes('<div class="mmore"><div><div class="mcap">看到的是什么</div>她的参与者档案、批到的分级和路径</div>') && !p.includes('class="sf"') && !p.includes('还没有拆出') },
    OLD + "MODULES.g2.groups[0].functions.push({ id: 'f-9', title: '查看一位老人的档案', intent: '办事之前先看清她批到了什么', subject: { title: '这位老人的参与者档案', op: '查看', from: '不该显示的', to: '也不该显示的', edits: ['分到的资金：不该显示'] }, in: [{ title: 'My Aged Care 编号', note: '要看的是哪一位' }], returns: '她的参与者档案、批到的分级和路径' }); popFrom('fn:f-9')"],
  // 旧功能图里别的功能照旧有「从什么变成什么」
  ['#样例系统/module/g2', (s) => popup(s).includes('class="ft"') && !popup(s).includes('op view') && !popup(s).includes('看到的是什么'), OLD + "popFrom('fn:f-1')"],
  // 名字就是那样数据的名字、下面没有别的话：不留一个空的格子；看的是核心数据里装着的概念的，外面套着它那样核心数据
  ['#样例系统/module/g2', (s) => { const [a, b] = popup(s).split('<!--next-->')
    return a.includes('<div class="mid"><div class="cls core"><div class="ct"><i>核心数据</i><u class="op view">查看</u>参与者档案</div></div></div>')
      && b.includes('<div class="cls core"><div class="ct"><i>核心数据</i>参与者档案</div><div class="cb"><div class="cls part main"><div class="ct"><u class="op view">查看</u>签了的服务协议</div><div class="cb"><div class="sn">这位老人档案上签了的服务协议</div></div></div></div></div>') },
    OLD + "const out = [], f = { id: 'f-9', title: '查看档案', intent: '看一眼', subject: { title: '参与者档案', op: '查看' }, in: [] }; MODULES.g2.groups[0].functions.push(f); popFrom('fn:f-9'); out.push(els.pop.innerHTML); f.subject.title = '这位老人档案上签了的服务协议'; drawPop(); out.push(els.pop.innerHTML); els.pop.innerHTML = out.join('<!--next-->')"],
  // ---- 规则管着哪几样（covers）----
  // 每条规则细说：全话下面多一行「管着：……」；没写 covers 的规则不出这一行
  ['#样例系统/module/g2', (s) => { const p = popup(s), cut = (id) => p.split('data-rule="' + id + '"')[1].split('data-rule="')[0]
    return cut('r-2').includes('才照新的那一份整个换掉。</div><div class="rcv">管着：批到的分级和路径、参与者档案 › 决定通知书</div><div class="rw"><i>为了什么</i>') && !cut('r-7').includes('rcv') && !cut('r-8').includes('管着') && count(p, 'class="rcv"') === 1 },
    "popFrom('act:act-3'); wins[0].open.rules = true; drawPop()"],
  // 「做的时候守着」那张卡：short 后面用小字列出管着的名字，一条规则一行；没写 covers（或者是空的一列）的那一条后面什么都不加，细说里也不出「管着」那一行
  ['#样例系统/module/g2', (s) => { const [a, b] = popup(s).split('<!--next-->')
    return a.includes('<div><code>r-3</code>一个基金账户只能买她批了的那一类服务<span class="kv">管着：基金账户 › 服务类型、参与者档案 › 批了的服务类型</span></div><div><code>r-4</code>她名下各个账户的余额加起来，不超过这一季分到的钱<span class="kv">管着：基金账户 › 余额、她名下的基金</span></div>')
      && count(a, 'class="kv"') === 2 && count(a, 'class="rcv"') === 2
      && b.includes('<div><code>r-3</code>一个基金账户只能买她批了的那一类服务</div><div><code>r-4</code>') && count(b, 'class="kv"') === 1 && count(b, 'class="rcv"') === 1 && html.includes('.kc .kv{font-size:11.5px;') },
    "const out = []; popFrom('act:act-5'); wins[0].open.rules = true; drawPop(); out.push(els.pop.innerHTML); MODULES.g2.rules.find((r) => r.id === 'r-3').covers = []; drawPop(); out.push(els.pop.innerHTML); delete MODULES.g2.rules.find((r) => r.id === 'r-4').covers; els.pop.innerHTML = out.join('<!--next-->')"],
  // 数据格式注释里写着「查看」和 covers
  ['#map', () => html.includes('op 是创建、更新、删除、查看。只是看、不改数据的功能标「查看」') && html.includes('covers?: [概念名 或「概念 › 栏」]') && html.includes('//          covers 是这条规则管着哪几样')],
  // 一行排不下时折到下一行，行与行之间的线拐弯抹圆；每行的框数尽量均匀，不让最后一行只剩一个（五个框排成三个、两个）
  ['#样例系统/module/g2', (s) => { const p = popup(s), bs = flowBoxes(p), rows = [...new Set(bs.map((b) => b.y + b.h / 2))]
    return bs.length === 5 && rows.length === 2 && bs.filter((b) => b.y + b.h / 2 === rows[0]).length === 3 && bs.filter((b) => b.y + b.h / 2 === rows[1]).length === 2 && bs[3].x === bs[0].x && bs[3].y > bs[0].y + bs[0].h
      && /<path class="ln" d="M [-\d.]+ [-\d.]+ L [-\d. ]+ Q [^"]+ Q [^"]+ Q [^"]+ Q [^"]+ L [-\d. ]+" marker-end/.test(p) && svgW(p) <= 1200 - 48 - 64 && inBounds(p) }, "popFrom('act:act-1')"],

  // ---- 窗口：每点开一样就多一个 ----
  // 点图里的行为、查询、接着办的功能：再开一个窗口，原来的还在；开着两个以上时右下角有「全部关闭（N 个）」
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return winKeys(p) === 'act:act-1,svc:s-1,fn:f-1,fn:f-2' && count(p, '<button class="x" data-pop-close="1">关闭 ✕</button>') === 4 && p.endsWith('<button class="xall" data-pop-close-all="1">全部关闭（4 个）</button>')
      && [...p.matchAll(/<div class="wn" data-win="[^"]+" style="[^"]*z-index:(\d+)"/g)].map((m) => +m[1]).join() === '41,42,43,44' },
    "popFrom('fn:f-1'); for (const k of ['act:act-1', 'svc:s-1', 'fn:f-2']) fire(els.pop.on.click, { target: at({ '.wn[data-win]': { dataset: { win: 'fn:f-1' } }, '[data-pop]': { dataset: { pop: k } } }) })"],
  // 只开着一个：没有「全部关闭」
  ['#样例系统/module/g2', (s) => winKeys(popup(s)) === 'fn:f-1' && !popup(s).includes('全部关闭'), "popFrom('fn:f-1')"],
  // 同一样东西已经开着：不再开第二个，把它拿到最上面
  ['#样例系统/module/g2', (s) => winKeys(popup(s)) === 'act:act-1,fn:f-1' && popup(s).includes('全部关闭（2 个）'), "popFrom('fn:f-1'); popFrom('act:act-1'); popFrom('fn:f-1')"],
  // 各有自己的「关闭」：点下面那个窗口的关闭，关的是它，上面的还在；Esc、点窗口外面的空白，关最上面的一个
  ['#样例系统/module/g2', (s) => s.includes('<!--left:act:act-1,svc:s-1|act:act-1|-->'),
    "const out = [], see = () => out.push(wins.map((w) => w.key).join()); popFrom('fn:f-1'); popFrom('act:act-1'); popFrom('svc:s-1'); fire(els.pop.on.click, { target: at({ '.wn[data-win]': { dataset: { win: 'fn:f-1' } }, '[data-pop-close]': {} }) }); see(); fire(docOn.keydown, { key: 'Escape' }); see(); fire(els.pop.on.click, { target: els.pop }); see(); els.main.innerHTML += '<!--left:' + out.join('|') + '-->'"],
  // 「全部关闭」：都关掉
  ['#样例系统/module/g2', (s) => popup(s) === '' && s.includes('<!--n:0-->'), "popFrom('fn:f-1'); popFrom('act:act-1'); popFrom('svc:s-1'); fire(els.pop.on.click, { target: at({ '[data-pop-close-all]': {} }) }); els.main.innerHTML += '<!--n:' + wins.length + '-->'"],
  // 点一下（按下）哪个窗口，它到最上面
  ['#样例系统/module/g2', (s) => winKeys(popup(s)) === 'act:act-1,svc:s-1,fn:f-1', "popFrom('fn:f-1'); popFrom('act:act-1'); popFrom('svc:s-1'); fire(els.pop.on.mousedown, { target: at({ '.wn[data-win]': { dataset: { win: 'fn:f-1' } } }) })"],
  // 按住标题那一行拖动：窗口跟着走，放开以后照拖到的位置摆；没拖过的在上面居中、后开的错开一点
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="wn" data-win="fn:f-1" style="left:calc(50% + 0px);top:24px;transform:translateX(-50%);z-index:41">') && p.includes('<div class="wn" data-win="act:act-1" style="left:340px;top:150px;z-index:42">') && s.includes('<!--moved:340px,150px;after:340-->') },
    "popFrom('fn:f-1'); popFrom('act:act-1'); const wn = { dataset: { win: 'act:act-1' }, style: {}, getBoundingClientRect: () => ({ left: 300, top: 100, width: 900 }) }; fire(els.pop.on.mousedown, { clientX: 320, clientY: 110, target: at({ '.wn[data-win]': wn, '.ph': {} }) }); fire(docOn.mousemove, { clientX: 360, clientY: 160 }); fire(docOn.mouseup, {}); const moved = wn.style.left + ',' + wn.style.top; fire(docOn.mousemove, { clientX: 900, clientY: 900 }); drawPop(); els.main.innerHTML += '<!--moved:' + moved + ';after:' + wins[1].x + '-->'"],
  // 按在标题行的「关闭」上不算拖
  ['#样例系统/module/g2', (s) => popup(s).includes('<div class="wn" data-win="fn:f-1" style="left:calc(50% + 0px);top:24px;transform:translateX(-50%);z-index:41">'),
    "popFrom('fn:f-1'); fire(els.pop.on.mousedown, { clientX: 320, clientY: 110, target: at({ '.wn[data-win]': { dataset: { win: 'fn:f-1' }, style: {}, getBoundingClientRect: () => ({ left: 300, top: 100, width: 900 }) }, '.ph': {}, 'button,a,[data-pop]': {} }) }); fire(docOn.mousemove, { clientX: 360, clientY: 160 }); drawPop()"],
  // 看板里的页签：就在这个窗口里换一样核心数据；图上是另一样核心数据的那一站：再开一个窗口
  ['#样例系统/module/g5', (s) => winKeys(popup(s)) === 'core:1,core:2' && popup(s).includes('<button data-pop-tab="core:1" class="on">照护管理记录</button>'),
    "popFrom('core:0'); fire(els.pop.on.click, { target: at({ '[data-pop-tab]': { dataset: { popTab: 'core:1' } } }) }); fire(els.pop.on.click, { target: at({ '[data-pop]': { dataset: { pop: 'core:2' } } }) })"],

  // ---- 没拆的、拆了一半的 ----
  // 没拆的主题（没写顶层 rules；先把 g5 换回没拆的那一份 G5OLD）：功能、响应的窗口照旧的样子画，没有流程图，也不说「还没有拆出」
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="pw" data-kind="fn"><div class="ph"><b>记下自己的工作者做的一次服务</b><span class="in">f-1 · 功能</span>') && p.includes('<p class="pd">记下哪天、哪项服务、做了多少</p><div class="pb"><div class="fg"><div class="lc"><div class="mc intent"><div class="mk">操作意图</div>')
    && p.includes('<div class="ei"><u class="op new">创建</u><b>服务项</b><div class="el">记下：做的是服务清单上的哪一项</div></div>') && !p.includes('class="sf"') && !p.includes('还没有拆出') && !p.includes('class="fo') }, OLD5 + "popFrom('fn:f-1')"],
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<span class="in">c-2 · 响应：一样数据变了，接着哪几样怎么变</span>') && p.includes('<div class="pb"><div class="mchain">') && !p.includes('class="sf"') && !p.includes('还没有拆出') }, OLD5 + "popFrom('chain:c-2')"],
  // 写了顶层 rules、但这项功能还没写 calls：照旧的样子画，上面说一句「还没有拆出它叫的行为」；写了 calls（哪怕是空的一列）就算拆过
  ['#样例系统/module/g2', (s) => { const [a, b] = popup(s).split('<!--next-->'); return a.includes('<div class="pb"><p class="warn undone">还没有拆出它叫的行为</p><div class="fg">') && !a.includes('class="sf"') && !b.includes('还没有拆出') && b.includes('class="sf"') && flowBoxes(b).length === 1 && b.includes('>还没有写步骤</text>') },
    "const f = allFns(MODULES.g2).find((x) => x.id === 'f-3'); delete f.calls; popFrom('fn:f-3'); const a = els.pop.innerHTML; f.calls = []; drawPop(); els.pop.innerHTML = a + '<!--next-->' + els.pop.innerHTML"],
  ['#样例系统/module/g2', (s) => popup(s).includes('<p class="warn undone">还没有拆出它叫的行为</p><div class="mchain">'), "delete MODULES.g2.chains[0].calls; popFrom('chain:c-1')"],
  // 拆过的功能：副作用不靠 subject.edits，从它叫的行为和它自己的 steps、out 里来；它自己的 out 挂在引起它的那一步下面
  ['#样例系统/module/g2', (s) => { const p = popup(s); return fxUnder(p) === 4 && fxSum(p) === 4 && />新记录<\/text><text[^>]*>分资金的信的留底<\/text>/.test(p) && !p.includes('不该出现') },
    "const f = allFns(MODULES.g2).find((x) => x.id === 'f-3'); f.subject.edits = ['不该出现：旧写法']; f.steps = [{ text: '把信收进档案', on: ['分资金的信的留底'] }]; f.out = [{ kind: '新记录', title: '分资金的信的留底：照原样存一份' }]; popFrom('fn:f-3')"],
  // 步骤的 on 对不上名字的：照样挂出来，类别写「没对上」
  ['#样例系统/module/g2', (s) => />没对上<\/text><text[^>]*>没有这一项<\/text>/.test(popup(s)), "MODULES.g2.core[1].actions[1].steps[0].on = ['没有这一项']; popFrom('act:act-5')"],

  // ---- 拆过的主题：「核心数据和概念」「业务目的及方案」上多出来的 ----
  // 核心数据那一行多两个标签：「一直要守的 N 条」默认收着，「N 个行为」默认展开；一行一个行为：名字（能点）、从哪个状态到哪个状态、几条规则、向外说几件事
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core')
    return t.includes('<span class="chip fc" data-fields="样例系统/g2/参与者档案">7 栏 ▸</span><span class="chip fc" data-keeps="样例系统/g2/参与者档案">一直要守的 1 条 ▸</span><span class="chip fc" data-acts="样例系统/g2/参与者档案">3 个行为 ▾</span><span class="nt">')
      && t.includes('<span class="chip fc" data-keeps="样例系统/g2/基金账户">一直要守的 2 条 ▸</span><span class="chip fc" data-acts="样例系统/g2/基金账户">3 个行为 ▾</span>') && count(t, '<div class="ar"') === 6 && !t.includes('<div class="kp"')
      && t.includes('<div class="ar" style="padding-left:24px"><span class="chip bh" data-pop="act:act-1">建档</span><span class="mv">→ 已建档</span><span class="cn">1 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && t.includes('<span class="chip bh" data-pop="act:act-2">记签协议</span><span class="mv">已建档 → 已签协议</span><span class="cn">1 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && t.includes('<span class="chip bh" data-pop="act:act-5">扣</span><span class="cn">2 条规则</span><span class="cn">向外说 1 件事</span></div>') && t.includes('<span class="chip bh" data-pop="act:act-6">补足额度</span><span class="cn">1 条规则</span></div>')
      && t.indexOf('data-pop="act:act-3"') < t.indexOf('data-pop="core:0:批到的分级和路径"') }, open('g2', 'core')],
  // 点「一直要守的」展开那几条规则，点「N 个行为」收起那几行；只动点的那一样核心数据
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core'); return t.includes('一直要守的 1 条 ▾</span>') && t.includes('<div class="kp" style="padding-left:24px"><code>r-2</code><b>批到的分级和路径一直和决定通知书上批的一样</b><span class="nt">参与者档案上批到的分级和路径只照决定通知书记') && count(t, '<div class="kp"') === 1
    && t.includes('data-acts="样例系统/g2/基金账户">3 个行为 ▸</span>') && count(t, '<div class="ar"') === 3 && !t.includes('data-pop="act:act-4"') },
    open('g2', 'core') + "; fire(els.main.on.click, { target: at({ '[data-keeps]': { dataset: { keeps: '样例系统/g2/参与者档案' } } }) }); fire(els.main.on.click, { target: at({ '[data-acts]': { dataset: { acts: '样例系统/g2/基金账户' } } }) })"],
  // 没拆的主题（g5 换回 G5OLD）：核心数据那一行没有这两个标签，也没有行为那几行
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'); return !t.includes('data-keeps=') && !t.includes('data-acts=') && !t.includes('class="ar"') && !t.includes('class="chip bh"') }, OLD5 + open('g5', 'core')],
  // 展开的栏：写了 for 的标「为了 p-1.1」，后面接「为了：……」那句话；没写 for 的（共付比例、建档日期）是「没有找到目的」；for 指着的那一条找不到的也是
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core')
    return t.includes('<div class="fd" style="padding-left:24px"><b>My Aged Care 编号</b><span class="chip ff" title="分到的钱和扣掉的钱，每一笔都查得到。">为了 p-1.1</span><span class="nt">政府给每位老人编的号，申报和扣款都按它认人。<i class="wy">为了：申报和扣款都按这个编号找到她名下的账户。</i></span></div>')
      && t.includes('<b>决定通知书</b><span class="rf">→ 决定通知书 · 评估与分资金</span><span class="chip ff" title="她批到了什么，以政府发的决定通知书为准。">为了 p-2.1</span>')
      && t.includes('<div class="fd" style="padding-left:24px"><b>共付比例</b><span class="chip nf">没有找到目的</span></div>') && t.includes('<b>建档日期</b><span class="chip nf">没有找到目的</span></div>') && count(t, '<span class="chip nf">') === 3 && t.includes('<b>她在哪一段</b><span class="chip nf">没有找到目的</span><span class="nt">')
      && count(t, '<span class="chip ff"') === 4 && html.includes('.chip.nf{font-size:11px;border:1px dashed var(--bad);color:var(--bad);') },
    "CONCEPTS.g2.concepts[0].fields.at(-1).for = '9.9'; fieldsOpen['样例系统/g2/参与者档案'] = true; " + open('g2', 'core')],
  // 没拆的主题（g5 换回 G5OLD）：展开的栏照旧，不标目的
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'); return count(t, '<div class="fd"') === 6 && !t.includes('chip ff') && !t.includes('chip nf') && !t.includes('class="wy"') && t.includes('<b>数量</b></div>') }, OLD5 + "fieldsOpen['样例系统/g5/服务记录'] = true; " + open('g5', 'core')],
  // 业务目的带它的号 p-1、p-2，更细的目的带它的号 p-1.1、p-1.2；哪项服务的 for 指着这一条，就在这一条的右边列成标签；行为和规则不列在这里
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes')
    return t.includes('<span class="no">p-1</span><span class="tx">随时说得清每位老人名下的钱') && t.includes('<span class="no">p-2</span><span class="tx">后面的服务有一份说了算的依据') && ['p-1.1', 'p-1.2', 'p-2.1', 'p-2.2'].every((n) => count(t, '<td><i class="nn">' + n + '</i><b>') === 1)
      && t.includes('<span class="chip fn" data-pop="fn:f-4">f-4 照申报行从基金账户扣款</span><span class="chip sv" data-pop="svc:s-2">s-2 找到要扣的基金账户</span></div>')
      && t.includes('<span class="chip fn" data-pop="fn:f-1">f-1 照决定通知书建立参与者档案</span><span class="chip sv" data-pop="svc:s-1">s-1 参与者登记：核对这个编号还没有建过档案</span></div>')
      && t.includes('<span class="chip ch" data-pop="chain:c-1">c-1 分到资金以后</span></div>') && count(t, 'class="chip sv"') === 2 && !t.includes('data-pop="act:') && !t.includes('r-1') && !t.includes('class="warn"')
      && t.includes('哪项功能、哪条响应、哪项服务达到。') }, "for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'purposes')],
  // 目的的号是固定的：在第 1 条业务目的的最前面插一条新的更细的目的（号用没用过的 p-1.9），原来各处「为了 …」「对着目的 …」指着的那句目的的话不变，服务也还挂在原来那一条的右边；
  // 显示的先后照文件里的先后，不照号排：p-1.9 排在 p-1.1 的前面
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'), c = secOf(s, 'core'), p = popup(s), nos = [...t.matchAll(/<i class="nn">([^<]+)<\/i>/g)].map((m) => m[1]).join()
    return nos === 'p-1.9,p-1.1,p-1.2,p-2.1,p-2.2' && t.includes('<tr><td><i class="nn">p-1.9</i><b>新插的一条更细的目的。</b>') && t.includes('<span class="cnt">3 条更细的目的</span>')
      && t.includes('<i class="nn">p-1.2</i><b>同一笔钱只有一处说了算。</b>') && /<i class="nn">p-1\.2<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-2"/.test(t) && /<i class="nn">p-2\.1<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-1"/.test(t) && count(t, 'class="chip sv"') === 2
      && c.includes('<b>My Aged Care 编号</b><span class="chip ff" title="分到的钱和扣掉的钱，每一笔都查得到。">为了 p-1.1</span>') && c.includes('<span class="chip ff" title="她批到了什么，以政府发的决定通知书为准。">为了 p-2.1</span>') && count(c, '<span class="chip nf">') === 2
      && p.includes('<div class="am2">对着目的 p-1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && p.includes('<div class="rf2">对着目的 p-1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && !p.includes('新插的一条') && !p.includes('业务目的里没有这一条') },
    "MODULES.g2.purposes[0].needs.unshift({ id: 'p-1.9', aim: '新插的一条更细的目的。', text: '新插的做法。', source: '人说的' }); fieldsOpen['样例系统/g2/参与者档案'] = true; for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'core', 'purposes') + "; popFrom('act:act-3'); wins[0].open.rules = true; drawPop()"],
  // 业务目的在文件里换了先后：页面照文件里的先后排，号跟着目的走
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'); return [...t.matchAll(/<span class="no">([^<]+)<\/span>/g)].map((m) => m[1]).join() === 'p-2,p-1' && [...t.matchAll(/<i class="nn">([^<]+)<\/i>/g)].map((m) => m[1]).join() === 'p-2.1,p-2.2,p-1.1,p-1.2' && /<i class="nn">p-1\.2<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-2"/.test(t) },
    "MODULES.g2.purposes.reverse(); for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'purposes')],
  // 目的都没写 id 的旧写法：照先后数，显示纯数字的 1、1.2，for 写「1.2」照旧指得到
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'), c = secOf(s, 'core'), p = popup(s)
    return [...t.matchAll(/<span class="no">([^<]+)<\/span>/g)].map((m) => m[1]).join() === '1,2' && [...t.matchAll(/<i class="nn">([^<]+)<\/i>/g)].map((m) => m[1]).join() === '1.1,1.2,2.1,2.2' && !t.includes('p-')
      && /<i class="nn">1\.2<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-2"/.test(t) && /<i class="nn">2\.1<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-1"/.test(t)
      && c.includes('<b>My Aged Care 编号</b><span class="chip ff" title="分到的钱和扣掉的钱，每一笔都查得到。">为了 1.1</span>') && c.includes('<span class="chip ff" title="她批到了什么，以政府发的决定通知书为准。">为了 2.1</span>') && count(c, '<span class="chip nf">') === 2
      && p.includes('<div class="am2">对着目的 1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && p.includes('<div class="rf2">对着目的 1.1：分到的钱和扣掉的钱，每一笔都查得到。</div>') && !p.includes('业务目的里没有这一条') },
    "const bare = (x) => { if (Array.isArray(x)) return x.forEach(bare); if (!x || typeof x !== 'object') return; if (typeof x.for === 'string') x.for = x.for.replace(/^p-/, ''); Object.values(x).forEach(bare) }; bare(MODULES.g2); bare(CONCEPTS.g2); for (const q of MODULES.g2.purposes) { delete q.id; for (const n of q.needs) delete n.id } fieldsOpen['样例系统/g2/参与者档案'] = true; for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'core', 'purposes') + "; popFrom('act:act-3'); wins[0].open.rules = true; drawPop()"],
  // for 指着一条业务目的（不是更细的目的）：页面照样找到，栏上标「为了 p-1」，后面的话用那条业务目的的 text；规则、行为的窗口里是「对着目的 p-2：……」。检查工具也算它对
  ['#样例系统/module/g2', (s) => { const c = secOf(s, 'core'), p = popup(s)
    return c.includes('<b>My Aged Care 编号</b><span class="chip ff" title="随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。">为了 p-1</span>') && count(c, '<span class="chip nf">') === 2
      && p.includes('<div class="am2">对着目的 p-2：后面的服务有一份说了算的依据：她批到了什么、签了什么协议。</div>') && p.includes('<div class="rf2">对着目的 p-1：随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。</div>') && !p.includes('业务目的里没有这一条') },
    "CONCEPTS.g2.concepts[0].fields[0].for = 'p-1'; allActs(MODULES.g2).find((x) => x.a.id === 'act-3').a.for = 'p-2'; MODULES.g2.rules.find((r) => r.id === 'r-7').for = 'p-1'; fieldsOpen['样例系统/g2/参与者档案'] = true; " + open('g2', 'core') + "; popFrom('act:act-3'); wins[0].open.rules = true; drawPop()"],
  // 旧写法（目的都没写 id）只写「1」的同样处理：指着第 1 条业务目的
  ['#样例系统/module/g2', (s) => { const c = secOf(s, 'core'), p = popup(s)
    return c.includes('<b>My Aged Care 编号</b><span class="chip ff" title="随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。">为了 1</span>') && p.includes('<div class="am2">对着目的 2：后面的服务有一份说了算的依据：她批到了什么、签了什么协议。</div>') && !p.includes('业务目的里没有这一条') },
    "const bare = (x) => { if (Array.isArray(x)) return x.forEach(bare); if (!x || typeof x !== 'object') return; if (typeof x.for === 'string') x.for = x.for.replace(/^p-/, ''); Object.values(x).forEach(bare) }; bare(MODULES.g2); bare(CONCEPTS.g2); for (const q of MODULES.g2.purposes) { delete q.id; for (const n of q.needs) delete n.id } CONCEPTS.g2.concepts[0].fields[0].for = '1'; allActs(MODULES.g2).find((x) => x.a.id === 'act-3').a.for = '2'; fieldsOpen['样例系统/g2/参与者档案'] = true; " + open('g2', 'core') + "; popFrom('act:act-3')"],
  // 状态转换流程：线上写了 act 的，图下面列出每一步是哪个行为做的，点了看那个行为；没写的那一步不列
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="was"><div class="mcap">每一步是哪个行为做的</div><div class="wa"><span>已建档 → 已签协议</span><span class="chip bh" data-pop="act:act-2">记签协议</span></div>') && count(p, '<div class="wa">') === 3 && !p.includes('已停用</span><span class="chip bh"') }, "popFrom('wf:w-1')"],
  ['#样例系统/module/g5', (s) => !popup(s).includes('class="was"') && popup(s).includes('状态转换流程 · 申报行'), OLD5 + "popFrom('wf:w-3')"],
  // ---- 样例里的另一个主题 g5 也是拆过的 ----
  // 核心数据那一行带「一直要守的 N 条」「N 个行为」；一行一个行为，没有规则的行为写「0 条规则」；照护管理记录没有一直要守的规则，不出那个标签；
  // 发票行不是核心数据、但自己有状态，列在顶层 concepts 里：它在「不归哪一样核心数据的」那一组，那一行也带「N 个行为」，下面一行一个行为，点名字看这个行为；它没有一直要守的规则，不出那个标签
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'), g = t.split('<div class="cg">').slice(1)
    return g.length === 6 && count(t, '<div class="ar"') === 9 && g[0].includes('<span class="chip fc" data-fields="样例系统/g5/服务记录">7 栏 ▸</span><span class="chip fc" data-keeps="样例系统/g5/服务记录">一直要守的 1 条 ▸</span><span class="chip fc" data-acts="样例系统/g5/服务记录">2 个行为 ▾</span>')
      && g[0].includes('<span class="chip bh" data-pop="act:act-1">记下一次服务</span><span class="mv">→ 等着申报</span><span class="cn">2 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && !g[1].includes('data-keeps=') && g[1].includes('<span class="chip bh" data-pop="act:act-3">记下一次照护管理</span><span class="cn">0 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && g[2].includes('<span class="chip bh" data-pop="act:act-5">记下审核结果</span><span class="mv">已报给政府 → 审核通过或被退回</span><span class="cn">2 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && g[5].includes('data-fields="样例系统/g5/发票行">5 栏 ▸</span><span class="chip fc" data-acts="样例系统/g5/发票行">2 个行为 ▾</span><span class="nt">') && !g[5].includes('data-keeps=') && count(g[5], '<div class="ar"') === 2
      && g[5].includes('<div class="ar" style="padding-left:24px"><span class="chip bh" data-pop="act:act-8">登记并等着核对</span><span class="mv">→ 等着核对</span><span class="cn">0 条规则</span></div>')
      && g[5].includes('<div class="ar" style="padding-left:24px"><span class="chip bh" data-pop="act:act-9">记成核对过了</span><span class="mv">等着核对 → 核对过了</span><span class="cn">1 条规则</span><span class="cn">向外说 1 件事</span></div>')
      && !t.includes('data-acts="样例系统/g5/凭据"') && !t.includes('data-acts="样例系统/g5/月结单明细"') }, open('g5', 'core')],
  // 点发票行那一行的「N 个行为」：只收起它下面的那两行，核心数据的行为还在；点行为的名字开这个行为的窗口
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'); return t.includes('data-acts="样例系统/g5/发票行">2 个行为 ▸</span>') && count(t, '<div class="ar"') === 7 && !t.includes('data-pop="act:act-8"') && t.includes('data-pop="act:act-1"') },
    open('g5', 'core') + "; fire(els.main.on.click, { target: at({ '[data-acts]': { dataset: { acts: '样例系统/g5/发票行' } } }) })"],
  ['#样例系统/module/g5', (s) => winKeys(popup(s)) === 'act:act-8' && popup(s).includes('<b>登记并等着核对</b><span class="in">act-8 · 发票行的行为 · → 等着核对 · 从左到右：'),
    open('g5', 'core') + "; fire(els.main.on.click, { target: at({ '[data-pop]': { dataset: { pop: 'act:act-8' } } }) })"],
  // 列在 concepts 里的概念排在某样核心数据下面的（这里临时把服务记录装着的凭据列进去）：它那一行一样多出两个标签，展开的规则和行为比它那一行再缩进一层
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'), g = t.split('<div class="cg">').slice(1)
    return count(t, '<div class="ar"') === 10 && g[0].includes('<div class="cr" style="padding-left:24px"><span class="chip part" data-pop="core:0:凭据">凭据</span><span class="chip fc" data-fields="样例系统/g5/凭据">3 栏 ▸</span><span class="chip fc" data-keeps="样例系统/g5/凭据">一直要守的 1 条 ▾</span><span class="chip fc" data-acts="样例系统/g5/凭据">1 个行为 ▾</span><span class="nt">')
      && g[0].includes('<div class="kp" style="padding-left:48px"><code>r-1</code><b>凭据记下以后不换、不改</b>') && g[0].includes('<div class="ar" style="padding-left:48px"><span class="chip bh" data-pop="act:act-10">换一份凭据</span><span class="cn">0 条规则</span></div>')
      && g[0].includes('<div class="ar" style="padding-left:24px"><span class="chip bh" data-pop="act:act-1">') && !t.includes('data-acts="样例系统/g5/月结单明细"') },
    "MODULES.g5.concepts.push({ title: '凭据', keeps: ['r-1'], actions: [{ id: 'act-10', title: '换一份凭据', rules: [] }] }); keepsOpen['样例系统/g5/凭据'] = true; " + open('g5', 'core')],
  // 栏全展开：写了 for 的标「为了 p-…」；写不出 for 的两栏（服务记录的「做服务的人」、月结单的「合计」）标「没有找到目的」，待定里各有一条没答的问题问它
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'), a = secOf(s, 'asks')
    return count(t, '<span class="chip nf">') === 2 && t.includes('<b>做服务的人</b><span class="chip nf">没有找到目的</span><span class="nt">自己的工作者，或者外部服务方。</span></div>') && t.includes('<b>合计</b><span class="chip nf">没有找到目的</span></div>')
      && count(t, '<span class="chip ff"') === 28 && t.includes('<b>金额</b><span class="chip ff" title="报上去的每一行都对得上一次真做了的服务。">为了 p-1.1</span><span class="nt"><i class="wy">为了：申报的金额照它写。</i></span></div>')
      && count(a, 'class="mask pending"') === 4 && a.includes('服务记录上的「做服务的人」这一栏是为了什么？') && a.includes('月结单上的「合计」这一栏是为了什么？') },
    "for (const k of ['服务记录', '凭据', '照护管理记录', '申报行', '月结单', '月结单明细', '发票行']) fieldsOpen['样例系统/g5/' + k] = true; " + open('g5', 'core', 'asks')],
  // 带状态变化的行为：一条检查、一条定出、三步；副作用挂在引起它的那一步下面；图上面是它为了哪条目的
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<b>记下审核结果</b><span class="in">act-5 · 申报行的行为 · 已报给政府 → 审核通过或被退回 · 从左到右：') && bs.map((b) => b.type + ':' + b.id).join() === 'chk:r-8,dec:r-9,step:,step:,step:'
      && p.includes('<div class="am2">对着目的 p-1.3：政府审核的结果有着落：通过的扣款，被退回的改了重报。</div>') && fxUnder(p) === 3 && fxSum(p) === 3 && p.includes('<div><code>r-6</code>一行申报行一直对着同一条服务记录<span class="kv">管着：申报行 › 服务记录</span></div>') && inBounds(p) }, "popFrom('act:act-5')"],
  // 没有规则的行为：图上只有输入和步骤，下面写「这里没有挂规则」
  ['#样例系统/module/g5', (s) => { const p = popup(s); return flowBoxes(p).map((b) => b.type).join() === 'step,step' && p.includes('每条规则细说<span class="cn">0 条</span>') && p.includes('<p class="none">这里没有挂规则。</p>') && !p.includes('class="kc"') && inBounds(p) }, "popFrom('act:act-3'); wins[0].open.rules = true; drawPop()"],
  // 功能：调用别的主题的一步、查询、它叫的两个行为；规则的出处读 source
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p)
    return bs.map((b) => b.type + ':' + b.id).join() === 'call:,svc:s-1,act:act-4,act:act-2' && p.includes('>调用 · 服务清单</text>') && !p.includes('还没有拆出') && fxUnder(p) === 7 && fxSum(p) === 7 && p.includes('>空结果（无返回）</text>')
      && p.includes('<div class="am2">对着目的 p-1.1：报上去的每一行都对得上一次真做了的服务。</div>') && p.includes('<div class="mcap">谁能做</div>财务') && inBounds(p) }, "popFrom('fn:f-5')"],
  // 动的是列在顶层 concepts 里的概念的功能（发票行不是核心数据、但自己有状态）：它叫发票行的行为，框头写「发票行的行为」，能点开；
  // 变化写在行为里，功能自己的 out 是空的，副作用从它叫的行为里来；「等着核对才能核对」（r-5）挂在行为上，功能的图里没有检查
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p)
    return bs.map((b) => b.type + ':' + b.id).join() === 'call:,step:,act:act-9' && bs[2].pop === 'act:act-9' && p.includes('>发票行的行为</text>') && fxUnder(p) === 2 && fxSum(p) === 2 && />修改<\/text><text class="nm"[^>]*>状态<\/text>/.test(p)
      && /<text class="ct ev"[^>]*>事件<\/text><text class="nm"[^>]*>发票行已核对<\/text>/.test(p) && !p.includes('r-5') && !p.includes('还没有拆出') && !p.includes('业务文件里没有') && inBounds(p) }, "popFrom('fn:f-3')"],
  // 点功能图里「发票行的行为」那个框：再开这个行为的窗口，原来的还在
  ['#样例系统/module/g5', (s) => winKeys(popup(s)) === 'fn:f-3,act:act-9', "popFrom('fn:f-3'); fire(els.pop.on.click, { target: at({ '.wn[data-win]': { dataset: { win: 'fn:f-3' } }, '[data-pop]': { dataset: { pop: 'act:act-9' } } }) })"],
  // 概念的行为的窗口：小标题写「发票行的行为」；一条检查、两步；图上面是它为了哪条目的；发票行没有一直要守的规则，不出「做的时候守着」那张卡
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p)
    return p.includes('<div class="pw" data-kind="act"><div class="ph"><b>记成核对过了</b><span class="in">act-9 · 发票行的行为 · 等着核对 → 核对过了 · 从左到右：') && bs.map((b) => b.type + ':' + b.id).join() === 'chk:r-5,step:,step:'
      && p.includes('<div class="am2">对着目的 p-2.2：每条服务记录都指得出它的依据。</div>') && fxUnder(p) === 2 && fxSum(p) === 2 && !p.includes('class="kc"') && inBounds(p) }, "popFrom('act:act-9')"],
  // 概念写了 keeps 的（这里临时给发票行挂一条）：单子上它那一行多出「一直要守的 N 条」；行为的窗口里「做的时候守着」那张卡列的是这个概念自己的 keeps，不是哪样核心数据的
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'), p = popup(s)
    return t.includes('<span class="chip fc" data-keeps="样例系统/g5/发票行">一直要守的 1 条 ▸</span><span class="chip fc" data-acts="样例系统/g5/发票行">2 个行为 ▾</span>')
      && p.includes('<div class="kc"><b>做的时候守着</b>') && p.includes('<div><code>r-1</code>凭据记下以后不换、不改<span class="kv">管着：服务记录 › 凭据、凭据</span></div>') && !p.includes('<code>r-6</code>') && !p.includes('<code>r-11</code>') && inBounds(p) },
    "MODULES.g5.concepts[0].keeps = ['r-1']; " + open('g5', 'core') + "; popFrom('act:act-9')"],
  // 概念的状态转换流程：线上的 act 指着概念的行为，图下面列出这一步是哪个行为做的，点了看那个行为
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<b>状态转换流程 · 发票行</b>') && count(p, '<div class="wa">') === 1 && p.includes('<div class="was"><div class="mcap">每一步是哪个行为做的</div><div class="wa"><span>等着核对 → 核对过了</span><span class="chip bh" data-pop="act:act-9">记成核对过了</span></div>') && !p.includes('业务文件里没有这个行为') }, "popFrom('wf:w-2')"],
  // 响应看情形叫概念的行为（这里临时让「发票行核对过以后」分叉）：callsWhen 里概念的行为一样认，框头写「发票行的行为」
  ['#样例系统/module/g5', (s) => { const p = popup(s), acts = flowBoxes(p).filter((b) => b.type === 'act'); return acts.map((b) => b.pop).join() === 'act:act-1,act:act-8' && acts[0].x === acts[1].x && p.includes('>服务记录的行为</text>') && p.includes('>发票行的行为</text>') && !p.includes('业务文件里没有这个行为') && inBounds(p) },
    "Object.assign(MODULES.g5.chains[0], { alt: true, calls: ['act-1', 'act-8'], callsWhen: { 'act-1': '核对无误', 'act-8': '要重新登记' } }); popFrom('chain:c-1')"],
  // 副作用的小卡里，类别那一列照最宽的类别留地方：「状态改变」四个字（宽 42）后面的名字往右让，不压在一起；右边的汇总也一样。只有「修改」「事件」的卡，名字的位置照旧（差 38、42）。
  // 样例里现在没有哪一处的副作用是「状态改变」，先给 f-3 自己的 out 添一条、挂到它自己的那一步下面再看
  ['#样例系统/module/g5', (s) => { const [a, b] = popup(s).split('<!--next-->'), gap = (p, re) => { const m = p.match(re); return m ? +m[2] - +m[1] : -1 }
    return gap(a, /<text class="ct" x="([\d.]+)" y="[\d.]+">状态改变<\/text><text x="([\d.]+)"/) >= 50 && gap(a, /<text class="ct" x="([\d.]+)" y="[\d.]+">状态改变<\/text><text class="nm" x="([\d.]+)"/) >= 50
      && gap(b, /<text class="ct" x="([\d.]+)" y="[\d.]+">修改<\/text><text x="([\d.]+)"/) === 38 && gap(b, /<text class="ct" x="([\d.]+)" y="[\d.]+">修改<\/text><text class="nm" x="([\d.]+)"/) === 42 && inBounds(a) },
    "const f3 = allFns(MODULES.g5).find((f) => f.id === 'f-3'); f3.out = [{ kind: '状态改变', title: '发票行：等着核对 → 核对过了' }]; f3.steps[1].on = ['发票行']; popFrom('fn:f-3'); const a = els.pop.innerHTML; closeAll(); popFrom('act:act-6'); els.pop.innerHTML = a + '<!--next-->' + els.pop.innerHTML"],
  // 写了 after 的调用排在它叫的行为后面：g5 记下审核结果以后，审核通过的那一行交去「参与者档案与她名下的钱」扣款
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p); return bs.map((b) => b.type + ':' + (b.id || b.pop)).join() === 'act:act-5,call:' && p.includes('>调用 · 参与者档案与') && p.includes('>基金账户扣款</text>') && fxUnder(p) === 3 && fxSum(p) === 3 && inBounds(p) }, "popFrom('fn:f-8')"],
  // 两个主题的话对得上：g2 的行为「扣」发出「已扣款」，带着是照哪一行申报行扣的；g5 的响应「申报行审核通过以后」写明是这件事引起的；g2 里没有哪一步调用 g5
  ['#样例系统/module/g5', (s) => { const [a, b] = popup(s).split('<!--next-->'), said = (p) => [...p.matchAll(/<text class="tx"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join('')
    return said(a).includes('「参与者档案与她名下的钱」的基金账户发出「已扣款」，扣的是这一行申报行') && b.includes('<td class="ev">事件</td><td><b>已扣款</b></td><td>带着是照哪一行申报行扣的、她的 My Aged Care 编号、服务类型、扣了多少、还剩多少</td>')
      && !JSON.stringify(BIZG2).includes('"call":{"topic":"服务发生与申报"') && JSON.stringify(BIZG5).includes('"call":{"topic":"参与者档案与她名下的钱","title":"照申报行从基金账户扣款"}') && BIZG2.groups[1].functions[0].title === '照申报行从基金账户扣款' },
    "popFrom('chain:c-2'); const a = els.pop.innerHTML; closeAll(); popFrom('act:act-5', 'g2'); wins[0].open.fx = true; drawPop(); els.pop.innerHTML = a + '<!--next-->' + els.pop.innerHTML; global.BIZG2 = MODULES.g2; global.BIZG5 = MODULES.g5"],
  // 响应：什么事发生了，后面是它叫的行为
  ['#样例系统/module/g5', (s) => { const p = popup(s), bs = flowBoxes(p); return bs.map((b) => b.type + ':' + b.id).join() === 'event:,act:act-6' && p.includes('>什么事发生了</text>') && p.includes('>扣的是这一行申报行</text>') && p.includes('<b>申报行审核通过以后</b>') && !p.includes('还没有拆出') && inBounds(p) }, "popFrom('chain:c-2')"],
  // 状态转换流程：带 act 的三步列在图下面；「改了以后重新报上去」那一步现在没有行为做，不列
  ['#样例系统/module/g5', (s) => { const p = popup(s); return count(p, '<div class="wa">') === 3 && p.includes('<div class="wa"><span>已报给政府 → 被退回</span><span class="chip bh" data-pop="act:act-5">记下审核结果</span></div>') && p.includes('<div class="wa"><span>审核通过 → 已扣款</span><span class="chip bh" data-pop="act:act-6">记成已扣款</span></div>') && !p.includes('<span>被退回 → 已报给政府</span>') }, "popFrom('wf:w-3')"],
  // 业务目的及方案：服务照它的 for 挂在那一条更细的目的右边
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes'); return /<i class="nn">p-1\.1<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-1"/.test(t) && /<i class="nn">p-3\.1<\/i>(?:(?!<\/tr>).)*data-pop="svc:s-2"/.test(t) && count(t, 'class="chip sv"') === 2 && !t.includes('class="warn"') },
    "for (const i of [0, 1, 2]) purposeOpen['样例系统/g5/' + i] = true; " + open('g5', 'purposes')],
  // g5 的每一个行为、功能、响应、服务的窗口都画得出：不出画布，没有「还没有拆出」，没有对不上的行为、服务、功能、副作用
  ['#样例系统/module/g5', (s) => { const ps = s.split('<!--win-->').slice(1)
    return ps.length === 21 && ps.every((p) => p.includes('class="sf"') && inBounds(p) && !p.includes('还没有拆出') && !p.includes('业务文件里没有') && !p.includes('没对上') && fxUnder(p) === Math.max(0, fxSum(p))) },
    "const m = MODULES.g5, keys = [...allActs(m).map((x) => 'act:' + x.a.id), ...allFns(m).map((f) => 'fn:' + f.id), ...m.chains.map((c) => 'chain:' + c.id), ...allSvcs(m).map((x) => 'svc:' + x.id)], out = []; for (const k of keys) { closeAll(); popFrom(k); out.push(els.pop.innerHTML) } els.main.innerHTML += '<!--win-->' + out.join('<!--win-->')"],
  // 改名后的六个词都在页面上：响应、行为、步骤、定出、被对方记住ID、记住对方ID；旧的叫法（内部流程、「交给」「用到」那两个标签、算出、实际做的）不再出现在给人看的字里
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s), p = popup(s)
    return ['没有挂到哪一条目的上的响应：', '「记住对方ID」是它记着别处一样东西的编号、只读那边的资料；「被对方记住ID」是别的主题的数据记着它的编号，由这里的功能让那边新建或改变。', '<i class="ld">被对方记住ID</i>', '个行为 ▾'].every((t) => m.includes(t))
      && ['· 响应：一件事发生以后跟着办的', '>定出</text>', '>基金账户的行为</text>'].every((t) => p.includes(t)) && !m.includes('内部流程') && !p.includes('内部流程') && !m.includes('<i class="ld">交给</i>') && !m.includes('「交给」') && !m.includes('「用到」') && !p.includes('算出') && !p.includes('实际做的') },
    "MODULES.g2.purposes[0].needs[0].chains = []; " + open('g2', ...ALL) + "; popFrom('chain:c-1')"],
  ['#样例系统/module/g5', (s) => { const m = mainHtml(s); return m.includes('<i class="ld">记住对方ID</i><span class="chip res">服务清单</span>') && !m.includes('内部流程') && !m.includes('<i class="ld">用到</i>') && popup(s).includes('>步骤 1 / 2</text>') === false
    && ['内部流程：', "'交给'", "'用到'", '>算出<', '实际做的'].every((t) => !html.slice(html.indexOf('function renderModule')).includes(t)) && html.includes("row(1, '记住对方ID'") && html.includes("row(1, '被对方记住ID'") }, open('g5', ...ALL)],
  ['#样例系统/module/g2', (s) => popup(s).includes('>步骤 1 / 2</text>') && popup(s).includes('<div class="am"><i>做什么</i><span>从这个基金账户的余额里扣掉一笔。</span></div>'), "popFrom('act:act-5')"],

  // ---- 旧地址：进来时开对应的窗口一次，然后地址换成主题页的 ----
  // 功能：带着组和功能号的，浮出那一项；主区是五块都收着的主题页；地址换掉了
  ['#样例系统/module/g2/功能/1/f-2', (s) => popup(s).includes('<div class="pw" data-kind="fn"><div class="ph"><b>在参与者档案上记下签了的服务协议</b>') && count(mainHtml(s), '<div class="sec') === 5 && !mainHtml(s).includes('<div class="sec open') && mainHtml(s).includes('<!--at:#样例系统/module/g2,module/g2-->'),
    "els.main.innerHTML += '<!--at:' + location.hash + ',' + view + '-->'"],
  // 只弹一次：关掉以后重画，不再弹出来
  ['#样例系统/module/g2/功能/1/f-2', (s) => popup(s) === '' && count(mainHtml(s), '<div class="sec') === 5, "closePop(); render()"],
  // 只带组的落到那一组的头一项；什么都没带的落到头一项
  ['#样例系统/module/g2/功能/2', (s) => popup(s).includes('<b>照申报行从基金账户扣款</b><span class="in">f-4 · 功能 · 从左到右：')],
  ['#样例系统/module/g2/功能', (s) => popup(s).includes('<span class="in">f-1 · 功能 · 页面上叫「建档」 · 从左到右：')],
  // 响应（更早叫内部流程）、工作流程（现在叫状态转换流程）的旧地址：各开那一份的窗口；没带号的落到头一份
  ['#样例系统/module/g5/内部流程/c-2', (s) => popup(s).includes('data-kind="chain"') && popup(s).includes('<b>申报行审核通过以后</b>') && s.includes('<!--at:#样例系统/module/g5-->'), "els.main.innerHTML += '<!--at:' + location.hash + '-->'"],
  ['#样例系统/module/g5/内部流程', (s) => popup(s).includes('<b>发票行核对过以后</b>')],
  ['#样例系统/module/g5/响应/c-2', (s) => popup(s).includes('data-kind="chain"') && popup(s).includes('<b>申报行审核通过以后</b>') && s.includes('<!--at:#样例系统/module/g5-->'), "els.main.innerHTML += '<!--at:' + location.hash + '-->'"],
  ['#样例系统/module/g5/响应', (s) => popup(s).includes('<b>发票行核对过以后</b>')],
  ['#样例系统/module/g5/工作流程/w-2', (s) => popup(s).includes('data-kind="wf"') && popup(s).includes('<b>状态转换流程 · 发票行</b>') && s.includes('<!--at:#样例系统/module/g5-->'), "els.main.innerHTML += '<!--at:' + location.hash + '-->'"],
  ['#样例系统/module/g6/工作流程', (s) => popup(s).includes('<b>状态转换流程 · 报销</b>'), '', STAGES],
  // 指不到东西的旧地址（功能号没有、这个主题没有内部流程）：不弹，地址照样换掉，不抛错
  ['#样例系统/module/g1/内部流程/c-9', (s) => popup(s) === '' && count(mainHtml(s), '<div class="sec') === 5 && s.includes('<!--at:#样例系统/module/g1-->'), "els.main.innerHTML += '<!--at:' + location.hash + '-->'", DEEP],
  // 页面里旧的功能视图、三层页签、往本机记业务概述的代码都拿掉了
  ['#样例系统/module/g2', () => ['fnView', 'frameView', 'coreFlow', 'flowSection', 'MTABS', 'introState', 'coreTab', 'class="mtabs', '.mtabs'].every((k) => !html.includes(k))],
  // 左边栏：「业务 · 按主题」一组，有业务的主题一行带红点；在它的页签上这一行亮、组展开
  ['#样例系统/module/g6/工作流程', (s) => nav(s).includes('data-g="样例系统/module"><span class="tri">▾</span>业务 · 按主题</div><div class="gb"><a href="#样例系统/module/g6" class="sub on">服务发生与扣费<i class="open">1</i></a>'), '', STAGES],
  // 流程收进大组「流程 · 按主题」，里面一个主题一个小组，没写主题的放「没写主题」，都默认折着
  ['#样例系统/map', (s) => nav(s).includes('data-g="样例系统/flows"><span class="tri">▸</span>流程 · 按主题</div><div class="gb" hidden>') && nav(s).includes('data-g="样例系统/flows/g6"><span class="tri">▸</span>服务发生与扣费</div><div class="gb" hidden>') && nav(s).includes('data-g="样例系统/flows/-"><span class="tri">▸</span>没写主题</div>') && nav(s).indexOf('核报销') < nav(s).indexOf('旧的'), '', STAGES],
  // 打开某份流程：它所在的大组、小组都自己展开，别的小组照旧折着
  ['#样例系统/flow/g6-02-核报销', (s) => nav(s).includes('data-g="样例系统/flows"><span class="tri">▾</span>流程 · 按主题</div><div class="gb">') && nav(s).includes('data-g="样例系统/flows/g6"><span class="tri">▾</span>服务发生与扣费</div><div class="gb">') && nav(s).includes('data-g="样例系统/flows/-"><span class="tri">▸</span>没写主题</div><div class="gb" hidden>'), '', STAGES],
  // 折着时大组、小组右边都是几条没答
  ['#样例系统/map', (s) => nav(s).includes('流程 · 按主题<i class="open">5</i>') && nav(s).includes('服务发生与扣费<i class="open">3</i>') && nav(s).includes('没写主题<i class="open">2</i>'), '', { ...STAGES, OPEN: { '样例系统/g6-01-报销': 1, '样例系统/g6-02-核报销': 2, '样例系统/99-旧的': 2 } }],
  // 全局图上面：整个上下文的背景，和每个主题的业务目的；没写的主题说一句
  ['#map', (s) => s.includes('<div class="fh">背景</div><div class="fbg">政府出钱替老人买居家照护服务：先评估批给她多少') && s.includes('<td><a href="#module/g5">服务发生与申报</a></td><td><div>交给政府的申报行要通得过政府的审核。</div>') && s.includes('<span class="none">业务目的还没写</span>') && s.indexOf('class="fr"') < s.indexOf('<svg')],
  // ---- 流程：入口出口、opt/alt、主题 ----
  // 标题下一排主题：这一份的主题在前加粗，数据卡用到的别的主题在后；数据卡前面写主题名、照主题上色
  ['#样例系统/flow/g6-01-报销', (s) => s.includes('<div class="ftopics"><a href="#concepts/g6" class="own"') && s.indexOf('>服务发生与扣费</a>') < s.indexOf('>建档与服务协议</a>')
    && s.includes('<g class="data tpc">') && /<text class="tn"[^>]*>建档与服务协议<\/text><text[^>]*>服务协议<\/text>/.test(s) && inBounds(s), '', STAGES],
  // 出口：最左边一列，跟它接着的那一步一样高，链到接着的那一份
  ['#样例系统/flow/g6-01-报销', (s) => { const m = s.match(/<a href="#flow\/g6-02-核报销"><g class="end out"><rect x="10" y="([-\d.]+)"/), st = s.match(/<g class="self" data-id="2"><rect x="([-\d.]+)" y="([-\d.]+)"/)
    return !!m && !!st && Math.abs(+m[1] - (+st[2] + 10 - 16)) < 1 && s.includes('接着去「核报销」') && +st[1] > 10 + 160 }, '', STAGES],
  // opt 框包住挨着的两步（1、1a），alt 框里横虚线隔成两格、每格写情况；入口卡在第 1 步旁边；没写 flow 的出口写「出口」
  ['#样例系统/flow/g6-02-核报销', (s) => { const f = [...s.matchAll(/<g class="frame (opt|alt)"><rect class="f" x="[-\d.]+" y="([-\d.]+)" width="[-\d.]+" height="([-\d.]+)"/g)].map((m) => ({ k: m[1], y: +m[2], h: +m[3] }))
    const y = (id) => +s.match(new RegExp('<g class="(?:msg|self)" data-id="' + id + '">(?:<rect x="[-\\d.]+" y="|<path d="M [-\\d.]+ )([-\\d.]+)'))[1]
    return f.length === 2 && f[0].k === 'opt' && f[1].k === 'alt' && f[0].y < y(1) && f[0].y + f[0].h > y('1a') && f[0].y + f[0].h < y('2a') && f[1].y < y('2a') && f[1].y + f[1].h > y('2b') && f[1].y + f[1].h < y(3)
      && s.includes('票据看不清') && s.includes('［批了］') && s.includes('［不批］') && (s.split('<g class="frame alt">')[1].split('</g>')[0].match(/<line /g) ?? []).length === 1
      && s.includes('从「报销」来') && s.includes('class="end out"') && s.includes('>出口<') && inBounds(s) }, '', STAGES],
  // 指着 1a 这一步：认得字的步号
  ['#样例系统/flow/g6-02-核报销', (s) => s.includes('<!--hover-->'), "els.main.innerHTML += '<!--hover-->'", STAGES],
  // ---- 概念图 ----
  // 同样两样数据之间一来一回两条线：只画一条，两句话接起来，做事的角色并在一起
  ['#样例系统/concepts/g2', (s) => (s.match(/<g class="ed/g) ?? []).length === 1 && s.includes('签了记进档案；') && s.includes('协议号') && s.includes('data-r="照护伙伴"') && s.includes('data-r="老人"'), '', STAGES],
  // 两侧虚框：每一列上下居中，对着主题框的正中
  ['#concepts/g6', (s) => { const f = grp(s), mid = f.y + f.h / 2, cols = {}
    for (const m of s.matchAll(/<g class="stub"[^>]*><rect x="([-\d.]+)" y="([-\d.]+)" width="[\d.]+" height="([\d.]+)"/g)) (cols[m[1]] ??= []).push({ y: +m[2], h: +m[3] })
    const off = Object.values(cols).map((c) => Math.abs((Math.min(...c.map((b) => b.y)) + Math.max(...c.map((b) => b.y + b.h))) / 2 - mid))
    return off.length >= 2 && off.every((d) => d < 1) }, '', G6NOW],
  // 线全是曲线：画出来的线里没有折线（L 后面接 L）
  ['#concepts/g6', (s) => { const ds = [...s.matchAll(/<g class="ed[^"]*" data-e="\d+"><path class="vis" d="([^"]+)"/g)].map((m) => m[1]); return ds.length > 0 && ds.every((d) => !/L [-\d.]+ [-\d.]+ L /.test(d)) && ds.some((d) => d.includes('Q')) }, '', G6NOW],
  // 小卡的虚线：从文字框的边上出发（不在角上），微微弯
  ['#concepts/g6', (s) => { const ls = [...s.matchAll(/<g class="lb"><path d="M ([-\d.]+) ([-\d.]+) Q [^"]+"[^>]*\/><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)]
    return ls.length > 0 && ls.every((m) => { const [x, y, rx, ry, w, h] = m.slice(1).map(Number), onV = (Math.abs(x - rx) < 0.5 || Math.abs(x - rx - w) < 0.5) && y > ry + 1 && y < ry + h - 1, onH = (Math.abs(y - ry) < 0.5 || Math.abs(y - ry - h) < 0.5) && x > rx + 1 && x < rx + w - 1; return onV || onH }) }, '', G6NOW],
  NEW,
  // ==== 新写法的主题（模块文件写了 goals）：样例里的 g2、g5 ====
  // ---- 主题页五块 ----
  // 五块的顺序和名字：业务概述、主要流程速览、业务目的及模型、业务方案、待定；不再有「核心数据和概念」「业务目的及方案」这两块；默认都收着
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s)
    return [...m.matchAll(/data-sec="(\w+)"/g)].map((x) => x[1]).join() === 'intro,tours,model,plan,asks' && [...m.matchAll(/<span class="tri">▸<\/span><b>([^<]+)<\/b>/g)].map((x) => x[1]).join() === '业务概述,主要流程速览,业务目的及模型,业务方案,待定'
      && !m.includes('核心数据和概念') && !m.includes('业务目的及方案') && !m.includes('<div class="sec open') && popup(s) === '' }],
  // 收着时的小字：目的的树和数出来的核心数据、状态转换流程；流程视角、角色视角和数出来的角色、事
  ['#样例系统/module/g2', (s) => secOf(s, 'model').includes('<b>业务目的及模型</b><span class="hint">目的的树；2 样核心数据，1 份状态转换流程</span>') && secOf(s, 'plan').includes('<b>业务方案</b><span class="hint">基于业务模型排出来的做法：流程视角、角色视角（2 个角色 5 件事）</span>')],
  ['#样例系统/module/g5', (s) => secOf(s, 'model').includes('<span class="hint">目的的树；4 样核心数据，3 份状态转换流程</span>') && secOf(s, 'plan').includes('流程视角、角色视角（2 个角色 6 件事）</span>')],
  // goals 写了、别的还没写的主题：照新写法的样子出五块，「业务方案」的小字是还没写，展开了各说一句
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s); return secOf(s, 'plan').includes('<span class="hint">还没写</span>') && secOf(s, 'model').includes('<p class="none">目的的树还没写。</p>') && m.includes('<p class="none">流程表还没写。</p>') && !m.includes('业务目的及方案') },
    "MODULES.g2.goals = []; delete MODULES.g2.jobs; delete MODULES.g2.flows; secOpen['样例系统/g2/model'] = true; secOpen['样例系统/g2/plan'] = true; render()"],
  ['#样例系统/module/g2', (s) => mainHtml(s).includes('<p class="none">各角色要办成的事还没写。</p>'), 'MODULES.g2.jobs = []; ' + roleV('g2')],
  // 没写 goals 的主题一处没变：换回写 purposes 的那一份，第三、四块还是「核心数据和概念」「业务目的及方案」，没有新的两块，展开了没有树、没有流程表
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s)
    return [...m.matchAll(/data-sec="(\w+)"/g)].map((x) => x[1]).join() === 'intro,tours,core,purposes,asks' && m.includes('<b>核心数据和概念</b>') && m.includes('<b>业务目的及方案</b><span class="hint">2 条业务目的</span>')
      && !m.includes('业务目的及模型') && !m.includes('业务方案') && !m.includes('class="gt"') && !m.includes('class="ftb"') && !m.includes('class="jtb"') && m.includes('class="pu"') && m.includes('为了 p-') },
    PRE + open('g2', ...ALL) + "; fieldsOpen['样例系统/g2/参与者档案'] = true; render()"],
  // 没写 goals 的主题：流程速览上没有段名、没有「角色 · 步骤」的小标；窗口里照旧是「对着目的 p-…」，没有「达成的目的」「用在」
  ['#样例系统/module/g2', (s) => { const p = popup(s); return !secOf(s, 'tours').includes('class="ts"') && !secOf(s, 'tours').includes('class="tj') && p.includes('对着目的 p-1.1') && !p.includes('达成的目的') && !p.includes('<i>用在</i>') },
    PRE + open('g2', 'tours') + "; popFrom('act:act-5')"],
  // ---- 业务目的及模型：两个页签 ----
  // 默认看「业务目的拆解」；最上面一行图例，说了目的、子目的、如何拆为子目的、途径、落点，和功能、响应到哪里看
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'model')
    return m.includes('<button data-model-tab="tree" data-key="样例系统/g2" class="on">业务目的拆解</button><button data-model-tab="parts" data-key="样例系统/g2">业务模型成员</button>')
      && m.includes('<p class="lg">一个 <i class="gk root">目的</i> 直接到不了的，拆成几个 <i class="gk">子目的</i> 去到，<i class="gq">如何拆为子目的</i> 说明是怎么拆的') && m.includes('写 <i class="gq">途径</i>：哪样核心数据（或者有自己状态的概念）的哪个行为') && m.includes('再写 <i class="gq">落点</i>')
      && m.includes('功能、响应不在里面，在「业务方案」的流程视角、角色视角里看') && m.includes('点带 ▸ 的一行展开或收起') && !m.includes('class="cg"') }, tree('g2')],
  // 到不了的节点：一行是标签「目的」（根）加粗的目的，右边「N 个子目的」；下面一行「如何拆为子目的」；再下面是子节点。带 made 的后面标「推出来的」；写了 source 的鼠标停在目的上显示它
  ['#样例系统/module/g2', (s) => { const a = nodeOf(s, 'g-1'), b = nodeOf(s, 'g-2')
    return a.includes('<div class="gh" data-goal-fold="样例系统/g2/g-1" data-open="1"><span class="tri">▾</span><i class="gk root">目的</i><b>后面的服务有一份说了算的依据：她批到了什么、签了什么协议。</b><span class="guess">推出来的</span><span class="cnt">3 个子目的</span></div>')
      && a.includes('<div class="gl2"><i class="gq">如何拆为子目的</i><span>要成立三样：') && a.includes('<div class="gs">') && !a.includes('途径')
      && b.includes('<i class="gk root">目的</i><b title="根据：人 2026-11-24 说：要有个地方管理资金，把资金的出入都放在这里管理">随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。</b><span class="cnt">2 个子目的</span>') && !b.includes('推出来的') }, tree('g2')],
  // 默认只展开第一层：两个根展开着，第二层到不了的节点（g-2.1）收着：三角朝右、标签是「子目的」，没有「如何拆为子目的」那一行，它的子节点不画
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'model'), n = nodeOf(s, 'g-2.1')
    return [...m.matchAll(/data-goal-node="([^"]+)"/g)].map((x) => x[1]).join() === 'g-1,g-1.1,g-1.2,g-1.3,g-2,g-2.1,g-2.2'
      && n.includes('<div class="gh" data-goal-fold="样例系统/g2/g-2.1" data-open="0"><span class="tri">▸</span><i class="gk">子目的</i><b title="根据：手册 v4.4 §9.2 行 1290">分到的钱和扣掉的钱，每一笔都查得到。</b><span class="cnt">4 个子目的</span></div>') && !n.includes('如何拆为子目的') }, tree('g2')],
  // 点带 ▸ 的一行展开，再点收起；点展开着的根，它下面的都收起来
  ['#样例系统/module/g2', (s) => { const [a, b, c] = mainHtml(s).split('<!--next-->'), ids = (h) => [...h.matchAll(/data-goal-node="([^"]+)"/g)].map((x) => x[1]).join()
    return ids(a) === 'g-1,g-1.1,g-1.2,g-1.3,g-2,g-2.1,g-2.1.1,g-2.1.2,g-2.1.3,g-2.1.4,g-2.2' && a.includes('data-goal-fold="样例系统/g2/g-2.1" data-open="1"><span class="tri">▾</span>') && a.includes('<span>要成立四样：')
      && ids(b) === 'g-1,g-1.1,g-1.2,g-1.3,g-2,g-2.1,g-2.2' && ids(c) === 'g-1,g-2,g-2.1,g-2.2' && c.includes('data-goal-fold="样例系统/g2/g-1" data-open="0"><span class="tri">▸</span>') },
    tree('g2') + `; const out = []; ${tapMain('[data-goal-fold]', { goalFold: '样例系统/g2/g-2.1', open: '0' })}; out.push(els.main.innerHTML); ${tapMain('[data-goal-fold]', { goalFold: '样例系统/g2/g-2.1', open: '1' })}; out.push(els.main.innerHTML); ${tapMain('[data-goal-fold]', { goalFold: '样例系统/g2/g-1', open: '1' })}; out.push(els.main.innerHTML); els.main.innerHTML = out.join('<!--next-->')`],
  // 到得了的节点：标签「子目的」加粗的目的；「途径」一行是一个能点的小块，点了开那个行为的窗口；「落点」一行；没写疑点的不出那一行；没有「N 个子目的」，点不动
  ['#样例系统/module/g2', (s) => { const n = nodeOf(s, 'g-1.1')
    return n.includes('<div class="gh"><span class="tri"></span><i class="gk">子目的</i><b title="根据：手册 v4.4 §6.6 行 562–568">她批到了什么，要照决定通知书记进参与者档案，后面的服务都照这一份。</b></div>')
      && n.includes('<div class="gl2"><i class="gq">途径</i><span class="chip bh" data-pop="act:act-1">参与者档案-建档</span></div>') && n.includes('<div class="gl2"><i class="gq">落点</i><span>参与者档案-My Aged Care 编号、决定通知书、批到的分级和路径、批了的服务类型</span></div>')
      && !n.includes('疑点') && !n.includes('个子目的') && !n.includes('data-goal-fold') && !n.includes('推出来的')
      && popup(s).includes('<div class="pw" data-kind="act"><div class="ph"><b>建档</b>') }, tree('g2') + '; ' + tapMain('[data-pop]', { pop: 'act:act-1' })],
  // 疑点写了才出；落点写了几样的（用「；」隔开）一样一行，分号后面的不丢；到得了的节点带 made 的一样标「推出来的」
  ['#样例系统/module/g2', (s) => { const a = nodeOf(s, 'g-2.1.4'), b = nodeOf(s, 'g-1.3')
    return a.includes('<div class="gl2 db"><i class="gq">疑点</i><span>基金账户上只记着余额，没有把每一笔扣款单独记下来') && a.includes('<span class="chip bh" data-pop="act:act-5">基金账户-扣</span>')
      && b.includes('<i class="gq">落点</i><span>签了的服务协议-签的协议、签约日期<br>参与者档案-她在哪一段</span>') && b.includes('看得出签了、签的是哪一份。</b><span class="guess">推出来的</span>') }, tree('g2', true)],
  // 交给别的主题办的（外部调用）：途径是虚线的小块，不能点；落点是向那个主题发出的一次请求
  ['#样例系统/module/g2', (s) => { const n = nodeOf(s, 'g-1.2')
    return n.includes('<i class="gq">途径</i><span class="chip ext gx">外部调用-服务方与协议-查一份服务协议</span>') && !n.includes('data-pop') && n.includes('<i class="gq">落点</i><span>向服务方与协议发出的一次请求</span>') }, tree('g2')],
  // 留记录这一类：途径是一句话、没有 act，画成灰色实线的小块，不能点，和外部调用的虚线小块不是一种
  ['#样例系统/module/g2', (s) => { const n = nodeOf(s, 'g-3'); return n.includes('<i class="gk root">目的</i><b>档案改过什么都查得到。</b>') && n.includes('<i class="gq">途径</i><span class="chip gw">每改一次参与者档案，都留下一条变更记录</span>') && !n.includes('data-pop') && !n.includes('gx') },
    "MODULES.g2.goals.push({ id: 'g-3', aim: '档案改过什么都查得到。', way: '每改一次参与者档案，都留下一条变更记录' }); " + tree('g2')],
  // 途径指着的行为业务文件里没有：标红说一句，不能点；还没写途径的也说一句
  ['#样例系统/module/g2', (s) => nodeOf(s, 'g-1.1').includes('<span class="chip nf">参与者档案-建档：业务文件里没有行为 act-99</span>') && nodeOf(s, 'g-1.3').includes('<i class="gq">途径</i><span class="none">还没写途径</span>'),
    "MODULES.g2.goals[0].parts[0].act = 'act-99'; delete MODULES.g2.goals[0].parts[2].way; delete MODULES.g2.goals[0].parts[2].act; " + tree('g2')],
  // 根自己就到得了的：标签还是「目的」，下面直接是途径、落点、疑点（g5 的月结单那一条）
  ['#样例系统/module/g5', (s) => { const n = nodeOf(s, 'g-3')
    return mainHtml(s).includes('<div class="gd leaf" data-goal-node="g-3">') && n.includes('<i class="gk root">目的</i><b>老人每个月要看得到自己用了哪些服务、每一项花了多少钱。</b><span class="guess">推出来的</span>')
      && n.includes('data-pop="act:act-7">月结单-汇总成月结单并出给老人</span>') && n.includes('<span>月结单-老人、月份<br>月结单明细-对着哪一条记录、金额</span>') && n.includes('<i class="gq">疑点</i>') }, tree('g5')],
  // 发票行不是核心数据、但自己有状态，它的两个行为一样进树、一样点得开；g5 的三个外部调用各是一个虚线的小块
  ['#样例系统/module/g5', (s) => { const m = secOf(s, 'model')
    return nodeOf(s, 'g-1.2.1').includes('data-pop="act:act-8">发票行-登记并等着核对</span>') && nodeOf(s, 'g-1.2.2').includes('data-pop="act:act-9">发票行-记成核对过了</span>') && count(m, '<span class="chip ext gx">') === 3
      && m.includes('>外部调用-服务清单-查一项服务</span>') && m.includes('>外部调用-参与者档案与她名下的钱-照申报行从基金账户扣款</span>') && popup(s).includes('<span class="in">act-9 · 发票行的行为') }, tree('g5', true) + "; popFrom('act:act-9')"],
  // 样例里两个主题的每一个行为都进了树：树上 act 指到的行为，和业务文件里的行为一个不差
  ['#样例系统/module/g2', (s) => mainHtml(s).includes('<!--g2:act-1,act-2,act-3,act-4,act-5,act-6|act-1,act-2,act-3,act-4,act-5,act-6-->') && mainHtml(s).includes('<!--g5:act-1,act-2,act-3,act-4,act-5,act-6,act-7,act-8,act-9|act-1,act-2,act-3,act-4,act-5,act-6,act-7,act-8,act-9-->'),
    "for (const t of ['g2', 'g5']) { const m = MODULES[t]; els.main.innerHTML += '<!--' + t + ':' + allActs(m).map((y) => y.a.id).sort().join() + '|' + [...new Set(reachGoals(m).map((n) => n.act).filter(Boolean))].sort().join() + '-->' }"],
  // 旧样子的目的的树不画：有节点带 title、answer、basis 里的任何一栏，「业务目的拆解」里只有一句话；角色视角里不算达成的目的，表上面说一句；窗口里不出「达成的目的」那一行
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'model'), p = secOf(s, 'plan'), w = popup(s)
    return m.includes('</div><p class="none">目的的树是旧的样子，要重做。</p></div>') && !m.includes('class="gd') && !m.includes('class="lg"')
      && p.includes('<p class="tip">目的的树是旧的样子，要重做；重做以前，这里不算每一步达成的目的。</p>') && !p.includes('达成的目的</i>') && !p.includes('data-goal=') && p.includes('data-step-row="j-1.1"')
      && w.includes('<div class="am"><i>业务目的</i>') && !w.includes('达成的目的') && !w.includes('没进目的的树') },
    "MODULES.g2.goals[1].parts[0].basis = '手册'; secOpen['样例系统/g2/model'] = true; " + roleV('g2') + "; popFrom('act:act-5')"],
  // parts 里的项带 fn、chain 的也是旧样子；三栏里另外两栏（title、answer）一样认；照新写法写的不算旧
  ['#样例系统/module/g2', (s) => mainHtml(s).includes('<!--old:true,true,true,true,false,false-->'),
    "const was = JSON.stringify(MODULES.g2.goals), out = [], put = (f) => { MODULES.g2.goals = JSON.parse(was); f(MODULES.g2.goals); out.push(oldTree(MODULES.g2)) }; put((g) => { g[0].parts[0].fn = 'f-1' }); put((g) => { g[1].parts[0].parts[1].chain = 'c-1' }); put((g) => { g[0].title = '旧的' }); put((g) => { g[1].parts[1].answer = '旧的' }); put(() => {}); put((g) => { g[0].fn = 'f-1' }); els.main.innerHTML += '<!--old:' + out.join() + '-->'"],
  // 「业务模型成员」：就是核心数据和概念那张单子，原样搬进来；栏展开了不标「为了 p-…」「没有找到目的」，也没有「为了：……」那句话
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'model')
    return m.includes('<button data-model-tab="parts" data-key="样例系统/g2" class="on">业务模型成员</button>') && !m.includes('class="gt"') && count(m, '<div class="cg">') === 3 && m.includes('<span class="chip core" data-pop="core:0">参与者档案</span>')
      && m.includes('data-keeps="样例系统/g2/参与者档案">一直要守的 1 条 ▸</span>') && m.includes('<span class="chip bh" data-pop="act:act-5">扣</span>') && m.includes('data-fields="样例系统/g2/参与者档案">7 栏 ▾</span>') && count(m, '<div class="fd"') === 9
      && !m.includes('为了 p-') && !m.includes('没有找到目的') && !m.includes('class="wy"') && !m.includes('chip ff') && !m.includes('chip nf') },
    "secOpen['样例系统/g2/model'] = true; fieldsOpen['样例系统/g2/参与者档案'] = true; fieldsOpen['样例系统/g2/批到的分级和路径'] = true; " + tapMain('[data-model-tab]', { key: '样例系统/g2', modelTab: 'parts' })],
  // ---- 业务方案：流程视角 ----
  // 默认看流程视角；有两张流程表，再分一排页签「1 标题」「2 标题」；表头两行：业务目的；业务流程的名字，后面跟为什么排成这一张
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan')
    return m.includes('<button data-plan-tab="flow" data-key="样例系统/g2" class="on">流程视角</button><button data-plan-tab="role" data-key="样例系统/g2">角色视角</button>')
      && m.includes('<button data-flow-tab="0" data-key="样例系统/g2" class="on">1 从建档到分到资金</button><button data-flow-tab="1" data-key="样例系统/g2">2 做了服务以后扣款</button>')
      && m.includes('<div class="fpu">业务目的：替一位新来的老人把档案建好、记准，分到的钱开在她名下，后面做的服务才有依据、有钱可扣。</div><div class="ftl"><b>业务流程：从建档到分到资金</b>建档、签协议、分到资金是接着办的一条线：')
      && m.includes('虚线边的小块是系统接着办的、或者要先备好的一步；浅色的小块是不顺利时才重走的一步') && !m.includes('class="jtb"') }, open('g2', 'plan')],
  // 一段一行：左边是序号加段名，下面小字是这一段里的状态；右边先是说明，下面是步骤，一个步骤一个小块「角色 · 步骤标题」，小块之间用箭头连着；系统接着办的一步是虚线边的小块
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan'), rows = m.split('<tr').slice(1)
    return rows.length === 4 && rows[0].includes('<td><b><i>1</i>建档</b><div class="fst">已建档</div></td><td><div>老人交来决定通知书和支持计划，照护伙伴照它们建立参与者档案。</div><div class="frn"><span class="fp" data-jstep="j-1.1">照护伙伴 · 照决定通知书建立参与者档案</span></div></td>')
      && rows[1].includes('<b><i>2</i>签协议</b><div class="fst">已签协议</div>') && rows[1].includes('<span class="fp" data-jstep="j-2.1">照护伙伴 · 先查看她的档案</span><i class="fa">→</i><span class="fp" data-jstep="j-2.2">照护伙伴 · 记下她签了的服务协议</span>')
      && rows[2].includes('<b><i>3</i>分到资金</b>') && rows[2].includes('<i class="fa">→</i><span class="fp sys" data-jstep="j-3.2">照护伙伴 · 系统开出她名下的基金账户，先前只分到一部分的补到全额</span>')
      && stepIds(m) === 'j-1.1,j-2.1,j-2.2,j-3.1,j-3.2,j-4.1' && count(m, '<i class="fa">→</i>') === 2 }, open('g2', 'plan')],
  // anytime（随时可能发生的一段）排在最后单独一行，没有序号，小字写「随时可能发生」；流程视角只画路线，不列功能、响应、服务
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan'), last = m.split('<tr').at(-1)
    return last.startsWith(' class="any"><td><b>看还能用多少</b><div class="fst">随时可能发生</div></td><td><div>分到资金以后，照护伙伴替老人安排服务之前，随时可以看她名下的基金账户还能用多少。</div><div class="frn"><span class="fp" data-jstep="j-4.1">照护伙伴 · 查看基金账户还能用多少</span></div></td></tr></table>')
      && !m.includes('data-pop=') && !m.includes('f-1') }, open('g2', 'plan')],
  // 点流程表的页签换一张；没写状态的一段左边只有段名；这一张没有 anytime 就没有那一行
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan')
    return m.includes('<button data-flow-tab="1" data-key="样例系统/g2" class="on">2 做了服务以后扣款</button>') && m.includes('<div class="fpu">业务目的：做了的服务，钱从她名下对着这一类服务的基金账户里扣掉，每一笔都说得清。</div>')
      && m.includes('<tr><td><b><i>1</i>扣款</b></td><td>') && stepIds(m) === 'j-5.1' && m.includes('data-jstep="j-5.1">财务 · 照申报行从基金账户扣款</span>') && !m.includes('class="any"') && !m.includes('class="fst"') },
    open('g2', 'plan') + '; ' + tapMain('[data-flow-tab]', { key: '样例系统/g2', flowTab: '1' })],
  // 写 roads 的一段：几条路一条一行，前面是路名
  ['#样例系统/module/g5', (s) => { const m = secOf(s, 'plan'), rows = m.split('<tr').slice(1)
    return rows.length === 4 && rows[0].includes('<b><i>1</i>记下服务</b><div class="fst">等着核对、核对过了、等着申报</div>') && count(rows[0], '<div class="frd">') === 3
      && rows[0].includes('<div class="frd"><i class="rn">自己的工作者做的</i><div class="frn"><span class="fp" data-jstep="j-1.1">照护伙伴 · 记下自己的工作者做的一次服务</span></div></div>')
      && rows[0].includes('<i class="rn">外部服务方做的</i><div class="frn"><span class="fp" data-jstep="j-2.1">') && rows[0].includes('<i class="fa">→</i><span class="fp sys" data-jstep="j-2.3">照护伙伴 · 系统把核对过的发票行记成一条服务记录</span></div></div>')
      && rows[0].includes('<i class="rn">老人自己先付了钱的</i>') && rows[2].includes('<div class="frn"><span class="fp" data-jstep="j-5.2">财务 · 记下政府对申报行的审核结果</span></div>')
      && rows[3].includes('<span class="fp sys" data-jstep="j-5.4">') && stepIds(m) === 'j-1.1,j-2.1,j-2.2,j-2.3,j-3.1,j-5.1,j-5.2,j-5.4' && !m.includes('fp again') }, open('g5', 'plan')],
  // 不顺利时才重走的一步（again）是浅色的小块；又是系统接着办的，两样都带上（样例里没有 again 的步骤，这里临时标一个）
  ['#样例系统/module/g5', (s) => { const m = secOf(s, 'plan'); return m.includes('<span class="fp again" data-jstep="j-5.2">财务 · 记下政府对申报行的审核结果</span>') && m.includes('<span class="fp sys again" data-jstep="j-5.4">') && count(m, ' again"') === 2 },
    "{ const st = Object.fromEntries(allSteps(MODULES.g5).map((x) => [x.s.id, x.s])); st['j-5.2'].again = true; st['j-5.4'].again = true } " + open('g5', 'plan')],
  // 只有一张流程表：不出流程表的页签；流程表指着的步骤各角色要办成的事里没有：标红说一句，点不动
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan'); return !m.includes('data-flow-tab') && m.includes('<div class="fpu">业务目的：做了的服务，') && m.includes('<span class="fp miss">j-9.9：各角色要办成的事里没有这一步</span>') && stepIds(m) === 'j-5.1' },
    "MODULES.g2.flows.shift(); MODULES.g2.flows[0].stages[0].parts.push('j-9.9'); " + open('g2', 'plan')],
  // 点流程视角里一个步骤的小块：换到角色视角、换到这一步的角色的页签，这一步的那一格显眼一下（带 hi）；再重画就不再闪
  ['#样例系统/module/g2', (s) => { const [a, b] = mainHtml(s).split('<!--next-->')
    return a.includes('<button data-plan-tab="role" data-key="样例系统/g2" class="on">角色视角</button>') && a.includes('<button data-role-tab="财务" data-key="样例系统/g2" class="on">财务　1 件事</button>') && a.includes('<td class="js hi" data-step-row="j-5.1">') && count(a, ' hi"') === 1
      && b.includes('<td class="js" data-step-row="j-5.1">') && !b.includes(' hi"') && b.includes('class="on">财务　1 件事</button>') },
    open('g2', 'plan') + '; ' + tapMain('[data-jstep]', { jstep: 'j-5.1' }) + "; const a = els.main.innerHTML; render(); els.main.innerHTML = a + '<!--next-->' + els.main.innerHTML"],
  // ---- 业务方案：角色视角 ----
  // 照角色分页签，页签上写「角色 N 件事」，默认看头一个角色；一张表三栏
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan')
    return m.includes('<button data-role-tab="照护伙伴" data-key="样例系统/g2" class="on">照护伙伴　4 件事</button><button data-role-tab="财务" data-key="样例系统/g2">财务　1 件事</button>')
      && m.includes('<table class="jtb"><tr><th>要完成的事</th><th>步骤，和它达成了目的的树上哪几个目的</th><th>这一步用到的核心数据、功能、响应、服务</th></tr>')
      && [...m.matchAll(/<tr(?: class="j1")? data-job="([^"]+)">/g)].map((x) => x[1]).join() === 'j-1,j-2,j-2,j-3,j-3,j-4' && !m.includes('class="ftb"') && !m.includes('没有哪一步用到的') }, roleV('g2')],
  // 「要完成的事」：号加标题，下面「做完的标志」；一件事有几步，这一格就跨几行
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan')
    return m.includes('<tr class="j1" data-job="j-2"><td class="jj" rowspan="2"><div><code>j-2</code><b>在她的档案上记下签了的服务协议</b></div><div class="jd"><i class="gq">做完的标志</i><span>参与者档案的状态是「已签协议」，档案上记着她签的是哪一份服务协议、哪天签的。</span></div></td>')
      && m.includes('<tr class="j1" data-job="j-1"><td class="jj"><div><code>j-1</code><b>照决定通知书替一位老人建立参与者档案</b></div>') }, roleV('g2')],
  // 一步一格：序号加步骤的标题，下面小字是为什么，再下面「达成的目的」；只用到查看的功能的一步写「只是查看」，它右边只有那项功能
  ['#样例系统/module/g2', (s) => { const r = stepRow(s, 'j-2.1')
    return r.includes('"><div><b>1. 先查看她的档案</b></div><div class="jw">记之前先看清她批到了什么、签没签过服务协议。</div><div class="jg"><i class="gq">达成的目的</i><div><span class="none">只是查看</span></div></div></td>')
      && r.includes('<td><div class="jc"><span class="chip fn" data-pop="fn:f-5">f-5 查看一位老人的档案</span></div></td>') && goalIds(r) === '' && goalIds(stepRow(s, 'j-4.1')) === '' && stepRow(s, 'j-4.1').includes('<span class="none">只是查看</span>') }, roleV('g2')],
  // 达成的目的算得对：这一步的功能叫了行为「记签协议」，功能的步骤里又真有调用「服务方与协议」的「查一份服务协议」那一步，所以是树上这两个节点，点了跳到树上
  ['#样例系统/module/g2', (s) => { const r = stepRow(s, 'j-2.2')
    return goalIds(r) === 'g-1.2,g-1.3' && r.includes('<span class="ga" data-goal="g-1.2">记下签了的服务协议之前，取得回这份服务协议上的签约日期，和它现在是不是还有效。</span><span class="ga" data-goal="g-1.3">她签了服务协议，要在档案上看得出签了、签的是哪一份。</span>')
      && goalIds(stepRow(s, 'j-1.1')) === 'g-1.1' && goalIds(stepRow(s, 'j-3.1')) === 'g-2.1.1' && goalIds(stepRow(s, 'j-3.2')) === 'g-2.1.2,g-2.1.3' }, roleV('g2')],
  // 一个行为承载两个目的的那一步：财务的「照申报行从基金账户扣款」叫的是基金账户的「扣」，树上有两个节点的 act 指着它，两条都列出来
  ['#样例系统/module/g2', (s) => { const r = stepRow(s, 'j-5.1')
    return goalIds(r) === 'g-2.1.4,g-2.2' && r.includes('data-goal="g-2.1.4">每扣一笔都查得到：扣了多少、还剩多少、是照哪一行申报行扣的。</span>') && r.includes('data-goal="g-2.2">同一笔钱只有一处说了算：做了的服务，钱只从她名下对着这一类服务的基金账户里出。</span>') }, roleV('g2', '财务')],
  // 跨着两个根的一步（g5「记下自己的工作者做的一次服务」）：行为「记下一次服务」承载三个目的，加上调用「服务方与协议」的那一步，一共四条；系统接着办的那一步照它的响应叫的行为算
  ['#样例系统/module/g5', (s) => goalIds(stepRow(s, 'j-1.1')) === 'g-1.1,g-1.2.3,g-2.2.1,g-2.2.2' && goalIds(stepRow(s, 'j-2.1')) === 'g-1.2.1' && goalIds(stepRow(s, 'j-2.2')) === 'g-1.2.2,g-2.2.1' && goalIds(stepRow(s, 'j-2.3')) === 'g-1.1,g-1.2.3,g-2.2.2'
    && goalIds(stepRow(s, 'j-3.1')) === 'g-1.1,g-1.2.3,g-2.2.1,g-2.2.2' && goalIds(stepRow(s, 'j-4.1')) === 'g-1.3', roleV('g5')],
  ['#样例系统/module/g5', (s) => goalIds(stepRow(s, 'j-5.1')) === 'g-2.1.1,g-2.1.2,g-2.1.3' && goalIds(stepRow(s, 'j-5.2')) === 'g-2.3.1,g-2.3.2' && goalIds(stepRow(s, 'j-5.4')) === 'g-2.3.3' && goalIds(stepRow(s, 'j-6.1')) === 'g-3', roleV('g5', '财务')],
  // 一条目的都没达成的一步写「没有达成树上的目的」；不顺利时才重走的、系统接着办的各带一个小标；没用到功能、响应的一步右边是空的（样例里没有这样的一步，这里临时添一步）。步骤前面的序号照它在这件事里排第几
  ['#样例系统/module/g5', (s) => { const r = stepRow(s, 'j-5.9'), q = stepRow(s, 'j-5.4')
    return r.includes('<b>4. 改了以后重新报上去</b><span class="jk">不顺利时才重走的</span></div>') && r.includes('<div><span class="none">没有达成树上的目的</span></div>') && r.includes('<td><div class="jc"></div></td>')
      && q.includes('<b>3. 扣成了以后，系统把申报行记成已扣款</b><span class="jk">系统接着办的，或者要先备好的</span></div>') && !stepRow(s, 'j-5.1').includes('class="jk"') && secOf(s, 'plan').includes('<td class="jj" rowspan="4">') },
    "MODULES.g5.jobs[4].steps.push({ id: 'j-5.9', title: '改了以后重新报上去', again: true }); " + roleV('g5', '财务')],
  // 一个节点写了途径、同时又写了 parts：它也算到得了的目的。树上途径、落点那几行一直在（收着也在），点它那一行展开的是「如何拆为子目的」和子节点；叫到它的行为的那一步，达成的目的里有它
  ['#样例系统/module/g2', (s) => { const [a, b] = mainHtml(s).split('<!--next-->'), n = nodeOf(a, 'g-2.1'), r = b.slice(b.indexOf('data-step-row="j-5.1"'), b.indexOf('</tr>', b.indexOf('data-step-row="j-5.1"')))
    return n.includes('data-goal-fold="样例系统/g2/g-2.1" data-open="0"><span class="tri">▸</span>') && n.includes('<span class="cnt">4 个子目的</span></div><div class="gl2"><i class="gq">途径</i><span class="chip bh" data-pop="act:act-5">基金账户-扣</span></div><div class="gl2"><i class="gq">落点</i><span>基金账户-余额</span></div></div>')
      && !n.includes('如何拆为子目的') && goalIds(r) === 'g-2.1,g-2.1.4,g-2.2' },
    "Object.assign(MODULES.g2.goals[1].parts[0], { way: '基金账户-扣', act: 'act-5', land: '基金账户-余额' }); " + tree('g2') + "; const a = els.main.innerHTML; " + roleV('g2', '财务') + "; els.main.innerHTML = a + '<!--next-->' + els.main.innerHTML"],
  // 第三栏：这一步叫到的行为所在的核心数据（蓝色实心的小块，点了看它的看板），功能、响应、这些功能用到的服务各一个小块（号加名字），点了开各自的窗口
  ['#样例系统/module/g2', (s) => stepRow(s, 'j-1.1').includes('<td><div class="jc"><span class="chip core" data-pop="core:0">参与者档案</span><span class="chip fn" data-pop="fn:f-1">f-1 照决定通知书建立参与者档案</span><span class="chip sv" data-pop="svc:s-1">s-1 参与者登记：核对这个编号还没有建过档案</span></div></td>')
    && stepRow(s, 'j-3.2').includes('<td><div class="jc"><span class="chip core" data-pop="core:1">基金账户</span><span class="chip ch" data-pop="chain:c-1">c-1 分到资金以后</span></div></td>') && popup(s).includes('<div class="pw" data-kind="svc">'),
    roleV('g2') + '; ' + tapMain('[data-pop]', { pop: 'svc:s-1' })],
  // 叫到的行为是顶层 concepts 里的概念的（发票行）：小块是空心的，点了看概念图；一步叫到两样核心数据的行为，两样都列
  ['#样例系统/module/g5', (s) => stepRow(s, 'j-2.1').includes('<div class="jc"><span class="chip part" data-pop="concept:发票行">发票行</span><span class="chip fn" data-pop="fn:f-2">') && stepRow(s, 'j-2.3').includes('<span class="chip core" data-pop="core:0">服务记录</span><span class="chip ch" data-pop="chain:c-1">'), roleV('g5')],
  ['#样例系统/module/g5', (s) => stepRow(s, 'j-5.1').includes('<div class="jc"><span class="chip core" data-pop="core:2">申报行</span><span class="chip core" data-pop="core:0">服务记录</span><span class="chip fn" data-pop="fn:f-5">f-5 把服务记录写成申报行并报给政府</span><span class="chip sv" data-pop="svc:s-1">s-1 找出还没有申报的服务记录</span></div>'), roleV('g5', '财务')],
  // 步骤写了 note 的：小字先是为什么，再跟一行 note，再下面是达成的目的；件事写了 why 的，标题下面一行小字
  ['#样例系统/module/g2', (s) => stepRow(s, 'j-1.1').includes('<div class="jw">老人交来决定通知书，要给她留一份档案，以后签协议、分资金、记服务都记在这一份上。</div><div class="jw">通知书不全的先退回去补。</div><div class="jg"><i class="gq">达成的目的</i>')
    && secOf(s, 'plan').includes('<code>j-1</code><b>照决定通知书替一位老人建立参与者档案</b></div><div class="jw">后面的事都要这份档案。</div><div class="jd">'),
    "MODULES.g2.jobs[0].steps[0].note = '通知书不全的先退回去补。'; MODULES.g2.jobs[0].why = '后面的事都要这份档案。'; " + roleV('g2')],
  // 点角色的页签换一个角色
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan'); return m.includes('<button data-role-tab="财务" data-key="样例系统/g2" class="on">财务　1 件事</button>') && m.includes('data-step-row="j-5.1"') && !m.includes('data-step-row="j-1.1"') },
    roleV('g2') + '; ' + tapMain('[data-role-tab]', { key: '样例系统/g2', roleTab: '财务' })],
  // 点一条达成的目的：「业务目的及模型」那一块展开、换到「业务目的拆解」，它上面的每一层都展开，这个节点显眼一下（带 hi）；再重画就不再闪
  ['#样例系统/module/g2', (s) => { const [a, b] = mainHtml(s).split('<!--next-->'), cut = (h) => h.slice(h.indexOf('data-sec="model"'), h.indexOf('data-sec="plan"'))
    return a.includes('<div class="sec open" data-sec="model">') && cut(a).includes('<button data-model-tab="tree" data-key="样例系统/g2" class="on">') && cut(a).includes('data-goal-fold="样例系统/g2/g-2.1" data-open="1"') && cut(a).includes('<div class="gd leaf hi" data-goal-node="g-2.1.4">')
      && count(cut(a), ' hi"') === 1 && cut(b).includes('<div class="gd leaf" data-goal-node="g-2.1.4">') && !cut(b).includes(' hi"') },
    "modelTab['样例系统/g2'] = 'parts'; " + roleV('g2', '财务') + '; ' + tapMain('[data-goal]', { goal: 'g-2.1.4' }) + "; const a = els.main.innerHTML; render(); els.main.innerHTML = a + '<!--next-->' + els.main.innerHTML"],
  // 最下面一块「没有哪一步用到的」：没被任何步骤用到的功能、响应、服务，照样能点开；服务算在用它的功能上；样例里没有，就不出这一块
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'plan'), w = m.slice(m.indexOf('<div class="warn"><span>没有哪一步用到的：</span>'))
    return m.includes('</table><div class="warn"><span>没有哪一步用到的：</span>') && w.includes('<span class="chip fn" data-pop="fn:f-4">f-4 照申报行从基金账户扣款</span><span class="chip fn" data-pop="fn:f-6">f-6 查看基金账户还能用多少</span><span class="chip ch" data-pop="chain:c-1">c-1 分到资金以后</span><span class="chip sv" data-pop="svc:s-2">s-2 找到要扣的基金账户</span></div>')
      && !w.includes('svc:s-1') && !w.includes('fn:f-1') && popup(s).includes('<div class="pw" data-kind="fn"><div class="ph"><b>照申报行从基金账户扣款</b>') },
    "{ const st = Object.fromEntries(allSteps(MODULES.g2).map((x) => [x.s.id, x.s])); delete st['j-4.1'].fns; delete st['j-3.2'].chains; delete st['j-5.1'].fns } " + roleV('g2') + '; ' + tapMain('[data-pop]', { pop: 'fn:f-4' })],
  ['#样例系统/module/g5', (s) => !secOf(s, 'plan').includes('没有哪一步用到的') && !secOf(s, 'plan').includes('class="warn"'), roleV('g5')],
  // 步骤指着的功能、响应业务文件里没有：标红说一句
  ['#样例系统/module/g2', (s) => stepRow(s, 'j-1.1').includes('<span class="chip nf">f-99：业务文件里没有这项功能</span><span class="chip nf">c-99：业务文件里没有这条响应</span>'),
    "MODULES.g2.jobs[0].steps[0].fns = ['f-99']; MODULES.g2.jobs[0].steps[0].chains = ['c-99']; " + roleV('g2')],
  // ---- 主要流程速览：每一步上多两样小标 ----
  // 步骤写了 stage 的，框的右上方用小字标出段名；写了 jobs 的，功能的标签下面排「角色 · 步骤标题」的小标，点了到角色视角看这一步；别的主题办的一步（没写功能）也照样标段名。折行照原来的，画的东西都在画布里
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'tours')
    return [...m.matchAll(/<text class="ts"[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join() === '建档,建档,签协议,签协议,分到资金,分到资金' && [...m.matchAll(/<g class="tj" data-jstep="([^"]+)">/g)].map((x) => x[1]).join() === 'j-1.1,j-2.2,j-3.1,j-3.2'
      && />照护伙伴 · 照决定通知书建立参与者档案<\/text><\/g>/.test(m) && count(m, '<g class="tg" data-pop="fn:') === 3 && tourBoxes(m).length === 6 && inBounds(m) }, open('g2', 'tours')],
  ['#样例系统/module/g5', (s) => { const m = secOf(s, 'tours'), b = tourBoxes(m)
    return [...m.matchAll(/<text class="ts"[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join() === '记下服务,记下服务,申报,审核,扣款,出月结单' && [...m.matchAll(/<g class="tj" data-jstep="([^"]+)">/g)].map((x) => x[1]).join() === 'j-2.1,j-2.2,j-2.3,j-5.1,j-5.2,j-5.4,j-6.1'
      && b.length === 6 && inBounds(m) }, open('g5', 'tours')],
  // 段名的小字在这一步的框上方、靠右，不压角色的标签；「角色 · 步骤」的小标在功能的标签下面，一个一行
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'tours'), b = tourBoxes(m)[1], ts = [...m.matchAll(/<text class="ts" x="([-\d.]+)" y="([-\d.]+)"/g)].map((x) => ({ x: +x[1], y: +x[2] }))[1]
    const tg = m.match(/<g class="tg" data-pop="fn:f-1"><rect x="([-\d.]+)" y="([-\d.]+)"/), tj = m.match(/<g class="tj" data-jstep="j-1.1"><rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/)
    return ts.x === b.x + b.w && ts.y < b.y && +tj[2] > +tg[2] + 20 && +tj[1] === b.x && +tg[2] > b.y + b.h }, open('g2', 'tours')],
  // 点「角色 · 步骤」的小标：到角色视角看这一步；jobs 指着的步骤没有的：标红说一句，点不动
  ['#样例系统/module/g2', (s) => secOf(s, 'plan').includes('<td class="js hi" data-step-row="j-3.2">') && secOf(s, 'plan').includes('class="on">照护伙伴　4 件事</button>'), open('g2', 'tours') + '; ' + tapMain('[data-jstep]', { jstep: 'j-3.2' })],
  ['#样例系统/module/g2', (s) => { const m = secOf(s, 'tours'); return m.includes('<g class="tj miss"><rect') && m.includes('>j-9.9：各角色要办成的事里没有这一步</text>') && inBounds(m) }, "MODULES.g2.tours[0].steps[1].jobs = ['j-9.9']; " + open('g2', 'tours')],
  // ---- 窗口里跟着改的 ----
  // 行为的窗口：照旧显示它自己的 why（业务目的那一行）；下面「达成的目的」是树上 act 指着它的那几个节点，点了跳到树上；不再有「对着目的 p-…」，也不说「还没有写它为了哪条业务目的」
  ['#样例系统/module/g2', (s) => { const p = popup(s), l = lineOf(p, '达成的目的')
    return p.includes('<div class="am"><i>业务目的</i><b>做了的服务从她名下对着这一类服务的账户里出钱，每扣一笔都查得到。</b></div><div class="am"><i>达成的目的</i><span><span class="ga" data-goal="g-2.1.4">每扣一笔都查得到：')
      && goalIds(l) === 'g-2.1.4,g-2.2' && !p.includes('对着目的') && !p.includes('还没有写它为了哪条业务目的') && !p.includes('没有找到目的') && p.includes('<div class="am"><i>做什么</i>') && inBounds(p) }, "popFrom('act:act-5')"],
  // 没进树的行为：写「没进目的的树」；行为上还留着 for 的，不拿它显示，也不因为它找不到说什么
  ['#样例系统/module/g2', (s) => { const p = popup(s); return lineOf(p, '达成的目的').includes('<span><span class="none">没进目的的树</span></span>') && goalIds(p) === '' && p.includes('<i>业务目的</i><b>先分到一部分、后来补到全额的，账户上的钱要跟着补上。</b>') && !p.includes('p-9.9') && !p.includes('业务目的里没有这一条') && !p.includes('没有找到目的') },
    "MODULES.g2.goals[1].parts[0].parts.splice(2, 1); MODULES.g2.core[1].actions[2].for = 'p-9.9'; popFrom('act:act-6')"],
  // 点窗口里一条达成的目的：窗口都关掉，跳到树上那个节点
  ['#样例系统/module/g2', (s) => popup(s) === '' && mainHtml(s).includes('<div class="gd leaf hi" data-goal-node="g-2.2">') && secOf(s, 'model').includes('class="on">业务目的拆解</button>'), "popFrom('act:act-5'); popFrom('fn:f-4'); " + tapPop('[data-goal]', { goal: 'g-2.2' })],
  // 服务的窗口：照旧显示它自己的 why；不说「还没有写它为了哪条业务目的」，没有「对着目的」
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="am"><i>业务目的</i><b>一位老人只有一份档案。</b></div><div class="am"><i>做什么</i>') && !p.includes('还没有写它为了哪条业务目的') && !p.includes('对着目的') && inBounds(p) }, "popFrom('svc:s-1')"],
  // 功能的窗口：原来显示它为了哪条目的的地方是两行，「用在」是用到它的步骤（角色 · 步骤标题），「达成的目的」照它叫的行为算
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="am"><i>业务目的</i><b>服务做了、申报了，这一行的钱要从她名下对应的那个账户里扣掉。</b></div><div class="am"><i>用在</i><span><span class="ga" data-jstep="j-5.1">财务 · 照申报行从基金账户扣款</span></span></div><div class="am"><i>达成的目的</i><span><span class="ga" data-goal="g-2.1.4">')
      && goalIds(lineOf(p, '达成的目的')) === 'g-2.1.4,g-2.2' && !p.includes('对着目的') && inBounds(p) }, "popFrom('fn:f-4')"],
  // 功能的步骤里真有调用别的主题的一步的：达成的目的里有树上那个外部调用的节点
  ['#样例系统/module/g2', (s) => { const p = popup(s); return goalIds(lineOf(p, '达成的目的')) === 'g-1.2,g-1.3' && stepIds(lineOf(p, '用在')) === 'j-2.2' && p.includes('>调用 · 服务方与协议</text>') }, "popFrom('fn:f-2')"],
  // 查看的功能只出「用在」那一行，不算它达成了哪个目的
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="am"><i>用在</i><span><span class="ga" data-jstep="j-4.1">照护伙伴 · 查看基金账户还能用多少</span></span></div><div class="am"><i>做什么</i>') && !p.includes('达成的目的') && p.includes('<i>看的是</i>') }, "popFrom('fn:f-6')"],
  // 没有哪一步用到的功能：「用在」那一行说一句；叫的行为都没进树的：「没有达成树上的目的」
  ['#样例系统/module/g2', (s) => { const p = popup(s); return lineOf(p, '用在').includes('<span class="none">没有哪一步用到它</span>') && lineOf(p, '达成的目的').includes('<span class="none">没有达成树上的目的</span>') },
    "MODULES.g2.jobs[4].steps[0].fns = []; for (const x of goalNodes(MODULES.g2)) if (x.n.act === 'act-5') x.n.act = 'act-0'; popFrom('fn:f-4')"],
  // 响应的窗口：也是「用在」「达成的目的」两行；点「用在」里的一步：窗口关掉，到角色视角看这一步
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="pb"><div class="am"><i>用在</i><span><span class="ga" data-jstep="j-3.2">照护伙伴 · 系统开出她名下的基金账户，先前只分到一部分的补到全额</span></span></div><div class="am"><i>达成的目的</i>') && goalIds(lineOf(p, '达成的目的')) === 'g-2.1.2,g-2.1.3' && !p.includes('对着目的') && inBounds(p) }, "popFrom('chain:c-1')"],
  ['#样例系统/module/g2', (s) => popup(s) === '' && secOf(s, 'plan').includes('<td class="js hi" data-step-row="j-3.2">'), "popFrom('chain:c-1'); " + tapPop('[data-jstep]', { jstep: 'j-3.2' })],
  // 规则细说：for 指着步骤号的显示「为了：角色 · 步骤标题」；指着目的号的显示那条目的；两处都没有这个号的说一句；没写 for 的说还没有写它为了哪一步
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="rf2">为了：<span class="ga" data-jstep="j-5.1">财务 · 照申报行从基金账户扣款</span></div><div class="rf2">出处：申报格式 v1.14 第 4 节</div>') && !p.includes('对着目的') && !p.includes('业务目的里没有这一条') },
    "openWin('g2', 'fn', 'f-4').open = { rules: true }; drawPop()"],
  ['#样例系统/module/g2', (s) => { const p = popup(s); return count(p, '<div class="rd" data-rule=') === 4 && p.includes('<div class="rf2">为了：<span class="ga" data-goal="g-2.2">同一笔钱只有一处说了算：做了的服务，钱只从她名下对着这一类服务的基金账户里出。</span></div>')
      && p.includes('<div class="rf2">为了：j-9.9，各角色要办成的事里、目的的树上都没有这个号</div>') && p.includes('<div class="rf2 none">还没有写它为了哪一步</div>') && p.includes('<div class="rf2">为了：<span class="ga" data-jstep="j-3.2">') },
    "{ const R = ruleOf(MODULES.g2); R['r-10'].for = 'g-2.2'; R['r-11'].for = 'j-9.9'; delete R['r-3'].for } openWin('g2', 'act', 'act-5').open = { rules: true }; drawPop()"],
  // 页面上不再有「取数」，都叫「查询」：功能图里用到的服务那一格头上写「查询」
  ['#样例系统/module/g2', (s) => { const p = popup(s); return !html.includes('取数') && p.includes('<g class="sb svc" data-pop="svc:s-2" data-id="s-2">') && />查询<\/text>/.test(p) && !p.includes('取数') }, "popFrom('fn:f-4')"],
  // ---- 步骤图（行为、功能、响应、服务的窗口共用）的折行和分叉 ----
  // 新写法的主题：主线上总共 n 格，排数是 n 除以 4 往上取整，每排的格数尽量匀。5 格排成 3、2（放得下一排也折）；7 格排成 4、3；4 格是一排
  ['#样例系统/module/g2', (s) => { const b = flowBoxes(popup(s)), ys = [...new Set(b.map((x) => x.y + x.h / 2))]
    return b.length === 5 && ys.length === 2 && b.filter((x) => x.y + x.h / 2 === ys[0]).length === 3 && b.filter((x) => x.y + x.h / 2 === ys[1]).length === 2 && b[3].x === b[0].x && inBounds(popup(s)) }, WIDE("popFrom('act:act-1')")],
  ['#样例系统/module/g5', (s) => { const b = flowBoxes(popup(s)), ys = [...new Set(b.map((x) => x.y + x.h / 2))]
    return b.length === 7 && ys.length === 2 && b.filter((x) => x.y + x.h / 2 === ys[0]).length === 4 && b.filter((x) => x.y + x.h / 2 === ys[1]).length === 3 && inBounds(popup(s)) }, WIDE("popFrom('act:act-1')")],
  ['#样例系统/module/g2', (s) => { const b = flowBoxes(popup(s)); return b.length === 4 && new Set(b.map((x) => x.y + x.h / 2)).size === 1 && inBounds(popup(s)) }, WIDE("popFrom('fn:f-1')")],
  // 没写 goals 的主题照原来的折法：同一个行为 5 格，窗口放得下就排成一排
  ['#样例系统/module/g2', (s) => { const b = flowBoxes(popup(s)); return b.length === 5 && new Set(b.map((x) => x.y + x.h / 2)).size === 1 && inBounds(popup(s)) }, PRE + 'render(); ' + WIDE("popFrom('act:act-1')")],
  // 一排放不下四格的窄窗口：再多排一排，不出画布
  ['#样例系统/module/g5', (s) => { const b = flowBoxes(popup(s)), ys = [...new Set(b.map((x) => x.y + x.h / 2))]; return b.length === 7 && ys.length === 3 && inBounds(popup(s)) }, "popFrom('act:act-1')"],
  // 分叉第一种（alt 加 callsWhen，几条只走一条、每条叫一个行为）：几个行为叠在一列，线上写各自的情形；两个行为都算进叫到的行为
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p).filter((x) => x.type === 'act')
    return b.length === 2 && b[0].x === b[1].x && b[1].y > b[0].y + b[0].h && count(p, '<g class="wl">') === 2 && !p.includes('class="cd"') && !p.includes('class="sb fork"') && goalIds(lineOf(p, '达成的目的')) === 'g-2.1.2,g-2.1.3' && inBounds(p) }, "popFrom('chain:c-1')"],
  // 分叉第二种（branches，几条只走一条、每条叫几个行为）：主线上多一格「分路」；几条路排在主线下面，一条路一排，各条路的头一格左边对齐，前面写这条路的情形；
  // calls 里的 { text, only } 是不经过行为的一步；这条路自己的 callsWhen 里的行为也画出来；带条件的格子上面标「只在……时做，否则跳过」
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p), by = (id) => b.find((x) => x.id === id), fork = b.find((x) => x.type === 'fork'), step = b.find((x) => x.type === 'step')
    const main = by('act-3'), r1 = by('act-4'), r2 = by('act-6'), mid = (x) => x.y + x.h / 2
    return b.map((x) => x.type + ':' + x.id).join() === 'act:act-3,fork:,act:act-4,step:,act:act-6' && mid(fork) === mid(main) && fork.x > main.x && r1.y > main.y + main.h && r2.y > r1.y + r1.h && r1.x === r2.x && mid(step) === mid(r1) && step.x > r1.x + r1.w
      && />分路<\/text>/.test(p) && />不经过行为的一步<\/text>/.test(p) && [...p.matchAll(/<g class="wl"><rect[^>]*\/><text[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join() === '她名下还没有基金账户,先前分到的是一部分'
      && [...p.matchAll(/<text class="cd"[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join('') === '只在开了两个以上时做，否则跳过只在补的钱大于零时做，否则跳过' && r1.pop === 'act:act-4' && inBounds(p) }, ROADS + WIDE("popFrom('fn:f-3')")],
  // 分路的线：从「分路」那一格往下，回到最左边，再进每条路头一格的左边，一条路一条带箭头的线；各条路上引起的副作用也进右边的汇总
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p), r1 = b.find((x) => x.id === 'act-4'), r2 = b.find((x) => x.id === 'act-6'), fork = b.find((x) => x.type === 'fork')
    const ends = [...p.matchAll(/<path class="ln" d="M ([-\d.]+) ([-\d.]+) L [^"]*L ([-\d.]+) ([-\d.]+)" marker-end="url\(#a\)"\/>/g)].map((m) => ({ x0: +m[1], y0: +m[2], x: +m[3], y: +m[4] })).filter((e) => e.x0 === fork.x + fork.w / 2)
    return ends.length === 2 && ends[0].y0 === fork.y + fork.h && ends[0].x === r1.x - 2 && ends[0].y === r1.y + r1.h / 2 && ends[1].x === r2.x - 2 && ends[1].y === r2.y + r2.h / 2 && fxSum(p) === fxUnder(p) && fxSum(p) === 8 }, ROADS + WIDE("popFrom('fn:f-3')")],
  // branches 里的行为一样算进「叫到的行为」「达成的目的」：功能的窗口和角色视角里用到它的那一步，都多出两条路上的两个目的
  ['#样例系统/module/g2', (s) => goalIds(lineOf(popup(s), '达成的目的')) === 'g-2.1.1,g-2.1.2,g-2.1.3' && goalIds(stepRow(s, 'j-3.1')) === 'g-2.1.1,g-2.1.2,g-2.1.3' && stepRow(s, 'j-3.1').includes('<span class="chip core" data-pop="core:0">参与者档案</span><span class="chip core" data-pop="core:1">基金账户</span>'),
    ROADS + roleV('g2') + "; popFrom('fn:f-3')"],
  // 只写了 branches、没写 calls 的功能也算拆过，照样画步骤图；响应一样能写 branches
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p); return !p.includes('还没有拆出它叫的行为') && b.map((x) => x.type + ':' + x.id).join() === 'fork:,act:act-4,step:,act:act-6' && inBounds(p) },
    ROADS + "delete allFns(MODULES.g2).find((x) => x.id === 'f-3').calls; " + WIDE("popFrom('fn:f-3')")],
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p); return b.map((x) => x.type + ':' + x.id).join() === 'event:,dec:r-14,fork:,act:act-4,act:act-6' && b[3].x === b[4].x && b[4].y > b[3].y + b[3].h && b[3].y > b[2].y + b[2].h && goalIds(lineOf(p, '达成的目的')) === 'g-2.1.2,g-2.1.3' && inBounds(p) },
    "{ const c = MODULES.g2.chains[0]; delete c.alt; delete c.callsWhen; c.calls = []; c.branches = [{ when: '她名下还没有基金账户', calls: ['act-4'] }, { when: '先前分到的是一部分', calls: ['act-6'] }] } " + WIDE("popFrom('chain:c-1')")],
  // 分叉第三种（只写 callsWhen、不写 alt，不互斥、各看各的条件）：还是主线上的一串，一个行为一格、在同一排，每格上面标「只在……时做，否则跳过」；callsWhen 里的行为也算进叫到的行为
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p).filter((x) => x.type === 'act')
    return b.map((x) => x.id).join() === 'act-4,act-6' && b[0].y + b[0].h / 2 === b[1].y + b[1].h / 2 && b[1].x > b[0].x + b[0].w && !p.includes('<g class="wl">') && !p.includes('class="sb fork"')
      && [...p.matchAll(/<text class="cd"[^>]*>([^<]*)<\/text>/g)].map((x) => x[1]).join('') === '只在她名下还没有基金账户时做，否则跳过只在先前分到的是一部分时做，否则跳过' && goalIds(lineOf(p, '达成的目的')) === 'g-2.1.2,g-2.1.3' && inBounds(p) }, EACH + WIDE("popFrom('chain:c-1')")],
  ['#样例系统/module/g2', (s) => goalIds(stepRow(s, 'j-3.2')) === 'g-2.1.2,g-2.1.3', EACH + roleV('g2')],
  // 「只在……时做」的小字在它那一格的正上方，不压上面的东西，也不出画布
  ['#样例系统/module/g2', (s) => { const p = popup(s), b = flowBoxes(p).find((x) => x.id === 'act-4'), t = [...p.matchAll(/<text class="cd" x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => ({ x: +m[1], y: +m[2] }))
    return t.length === 4 && t[0].x === b.x && t[1].x === b.x && t[0].y < t[1].y && t[1].y < b.y && t[1].y > b.y - 12 }, EACH + WIDE("popFrom('chain:c-1')")],
  // 样例里两个主题的每一个行为、功能、响应、服务的窗口都画得出：不出画布，没有「还没有拆出」，没有对不上的行为、服务、功能、副作用
  ...['g2', 'g5'].map((t) => ['#样例系统/module/' + t, (s) => { const m = mainHtml(s).match(/<!--wins:(\d+),(\d+)-->/); return !!m && +m[1] > 12 && m[1] === m[2] },
    `{ const m = MODULES.${t}, keys = [...allActs(m).map((y) => 'act:' + y.a.id), ...allFns(m).map((f) => 'fn:' + f.id), ...m.chains.map((c) => 'chain:' + c.id), ...allSvcs(m).map((x) => 'svc:' + x.id)]; let ok = 0
      for (const k of keys) { closeAll(); popFrom(k); const p = els.pop.innerHTML; if (!els.pop.hidden && inBounds(p) && !p.includes('还没有拆出') && !p.includes('业务文件里没有') && !p.includes('没对上') && fxSum(p) === fxUnder(p)) ok++ }
      closeAll(); els.main.innerHTML += '<!--wins:' + keys.length + ',' + ok + '-->' }`]),
  // ---- 全局图上面每个主题的业务目的 ----
  // 写了 goals 的主题取目的的树的每个根的目的，一个根一条；没写 goals 的主题照旧取 purposes
  ['#样例系统/map', (s) => { const m = mainHtml(s)
    return m.includes('<td><a href="#module/g2">参与者档案与她名下的钱</a></td><td><div>后面的服务有一份说了算的依据：她批到了什么、签了什么协议。</div><div>随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。</div></td>')
      && m.includes('<td><a href="#module/g5">服务发生与申报</a></td><td><div>每一次服务都照政府的要求留痕，查的时候拿得出依据。</div><div>交给政府的申报行要通得过政府的审核。</div><div>老人每个月要看得到自己用了哪些服务、每一项花了多少钱。</div></td>')
      && m.includes('<span class="none">业务目的还没写</span>') }],
  ['#样例系统/map', (s) => { const m = mainHtml(s)
    return m.includes('<td><a href="#module/g2">参与者档案与她名下的钱</a></td><td><div>随时说得清每位老人名下的钱：分到多少、扣了多少、还剩多少。</div><div>后面的服务有一份说了算的依据：她批到了什么、签了什么协议。</div></td>')
      && m.includes('<td><a href="#module/g5">服务发生与申报</a></td><td><div>每一次服务都照政府的要求留痕，查的时候拿得出依据。</div><div>交给政府的申报行要通得过政府的审核。</div><div>老人每个月要看得到自己用了哪些服务、每一项花了多少钱。</div></td>') }, 'MODULES.g2 = fresh(G2PUR); render()'],
  // goals 写了、还是空的一列的主题：说业务目的还没写
  ['#样例系统/map', (s) => count(mainHtml(s), '<span class="none">业务目的还没写</span>') === 4, 'MODULES.g2.goals = []; render()'],
  // ---- 别的 ----
  // 左边栏：新写法的样例里 g2 业务上 5 条待定、g5 业务上 5 条待定，加上流程上的 2 条，一共 12 条
  ['#map', (s) => nav(s).includes('<small>12 条没答</small>')],
  // 数据格式注释里写着新写法的键，和 purposes 只有没写 goals 的主题还读
  ['#map', () => ['goals: [节点]', "jobs: [{ id: 'j-1', by, title, done, why?,", 'flows: [{ title, purpose, why?,', 'purposes 只有没写 goals 的主题还读', 'stage?, jobs?: [步骤号]', 'branches: [{ when, calls: [行为号 | { text, only? }], callsWhen? }]', '落在几样上的用全角分号「；」隔开', '旧样子的树不画',
    '改成指角色的步骤号（j-1.1）', '不再写的：purposes；行为（actions）和服务（services）的 for（why 照旧写）；概念文件里栏（fields）的 for 和 why'].every((t) => html.includes(t))],
  // 样例里的 g2、g5 不再写 purposes，行为、服务上没有 for，概念的栏上没有 for 和 why；规则的 for 都指着一步
  ['#map', (s) => mainHtml(s).includes('<!--clean:true-->'),
    "{ const ok = ['g2', 'g5'].every((t) => { const m = MODULES[t], ids = new Set(allSteps(m).map((x) => x.s.id)); return !('purposes' in m) && isNew(m) && allActs(m).every((y) => !('for' in y.a)) && allSvcs(m).every((x) => !('for' in x)) && m.rules.every((r) => ids.has(r.for)) && (CONCEPTS[t].concepts ?? []).every((n) => fieldsOf(n).every((f) => !('for' in f) && !('why' in f))) }); els.main.innerHTML += '<!--clean:' + ok + '-->' }"],
];
let bad = 0, isNew = false;
for (const c of cases) {
  if (c === NEW) { isNew = true; continue }
  const [h, ok, tail, data] = c;
  let out;
  global.window = { addEventListener() {}, DATA: data };
  try { out = run(h, tail, isNew ? '' : PRE) } catch (e) { console.log(h, 'ERROR', e.message); bad++; continue }
  const pass = out.length > 0 && ok(out);
  console.log(h, tail ? '(' + tail.slice(0, 24) + ')' : '', out.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
console.log(cases.length - 1, '条，', bad ? bad + ' 条不过' : '全过');
process.exit(bad ? 1 : 0);
