// 给 document、location 装个假的，把页面脚本跑一遍，各视图各 render 一次；报错就说明页面会白板。
// 页面挂在 main、浮层、document 上的处理函数都记下来，断言里能模拟点一下、按一下键
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
// tail：跑完页面脚本再接着跑的一句，用来模拟点了一个概念、答了一条问题。交回的一串分三截：主区、左边栏、浮层（关着就是空的）
const run = (hash, tail = '') => { global.location.hash = hash; for (const k of Object.keys(els)) delete els[k]; for (const k of Object.keys(docOn)) delete docOn[k]; eval(script + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML + '\n<!--pop-->\n' + (els.pop && !els.pop.hidden ? els.pop.innerHTML : ''); };
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
// 主区、浮层各自的内容；主题页的某一块（从它的开头到下一块之前）
const mainHtml = (s) => s.split('\n<!--nav-->\n')[0]
const popup = (s) => s.split('<!--pop-->\n')[1] ?? ''
const secOf = (s, k) => { const m = mainHtml(s), a = m.indexOf('<div class="sec', Math.max(0, m.indexOf('data-sec="' + k + '"') - 40)), b = m.indexOf('<div class="sec', a + 10); return m.indexOf('data-sec="' + k + '"') < 0 ? '' : m.slice(a, b < 0 ? undefined : b) }
const count = (s, t) => s.split(t).length - 1
// 跑完页面再接着跑的一句：把这个主题的几块展开、重画
const open = (t, ...ks) => ks.map((k) => `secOpen['样例系统/${t}/${k}'] = true`).join('; ') + '; render()'
const ALL = ['intro', 'tours', 'core', 'purposes', 'asks']
// 断言要改动注入的数据时，给它一份抄出来的，改动不带到后面的断言里
const fresh = (d) => JSON.parse(JSON.stringify(d))
// 模拟点一下、按一下键：页面挂在 main、浮层、document 上的处理函数照样跑；at 造一个「点中了什么」的目标
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
  // 左边栏：流程那一行红点带条数（1 条待定规则 + 1 个没答的问题 = 2），上下文那行汇总（再加 g2 业务上 3 条待定、g5 业务上 2 条待定 = 7）
  ['#map', (s) => nav(s).includes('老人注册<i class="open">2</i>') && nav(s).includes('<small>7 条没答</small>')],
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
  // 五块的顺序和标题；默认都收着：每块只有一行（三角、标题、一句提示），没有展开的内容、没有「收起」，浮层关着
  ['#样例系统/module/g2', (s) => { const m = mainHtml(s), hs = [...m.matchAll(/<div class="sec[^"]*" data-sec="([a-z]+)"><div class="sh" data-sec-toggle="样例系统\/g2\/[a-z]+"><span class="tri">(.)<\/span><b>([^<]+)<\/b><span class="hint">/g)]
    return hs.map((x) => x[1]).join() === 'intro,tours,core,purposes,asks' && hs.map((x) => x[3]).join() === '业务概述,主要流程速览,核心数据和概念,业务目的及方案,待定' && hs.every((x) => x[2] === '▸')
      && !m.includes('class="sb"') && !m.includes('收起') && popup(s) === '' && s.includes('参与者档案与她名下的钱 <span class="kind">· 业务</span></h1>') }],
  // 收着时的那句提示：业务概述是一句简介，别的是数出来的；待定有没答的标红
  ['#样例系统/module/g2', (s) => secOf(s, 'intro').includes('<span class="hint">注册服务方替每位老人留一份档案，并管着政府开在她名下的钱。</span>') && secOf(s, 'tours').includes('<span class="hint">最常走的 2 条流程：谁做了什么、碰到哪些概念</span>')
    && secOf(s, 'core').includes('<span class="hint">2 样核心数据，1 份状态转换流程</span>') && secOf(s, 'purposes').includes('<span class="hint">2 条业务目的</span>') && secOf(s, 'asks').includes('<div class="sec red" data-sec="asks">') && secOf(s, 'asks').includes('<span class="hint">3 条没答</span>')],
  ['#样例系统/module/g5', (s) => secOf(s, 'core').includes('<span class="hint">4 样核心数据，3 份状态转换流程</span>') && secOf(s, 'purposes').includes('<span class="hint">3 条业务目的</span>') && secOf(s, 'asks').includes('<span class="hint">2 条没答</span>')],
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
      && count(t, 'class="chip cm"') === 4 && count(t, 'class="chip wf"') === 3 && count(t, 'class="chip fc"') === 7 && !t.includes('<div class="fd"') && html.includes('.chip.fc{') }, open('g5', 'core')],
  // 每组最后：「用到」是概念图上和这样核心数据（或它装着的概念）连着线的资料；「交给」是去处里带主题的数据，点了去那个主题
  ['#样例系统/module/g5', (s) => { const g = secOf(s, 'core').split('<div class="cg">').slice(1)
    return g[0].includes('<div class="cr" style="padding-left:24px"><i class="ld">用到</i><span class="chip res">服务清单</span><span class="nt">政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。</span></div>') && !g[0].includes('服务协议') && count(g.join(''), '<i class="ld">用到</i>') === 1
      && g[2].includes('<div class="cr" style="padding-left:24px"><i class="ld">交给</i><a class="chip ext" href="#module/g2">基金账户<small>参与者档案与她名下的钱</small></a><span class="nt">一笔基金按批了的服务类型分开的账户，扣款只从对应的那一个扣。</span></div>') && count(g.join(''), '<i class="ld">交给</i>') === 1 }, open('g5', 'core')],
  // 最下面的组，有才出：没连到哪一样核心数据的资料、不归哪一样核心数据的概念（也带状态转换标签）；样例里没有名字对不上概念的状态转换流程
  ['#样例系统/module/g5', (s) => { const g = secOf(s, 'core').split('<div class="cg">').slice(1)
    return g[4].startsWith('<div class="gl">用到的资料</div><div class="cr" style="padding-left:0px"><span class="chip res">服务协议</span><span class="nt">老人跟注册服务方签的那一份；')
      && g[5].startsWith('<div class="gl">不归哪一样核心数据的</div><div class="cr" style="padding-left:0px"><span class="chip part" data-pop="concept:发票行">发票行</span><span class="chip wf" data-pop="wf:w-2">状态转换 · 2 个状态</span><span class="chip fc" data-fields="样例系统/g5/发票行">4 栏 ▸</span><span class="nt">外部服务方开来的发票上的一行，对着一次服务。</span>') && !secOf(s, 'core').includes('名字对不上概念的状态转换流程') }, open('g5', 'core')],
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'core'); return t.includes('<div class="gl">不归哪一样核心数据的</div><div class="cr" style="padding-left:0px"><span class="chip part" data-pop="concept:她名下的基金">她名下的基金</span><span class="nt">政府开在老人名下、替她保管的一笔钱。</span>')
    && t.includes('<i class="ld">交给</i><a class="chip ext" href="#module/g5">申报行<small>服务发生与申报</small></a><span class="nt">向政府申报的一行，对着一条服务记录。</span>') && !t.includes('<div class="gl">用到的资料</div>') && !t.includes('<i class="ld">用到</i>') && count(t, '<div class="cg">') === 3 }, open('g2', 'core')],
  // 状态转换流程的名字对不上概念：那个概念后面没有标签，状态图列到最下面那一组
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core'); return t.includes('data-pop="core:0">服务记录</span><span class="chip cm"') && t.includes('<div class="gl">名字对不上概念的状态转换流程</div><div class="cr" style="padding-left:0px"><b class="wn">服务记录的状态</b><span class="chip wf" data-pop="wf:w-1">状态转换 · 2 个状态</span>') },
    "MODULES.g5.workflows[0].title = '服务记录的状态'; " + open('g5', 'core')],
  // 三层上下层：一层缩进一格；资料连在装着的概念上也算这样核心数据用到的；去处里同一样数据、同一个主题只列一行；那个主题没写业务的，点了去它的概念图；说明取那边概念定义的头一句
  ['#样例系统/module/g1', (s) => { const t = secOf(s, 'core')
    return t.includes('style="padding-left:24px"><span class="chip part" data-pop="core:0:明细">明细</span><span class="chip wf" data-pop="wf:w-1">状态转换 · 1 个状态</span><span class="chip fc" data-fields="样例系统/g1/明细">1 栏 ▸</span><span class="nt">单据上的一行。</span>') && t.includes('style="padding-left:48px"><span class="chip part" data-pop="core:0:批注">批注</span><span class="nt">明细上的一句话。</span>')
      && t.includes('<span class="chip cm" data-pop="concept:单据">概念图</span><span class="chip fc" data-fields="样例系统/g1/单据">2 栏 ▸</span><span class="nt">一张单据。</span>') && t.includes('<i class="ld">用到</i><span class="chip res" data-pop="concept:模板">模板</span><span class="nt">开单照它抄。</span>')
      && count(t, '<i class="ld">交给</i>') === 2 && t.includes('<a class="chip ext" href="#concepts/g2">货<small>库房</small></a><span class="nt">收进库房的货。</span>') && t.includes('<span class="chip ext">对账单<small>对账（财务系统）</small></span><span class="nt">告诉外面</span>')
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
    open('g5', 'core') + "; const tap = () => fire(els.main.on.click, { target: at({ '[data-fields]': { dataset: { fields: '样例系统/g5/服务记录' } } }) }); tap(); const a = els.main.innerHTML; tap(); els.main.innerHTML = a + '<!--2-->' + els.main.innerHTML"],
  // 展开的一行：栏名加粗；写了 ref 的，后面蓝色小字「→ 数据名 · 主题名」，再后面灰字是 note；只有名字的只有栏名。缩进比它那个概念多一格
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'core')
    return t.includes('<div class="fd" style="padding-left:24px"><b>老人</b><span class="rf">→ 参与者档案 · 参与者档案与她名下的钱</span><span class="nt">这一次服务是给哪一位老人做的。</span></div>')
      && t.includes('<div class="fd" style="padding-left:24px"><b>日期</b><span class="nt">这一次服务是哪天做的。</span></div>') && t.includes('<div class="fd" style="padding-left:24px"><b>数量</b></div>')
      // 指着的数据在同一个主题里、只写了 ref 的：只有「→ 数据名」
      && t.includes('<div class="fd" style="padding-left:48px"><b>发票行</b><span class="rf">→ 发票行</span><span class="nt">照发票记下的，写它对着发票上的哪一行。</span></div>') && html.includes('.fd .rf{font-size:11.5px;color:var(--accent-ink,var(--accent))}') },
    "fieldsOpen['样例系统/g5/服务记录'] = fieldsOpen['样例系统/g5/凭据'] = true; " + open('g5', 'core')],
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
    return count(t, '<div class="pu">') === 3 && !t.includes('<table>') && t.includes('<span class="no">1</span><span class="tx">交给政府的申报行要通得过政府的审核。</span><span class="cnt">3 条更细的目的</span>')
      && t.includes('<button data-purposes-all="1" data-key="样例系统/g5">全部展开</button><button data-purposes-all="0" data-key="样例系统/g5">全部收起</button>')
      && t.includes('每个月向老人交代清楚：用了哪些服务、花了多少钱。<span class="guess">推出来的，等你确认</span></span><span class="cnt">1 条更细的目的</span>') && count(t, 'class="guess"') === 1 && !t.includes('class="warn"') }, open('g5', 'purposes')],
  // 展开一条：先一行对着背景哪一句和出处，再一张表，一行一条更细的目的：左边更细的目的加粗、下面小字「做法」，右边是标签
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return count(t, '<div class="pu open">') === 1 && count(t, '<tr>') === 3 && t.includes('<div class="pf">背景里对着：政府审核通过才付钱　出处：人 2026-11-24 说：系统要提供出符合政府审核的申报项</div><table><tr><td><b>报上去的每一行都对得上一次真做了的服务。</b><div class="how"><i>做法</i>申报行只能从服务记录写出来，一条服务记录对一行。</div><div class="ns">出处：申报格式 v1.14 第 4 节</div></td><td><div class="tags">')
      // 标签：核心数据实心、别的数据空心、功能、内部流程（样式和功能分开），能点的带 data-pop
      && t.includes('<div class="tags"><span class="chip core" data-pop="core:2">申报行</span><span class="chip fn" data-pop="fn:f-5">f-5 把服务记录写成申报行并报给政府</span></div>')
      && t.includes('<span class="chip core" data-pop="core:0">服务记录</span><span class="chip part">服务清单</span><span class="chip part">服务协议</span><span class="chip fn" data-pop="fn:f-1">')
      && t.includes('<span class="chip fn" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</span><span class="chip ch" data-pop="chain:c-2">c-2 申报行审核通过以后</span>') && html.includes('.chip.ch{') && html.includes('.chip.fn{') }, "purposeOpen['样例系统/g5/0'] = true; " + open('g5', 'purposes')],
  // 别的数据：装在核心数据里的点了看那样核心数据（那一格标黄），概念图上有的点了看概念图
  ['#样例系统/module/g5', (s) => secOf(s, 'purposes').includes('<div class="tags"><span class="chip part" data-pop="concept:发票行">发票行</span><span class="chip part" data-pop="core:0:凭据">凭据</span><span class="chip fn" data-pop="fn:f-2">'), "purposeOpen['样例系统/g5/1'] = true; " + open('g5', 'purposes')],
  // 点标题行展开、再点收起；全部展开、全部收起
  ['#样例系统/module/g5', (s) => { const [a, b, c, d] = mainHtml(s).split('<!--next-->'); return count(a, '<div class="pu open">') === 1 && count(b, '<div class="pu open">') === 0 && count(c, '<div class="pu open">') === 3 && count(c, '<tr>') === 7 && count(d, '<div class="pu open">') === 0 },
    open('g5', 'purposes') + "; const out = [], click = (map) => { fire(els.main.on.click, { target: at(map) }); out.push(els.main.innerHTML) }; click({ '[data-purpose]': { dataset: { key: '样例系统/g5', purpose: '1' } } }); click({ '[data-purpose]': { dataset: { key: '样例系统/g5', purpose: '1' } } }); click({ '[data-purposes-all]': { dataset: { key: '样例系统/g5', purposesAll: '1' } } }); click({ '[data-purposes-all]': { dataset: { key: '样例系统/g5', purposesAll: '0' } } }); els.main.innerHTML = out.join('<!--next-->')"],
  // 没写 aim 的旧写法：左边只有那一句，不出「做法」；没写对着背景哪一句、也没写出处的不出那一行
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'); return t.includes('</div><table><tr><td>只有一句的旧写法</td><td><div class="tags"><span class="chip core" data-pop="core:1">基金账户</span>') && !t.includes('class="pf"') },
    "const p = MODULES.g2.purposes[0]; delete p.from; delete p.source; p.needs = [{ text: '只有一句的旧写法', cores: ['基金账户'] }]; purposeOpen['样例系统/g2/0'] = true; " + open('g2', 'purposes')],
  // 最下面三行提醒，有才出：没有目的落到它上面的核心数据（指到待定）、没挂到目的上的功能、没挂到目的上的内部流程，都能点
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return t.includes('<div class="warn"><span>没有目的落到它上面的核心数据：</span><span class="chip core" data-pop="core:3">月结单</span><span>它是为了什么，见<a href="#module/g5/待定">待定</a>。</span></div>')
      && t.includes('<div class="warn"><span>没有挂到哪一条目的上的功能：</span><span class="chip fn" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</span><span class="chip fn" data-pop="fn:f-6">f-6 出这个月的月结单</span></div>') && t.includes('<div class="warn"><span>没有挂到哪一条目的上的内部流程：</span><span class="chip ch" data-pop="chain:c-2">c-2 申报行审核通过以后</span></div>') && count(t, 'class="warn"') === 3 },
    "MODULES.g5.purposes.pop(); MODULES.g5.purposes[0].needs.pop(); " + open('g5', 'purposes')],
  // 业务目的还没写的主题：说一句；功能和内部流程照样列在下面，点得开
  ['#样例系统/module/g6', (s) => { const t = secOf(s, 'purposes'); return t.includes('<p class="none">业务目的还没写。</p>') && !t.includes('全部展开') && t.includes('<span class="chip fn" data-pop="fn:f-1">f-1 登记老人先付的报销</span><span class="chip fn" data-pop="fn:f-2">') && t.includes('<span class="chip fn" data-pop="fn:f-3">f-3 作废服务记录</span>') && t.includes('<span class="chip ch" data-pop="chain:c-1">c-1 报销核过以后</span>') && !t.includes('没有目的落到它上面的核心数据') },
    open('g6', 'purposes'), STAGES],
  // 更细的目的写了出处的：做法下面一行小字写出处，不标；没写出处的：旁边标「推出来的」，没有出处那一行
  ['#样例系统/module/g5', (s) => { const t = secOf(s, 'purposes')
    return count(t, '<tr>') === 7 && count(t, '<div class="ns">出处：') === 6 && count(t, '<span class="guess">推出来的</span>') === 1
      && t.includes('<tr><td><b>老人每个月看得到自己用了哪些服务、每一项花了多少钱。</b><span class="guess">推出来的</span><div class="how"><i>做法</i>月底把这个月的服务记录和照护管理记录汇总成月结单，一条记录列一行，发给老人。</div></td>')
      && t.includes('<b>做了的服务一次不漏。</b><div class="how"><i>做法</i>服务不管从哪里来，都要落成服务记录。</div><div class="ns">出处：人 2026-11-24 说：按照要求为服务留痕</div></td>') && html.includes('.pu .ns{') },
    "for (const i of [0, 1, 2]) purposeOpen['样例系统/g5/' + i] = true; " + open('g5', 'purposes')],
  ['#样例系统/module/g2', (s) => { const t = secOf(s, 'purposes'); return count(t, '<span class="guess">推出来的</span>') === 1 && t.includes('<b>看档案就知道她签没签服务协议、签的是哪一份。</b><span class="guess">推出来的</span><div class="how">') && count(t, '<div class="ns">出处：') === 3 },
    "for (const i of [0, 1]) purposeOpen['样例系统/g2/' + i] = true; " + open('g2', 'purposes')],

  // ---- 第五块：待定 ----
  // 展开：没答的红框带偏向和按钮，答了的灰框写答案
  ['#样例系统/module/g6', (s) => { const t = secOf(s, 'asks'); return t.includes('class="mask pending"') && t.includes('偏向：要') && t.includes('class="mask done"') && t.includes('答：一个月') && t.includes('data-module="g6" data-ask="q-1" data-opt="要"') && t.includes('data-other="1">另说</button>') }, open('g6', 'asks'), STAGES],
  // 从别处点待定的链接过来（地址带 /待定）：替人把待定那一块展开一次，别的块照旧收着，地址换成主题页的；人收起以后重画不再自己展开
  ['#样例系统/module/g2/待定', (s) => { const m = mainHtml(s); return secOf(s, 'asks').includes('<div class="sec open red" data-sec="asks">') && count(m, '<div class="sec open') === 1 && count(m, 'class="mask pending"') === 3 && m.includes('<!--at:#样例系统/module/g2,module/g2-->') },
    "els.main.innerHTML += '<!--at:' + location.hash + ',' + view + '-->'"],
  ['#样例系统/module/g2/待定', (s) => !mainHtml(s).includes('<div class="sec open'), "fire(els.main.on.click, { target: at({ '[data-sec-toggle]': { dataset: { secToggle: '样例系统/g2/asks' } } }) }); render()"],
  // 单开时点一个答法：只改内存里的那条、重画成答了，提示里的条数跟着减
  ['#样例系统/module/g2', (s) => count(secOf(s, 'asks'), 'class="mask pending"') === 2 && secOf(s, 'asks').includes('答：不让建') && secOf(s, 'asks').includes('<span class="hint">2 条没答</span>'), open('g2', 'asks') + "; answerModule({ module: 'g2', ask: 'q-1', opt: '不让建' })"],
  // 全答了：不标红，提示写都答了
  ['#样例系统/module/g5', (s) => secOf(s, 'asks').includes('<div class="sec" data-sec="asks">') && secOf(s, 'asks').includes('<span class="hint">2 条都答了</span>'), "answerModule({ module: 'g5', ask: 'q-1', opt: '是这个目的' }); answerModule({ module: 'g5', ask: 'q-2', opt: '是，一条记录列一行' })"],
  // 工作台上点：post 答，带主题、待定号、上下文、记号
  ['#样例系统/module/g6', (s) => s.includes('<!--posted:{"module":"g6","context":"样例系统","ask":"q-1","text":"要","sig":"abc"}-->'),
    "answerModule({ module: 'g6', ask: 'q-1', opt: '要' }); els.main.innerHTML += '<!--posted:' + JSON.stringify(__posted) + '-->'", { ...STAGES, WB: { project: 'x' } }],

  // ---- 浮层：全页共用一个 ----
  // 点主区里带 data-pop 的标签：浮层打开；点浮层的空白、点右上角、按 Esc 都关掉
  ['#样例系统/module/g2', (s) => { const [a, b, c, d] = s.split('<!--next-->'); return a.includes('<div class="pw" data-kind="fn">') && a.includes('<button class="x" data-pop-close="1">关闭 ✕</button>') && b === 'shut' && c === 'shut' && d.startsWith('shut') },
    "const out = [], see = () => out.push(els.pop.hidden ? 'shut' : els.pop.innerHTML), tap = () => fire(els.main.on.click, { target: at({ '[data-pop]': { dataset: { pop: 'fn:f-1' } } }) }); tap(); see(); fire(els.pop.on.click, { target: els.pop }); see(); tap(); fire(els.pop.on.click, { target: at({ '[data-pop-close]': {} }) }); see(); tap(); fire(docOn.keydown, { key: 'Escape' }); see(); els.main.innerHTML = out.join('<!--next-->')"],
  // 浮层只属于打开它的那个主题页：还在这一页重画（比如答了一条待定）照旧开着；换了页就关掉
  ['#样例系统/module/g2', (s) => popup(s).includes('data-kind="fn"') && popup(s).includes('照决定通知书建立参与者档案'), "popFrom('fn:f-1'); answerModule({ module: 'g2', ask: 'q-1', opt: '不让建' })"],
  ['#样例系统/module/g2', (s) => popup(s) === '' && s.includes('<svg'), "popFrom('fn:f-1'); view = 'map'; render()"],
  // 指不到东西的（功能号没有）：不开
  ['#样例系统/module/g2', (s) => popup(s) === '', "popFrom('fn:f-99')"],

  // ---- 浮层一：核心数据 ----
  // 左边来路、中间核心数据、右边去处，下面一行用到的资料；几样核心数据排成页签，一次看一样。服务记录三条来路、两个去处，去处本身是另一样核心数据的，那个框能点
  ['#样例系统/module/g5', (s) => { const p = popup(s)
    return p.includes('<div class="pw" data-kind="core"><div class="ph"><b>服务记录</b><span class="in">核心数据</span>') && p.includes('<div class="ch">核心数据 <span>4 样，一次看一样</span></div><div class="ptabs"><button data-pop="core:0" class="on">服务记录</button><button data-pop="core:1">照护管理记录</button>')
      && count(p, '<div class="row">') === 5 && p.includes('<div class="d ev">外部服务方开来一张发票</div>') && !p.includes('class="d ext"') && p.includes('<div class="d  go" data-pop="core:2"><i>也是核心数据 ›</i><b>申报行</b>') && p.includes('<div class="d  go" data-pop="core:3"><i>也是核心数据 ›</i><b>月结单</b>')
      // 线上标创建、更新、删除；是哪项功能做的，点了看功能图解
      && p.includes('<span><u class="op new">创建</u>直接记下这一次服务<em class="lk" data-pop="fn:f-1">f-1 记下自己的工作者做的一次服务</em></span>')
      // 用到的资料：只列概念图上和这样核心数据连着线的
      && p.includes('<div class="cu"><span>用到的资料</span><b title="政府定的服务组、服务类型、服务三层；做的是清单上的哪一项，照它查。">服务清单</b></div>') }, "popFrom('core:0')"],
  // 中间的框是类图的画法：核心数据的框里列出栏（写了 fields 的），套着它装着的概念，概念也列栏。
  // 栏照「核心数据和概念」那一块的规矩：指着下面装着的概念的不列（服务记录的「凭据」那一栏）；带说明或指向的，栏名加粗、后面是指向、下面一行小字是说明；只有名字的只写名字
  ['#样例系统/module/g5', (s) => { const p = popup(s)
    return p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>服务记录</div><div class="cb"><div class="fl"><b>老人</b><span class="rf">→ 参与者档案 · 参与者档案与她名下的钱</span><div class="fn">这一次服务是给哪一位老人做的。</div></div><div class="fl"><b>日期</b><div class="fn">这一次服务是哪天做的。</div></div><div class="fl"><b>服务项</b><span class="rf">→ 服务 · 服务清单</span><div class="fn">做的是服务清单上的哪一项。</div></div><div class="fl">数量</div><div class="fl">金额</div><div class="fl"><b>做服务的人</b><div class="fn">自己的工作者，或者外部服务方。</div></div>'
        + '<div class="kids"><div class="cls part"><div class="ct">凭据</div><div class="cb"><div class="fl"><b>凭据的种类</b><div class="fn">发票上的一行，或者老人交来的收据。</div></div><div class="fl"><b>发票行</b><span class="rf">→ 发票行</span><div class="fn">照发票记下的，写它对着发票上的哪一行。</div></div><div class="fl"><b>收据</b><div class="fn">照收据记下的，写它对着老人交来的哪一张收据。</div></div></div></div></div></div></div>')
      && !p.includes('<div class="fl"><b>凭据</b>') && !p.includes('<div class="fl">凭据</div>') && !p.includes('class="cls part hi"') }, "popFrom('core:0')"],
  // 没写 ref、栏名等于下面装着的概念的也不列：参与者档案的看板上没有「批到的分级和路径」「签了的服务协议」这两栏，这两个概念套在框里
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>参与者档案</div>') && count(p.split('<div class="kids">')[0], '<div class="fl">') === 7 && !p.includes('<div class="fl"><b>批到的分级和路径</b>') && !p.includes('<div class="fl">签了的服务协议</div>')
    && p.includes('<div class="kids"><div class="cls part"><div class="ct">批到的分级和路径</div>') && p.includes('<div class="cls part"><div class="ct">签了的服务协议</div><div class="cb"><div class="fl"><b>签的协议</b><span class="rf">→ 服务协议 · 服务方与协议</span>') }, "popFrom('core:0')"],
  // 栏多的排成几列：6 栏以上 2 列，11 栏以上 3 列，16 栏以上 4 列，框上带 cols2、cols3、cols4；不到 6 栏的不分列。装着的概念那一排占满整行
  ['#样例系统/module/g5', (s) => s.includes('<!--cols:cls core|cls core cols2|cls core cols2|cls core cols3|cls core cols3|cls core cols4|cls core cols4-->')
    && html.includes('.cf .cls.cols2>.cb{grid-template-columns:repeat(2,auto)}.cf .cls.cols3>.cb{grid-template-columns:repeat(3,auto)}.cf .cls.cols4>.cb{grid-template-columns:repeat(4,auto)}') && html.includes('.cf .cls.cols4>.cb>.kids{grid-column:1/-1}'),
    "const out = []; for (const n of [5, 6, 10, 11, 15, 16, 30]) { CONCEPTS.g5.concepts[1].fields = Array.from({ length: n }, (_, i) => '栏' + i); popFrom('core:0'); out.push(els.pop.innerHTML.match(/class=.(cls core[a-z0-9 ]*).><div class=.ct.><i>核心数据<.i>服务记录/)[1]) } els.main.innerHTML += '<!--cols:' + out.join('|') + '-->'"],
  // 分列只数列出来的栏：指着下面装着的概念的那一栏不算（5 栏再加一栏「凭据」还是不分列）
  ['#样例系统/module/g5', (s) => popup(s).includes('<div class="cls core"><div class="ct"><i>核心数据</i>服务记录</div>'), "CONCEPTS.g5.concepts[1].fields = ['一', '二', '三', '四', '五', { title: '凭据', ref: '凭据' }]; popFrom('core:0')"],
  // 看板这一种浮层最宽 1880、四周留白小一些，字和间距比别的浮层小一号；别的浮层照旧最宽 1400。浮层上记着现在开的是哪一种，关了就去掉
  ['#样例系统/module/g5', (s) => s.includes('<!--kinds:core,fn,-->') && html.includes('.pop .pw[data-kind="core"]{max-width:min(100%,1880px);') && html.includes('.pop[data-kind="core"]{padding:14px 12px}') && html.includes('max-width:min(100%,1400px);padding:16px 22px 20px;')
    && html.includes('.cf .cls .fl{font-size:11.5px;') && html.includes('.cls .fl{font-size:12.5px;'),
    "const ks = []; popFrom('core:0'); ks.push(els.pop.dataset.kind); popFrom('fn:f-1'); ks.push(els.pop.dataset.kind); closePop(); ks.push(els.pop.dataset.kind ?? ''); els.main.innerHTML += '<!--kinds:' + ks.join() + '-->'"],
  // 点的是装着的概念：标题写「X　装在核心数据「Y」里」，下面是它的完整定义，图上那一格标黄
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="ph"><b>凭据</b><span class="in">装在核心数据「服务记录」里，下面图上标黄的那一格就是它</span>') && p.includes('<p class="pd">一条服务记录是照什么记下的：发票上的哪一行，或者老人交来的哪一张收据。自己的工作者做的服务没有凭据。</p>') && count(p, '<div class="cls part hi"><div class="ct">凭据</div>') === 1 && html.includes('.cls.hi{') }, "popFrom('core:0:凭据')"],
  // 概念里再套下一层：三层一层套一层；同一层横着排、放不下换行（kids 是能换行的一排）
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="kids"><div class="cls part"><div class="ct">明细</div><div class="cb"><div class="fl">数量</div><div class="kids"><div class="cls part hi"><div class="ct">批注</div></div></div></div></div></div>') && html.includes('.cls .kids{display:flex;flex-wrap:wrap;'), "popFrom('core:0:批注')", DEEP],
  // 浮层里点页签、点图上是另一样核心数据的那一站：换到那一样。去处是别的主题的数据：画成别的主题的虚框，线上是这里办这件事的那项功能；没有连着线的资料就没有那一行
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<button data-pop="core:2" class="on">申报行</button>') && p.includes('<div class="cls core cols2"><div class="ct"><i>核心数据</i>申报行</div>') && count(p, '<div class="row">') === 2
    && p.includes('<u class="op upd">更新</u>审核通过的一行交去扣款<em class="lk" data-pop="fn:f-8">f-8 记下政府对申报行的审核结果</em></span></div><div class="tip"></div><div class="dw"><div class="d ext"><i>别的主题：参与者档案与她名下的钱</i><b>基金账户</b>') && !p.includes('class="cu"') },
    "popFrom('core:0'); fire(els.pop.on.click, { target: at({ '[data-pop]': { dataset: { pop: 'core:2' } } }) })"],
  // 只有一样核心数据：不出页签。这个主题还没有概念图的：用到的资料都列上，装着的概念照 parts
  ['#样例系统/module/g5', (s) => { const p = popup(s); return !p.includes('class="ptabs"') && p.includes('<div class="kids"><div class="cls part"><div class="ct">凭据</div></div></div>') && p.includes('<b title="老人跟注册服务方签的那一份；核对一项服务在不在她签的协议里，照它查。">服务协议</b>') },
    "MODULES.g5.core.length = 1; delete CONCEPTS.g5; popFrom('core:0')"],
  // 来路写了 heads：两个起点先各画一行、并到一起，再画后面只写一遍的站
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="d ev">起点甲</div>') && p.includes('<div class="d ev">起点乙</div>') && count(p, '<b>汇合的那一站</b>') === 1 && p.includes('<div class="row"><div class="col in fork">') },
    "MODULES.g5.core[0].sources.unshift({ heads: [{ steps: [{ data: '起点甲', event: true, by: '甲交来' }] }, { steps: [{ data: '起点乙', event: true, by: '乙交来' }] }], steps: [{ data: '汇合的那一站', by: '照它记下' }] }); popFrom('core:0')"],
  // 来路的起点是别的主题里发生的一件事：画成别的主题的虚框；线上的删除；旧数据里标着 change 的来路不画
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="d ext"><i>别的主题：上游的主题</i>上游那边一件事成了</div>') && p.includes('<u class="op del">删除</u>整份撤掉') && !p.includes('改了已有的那一条') },
    "const c = MODULES.g5.core[0]; c.sources.unshift({ steps: [{ data: '上游那边一件事成了', event: true, topic: '上游的主题', by: '照它记下' }] }); c.targets.unshift({ op: '删除', by: '整份撤掉', data: '草稿' }); c.sources.push({ change: true, steps: [{ data: '改了已有的那一条', event: true, by: '改' }] }); popFrom('core:0')"],

  // ---- 浮层二：功能 ----
  // 标题、号、页面上的叫法、一句做了什么。左边一列：操作意图的卡片（下面列着对着的目的）；其余输入各一个框，框里上面一行灰字是谁给的、下面是名字，说明在框左边的小卡上
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="pw" data-kind="fn"><div class="ph"><b>照决定通知书建立参与者档案</b><span class="in">f-1 · 功能 · 页面上叫「建档」</span>') && p.includes('<p class="pd">照决定通知书记下她批了哪一级、哪条路径</p>')
      && p.includes('<div class="fg"><div class="lc"><div class="mc intent"><div class="mk">操作意图</div>老人交来决定通知书，给她留一份档案，以后签协议、分资金、记服务都记在这一份上。<div class="fup"><i>对着的目的</i>她批到了什么，以政府发的决定通知书为准。</div></div>')
      && p.includes('<div class="fi"><span class="nt">政府评估后发给她的那一份，上面写着分级和路径</span><span class="bx"><i>老人交来的</i><b>决定通知书</b></span></div>') && count(p, 'class="bx"') === 3 && !p.includes('class="idt"') }, "popFrom('fn:f-1')"],
  // 中间是类图画法的框：蓝色的头是主数据（从业务数据的名字里认出来的概念），新建的标出来；被动到的每一项一行：前面标创建，名字，下面一句「记下：…」
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="mid"><div class="cls core"><div class="ct"><i>核心数据</i><u class="op new">创建</u>参与者档案</div><div class="cb"><div class="sn">这位老人的参与者档案</div><div class="ft">新记下 → 档案建好了，记着她批到的分级和路径</div><div class="ei"><u class="op new">创建</u><b>My Aged Care 编号</b><div class="el">记下：照决定通知书上印的编号记下</div></div>')
      // 是业务概念的那一项画成一格，里面一栏一行，每栏下面写它的逻辑：写了「概念 › 栏：逻辑」的照它；没写的，栏名和某项输入同名就写「照」加那项输入是谁给的
      && p.includes('<div class="ei"><div class="cls part"><div class="ct"><u class="op new">创建</u>批到的分级和路径<div class="el">记下：照决定通知书记下</div></div><div class="cb"><div class="fl"><b>分级</b><div class="el">照政府批的</div></div><div class="fl"><b>路径</b><div class="el">只记通知书上批的那一条，不替她另选</div></div></div></div></div>')
      // 图下面：规则、用在流程的哪一步、出处；没有顺带留下的就没有右边那一列
      && p.includes('<div class="mcap">规则</div><ul><li>一位老人只有一份档案，按 My Aged Care 编号认</li></ul>') && p.includes('<div class="mcap">用在流程的哪一步</div><ul><li><a href="#flow/01-老人注册">老人注册</a> 第 5 步</li></ul>') && p.includes('<div class="mcap">出处</div>手册 v4.4 §3 Participant') && !p.includes('顺带留下的') }, "popFrom('fn:f-1')"],
  // 动的是核心数据里装着的概念：头写核心数据（不标），里面套一个绿色的格子写这个概念（新建的标出来）；指明办的是哪条记录的输入（没写 by）画成一个 ID 标签
  ['#样例系统/module/g2', (s) => { const p = popup(s)
    return p.includes('<div class="cls core"><div class="ct"><i>核心数据</i>参与者档案</div><div class="cb"><div class="cls part main"><div class="ct"><u class="op new">创建</u>签了的服务协议</div><div class="cb"><div class="sn">这位老人档案上签了的服务协议</div>')
      && p.includes('<div class="ei"><u class="op new">创建</u><b>签约日期</b><div class="el">记下：记下协议上写的那一天</div></div>') && p.includes('<div class="fi"><span class="nt">记在哪一位老人的档案上</span><span class="idt"><u>ID</u>参与者档案</span></div>') && count(p, 'class="idt"') === 1 && count(p, 'class="bx"') === 2
      // 右边：顺带留下的，按新记录、状态改变、事件分组，每组一根线指过去
      && p.includes('<div class="rc"><div class="mcap">顺带留下的</div><div class="og"><span class="arr"></span><div class="oc"><div class="ok">事件</div><div class="mc out"><b>协议已签</b><div class="when">记下以后告知聊天 app，给她开聊天</div></div></div></div></div>') && html.includes('.cls.part>.ct{background:var(--data)}') }, "popFrom('fn:f-2')"],
  // 主数据只是更新的：头上不标；每一项前面标更新，下面一句「会改：…」；同一种顺带留下的并成一组、一根线
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="cls core"><div class="ct"><i>核心数据</i>参与者档案</div><div class="cb"><div class="sn">这位老人的参与者档案</div><div class="ft">档案上记着她签了协议，还没分到资金 → ') && p.includes('<div class="ei"><u class="op upd">更新</u><b>分到的资金</b><div class="el">会改：记下哪天分到、分到的是全额还是一部分</div></div>')
    && count(p, 'class="og"') === 1 && p.includes('<div class="ok">新记录</div><div class="mc out"><b>她名下的基金</b></div><div class="mc out"><b>基金账户</b><div class="when">批了几类服务就开几个</div></div>') }, "popFrom('fn:f-3')"],
  // 被动到的那一项是装着的概念、没有栏：画成一格、里面没有栏的那几行
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="ei"><div class="cls part"><div class="ct"><u class="op upd">更新</u>余额<div class="el">会改：减去这一行申报的金额</div></div></div></div>') && count(p, 'class="og"') === 1 && p.includes('<div class="ok">状态改变</div><div class="mc out"><b>申报行</b><div class="when">扣成了就记成已扣</div></div>') && p.includes('<div class="mcap">规则</div><ul><li>只能扣她批了的那一类服务的账户</li></ul>') }, "popFrom('fn:f-4')"],
  // 主数据是删除的：头上标出来，每一项下面一句「去掉：…」；几种顺带留下的各一组，照新记录、状态改变、事件的先后排
  ['#样例系统/module/g2', (s) => { const p = popup(s); return p.includes('<div class="ct"><i>核心数据</i><u class="op del">删除</u>基金账户</div>') && p.includes('<u class="op del">删除</u>余额<div class="el">去掉：减去这一行申报的金额</div>') && count(p, 'class="og"') === 3 && p.indexOf('<div class="ok">新记录</div>') < p.indexOf('<div class="ok">状态改变</div>') && p.indexOf('<div class="ok">状态改变</div>') < p.indexOf('<div class="ok">事件</div>') },
    "const f = MODULES.g2.groups[1].functions[0]; f.subject.op = '删除'; f.out.push({ kind: '事件', title: '已扣款' }, { kind: '新记录', title: '扣款记录' }); popFrom('fn:f-4')"],
  // 业务数据归别的主题（名字末尾括号里是那个主题）：认不出这个主题的概念，头照名字写、不标核心数据；末尾括号里的名字不拿来认
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="cls core"><div class="ct"><u class="op new">创建</u>已发邮件（消息通知）</div><div class="cb"><div class="ft">新记下 → 发了</div></div></div>'), "popFrom('fn:f-1')", DEEP],
  ['#样例系统/module/g1', (s) => popup(s).includes('<div class="ct"><u class="op new">创建</u>已发邮件（单据）</div>') && !popup(s).includes('<i>核心数据</i>'), "MODULES.g1.groups[0].functions[0].subject.title = '已发邮件（单据）'; popFrom('fn:f-1')", fresh(DEEP)],
  // 名字里带着的两个概念名一个包着另一个（月结单、月结单明细）：认长的那个；它装在月结单里，头写月结单、里面一格写月结单明细
  ['#样例系统/module/g5', (s) => popup(s).includes('<div class="cls core"><div class="ct"><i>核心数据</i>月结单</div><div class="cb"><div class="cls part main"><div class="ct"><u class="op new">创建</u>月结单明细</div><div class="cb"><div class="sn">这个月新添的月结单明细</div>'), "MODULES.g5.groups[3].functions[0].subject.title = '这个月新添的月结单明细'; popFrom('fn:f-6')"],
  // 旧写法：要用到的数据只写名字、业务数据没写 op 和 edits，照样画得出
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<b>登记老人先付的报销</b><span class="in">f-1 · 功能 · 页面上叫「报销」</span>') && p.includes('<div class="fi"><span class="idt"><u>ID</u>外部发票</span></div>') && p.includes('<div class="cls core"><div class="ct">报销</div><div class="cb"><div class="ft">新记下 → 待核</div></div></div>') && p.includes('href="#flow/g6-01-报销">报销</a> 第 2 步') }, "popFrom('fn:f-1')", STAGES],
  // 概念的栏写成对象的：格子里的栏名取它的 title；「概念 › 栏：逻辑」照栏名对上，不多出一行。并写的两栏拆成了一栏一条
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<div class="cls part"><div class="ct"><u class="op new">创建</u>凭据<div class="el">记下：记下这一条是照哪一张收据记的</div></div><div class="cb"><div class="fl"><b>凭据的种类</b></div><div class="fl"><b>发票行</b></div><div class="fl"><b>收据</b><div class="el">写上是老人交来的哪一张</div></div></div></div>')
    && !p.includes('[object Object]') && p.includes('<b>服务项</b><div class="el">记下：照收据上写的服务记下</div>') && p.includes('<b>金额</b><div class="el">记下：照收据上写的金额记下</div>') },
    "allFns(MODULES.g5).find((f) => f.id === 'f-4').subject.edits.push('凭据 › 收据：写上是老人交来的哪一张'); popFrom('fn:f-4')"],

  // ---- 浮层三：内部流程（沿用原来的画法）----
  // 起因一个框，后面几个数据变化框，箭头上是条件
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<div class="pw" data-kind="chain"><div class="ph"><b>报销核过以后</b><span class="in">c-1 · 内部流程') && p.includes('class="mchain"') && p.includes('起因') && p.includes('<i>一行一条</i>') && p.includes('余额 → 扣过') && count(p, 'class="mc ') === 3 }, "popFrom('chain:c-1')", STAGES],

  // ---- 浮层四：状态转换流程（沿用原来的状态图）----
  // 三个状态、四条线（往后、隔一个、往回），不出画布；没分段的没有页签
  ['#样例系统/module/g6', (s) => { const p = popup(s); return p.includes('<div class="pw" data-kind="wf"><div class="ph"><b>状态转换流程 · 报销</b><span class="in">w-1 · 3 个状态</span>') && count(p, '<g class="st">') === 3 && count(p, 'class="mv"') === 4 && p.includes('页面上叫完成') && p.includes('退回重核') && !p.includes('class="ptabs"') && inBounds(p) }, "popFrom('wf:w-1')", STAGES],
  // 分了段的：上面一排页签，一次看一段，没有「全部」；这一段的状态是实框，同它们有线连着的别的段的状态是虚线框，只画碰到这一段的线
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<span class="in">w-3 · 4 个状态，分 2 段，一次看一段</span>') && p.includes('<div class="ptabs"><button data-pop-stage="0" class="on">申报和审核</button><button data-pop-stage="1">通过以后</button></div>') && !p.includes('全部')
    && count(p, '<g class="st">') === 2 && count(p, '<g class="st ext">') === 1 && />已报给政府<\/text>/.test(p) && />被退回<\/text>/.test(p) && /<g class="st ext"><rect[^>]*\/><text[^>]*>审核通过<\/text>/.test(p) && !p.includes('已扣款') && count(p, 'class="mv"') === 3 && p.includes('被退回的申报行改了以后重新报，不另写一行。') && inBounds(p) && html.includes('.wf .st.ext rect{') }, "popFrom('wf:w-3')"],
  // 点页签换一段
  ['#样例系统/module/g5', (s) => { const p = popup(s); return p.includes('<button data-pop-stage="1" class="on">通过以后</button>') && count(p, '<g class="st">') === 2 && /<g class="st ext"><rect[^>]*\/><text[^>]*>已报给政府<\/text>/.test(p) && p.includes('已扣款') && !p.includes('被退回</text>') && count(p, 'class="mv"') === 2 && inBounds(p) },
    "popFrom('wf:w-3'); fire(els.pop.on.click, { target: at({ '[data-pop-stage]': { dataset: { popStage: '1' } } }) })"],

  // ---- 浮层五：概念图 ----
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
  // 点浮层里概念图上的虚框：关掉浮层，去那个主题的概念图
  ['#样例系统/module/g2', (s) => s.includes('<!--to:样例系统/concepts/g5,shut-->'), "popFrom('concept:基金账户'); fire(els.pop.on.click, { target: at({ '.stub[data-g]': { dataset: { g: 'g5', n: 'claim' } } }) }); els.main.innerHTML += '<!--to:' + location.hash + ',' + (els.pop.hidden ? 'shut' : 'open') + '-->'"],

  // ---- 旧地址：进来时浮出对应的浮层一次，然后地址换成主题页的 ----
  // 功能：带着组和功能号的，浮出那一项；主区是五块都收着的主题页；地址换掉了
  ['#样例系统/module/g2/功能/1/f-2', (s) => popup(s).includes('<div class="pw" data-kind="fn"><div class="ph"><b>在参与者档案上记下签了的服务协议</b>') && count(mainHtml(s), '<div class="sec') === 5 && !mainHtml(s).includes('<div class="sec open') && mainHtml(s).includes('<!--at:#样例系统/module/g2,module/g2-->'),
    "els.main.innerHTML += '<!--at:' + location.hash + ',' + view + '-->'"],
  // 只弹一次：关掉以后重画，不再弹出来
  ['#样例系统/module/g2/功能/1/f-2', (s) => popup(s) === '' && count(mainHtml(s), '<div class="sec') === 5, "closePop(); render()"],
  // 只带组的落到那一组的头一项；什么都没带的落到头一项
  ['#样例系统/module/g2/功能/2', (s) => popup(s).includes('<b>照申报行从基金账户扣款</b><span class="in">f-4 · 功能</span>')],
  ['#样例系统/module/g2/功能', (s) => popup(s).includes('<span class="in">f-1 · 功能 · 页面上叫「建档」</span>')],
  // 内部流程、工作流程（现在叫状态转换流程）的旧地址：各浮出那一份；没带号的落到头一份
  ['#样例系统/module/g5/内部流程/c-2', (s) => popup(s).includes('data-kind="chain"') && popup(s).includes('<b>申报行审核通过以后</b>') && s.includes('<!--at:#样例系统/module/g5-->'), "els.main.innerHTML += '<!--at:' + location.hash + '-->'"],
  ['#样例系统/module/g5/内部流程', (s) => popup(s).includes('<b>发票行核对过以后</b>')],
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
