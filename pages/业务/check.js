// 给 document、location 装个假的，把页面脚本跑一遍，各视图各 render 一次；报错就说明页面会白板
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
const el = (id) => (els[id] ??= { innerHTML: '', hidden: false, addEventListener() {}, dataset: {}, className: '', style: {} });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, addEventListener() {} };
global.window = { addEventListener() {} };
global.location = { hash: '' };
global.innerWidth = 1200; global.innerHeight = 800;
// tail：跑完页面脚本再接着跑的一句，用来模拟点了一个概念、答了一条问题
const run = (hash, tail = '') => { global.location.hash = hash; els.main = undefined; els.nav = undefined; eval(script + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML; };
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
const nav = (s) => s.split('<!--nav-->')[1]
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
  // 左边栏：流程那一行红点带条数（1 条待定规则 + 1 个没答的问题 = 2），上下文那行汇总（再加 g2 业务上 1 条待定 = 3）
  ['#map', (s) => nav(s).includes('老人注册<i class="open">2</i>') && nav(s).includes('<small>5 条没答</small>')],
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
  // ---- 业务（模块业务）：三层页签 ----
  // 默认落在功能、第一组、第一项：页签三层，左边操作意图和要用到的数据，中间业务数据「新记下 → 待核」，动作是箭头上的灰字；用在流程哪一步链过去
  ['#样例系统/module/g6', (s) => s.includes('class="mtabs l1"') && s.includes('class="mtabs l2"') && s.includes('class="mtabs l3"') && s.includes('<a href="#module/g6/功能" class="on">功能 <small>3</small>')
    && s.includes('<a href="#module/g6/功能/1/f-1" class="on">登记老人先付的报销') && s.includes('页面上叫「报销」') && s.includes('操作意图') && s.includes('新记下 → 待核') && s.includes('<span class="marr"><i>登记老人先付的报销</i>')
    && s.includes('href="#flow/g6-01-报销">报销</a> 第 2 步') && !s.includes('顺带留下的'), '', STAGES],
  // 地址记着点到哪一项：第一组第二项，右边顺带留下的、规则
  ['#样例系统/module/g6/功能/1/f-2', (s) => s.includes('<a href="#module/g6/功能/1/f-2" class="on">核准报销并记成服务记录') && s.includes('顺带留下的') && s.includes('一行一条') && s.includes('待核 → 已核') && s.includes('只核她签了协议的服务'), '', STAGES],
  // 第二组：第二层页签换到它，第三层是它的功能
  ['#样例系统/module/g6/功能/2', (s) => s.includes('<a href="#module/g6/功能/2" class="on">服务记录') && s.includes('<a href="#module/g6/功能/2/f-3" class="on">作废服务记录') && !s.includes('f-1"'), '', STAGES],
  // 内部流程：起因一个框，后面几个数据变化框，箭头上是条件
  ['#样例系统/module/g6/内部流程', (s) => s.includes('class="mchain"') && s.includes('起因') && s.includes('<i>一行一条</i>') && s.includes('余额 → 扣过') && (s.match(/class="mc /g) ?? []).length === 3, '', STAGES],
  // 工作流程：状态图，三个状态、四条线（往后、隔一个、往回），不出画布
  ['#样例系统/module/g6/工作流程/w-1', (s) => (s.match(/<g class="st">/g) ?? []).length === 3 && (s.match(/class="mv"/g) ?? []).length === 4 && s.includes('页面上叫完成') && s.includes('退回重核') && inBounds(s), '', STAGES],
  // 待定：页签标红带条数；没答的红框带偏向和按钮，答了的灰框写答案
  ['#样例系统/module/g6/待定', (s) => s.includes('<a href="#module/g6/待定" class="on red">待定 <small>1 条没答</small>') && s.includes('class="mask pending"') && s.includes('偏向：要') && s.includes('class="mask done"') && s.includes('答：一个月') && s.includes('data-module="g6" data-ask="q-1" data-opt="要"'), '', STAGES],
  // 单开时点一个答法：只改内存里的那条、重画成答了
  ['#样例系统/module/g2/待定', (s) => s.includes('class="mask pending"'), ''],
  ['#样例系统/module/g2/待定', (s) => (s.match(/class="mask pending"/g) ?? []).length === 1 && s.includes('答：不让建'), "answerModule({ module: 'g2', ask: 'q-1', opt: '不让建' })"],
  // 工作台上点：post 答，带主题、待定号、上下文、记号
  ['#样例系统/module/g6/待定', (s) => s.includes('<!--posted:{"module":"g6","context":"样例系统","ask":"q-1","text":"要","sig":"abc"}-->'),
    "answerModule({ module: 'g6', ask: 'q-1', opt: '要' }); els.main.innerHTML += '<!--posted:' + JSON.stringify(__posted) + '-->'", { ...STAGES, WB: { project: 'x' } }],
  // 没写业务的主题、没有的主题：说一句
  ['#样例系统/module/g2', (s) => s.includes('这个主题的业务还没写'), '', STAGES],
  ['#样例系统/module/g9', (s) => s.includes('里没有主题 g9'), '', STAGES],
  // 左边栏：「业务 · 按主题」一组，有业务的主题一行带红点；在它的页签上这一行亮、组展开
  ['#样例系统/module/g6/工作流程', (s) => nav(s).includes('data-g="样例系统/module"><span class="tri">▾</span>业务 · 按主题</div><div class="gb"><a href="#样例系统/module/g6" class="sub on">服务发生与扣费<i class="open">1</i></a>'), '', STAGES],
  // 流程收进大组「流程 · 按主题」，里面一个主题一个小组，没写主题的放「没写主题」，都默认折着
  ['#样例系统/map', (s) => nav(s).includes('data-g="样例系统/flows"><span class="tri">▸</span>流程 · 按主题</div><div class="gb" hidden>') && nav(s).includes('data-g="样例系统/flows/g6"><span class="tri">▸</span>服务发生与扣费</div><div class="gb" hidden>') && nav(s).includes('data-g="样例系统/flows/-"><span class="tri">▸</span>没写主题</div>') && nav(s).indexOf('核报销') < nav(s).indexOf('旧的'), '', STAGES],
  // 打开某份流程：它所在的大组、小组都自己展开，别的小组照旧折着
  ['#样例系统/flow/g6-02-核报销', (s) => nav(s).includes('data-g="样例系统/flows"><span class="tri">▾</span>流程 · 按主题</div><div class="gb">') && nav(s).includes('data-g="样例系统/flows/g6"><span class="tri">▾</span>服务发生与扣费</div><div class="gb">') && nav(s).includes('data-g="样例系统/flows/-"><span class="tri">▸</span>没写主题</div><div class="gb" hidden>'), '', STAGES],
  // 折着时大组、小组右边都是几条没答
  ['#样例系统/map', (s) => nav(s).includes('流程 · 按主题<i class="open">5</i>') && nav(s).includes('服务发生与扣费<i class="open">3</i>') && nav(s).includes('没写主题<i class="open">2</i>'), '', { ...STAGES, OPEN: { '样例系统/g6-01-报销': 1, '样例系统/g6-02-核报销': 2, '样例系统/99-旧的': 2 } }],
  // 功能图：要用到的数据，名字下面一行灰字是解释；只写名字的旧写法照认
  ['#样例系统/module/g2/功能/1/f-1', (s) => s.includes('<b>决定通知书</b><div class="note">政府评估后发给她的那一份'), ''],
  ['#样例系统/module/g6', (s) => s.includes('<div class="mc data"><b>外部发票</b></div>'), '', STAGES],
  // 业务概述：在最上面四段的下面、页签的上面，默认看模块职责；换一栏、收起，换了主题照旧记着
  ['#样例系统/module/g2', (s) => s.includes('<div class="intro"><div class="ih" data-intro-shut="1"><span class="tri">▾</span>业务概述</div>') && s.includes('<button data-intro-tab="duty" class="on">模块职责</button>') && !s.includes('data-intro-tab="context"') && !s.includes('data-intro-tab="concepts"') && s.indexOf('class="fr"') < s.indexOf('class="intro"') && s.indexOf('class="intro"') < s.indexOf('class="mtabs l1"'), ''],
  ['#样例系统/module/g2', (s) => s.includes('<button data-intro-tab="users" class="on">使用角色</button>') && s.includes('<b>照护伙伴</b>') && s.includes('<li>照决定通知书给她建档</li>'), "introSet({ tab: 'users' })"],
  ['#样例系统/module/g2', (s) => s.includes('<span class="tri">▸</span>业务概述</div></div>') && !s.includes('class="itabs"'), "introSet({ shut: true })"],
  ['#样例系统/module/g6', (s) => s.includes('<!--记着:usual,true-->'), "introSet({ tab: 'usual', shut: true }); useCx(context); els.main.innerHTML += '<!--记着:' + introState.tab + ',' + introState.shut + '-->'", STAGES],
  // 没写业务概述的：不画这一块
  ['#样例系统/module/g6', (s) => !s.includes('class="intro"'), "introSet({ shut: false })", STAGES],
  // ---- 核心数据：画在业务概述上面；每一站是一样数据，线上是业务 ----
  // 只有一样核心数据：不出页签；线上的功能能点到功能图
  ['#样例系统/module/g2', (s) => s.includes('class="cf"') && !s.includes('class="ctabs"') && s.includes('<div class="d core"><i>核心数据</i><b>参与者档案</b>') && s.indexOf('class="intro"') < s.indexOf('class="cf"') && s.includes('<a href="#module/g2/功能/1/f-1">f-1 照决定通知书建立参与者档案</a>'), "const was = MODULES.g2.core.pop(); coreTab['样例系统/g2'] = 0; render(); MODULES.g2.core.push(was)"],
  // 几样核心数据：排成页签，一次看一样；服务记录三条来路、两个去处，去处本身是另一样核心数据的，那个框能点
  ['#样例系统/module/g5', (s) => s.includes('<button data-core-tab="0" data-core-key="样例系统/g5" class="on">服务记录</button>') && s.includes('<button data-core-tab="1" data-core-key="样例系统/g5">照护管理记录</button>')
    && (s.match(/<div class="row">/g) ?? []).length === 5 && s.includes('<div class="d ev">外部服务方开来一张发票</div>') && !s.includes('class="d ext"') && s.includes('<i>也是核心数据 ›</i><b>申报行</b>') && s.includes('<i>也是核心数据 ›</i><b>月结单</b>'), "coreTab['样例系统/g5'] = 0; render()"],
  // 换到另一样：只画它的图
  ['#样例系统/module/g5', (s) => s.includes('class="on">照护管理记录</button>') && s.includes('<div class="d core"><i>核心数据</i><b>照护管理记录</b>') && (s.match(/<div class="row">/g) ?? []).length === 2 && !s.includes('发票行'.concat('</b>')), "coreTab['样例系统/g5'] = 1; render()"],
  // 图上的一站本身是另一样核心数据（直接关联）：那个框能点，点了切过去
  ['#样例系统/module/g5', (s) => s.includes('<div class="d  go" data-core-tab="0" data-core-key="样例系统/g5"><i>也是核心数据 ›</i><b>服务记录</b>'), "MODULES.g5.core[1].targets.unshift({ by: '记成一条', data: '服务记录' }); coreTab['样例系统/g5'] = 1; render(); MODULES.g5.core[1].targets.shift(); coreTab['样例系统/g5'] = 0"],
  // 来路写了 heads：两个起点先各画一行、并到一起，再画后面只写一遍的站
  ['#样例系统/module/g5', (s) => s.includes('<div class="d ev">起点甲</div>') && s.includes('<div class="d ev">起点乙</div>') && (s.match(/<b>汇合的那一站<\/b>/g) ?? []).length === 1 && s.includes('<div class="row"><div class="col in fork">'), "MODULES.g5.core[0].sources.unshift({ heads: [{ steps: [{ data: '起点甲', event: true, by: '甲交来' }] }, { steps: [{ data: '起点乙', event: true, by: '乙交来' }] }], steps: [{ data: '汇合的那一站', by: '照它记下' }] }); coreTab['样例系统/g5'] = 0; render(); MODULES.g5.core[0].sources.shift()"],
  // 来路的起点是别的主题里发生的一件事：画成别的主题的虚框
  ['#样例系统/module/g5', (s) => s.includes('<div class="d ext"><i>别的主题：上游的主题</i>上游那边一件事成了</div>'), "MODULES.g5.core[0].sources.unshift({ steps: [{ data: '上游那边一件事成了', event: true, topic: '上游的主题', by: '照它记下' }] }); coreTab['样例系统/g5'] = 0; render(); MODULES.g5.core[0].sources.shift()"],
  // 看板只讲核心数据：框里是装着的概念、不带状态；线上标创建；底下一行用到的资料
  ['#样例系统/module/g2', (s) => s.includes('<small>装着：批到的分级和路径、签了的服务协议</small>') && !s.includes('已建档 / 已签协议') && s.includes('<span><u class="op new">创建</u>照通知书上批下来的内容建立档案') && !s.includes('class="cu"'), ''],
  ['#样例系统/module/g5', (s) => s.includes('<div class="cu"><span>用到的资料</span><b title="做的是清单上的哪一项，照它查">服务清单</b>') && s.includes('<u class="op upd">更新</u>申报通过以后扣款') && s.includes('class="d ext"') && s.includes('别的主题：参与者档案与她名下的钱'), "coreTab['样例系统/g5'] = 2; render(); coreTab['样例系统/g5'] = 0"],
  // 线上的删除；旧数据里标着 change 的来路不画
  ['#样例系统/module/g5', (s) => s.includes('<u class="op del">删除</u>整份撤掉') && !s.includes('改了已有的那一条'), "MODULES.g5.core[0].targets.unshift({ op: '删除', by: '整份撤掉', data: '草稿' }); MODULES.g5.core[0].sources.push({ change: true, steps: [{ data: '改了已有的那一条', event: true, by: '改' }] }); coreTab['样例系统/g5'] = 0; render(); MODULES.g5.core[0].targets.shift(); MODULES.g5.core[0].sources.pop()"],
  // 功能图的业务数据：标做了什么，列出记下、会改的项，冒号前面加粗
  ['#样例系统/module/g2/功能/1/f-1', (s) => s.includes('<div class="mk">业务数据</div><u class="op new">创建</u><b>这位老人的参与者档案</b>') && s.includes('<div class="ed"><div class="mk">记下</div><div><b>批到的分级和路径</b>：照决定通知书记下</div></div>'), ''],
  ['#样例系统/module/g2/功能/1/f-2', (s) => s.includes('<u class="op upd">更新</u>') && s.includes('<div class="mk">会改</div><div><b>签了的服务协议</b>：'), ''],
  // 模块职责：写成列表的一条一行；还是一段话的按句号、分号拆开
  ['#样例系统/module/g2', (s) => s.includes('<ul class="duty"><li>管每位老人的档案和她名下的基金、账户：建档，记下她签了协议、分到了资金，按申报从账户扣款。</li><li>不管评估怎么做、服务怎么排、发票怎么开。</li></ul>'), "introSet({ tab: 'duty', shut: false })"],
  ['#样例系统/module/g2', (s) => s.includes('<ul class="duty"><li>甲；</li><li>乙。</li></ul>'), "const was = MODULES.g2.intro.duty; MODULES.g2.intro.duty = '甲；乙。'; introState.tab = 'duty'; introState.shut = false; render(); MODULES.g2.intro.duty = was"],
  // 主题页最上面四段：背景、核心数据和概念（核心数据实心能点、别的空心）、业务目的（对着背景哪一句、出处）、具体的需求（落到的核心数据和功能）
  ['#样例系统/module/g5', (s) => s.includes('<div class="fh">背景</div><div class="fbg">政府出钱替老人买居家照护服务：注册服务方先把服务做了') && s.includes('<a class="fc" href="#module/g5" data-core-tab="2" data-core-key="样例系统/g5">申报行</a>') && s.includes('<span class="fd">发票行</span><span>')
    && s.includes('<b>1</b>交给政府的申报行要通得过政府的审核。</div><div class="ffrom">背景里对着：政府审核通过才付钱　出处：人 2026-11-24 说') && s.includes('<a class="ff" href="#module/g5/功能/3/f-5">f-5 ') && s.indexOf('class="fr"') < s.indexOf('class="intro"'), ''],
  // 没有需求落到它上面的核心数据：最下面列一行，指到待定
  ['#样例系统/module/g5', (s) => s.includes('还没有需求落到它上面的核心数据：月结单。它是为了什么，见<a href="#module/g5/待定">待定</a>。'), ''],
  // 业务目的没写出处：标「推出来的，等你确认」；每样核心数据都有需求落到的，不列那一行
  ['#样例系统/module/g2', (s) => s.includes('后面的服务有一份说了算的依据：她批到了什么、签了什么协议。<span class="fs">推出来的，等你确认</span>') && !s.includes('还没有需求落到它上面'), ''],
  // 业务目的还没写的主题：背景、核心数据和概念照画，说一句还没写
  ['#样例系统/module/g2', (s) => s.includes('<div class="none">业务目的还没写。</div>') && s.includes('<div class="fh">背景</div>'), "const was = MODULES.g2.purposes; delete MODULES.g2.purposes; render(); MODULES.g2.purposes = was"],
  // 功能上：操作意图下面列出对着的需求；没有需求落到它上面的功能不列
  ['#样例系统/module/g5/功能/2/f-2', (s) => s.includes('<div class="fup"><i>对着的需求</i>外部来的服务要留下凭据：'), ''],
  ['#样例系统/module/g5/功能/4/f-6', (s) => s.includes('出这个月的月结单') && !s.includes('class="fup"'), ''],
  // 全局图上面：整个上下文的背景，和每个主题的业务目的；没写的主题说一句
  ['#map', (s) => s.includes('<div class="fh">背景</div><div class="fbg">政府出钱替老人买居家照护服务：先评估批给她多少') && s.includes('<td><a href="#module/g5">服务发生与申报</a></td><td><div>交给政府的申报行要通得过政府的审核。</div>') && s.includes('<span class="none">业务目的还没写</span>') && s.indexOf('class="fr"') < s.indexOf('<svg')],
  // 没写核心数据的主题：不画这一块
  ['#样例系统/module/g6', (s) => !s.includes('class="cf"'), '', STAGES],
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
];
let bad = 0;
for (const [h, ok, tail, data] of cases) {
  let out;
  global.window = { addEventListener() {}, DATA: data };
  try { out = run(h, tail) } catch (e) { console.log(h, 'ERROR', e.message); bad++; continue }
  const pass = out.length > 0 && ok(out);
  console.log(h, tail ? '(' + tail.slice(0, 24) + ')' : '', out.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
console.log(cases.length, '条，', bad ? bad + ' 条不过' : '全过');
process.exit(bad ? 1 : 0);
