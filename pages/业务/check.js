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
// 线不穿过两端以外的框：把每条线（M/L/C）取点，落进别的数据框、虚框（往里缩 3）就记一条；两端是起点、终点贴着的框（往外放 8）
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
const G6NOW = {"CONTEXTS":["养老系统"],"OPEN":{},"BIZ":{"养老系统":{"MAP":{"topics":[{"id":"g2","title":"建档与服务协议","c":2,"x":2,"y":0,"does":["d"],"concepts":["c"]},{"id":"g4","title":"老人名下的基金","c":4,"x":3,"y":0,"does":["d"],"concepts":["c"]},{"id":"g3","title":"服务清单与价目表","c":3,"x":1,"y":1,"does":["d"],"concepts":["c"]},{"id":"g6","title":"服务发生与扣费","c":2,"x":2,"y":1,"does":["d"],"concepts":["c"]},{"id":"g7","title":"月结单","c":3,"x":3,"y":1,"does":["d"],"concepts":["c"]},{"id":"g8","title":"申报与付款对账","c":4,"x":4,"y":1,"does":["d"],"concepts":["c"]}],"edges":[]},"CONCEPTS":{"g6":{"topic":"g6","title":"服务发生与扣费","summary":"s","concepts":[{"id":"rec","title":"服务记录","by":["照护伙伴"],"order":1,"definition":"d","source":"x"},{"id":"proof","title":"凭据","by":["支持工作者"],"order":2,"definition":"d","source":"x"},{"id":"gc","title":"政府补贴与共付","by":["照护伙伴"],"order":3,"definition":"d","source":"x"},{"id":"inv","title":"外部发票","by":["照护伙伴"],"order":4,"definition":"d","source":"x"},{"id":"reimb","title":"报销","by":["老人","照护伙伴"],"order":5,"definition":"d","source":"x"},{"id":"flow","title":"流转记录","by":["照护伙伴","财务"],"order":6,"definition":"d","source":"x"},{"id":"cm","title":"护理管理记录","by":["照护伙伴"],"order":7,"definition":"d","source":"x"}],"external":[{"id":"svc","title":"服务","topic":"g3"},{"id":"price","title":"协议价","topic":"g2"},{"id":"rate","title":"共付比例","topic":"g2"},{"id":"fund","title":"基金","topic":"g4"},{"id":"cma","title":"护理管理账户","topic":"g4"},{"id":"detail","title":"明细行","topic":"g7"},{"id":"claim","title":"申报行","topic":"g8"},{"id":"agree","title":"服务协议","topic":"g2"}],"edges":[{"id":"1","from":"svc","to":"rec","label":"选清单上她批了的一项","by":["照护伙伴"]},{"id":"2","from":"price","to":"rec","label":"单价照她的协议价取、不加附加费，附加费申报时定"},{"id":"3","from":"proof","to":"rec","label":"一条记录一份凭据","by":["支持工作者"]},{"id":"4","from":"rec","to":"gc","label":"按类别和她的比例拆成政府补的和她出的","by":["照护伙伴"]},{"id":"5","from":"rate","to":"gc","label":"她这类服务的比例"},{"id":"6","from":"rec","to":"fund","label":"写从哪笔扣，挂待申报","by":["照护伙伴"]},{"id":"7","from":"inv","to":"rec","label":"一行一项服务就是一条服务记录，标第三方做的","by":["照护伙伴"],"tree":true},{"id":"8","from":"inv","to":"flow","label":"收到、附件、改、批、付每一步留一条","by":["财务"],"tree":true},{"id":"15","from":"reimb","to":"flow","label":"收到、附件、改、批、付每一步留一条","by":["财务"],"tree":true},{"id":"9","from":"cm","to":"cma","label":"按小时从护理管理账户申报"},{"id":"10","from":"rec","to":"detail","label":"月结单一行一次"},{"id":"11","from":"rec","to":"claim","label":"没申报的一条写成一行","by":["财务"]},{"id":"12","from":"reimb","to":"rec","label":"一行一项服务就是一条服务记录，标第三方做的","by":["照护伙伴"],"tree":true},{"id":"14","from":"agree","to":"reimb","label":"哪些可以她先付再报、她的共付怎么付，照协议上写的"}]}},"FLOWS":[]}}}
// 两样并列的单据是上一层（tree），下一层两样；左边虚框只连第二样单据，主题框里第二样单据右边还连着自己的一样（照 sample-care 的 g6 搭的）；
// 再加一条：左边虚框连同一层右边那个（照 a1 的「照护伙伴 → 群」），排序挪不开，得绕
const DOCS = { CONTEXTS: ['养老系统'], OPEN: {}, BIZ: { '养老系统': {
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
    edges: [{ from: 'a1', to: 'a2', label: '开进 app 的老人和她点头的家属才看得到' }, { from: 'a3', to: 'a2', label: '批了的收据进养老系统' }] },
  CONCEPTS: { a2: { topic: 'a2', title: '看她的档案', summary: 's', concepts: [{ id: 'notice', title: '月结单通知', by: ['老人'], order: 1, definition: 'd', source: 'x' }],
    external: [['file', 'g2'], ['notice-doc', 'g1'], ['plan', 'g1'], ['careplan', 'g5'], ['fund', 'g4'], ['bal', 'g4'], ['stmt', 'g7'], ['detail', 'g7']].map(([id, topic]) => ({ id, title: id, topic, context: '养老系统' }))
      .concat([{ id: 'old', title: '老人', topic: '共享内核' }, { id: 'fam', title: '家属', topic: '共享内核' }]),
    edges: [['old', 'file'], ['file', 'notice-doc'], ['file', 'plan'], ['old', 'careplan'], ['fund', 'bal', 1], ['old', 'bal'], ['stmt', 'notice'], ['notice', 'fam'], ['stmt', 'detail', 1], ['old', 'fam']]
      .map(([from, to, tree], i) => ({ id: String(i + 1), from, to, label: '线' + (i + 1) + '的说明', ...(tree ? { tree: true } : { by: ['老人'] }) })) } },
  FLOWS: [] } } }
// 上下文地图：两个上下文之间 8 条来往（照 sample-care 搭的），养老系统「管什么」一长句
const CX8 = { CONTEXTS: ['养老系统', '沟通 app', '共享内核'], OPEN: {}, BIZ: {}, USES: { c1: ['老人', '家属', '照护伙伴'], c2: ['老人', '家属', '照护伙伴'] }, PROGRESS: {},
  PROJECT: { name: 'AgedCareProvider', kernel: { concepts: ['老人', '家属', '照护伙伴'] }, contexts: [
    { id: 'c1', name: '养老系统', c: 2, role: '管一位老人从评估批下来到月结与申报的全程：建档签协议、记名下的基金、排照护计划与预算、录每一笔服务并算政府补贴与共付、出月结单、向 Services Australia 申报并对付款单' },
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
const FLOW4 = { CONTEXTS: ['养老系统', '共享内核'], OPEN: {}, BIZ: { '养老系统': { MAP: { topics: [], edges: [] }, CONCEPTS: {}, FLOWS: [{ file: '00-x', title: '老人来到公司：填登记表', summary: 's',
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
// 工作台注入的两个上下文：养老系统、沟通 app；沟通 app 的概念图连着养老系统的主题、共享内核，还有一个主题号跟本上下文撞上的；流程上有 UI 设计问的问题
const TWO = { CONTEXTS: ['养老系统', '沟通 app', '共享内核'], OPEN: { '沟通 app/01-x': 2 },
  SCREENS: { 'N-01/notice': { title: '照决定通知书填', context: '养老系统' } }, WB: { base: '/sample-care', project: '养老', pages: ['业务', '界面'] },
  BIZ: {
    '养老系统': { MAP: { topics: [{ id: 'g1', title: '评估与通知书', c: 2, x: 0, y: 0, does: ['评估批下来'], concepts: ['通知书'] }], edges: [] },
      CONCEPTS: { g1: { topic: 'g1', title: '评估与通知书', summary: 's', concepts: [{ id: 'n', title: '通知书', order: 1, definition: 'd', source: 'x' }], external: [], edges: [] } }, FLOWS: [] },
    '沟通 app': { MAP: { topics: [{ id: 'a1', title: '聊天与群', c: 3, x: 0, y: 0, does: ['一对一聊'], concepts: ['消息'] }], edges: [] },
      CONCEPTS: { a1: { topic: 'a1', title: '聊天与群', summary: 's', concepts: [{ id: 'msg', title: '消息', order: 1, definition: 'd', source: 'x' }],
        external: [{ id: 'notice', title: '通知书', topic: 'g1', context: '养老系统' }, { id: 'old', title: '老人', topic: '共享内核' }, { id: 'x', title: '撞号的', topic: 'a1', context: '养老系统' }],
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
  ['#map', (s) => nav(s).includes('▾</span>养老系统') && nav(s).includes('▸</span>共享内核')],
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
  // 左边栏：流程那一行红点带条数（1 条待定规则 + 1 个没答的问题 = 2），上下文那行汇总
  ['#map', (s) => nav(s).includes('老人注册<i class="open">2</i>') && nav(s).includes('<small>2 条没答</small>')],
  // 工作台注入 DATA.OPEN 时按它算
  ['#map', (s) => nav(s).includes('老人注册<i class="open">7</i>') && nav(s).includes('<small>9 条没答</small>'), '', { OPEN: { '养老系统/01-老人注册': 7, '养老系统/02-x': 2, '聊天 app/y': 5 } }],
  // 左边栏的组：默认折叠；当前这页所在的组展开；流程组折叠时组名右边是合计的红点
  ['#map', (s) => nav(s).includes('data-g="养老系统/map"><span class="tri">▾</span>全局</div><div class="gb">') && nav(s).includes('data-g="养老系统/concepts"><span class="tri">▸</span>概念 · 按主题</div><div class="gb" hidden>') && nav(s).includes('data-g="养老系统/flows"><span class="tri">▸</span>流程<i class="open">7</i></div><div class="gb" hidden>'), '', { OPEN: { '养老系统/01-老人注册': 7, '养老系统/02-x': 2, '聊天 app/y': 5 } }],
  ['#flow/01-老人注册', (s) => nav(s).includes('data-g="养老系统/flows"><span class="tri">▾</span>流程</div><div class="gb">') && nav(s).includes('data-g="养老系统/map"><span class="tri">▸</span>全局</div><div class="gb" hidden>')],
  ['#concepts/g2', (s) => nav(s).includes('data-g="养老系统/concepts"><span class="tri">▾</span>概念 · 按主题</div><div class="gb">') && nav(s).includes('href="#养老系统/concepts/g2" class="sub on"')],
  ['#共享内核/kernel', (s) => nav(s).includes('data-g="共享内核/concepts"><span class="tri">▾</span>概念</div><div class="gb">')],
  // ---- 多个上下文 ----
  // 单开的样例有两个上下文画了业务：两段都展开时各列各的全局图、概念、流程；红点按各自的流程
  ['#map', (s) => nav(s).includes('href="#养老系统/concepts/g2"') && nav(s).includes('href="#排版系统/map"') && nav(s).includes('href="#排版系统/concepts/p1"') && nav(s).includes('href="#排版系统/flow/01-排申报表" class="sub">排申报表<i class="open">1</i>') && nav(s).includes('排版系统<small>1 条没答</small>') && nav(s).includes('老人注册<i class="open">2</i>'), "Shell.show('排版系统'); render()"],
  // hash 带上下文切过去：主区画排版系统的全局图，左边栏它那一行亮、展开
  ['#排版系统/map', (s) => s.includes('申报表排版') && !s.includes('参与者档案与她名下的钱') && nav(s).includes('class="cx on" data-cx="排版系统"') && nav(s).includes('▾</span>排版系统') && nav(s).includes('href="#排版系统/map" class="sub on"')],
  ['#排版系统/map', inBounds],
  // 跨上下文的虚框：标题照自己的，小字标出处；不抛错
  ['#排版系统/concepts/p1', (s) => s.includes('>申报行</text>') && s.includes('养老系统 · g5 ›') && s.includes('共享内核 ›') && s.includes('data-cx="养老系统"') && s.includes('data-cx="共享内核"')],
  ['#排版系统/concepts/p1', inBounds],
  // 点虚框：别的上下文的跳到那边那张概念图，共享内核的跳共享内核那页，本上下文的照旧
  ['#排版系统/concepts/p1', (s) => s.includes('<!--h1:养老系统/concepts/g5-->') && s.includes('<!--h2:共享内核/kernel-->') && s.includes('<!--h3:排版系统/concepts/p1-->'),
    "openStub({ cx: '养老系统', g: 'g5' }); els.main.innerHTML += '<!--h1:' + location.hash + '-->'; openStub({ cx: '共享内核', g: '共享内核' }); els.main.innerHTML += '<!--h2:' + location.hash + '-->'; openStub({ g: 'p1' }); els.main.innerHTML += '<!--h3:' + location.hash + '-->'"],
  // 没画业务的上下文：还没画
  ['#聊天 app/map', (s) => s.includes('还没画') && nav(s).includes('业务还没画')],
  // 地址里的主题号、流程名这个上下文没有：说一句，不抛错
  ['#排版系统/concepts/g2', (s) => s.includes('排版系统 里没有主题 g2')],
  ['#排版系统/flow/01-老人注册', (s) => s.includes('排版系统 里没有流程 01-老人注册')],
  // 工作台注入 BIZ：旧 hash 落到第一个上下文
  ['#map', (s) => s.includes('评估与通知书') && !s.includes('聊天与群') && nav(s).includes('class="cx on" data-cx="养老系统"'), '', TWO],
  ['#concepts/g1', (s) => s.includes('评估与通知书') && s.includes('class="nd"') && nav(s).includes('class="cx on" data-cx="养老系统"'), '', TWO],
  ['', (s) => s.includes('评估与通知书') && nav(s).includes('href="#养老系统/map" class="sub on"'), '', TWO],
  // 注入的沟通 app：跨上下文虚框用那边主题的颜色、标出处；主题号撞上本上下文的不当成自己的、那边找不到主题就灰框；共享内核灰框
  ['#沟通 app/concepts/a1', (s) => s.includes('养老系统 · g1 ›') && s.includes('共享内核 ›') && s.includes('养老系统 · a1 ›') && s.includes('fill:var(--c2)') && (s.match(/class="nd/g) ?? []).length === 1 && (s.match(/class="stub"/g) ?? []).length === 3 && nav(s).includes('class="cx on" data-cx="沟通 app"') && nav(s).includes('href="#沟通 app/flow/01-x" class="sub">聊一句<i class="open">2</i>'), '', TWO],
  ['#沟通 app/concepts/a1', inBounds, '', TWO],
  // 答的时候 context 是当前上下文
  ['#沟通 app/flow/01-x', (s) => s.includes('"context":"沟通 app"') && s.includes('"flow":"01-x"') && s.includes('"ask":"a-1"') && s.includes('"text":"能"'),
    "answerQa({ flow: '01-x', step: '1', kind: 'ask', id: 'a-1', opt: '能' }); els.main.innerHTML += '<!--posted:' + JSON.stringify(__posted) + '-->'", TWO],
  // UI 设计问的问题：小字「UI 设计问 · N-01 屏名」，链到界面页那一屏；屏名找不到照 screen 原文
  ['#沟通 app/flow/01-x', (s) => s.includes('<a class="scr" href="/sample-care/%E7%95%8C%E9%9D%A2#养老系统/N-01/notice"><text class="s by"') && s.includes('UI 设计问 · N-01 照决定通知书填') && s.includes('UI 设计问 · N-02/zz') && s.includes('href="/sample-care/%E7%95%8C%E9%9D%A2#沟通 app/N-02/zz"'), '', TWO],
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
