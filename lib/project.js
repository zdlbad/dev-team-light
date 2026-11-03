// 项目目录 ⇄ 六页要的数据。pageData 把文件读成页面里那几个常量；applyAction 把「定下」「答」写回文件。
// 哪个常量对应哪个文件，写在各份小样 <script> 开头的头注释里；这里只做搬运和推导，不改形状。
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const STAGES = ['业务', '建模', '编码']

// ---------- 读 ----------
const exists = (p) => fs.existsSync(p)
const readJson = (p, dflt) => (exists(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : dflt)
const readText = (p) => fs.readFileSync(p, 'utf8')
const listJson = (dir) => (exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.slice(0, -5), data: readJson(path.join(dir, f)) })) : [])
const listDirs = (dir) => (exists(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [])
const walk = (dir, base = dir) => (exists(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name), base) : [path.relative(base, path.join(dir, d.name)).split(path.sep).join('/')])) : [])

const pad = (n) => String(n).padStart(2, '0')
const localNow = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`

function project(dir) {
  const pj = readJson(path.join(dir, '项目.json'), { name: path.basename(dir), contexts: [], kernel: { concepts: [] } })
  const names = pj.contexts.map((c) => c.name)
  return { pj, names, contexts: [...names, '共享内核'], cx: (name) => path.join(dir, '上下文', name) }
}
const 日程Of = (dir) => readJson(path.join(dir, '项目管理', '日程.json'), { updatedAt: null, milestones: [], drift: [] })
const 需求Of = (dir) => readJson(path.join(dir, '项目管理', '需求.json'), { items: [] })

// 日程里所有任务（功能下的 tasks 或功能本身），带它属于哪个功能
function tasksOf(日程) {
  const out = []
  for (const m of 日程.milestones) for (const it of m.items ?? []) {
    if (it.tasks?.length) for (const t of it.tasks) out.push({ ...t, feature: it.id, milestone: m.id })
    else out.push({ ...it, feature: it.id, milestone: m.id })
  }
  return out
}
const doneTask = (t) => STAGES.every((s) => t.stages?.[s])

// ---------- 每一页 ----------
// 业务页每个有业务文件夹的上下文都读，放进 BIZ（键是上下文名）；页面按 hash 切上下文。
// 建模、编码两页只开第一个有东西的上下文
function business(dir, P) {
  const BIZ = {}
  for (const name of P.names) {
    const b = path.join(P.cx(name), '业务')
    if (!exists(b)) continue
    const CONCEPTS = {}
    for (const { name: id, data } of listJson(path.join(b, '概念'))) CONCEPTS[id] = data
    BIZ[name] = {
      MAP: readJson(path.join(b, '全局图.json'), { topics: [], edges: [] }),
      CONCEPTS,
      FLOWS: listJson(path.join(b, '流程')).map(({ name: file, data }) => ({ ...data, file: data.file ?? file })) }
  }
  // 兼容：MAP/CONCEPTS/FLOWS 仍给第一个有业务的上下文的
  const first = Object.values(BIZ)[0] ?? { MAP: { topics: [], edges: [] }, CONCEPTS: {}, FLOWS: [] }
  // OPEN：每段流程还没答的规则和问题条数（键 <上下文>/<流程文件名>），左边栏红点用
  // SCREENS：界面页的屏名（键 <需求编号>/<屏 id>），流程里 UI 设计问的问题标屏名、链过去用
  // DECIDE：现场等他定的若在业务页，标题旁只在那一页给「定下」按钮
  const d = readJson(path.join(dir, '现场.json'), {}).decide
  return { CONTEXTS: P.contexts, BIZ, ...first, ...contextMap(dir, P), OPEN: openInFlows(dir, P).byFlow, SCREENS: screenIndex(P), DECIDE: d?.page === '业务' ? d : null }
}
function screenIndex(P) {
  const out = {}
  for (const name of P.names) for (const { name: id, data } of listJson(path.join(P.cx(name), '界面'))) {
    const req = data.req ?? id
    for (const v of data.views ?? []) for (const sc of v.screens ?? []) out[req + '/' + sc.id] = { title: sc.title ?? sc.id, context: name }
  }
  return out
}

// 项目管理页还有「总览」一截：所有项目一页看。opts.dirs 是工作台开着的所有项目目录，没给就只有这一个
function pm(dir, P, opts) {
  return { CONTEXTS: P.names, 需求: 需求Of(dir), 日程: 日程Of(dir), TODAY: (opts.now ?? localNow()).slice(0, 10), PROJECTS: overview(opts.dirs ?? [dir], opts).PROJECTS }
}

// 上下文地图（业务页里项目级的那一页）：项目.json、上下文图.json，加数出来的「用了共享内核什么」「到哪一步」
function contextMap(dir, P) {
  const 日程 = 日程Of(dir), tasks = tasksOf(日程), 需求 = 需求Of(dir)
  const kernel = P.pj.kernel?.concepts ?? []
  const USES = {}, PROGRESS = {}
  for (const c of P.pj.contexts) {
    const b = path.join(P.cx(c.name), '业务'), m = path.join(P.cx(c.name), '模型'), k = path.join(P.cx(c.name), '代码')
    const conceptText = listJson(path.join(b, '概念')).map((x) => JSON.stringify(x.data)).join('\n')
    USES[c.id] = kernel.filter((name) => conceptText.includes(name))
    const map = readJson(path.join(b, '全局图.json'), { topics: [] })
    const topicsWithConcept = map.topics.filter((t) => exists(path.join(b, '概念', t.id + '.json')))
    const aggs = listDirs(m).flatMap((t) => listJson(path.join(m, t, '聚合')))
    const pseudo = walk(path.join(k, '伪代码')).filter((f) => f.endsWith('.json'))
    const feats = 需求.items.filter((i) => i.context === c.name)
    const featDone = feats.filter((f) => { const ts = tasks.filter((t) => t.feature === f.id); return ts.length && ts.every(doneTask) })
    PROGRESS[c.id] = {
      '功能': { total: feats.length, done: featDone.length },
      '业务': { total: map.topics.length, done: topicsWithConcept.length, unit: '主题' },
      '模型': { total: aggs.length, done: aggs.length, unit: '聚合' },
      '编码': { total: pseudo.length, done: pseudo.filter((f) => exists(path.join(k, f.slice(0, -5)))).length, unit: '份伪代码' } }
  }
  return { PROJECT: P.pj, EDGES: readJson(path.join(dir, '上下文图.json'), { edges: [] }).edges, USES, PROGRESS }
}

function modelFiles(cxDir) {
  const m = path.join(cxDir, '模型')
  // CATALOG_AT：清单定下的日期（清单.json 的 decidedAt），按主题；CATALOG 只放条目，日期另放
  const AGGS = [], CATALOG = {}, CATALOG_AT = {}, MOVES = []
  for (const topic of listDirs(m)) {
    for (const { data } of listJson(path.join(m, topic, '聚合'))) AGGS.push({ ...data, topic: data.topic ?? topic })
    for (const { name, data } of listJson(path.join(m, topic, '调动'))) {
      if (name === '清单') { CATALOG[topic] = data.items ?? []; if (data.decidedAt) CATALOG_AT[topic] = data.decidedAt }
      else MOVES.push({ ...data, file: data.file ?? name, topic: data.topic ?? topic })
    }
  }
  return { AGGS, CATALOG, CATALOG_AT, MOVES }
}

function modeling(dir, P) {
  const out = { CONTEXTS: P.contexts, TOPICS: {}, AGGS: [], CATALOG: {}, CATALOG_AT: {}, MOVES: [], FLOW_STEPS: {}, GRAPHS: {} }
  // GRAPHS：每个上下文的 模型/全图.json（起骨架时写，聚合之间的指向），键是上下文名；没有的不列
  for (const name of P.names) { const g = readJson(path.join(P.cx(name), '模型', '全图.json'), null); if (g) out.GRAPHS[name] = g }
  for (const name of P.names) {
    const cx = P.cx(name)
    if (!exists(path.join(cx, '模型')) && !exists(path.join(cx, '业务'))) continue
    const map = readJson(path.join(cx, '业务', '全局图.json'), { topics: [] })
    // x、y 是业务全局图上主题框的格子位置，聚合全图照它排
    for (const t of map.topics) out.TOPICS[t.id] = { title: t.title, c: t.c, x: t.x, y: t.y }
    Object.assign(out, modelFiles(cx))
    out.MODEL_CX = name   // AGGS/CATALOG/MOVES 是这个上下文的；别的上下文页面只摆一句「还没建」
    for (const { name: file, data } of listJson(path.join(cx, '业务', '流程'))) {
      const steps = {}
      for (const s of data.steps ?? []) steps[s.id] = s.title
      out.FLOW_STEPS[data.file ?? file] = { title: String(data.title ?? '').split('：')[0], steps }
    }
    break
  }
  // DECIDE：现场等他定的若在建模页，标题旁只在那一页给「定下」按钮
  const d = readJson(path.join(dir, '现场.json'), {}).decide
  out.DECIDE = d?.page === '建模' ? d : null
  return out
}

// 编码页的 MODEL 是模型文件压扁的几栏：成员只留行为名，清单把 call / via / in 拍平，流程只留 ref
function codeModel(cx) {
  const map = readJson(path.join(cx, '业务', '全局图.json'), { topics: [] })
  const { AGGS, CATALOG, MOVES } = modelFiles(cx)
  const topics = {}
  for (const t of map.topics) topics[t.id] = t.title
  const aggs = AGGS.map((a) => ({
    id: a.id, title: a.title, topic: a.topic,
    members: a.members.map((m) => ({ id: m.id, name: m.name, kind: m.kind, ...(m.behaviors?.length ? { behaviors: m.behaviors.map((b) => b.name) } : {}) })),
    services: [...new Set((a.rules ?? []).map((r) => r.service).filter(Boolean))] }))
  const items = Object.values(CATALOG).flat().map((i) => {
    const x = { id: i.id, kind: i.kind, name: i.name, aggregate: i.call?.aggregate, out: i.out }
    if (i.call?.behavior) x.behavior = i.call.behavior
    if (i.call?.read) x.read = true
    if (i.via?.name) x.via = i.via.name
    if (i.on ?? i.in?.event) x.on = i.on ?? i.in.event
    return x
  })
  const flows = MOVES.map((mv) => ({ file: mv.file, title: mv.title, topic: mv.topic, rows: (mv.rows ?? []).map((r) => r.ref) }))
  return { topics, aggs, items, flows }
}

// 进度：结构.json 里每个文件指回模型的哪几条；源码在就是「已写」，有测试文件列着它就是「有测试」；跑没跑过这里不知道
function codeProgress(cx, STRUCT) {
  const status = {}, src = path.join(cx, '代码')
  const keysOf = (f) => {
    const m = f.model; if (!m) return []
    if (m.item) return ['item/' + m.item]
    if (m.service) return ['service/' + m.service]
    if (m.aggregate && m.member) return ['agg/' + m.aggregate + '/' + m.member]
    return []
  }
  for (const f of STRUCT.files ?? []) {
    const written = exists(path.join(src, f.path))
    for (const k of keysOf(f)) status[k] = written ? '已写' : '未写'
    if (f.kind === '测试' && written) for (const k of f.tests ?? []) status[k] = '有测试'
  }
  return { updatedAt: localNow(), status, runs: [] }
}

function coding(dir, P) {
  const out = { CONTEXTS: P.contexts, MODEL: { topics: {}, aggs: [], items: [], flows: [] }, STRUCT: { lang: '', root: 'src', files: [] }, PROGRESS: { updatedAt: '', status: {}, runs: [] },
    QUESTIONS: { '技术选型': readJson(path.join(ROOT, 'templates', '技术选型.json'), { questions: [] }).questions },
    STRUCTURE: readJson(path.join(ROOT, 'templates', '结构设计.json'), {}), NAMING: readJson(path.join(ROOT, 'templates', '文件命名.json'), {}), ANSWERS: { '技术选型': { answers: {} } }, PSEUDO: {}, CODE: {} }
  // 全局结构整个项目一份，在项目根；还没有就给模板，标出来
  out.GLOBAL = readJson(globalSpecPath(dir), null) ?? { ...readJson(path.join(ROOT, 'templates', '全局结构.json'), { nodes: [], edges: [] }), fromTemplate: true }
  for (const name of P.names) {
    const cx = P.cx(name), k = path.join(cx, '代码')
    if (!exists(k) && !exists(path.join(cx, '模型'))) continue
    out.MODEL = codeModel(cx)
    out.STRUCT = readJson(path.join(k, '结构.json'), out.STRUCT)
    // 定下后结构或任一份伪代码改过，指纹对不上，就当没定（页面写「定下后改过」，按钮回来）
    if (out.STRUCT.decidedAt && out.STRUCT.decidedSig !== pseudoSig(k)) { out.STRUCT = { ...out.STRUCT, changedSince: out.STRUCT.decidedAt }; delete out.STRUCT.decidedAt }
    out.PROGRESS = codeProgress(cx, out.STRUCT)
    const spec = (kind) => readJson(path.join(k, '规范', kind + '.json'), null)
    if (spec('结构设计')) out.STRUCTURE = spec('结构设计')
    if (spec('文件命名')) out.NAMING = spec('文件命名')
    if (spec('技术选型')) out.ANSWERS['技术选型'] = spec('技术选型')
    for (const f of walk(path.join(k, '伪代码'))) if (f.endsWith('.json')) { const { file, ...rest } = readJson(path.join(k, '伪代码', f)); out.PSEUDO[file ?? f.slice(0, -5)] = rest }
    for (const f of walk(path.join(k, 'src'))) out.CODE['src/' + f] = readText(path.join(k, 'src', f))
    break
  }
  return out
}

function command(dir, P, opts) {
  const now = opts.now ?? localNow()
  const scene = readJson(path.join(dir, '现场.json'), { now: [], decide: null, waiting: [] })
  const readLog = (ymd) => { const f = path.join(dir, '日志', ymd + '.jsonl'); return exists(f) ? readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [] }
  const today = readLog(now.slice(0, 10))
  // RECENT：流水只看最近 3 天（含今天），一天一组；泳道还是只画今天
  const RECENT = [0, 1, 2].map((k) => { const d = new Date(now.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - k); const ymd = d.toISOString().slice(0, 10); return { date: ymd, rows: k ? readLog(ymd) : today } }).filter((g) => g.rows.length)
  const ITEMS = {}
  for (const i of 需求Of(dir).items) ITEMS[i.id] = { title: i.title, context: i.context ?? null }
  // PAGE_ASKS：问题留在各自页上的角色，这里只给条数（业务的挂在流程步骤上，UI 设计的挂在小样那一屏上）
  return { CONTEXTS: P.contexts, NOW_TS: now, SCENE: { ...scene, today }, RECENT, ITEMS, PLAN: 日程Of(dir), PAGE_ASKS: { '业务': openInFlows(dir, P).total, '界面': openInMockups(dir, P).total } }
}

// 界面页：UI 设计的小样。一条需求一份 json，里面按视角分屏；屏的 html 读进 MOCKS（键 <需求编号>/<屏 id>）；每屏定下的日期就在它自己的 decidedAt 上。
// 屏上的问题就是屏自己的 asks，在界面页那一屏旁边答
function ui(dir, P) {
  // OPEN：每屏还没答的问题条数（键 <上下文>/<需求编号>/<屏 id>，没有没答的不列），左边栏需求和屏那行的红点用
  const out = { CONTEXTS: P.contexts, REQS: {}, MOCKS: {}, OPEN: openInMockups(dir, P).byScreen }
  for (const name of P.names) {
    const u = path.join(P.cx(name), '界面')
    if (!exists(u)) continue
    out.REQS[name] = listJson(u).map(({ name: id, data }) => {
      const req = { ...data, req: data.req ?? id }
      // 屏的 step 指 flow 那段流程的第几步：那一步的标题记进 stepTitle，页头写「对着流程第几步：标题」
      const flowFile = req.flow ? path.join(P.cx(name), '业务', '流程', req.flow + '.json') : null
      const flow = flowFile && exists(flowFile) ? readJson(flowFile) : null
      for (const v of req.views ?? []) for (const sc of v.screens ?? []) {
        const st = flow && sc.step != null ? (flow.steps ?? []).find((s) => String(s.id) === String(sc.step)) : null
        if (st) sc.stepTitle = st.title
        const f = path.join(u, req.req, sc.file ?? sc.id + '.html')
        if (exists(f)) out.MOCKS[req.req + '/' + sc.id] = readText(f)
      }
      return req
    })
  }
  return out
}
// 小样上还没答的问题：按屏数，给界面页左边栏的红点和指挥页「等你答」那一行用
function openInMockups(dir, P) {
  const byScreen = {}
  let total = 0
  for (const name of P.names) for (const { name: id, data } of listJson(path.join(P.cx(name), '界面'))) {
    const req = data.req ?? id
    for (const v of data.views ?? []) for (const sc of v.screens ?? []) {
      const n = (sc.asks ?? []).filter((a) => !a.answer).length
      if (n) { byScreen[name + '/' + req + '/' + sc.id] = n; total += n }
    }
  }
  return { byScreen, total }
}

// 总览（项目管理页里的一截）：好几个项目一页看。一个项目一项：上下文、现场、几期（每期的目标、截止、需求带三阶段日期）、没排进期的需求
function overview(dirs, opts = {}) {
  const now = opts.now ?? localNow()
  const PROJECTS = dirs.map((dir) => {
    const P = project(dir), 日程 = 日程Of(dir), 需求 = 需求Of(dir)
    const reqOf = {}; for (const r of 需求.items) reqOf[r.id] = r
    const planned = new Set()
    // 拆了任务的功能，阶段日期取所有任务都定了的那一天（最晚的）；没拆的用自己的
    const stagesOf = (it) => {
      if (!it.tasks?.length) return { 业务: it.stages?.['业务'] ?? null, 建模: it.stages?.['建模'] ?? null, 编码: it.stages?.['编码'] ?? null }
      const st = {}
      for (const s of STAGES) st[s] = it.tasks.every((t) => t.stages?.[s]) ? it.tasks.map((t) => t.stages[s]).sort().at(-1) : null
      return st
    }
    const itemOf = (it) => { planned.add(it.id); const r = reqOf[it.id] ?? {}; return { id: it.id, title: r.title ?? it.id, context: r.context ?? null, decision: r.decision ?? '做', moscow: r.moscow ?? null, outcome: r.outcome, stages: stagesOf(it) } }
    // 截止＝原定日期加上记下的拖延（日程只追加 drift、不改原日期）
    const dueOf = (m) => { const days = (日程.drift ?? []).filter((x) => x.milestone === m.id).reduce((n, x) => n + (x.days ?? 0), 0); if (!days) return m.date; const d = new Date(m.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
    const milestones = 日程.milestones.map((m) => ({ id: m.id, title: m.title, goal: m.goal ?? null, due: dueOf(m), items: (m.items ?? []).map(itemOf) }))
    const unplanned = 需求.items.filter((r) => !planned.has(r.id)).map((r) => ({ id: r.id, title: r.title, context: r.context ?? null, decision: r.decision ?? '再看', moscow: r.moscow ?? null, outcome: r.outcome, stages: { 业务: null, 建模: null, 编码: null } }))
    const scene = readJson(path.join(dir, '现场.json'), { now: [], decide: null, waiting: [] })
    return { dir: path.basename(dir), name: P.pj.name, contexts: P.pj.contexts.map((c) => ({ id: c.id, name: c.name })), scene, milestones, unplanned }
  })
  return { PROJECTS, TODAY: now.slice(0, 10) }
}

const PAGES = { '谁在干什么': command, '项目管理': pm, '业务': business, '界面': ui, '建模': modeling, '编码': coding }
function pageData(dir, page, opts = {}) {
  const fn = PAGES[page]; if (!fn) throw new Error('没有这一页：' + page)
  return fn(dir, project(dir), opts)
}

// ---------- 写 ----------
const writeJson = (p, data) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n') }
function appendLog(dir, now, row) {
  const p = path.join(dir, '日志', now.slice(0, 10) + '.jsonl')
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.appendFileSync(p, JSON.stringify({ ts: now.slice(11), ...row }) + '\n')
}

// 定下小样：一次定一屏。上下文/<名>/界面/<需求编号>.json 里那一屏记 decidedAt: 今天；日志记一条
function decideMockup(dir, body, now) {
  const p = path.join(dir, '上下文', body.context ?? '', '界面', body.mockup + '.json')
  if (!body.context || !exists(p)) return { ok: false, error: `没有 ${body.context ?? '?'} 的需求 ${body.mockup} 的小样` }
  const data = readJson(p)
  const hit = (data.views ?? []).flatMap((v) => v.screens ?? []).find((sc) => sc.id === body.screen)
  if (!hit) return { ok: false, error: `${body.mockup} 里没有屏 ${body.screen}` }
  if (hit.decidedAt) return { ok: false, error: `${body.mockup}/${body.screen} 已经定过了（${hit.decidedAt}）` }
  hit.decidedAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '定下', role: '你', context: body.context, task: body.mockup, text: `定下 ${body.mockup} 的小样 ${hit.title ?? body.screen}` })
  return { ok: true, mockup: body.mockup, screen: body.screen, date: hit.decidedAt }
}

// 定下：现场.json 的 decide 说的是哪个任务哪个阶段，日程里填上今天，日志记一条，decide 清掉
// 骨架（聚合全图）不属于哪个任务，task 是 null：不碰日程，只记那一页的 decidedAt
function decide(dir, body, now) {
  if (body.mockup) return decideMockup(dir, body, now)
  const scenePath = path.join(dir, '现场.json'), scene = readJson(scenePath, { now: [], decide: null, waiting: [] })
  const d = scene.decide
  if (!d) return { ok: false, error: '现场没有等你定的东西' }
  // 业务页、建模页定下的那一页（流程、概念、全局图；聚合全图、聚合、清单、调动）自己也记 decidedAt，页面标题旁据此写「定了」
  const bizFile = (d.page === '业务' || d.page === '建模') && d.hash ? bizFileOf(dir, d.hash) : null
  if (!d.task && !(bizFile && exists(bizFile))) return { ok: false, error: `现场等你定的 ${d.hash ?? '?'} 没有对应的文件` }
  if (d.task) {
    const 日程Path = path.join(dir, '项目管理', '日程.json'), 日程 = 日程Of(dir)
    let hit = null
    for (const m of 日程.milestones) for (const it of m.items ?? []) for (const t of it.tasks?.length ? it.tasks : [it]) if (t.id === d.task) hit = t
    if (!hit) return { ok: false, error: '日程里没有任务 ' + d.task }
    hit.stages ??= {}
    hit.stages[d.stage] = now.slice(0, 10)
    日程.updatedAt = now.slice(0, 10)
    writeJson(日程Path, 日程)
  }
  if (bizFile && exists(bizFile)) { const data = readJson(bizFile); data.decidedAt = now.slice(0, 10); writeJson(bizFile, data) }
  appendLog(dir, now, { kind: '定下', role: '你', context: d.context, task: d.task, stage: d.stage, page: d.page, hash: d.hash, text: body.text ?? (d.task ? `定下 ${d.task} 的${d.stage}` : d.text ?? `定下 ${d.hash}`) })
  scene.decide = null
  writeJson(scenePath, scene)
  return { ok: true, task: d.task, stage: d.stage, date: now.slice(0, 10) }
}

// 业务页的地址 <上下文>/flow/<流程文件名>、<上下文>/concepts/<主题>、<上下文>/map 对应的文件；
// 建模页的 <上下文>/all（聚合全图）、<上下文>/agg/<聚合 id 或名>、<上下文>/list/<主题>、<上下文>/move/<流程文件名>：聚合和流程不知道在哪个主题下，挨个主题找
function bizFileOf(dir, hash) {
  const [cx, kind, id] = hash.split('/'), b = path.join(dir, '上下文', cx, '业务'), m = path.join(dir, '上下文', cx, '模型')
  if (kind === 'flow') return path.join(b, '流程', id + '.json')
  if (kind === 'concepts') return path.join(b, '概念', id + '.json')
  if (kind === 'map') return path.join(b, '全局图.json')
  if (kind === 'all') return path.join(m, '全图.json')
  if (kind === 'list') return path.join(m, id, '调动', '清单.json')
  if (kind === 'agg' || kind === 'move') for (const t of listDirs(m)) {
    const sub = path.join(m, t, kind === 'agg' ? '聚合' : '调动')
    const hit = listJson(sub).find(({ name, data }) => kind === 'agg' ? data.id === id || data.title === id || name === id : name !== '清单' && (data.file ?? name) === id)
    if (hit) return path.join(sub, hit.name + '.json')
  }
  return null
}

// 答：从 现场.json 的 waiting 里拿掉这个问题，日志记一条
// 答流程里的规则或问题：body { flow: 流程文件名, context, step, rule | ask: id, text }；写回那一步的 answer，规则的 status 变定了；日志记一条
function answerInFlow(dir, body, now) {
  const p = path.join(dir, '上下文', body.context ?? '', '业务', '流程', body.flow + '.json')
  if (!body.context || !exists(p)) return { ok: false, error: `没有 ${body.context ?? '?'} 的流程 ${body.flow}` }
  const data = readJson(p)
  const step = (data.steps ?? []).find((s) => String(s.id) === String(body.step))
  if (!step) return { ok: false, error: `${body.flow} 里没有第 ${body.step} 步` }
  const hit = body.rule ? (step.rules ?? []).find((r) => r.id === body.rule) : (step.asks ?? []).find((a) => a.id === body.ask)
  if (!hit) return { ok: false, error: `第 ${body.step} 步上没有 ${body.rule ?? body.ask}` }
  hit.answer = body.text; hit.answeredAt = now.slice(0, 10)
  if (body.rule) hit.status = '定了'
  writeJson(p, data)
  appendLog(dir, now, { kind: '答', role: '你', context: body.context, q: `${body.flow}/${body.step}/${hit.id}`, text: body.text })
  return { ok: true, id: hit.id }
}
// 流程里还没答的规则和问题各有几条：按流程文件数，给业务页左边栏的红点和指挥页「等你答」那一行用
function openInFlows(dir, P) {
  const byFlow = {}
  let total = 0
  for (const name of P.names) for (const { name: file, data } of listJson(path.join(P.cx(name), '业务', '流程'))) {
    let n = 0
    for (const s of data.steps ?? []) n += (s.rules ?? []).filter((r) => r.status === '待定' && !r.answer).length + (s.asks ?? []).filter((a) => !a.answer).length
    if (n) { byFlow[name + '/' + (data.file ?? file)] = n; total += n }
  }
  return { byFlow, total }
}

// 答小样上的问题：body { mockup: 需求编号, screen: 屏 id, ask: 问题 id, context, text }；写回那一屏那条问题的 answer 与 answeredAt；答过的不再答；日志记一条
function answerInMockup(dir, body, now) {
  const p = path.join(dir, '上下文', body.context ?? '', '界面', body.mockup + '.json')
  if (!body.context || !exists(p)) return { ok: false, error: `没有 ${body.context ?? '?'} 的需求 ${body.mockup} 的小样` }
  if (!body.text) return { ok: false, error: '答案是空的' }
  const data = readJson(p)
  const sc = (data.views ?? []).flatMap((v) => v.screens ?? []).find((s) => s.id === body.screen)
  if (!sc) return { ok: false, error: `${body.mockup} 里没有屏 ${body.screen}` }
  const hit = (sc.asks ?? []).find((a) => a.id === body.ask)
  if (!hit) return { ok: false, error: `${body.mockup}/${body.screen} 上没有问题 ${body.ask}` }
  if (hit.answer) return { ok: false, error: `${body.mockup}/${body.screen}/${body.ask} 已经答过了（${hit.answeredAt ?? ''}）` }
  hit.answer = body.text; hit.answeredAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '答', role: '你', context: body.context, q: `${body.mockup}/${body.screen}/${hit.id}`, text: body.text })
  return { ok: true, id: hit.id }
}

function answer(dir, body, now) {
  if (body.mockup) return answerInMockup(dir, body, now)
  if (body.flow) return answerInFlow(dir, body, now)
  const scenePath = path.join(dir, '现场.json'), scene = readJson(scenePath, { now: [], decide: null, waiting: [] })
  const q = scene.waiting.find((x) => x.id === body.q)
  if (!q) return { ok: false, error: '没有这个问题：' + body.q }
  scene.waiting = scene.waiting.filter((x) => x.id !== body.q)
  writeJson(scenePath, scene)
  appendLog(dir, now, { kind: '答', role: '你', context: q.context, task: q.task, stage: q.stage, q: q.id, text: body.text })
  return { ok: true }
}

// 定规范：代码/规范/<类>.json 的 decidedAt 填今天；全局结构是项目根那一份，不带上下文
const globalSpecPath = (dir) => path.join(dir, '代码', '规范', '全局结构.json')
function decideSpec(dir, body, now) {
  const P = project(dir), name = body.kind === '全局结构' ? null : body.context ?? P.names[0]
  const p = name ? path.join(P.cx(name), '代码', '规范', body.kind + '.json') : globalSpecPath(dir)
  const spec = readJson(p, body.kind === '技术选型' ? { answers: {} } : null)
  if (!spec) return { ok: false, error: '还没有这份规范：' + body.kind }
  spec.decidedAt = now.slice(0, 10)
  writeJson(p, spec)
  appendLog(dir, now, { kind: '定下', role: '你', context: name, text: `定下${body.kind}` })
  return { ok: true, decidedAt: spec.decidedAt }
}

// 定伪代码：一个上下文的文件结构与伪代码整份一起定。代码/结构.json 记 decidedAt 和当时的指纹 decidedSig；日志记一条
// 指纹是结构.json（去掉这两栏）加每份伪代码的路径与内容，之后谁改了一处都对不上
function pseudoSig(k) {
  const h = crypto.createHash('sha1'), { decidedAt, decidedSig, ...st } = readJson(path.join(k, '结构.json'), {})
  h.update(JSON.stringify(st))
  for (const f of walk(path.join(k, '伪代码')).filter((f) => f.endsWith('.json')).sort()) h.update('\n' + f + '\n' + fs.readFileSync(path.join(k, '伪代码', f), 'utf8'))
  return h.digest('hex')
}
function decidePseudo(dir, body, now) {
  const P = project(dir), name = body.context ?? P.names.find((n) => exists(path.join(P.cx(n), '代码', '结构.json')))
  const k = name && path.join(P.cx(name), '代码'), p = k && path.join(k, '结构.json')
  if (!p || !exists(p)) return { ok: false, error: `${name ?? '?'} 还没有文件结构` }
  if (!walk(path.join(k, '伪代码')).some((f) => f.endsWith('.json'))) return { ok: false, error: `${name} 还没有伪代码` }
  const st = readJson(p), sig = pseudoSig(k)
  if (st.decidedAt && st.decidedSig === sig) return { ok: false, error: `${name} 的文件结构与伪代码已经定过了（${st.decidedAt}）` }
  const { decidedAt, decidedSig, ...rest } = st
  writeJson(p, { decidedAt: now.slice(0, 10), decidedSig: sig, ...rest })
  appendLog(dir, now, { kind: '定下', role: '你', context: name, page: '编码', text: `定下 ${name} 的文件结构与伪代码` })
  return { ok: true, decidedAt: now.slice(0, 10) }
}

const ACTIONS = { '定下': decide, '答': answer, '定规范': decideSpec, '定伪代码': decidePseudo }
function applyAction(dir, action, body, opts = {}) {
  const fn = ACTIONS[action]; if (!fn) throw new Error('没有这个动作：' + action)
  return fn(dir, body, opts.now ?? localNow())
}

module.exports = { pageData, applyAction, localNow }
