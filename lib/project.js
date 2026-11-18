// 项目目录 ⇄ 六页要的数据。pageData 把文件读成页面里那几个常量；applyAction 把「定下」「答」写回文件。
// 哪个常量对应哪个文件，写在各份小样 <script> 开头的头注释里；这里只做搬运和推导，不改形状。
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const ROOT = path.resolve(__dirname, '..')
const STAGES = ['业务', '建模', '界面', '编码']

// 这一版的记号：页面打开时带出去，人按「定下」、答问题时带回来；和文件现在的对不上就不记（页面开着的时候角色改过了）。只在按的那一下比，不存进文件
const sigOf = (...parts) => crypto.createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12)
// 屏的记号：屏的内容加它的小样文件；定下的日期、问题的答案不算（这两样是人自己按出来的），页面推出来的 stepTitle 这几栏也不算
function screenSig(uiDir, req, sc) {
  const { decidedAt, stepTitle, stepFlow, stepNo, sig, ...rest } = sc
  const asks = (sc.asks ?? []).map(({ answer, answeredAt, ...a }) => a)
  const f = path.join(uiDir, req, sc.file ?? sc.id + '.html')
  return sigOf({ ...rest, asks }, exists(f) ? readText(f) : null)
}
// 流程上一条待定规则或问题的记号：它在哪一步、问的是什么；答案不算
function qaSig(step, item) {
  const { answer, answeredAt, status, sig, ...rest } = item
  return sigOf(step.title, rest)
}
// 聚合、伪代码上一条问题的记号：它挂在哪（聚合的哪个成员、哪个行为；伪代码的哪一块）、问的是什么；答案不算
const askSig = (where, ask) => { const { answer, answeredAt, sig, ...rest } = ask; return sigOf(where, rest) }
// 现场上在干的角色要写哪些文件：这几份在页面上先按不了，免得角色写回去时把人刚按的盖掉。
// writes 的一项可以是一份文件、一个文件夹、带 <占位> 的一类文件；「a.json、b/」这样连着写的，后面的从头一个所在的文件夹算；括号里的补充不看
function writerOf(dir, file) {
  const scene = readJson(path.join(dir, '现场.json'), { now: [] })
  const norm = (p) => p.split(path.sep).join('/').replace(/[/]+$/, '')
  const F = norm(path.resolve(file))
  for (const n of Array.isArray(scene.now) ? scene.now : []) {
    for (const w of n.writes ?? []) {
      const pieces = String(w).split('（')[0].split('、').map((x) => x.trim()).filter(Boolean)
      if (!pieces.length) continue
      const firstDir = path.dirname(path.resolve(dir, pieces[0]))
      for (const [i, piece] of pieces.entries()) {
        for (const c of [path.resolve(dir, piece), ...(i ? [path.resolve(firstDir, piece)] : [])].map(norm)) {
          const hit = c.includes('<')
            ? new RegExp('^' + c.split(/<[^>]*>/).map((x) => x.replace(/[.*+?^$()|[\]{}\\]/g, (m) => '\\' + m)).join('[^/]+') + '(/.*)?$').test(F)
            : F === c || F.startsWith(c + '/')
          if (hit) return { role: n.role, step: n.step }
        }
      }
    }
  }
  return null
}
const lockedMsg = (w) => `${w.role}正在改这一份（${w.step}），等它交回再按`
const staleMsg = '这一处在你打开页面以后改过了：刷新页面，看一遍现在的再按'

// ---------- 读 ----------
const exists = (p) => fs.existsSync(p)
const readJson = (p, dflt) => (exists(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : dflt)
const readText = (p) => fs.readFileSync(p, 'utf8')
const listJson = (dir) => (exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.slice(0, -5), data: readJson(path.join(dir, f)) })) : [])
// 业务的概念文件：概念/<主题>.json 一个主题一份；分了子主题的主题另有 概念/<主题>/<子主题>.json，名字写成「主题/子主题」
const conceptFiles = (b) => { const d = path.join(b, '概念'); return [...listJson(d), ...(exists(d) ? fs.readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name).sort() : []).flatMap((t) => listJson(path.join(d, t)).map((x) => ({ ...x, name: t + '/' + x.name })))] }
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

// 一个任务四段做到哪，不用谁去填，从三样东西算：
//   日志：哪个角色为这个任务派出过（业务 → 业务，建模 → 建模，UI 设计 → 界面，软件工程师 → 编码）；指挥记的「做完」
//   界面：这条需求的屏是不是都定下了
//   日程里老数据填过的日期：照旧认（老数据只有三段，界面那一段跟着编码）
// 每段的值是做完那天的日期或 null；_doing 是正在做的那几段（派出过、还没绿）。
// 绿的条件：业务——后面哪一段派出过；建模——编码派出过；界面——屏全定下了；编码——任务记了做完。任务记了做完，四段全绿。
const STAGE_OF_ROLE = { '业务': '业务', '建模': '建模', 'UI 设计': '界面', '软件工程师': '编码' }
const fullStages = (st) => ({ 业务: st?.业务 ?? null, 建模: st?.建模 ?? null, 界面: st && '界面' in st ? st.界面 ?? null : st?.编码 ?? null, 编码: st?.编码 ?? null })
function progressOf(dir, P) {
  const first = {}, done = {}, logDir = path.join(dir, '日志')
  for (const f of exists(logDir) ? fs.readdirSync(logDir).filter((x) => x.endsWith('.jsonl')).sort() : []) {
    const date = f.slice(0, -6)
    for (const line of readText(path.join(logDir, f)).split(/\r?\n/)) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      if (!e.task) continue
      if (e.kind === '派出' && STAGE_OF_ROLE[e.role]) (first[e.task] ??= {})[STAGE_OF_ROLE[e.role]] ??= date
      else if (e.kind === '做完') done[e.task] ??= date
    }
  }
  const screens = {}   // 需求编号 → 几屏、定了几屏、最后定下的那天
  for (const name of P.names) for (const { name: id, data } of listJson(path.join(P.cx(name), '界面'))) {
    const s = (screens[data.req ?? id] ??= { total: 0, decided: 0, last: null })
    for (const v of data.views ?? []) for (const sc of v.screens ?? []) { s.total++; if (sc.decidedAt) { s.decided++; if (!s.last || sc.decidedAt > s.last) s.last = sc.decidedAt } }
  }
  return (id, recorded) => {
    const rec = fullStages(recorded), d = first[id] ?? {}, dn = done[id] ?? null
    const s = screens[id] ?? screens[String(id).split('.')[0]]   // 任务 N-02.1 的屏在需求 N-02 那一份里
    const later = [d.建模, d.界面, d.编码].filter(Boolean).sort()[0] ?? null
    const st = {
      业务: dn ?? rec.业务 ?? later,
      建模: dn ?? rec.建模 ?? d.编码 ?? null,
      界面: dn ?? rec.界面 ?? (s?.total && s.decided === s.total ? s.last : null),
      编码: dn ?? rec.编码 ?? null }
    st._doing = STAGES.filter((k) => !st[k] && (d[k] || (k === '界面' && s?.total)))
    return st
  }
}
// 日程带上算出来的四段：页面照它画，不看日程里填没填日期
function 日程With(dir, P) {
  const 日程 = JSON.parse(JSON.stringify(日程Of(dir))), prog = progressOf(dir, P)
  for (const m of 日程.milestones ?? []) for (const it of m.items ?? []) {
    if (it.tasks?.length) for (const t of it.tasks) t.stages = prog(t.id, t.stages)
    else it.stages = prog(it.id, it.stages)
  }
  return 日程
}

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
// 截止＝原定日期加上记下的拖延（日程只追加 drift、不改原日期）
function dueOf(日程, m) {
  const days = (日程.drift ?? []).filter((x) => x.milestone === m.id).reduce((n, x) => n + (x.days ?? 0), 0)
  if (!days) return m.date
  const d = new Date(m.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10)
}
// 当期：今天落在哪一期的日子里（这一期最早开工的那天到截止）就是哪一期；落不进就取最早一期里还没走完的；都走完了取最后一期
// 首页的进度只看当期，看得清眼下该干什么；项目管理页照旧全显示
function currentMilestone(日程, today) {
  const ms = 日程.milestones ?? []
  const startOf = (m) => (m.items ?? []).flatMap((it) => [it.start, ...(it.tasks ?? []).map((t) => t.start)]).filter(Boolean).sort()[0] ?? m.date
  const hit = ms.find((m) => startOf(m) <= today && today <= dueOf(日程, m))
  if (hit) return hit.id
  const open = ms.find((m) => (m.items ?? []).some((it) => !(it.tasks?.length ? it.tasks : [it]).every(doneTask)))
  return (open ?? ms.at(-1))?.id ?? null
}

// ---------- 每一页 ----------
// 业务页每个有业务文件夹的上下文都读，放进 BIZ（键是上下文名）；页面按 hash 切上下文。
// 建模、编码两页只开第一个有东西的上下文
function business(dir, P) {
  const BIZ = {}
  for (const name of P.names) {
    const b = path.join(P.cx(name), '业务')
    if (!exists(b)) continue
    const CONCEPTS = {}
    for (const { name: id, data } of conceptFiles(b)) CONCEPTS[id] = data
    BIZ[name] = {
      MAP: readJson(path.join(b, '全局图.json'), { topics: [], edges: [] }),
      CONCEPTS,
      FLOWS: listJson(path.join(b, '流程')).map(({ name: file, data }) => {
        for (const s of data.steps ?? []) {
          for (const r of s.rules ?? []) if (r.status === '待定' && !r.answer) r.sig = qaSig(s, r)
          for (const a of s.asks ?? []) if (!a.answer) a.sig = qaSig(s, a)
        }
        const locked = writerOf(dir, path.join(b, '流程', file + '.json'))
        return { ...data, file: data.file ?? file, ...(locked ? { locked } : {}) }
      }) }
  }
  // 兼容：MAP/CONCEPTS/FLOWS 仍给第一个有业务的上下文的
  const first = Object.values(BIZ)[0] ?? { MAP: { topics: [], edges: [] }, CONCEPTS: {}, FLOWS: [] }
  // OPEN：每段流程还没答的规则和问题条数（键 <上下文>/<流程文件名>），左边栏红点用
  // SCREENS：界面页的屏名（键 <需求编号>/<屏 id>），流程里 UI 设计问的问题标屏名、链过去用
  return { CONTEXTS: P.contexts, BIZ, ...first, ...contextMap(dir, P), OPEN: openInFlows(dir, P).byFlow, SCREENS: screenIndex(P) }
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
  return { CONTEXTS: P.names, 需求: 需求Of(dir), 日程: 日程With(dir, P), PROG: Object.fromEntries(((prog) => 需求Of(dir).items.map((r) => [r.id, prog(r.id, null)]))(progressOf(dir, P))), TODAY: (opts.now ?? localNow()).slice(0, 10), PROJECTS: overview(opts.dirs ?? [dir], opts).PROJECTS }
}

// 上下文地图（业务页里项目级的那一页）：项目.json、上下文图.json，加数出来的「用了共享内核什么」「到哪一步」
function contextMap(dir, P) {
  const 日程 = 日程With(dir, P), tasks = tasksOf(日程), 需求 = 需求Of(dir)
  const kernel = P.pj.kernel?.concepts ?? []
  const USES = {}, PROGRESS = {}
  for (const c of P.pj.contexts) {
    const b = path.join(P.cx(c.name), '业务'), m = path.join(P.cx(c.name), '模型'), k = path.join(P.cx(c.name), '代码')
    const conceptText = conceptFiles(b).map((x) => JSON.stringify(x.data)).join('\n')
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

function modelFiles(cxDir, each) {
  const m = path.join(cxDir, '模型')
  const AGGS = [], CATALOG = {}, MOVES = []
  for (const topic of listDirs(m)) {
    for (const { name, data } of listJson(path.join(m, topic, '聚合'))) { const a = { ...data, topic: data.topic ?? topic }; each?.(a, path.join(m, topic, '聚合', name + '.json')); AGGS.push(a) }
    for (const { name, data } of listJson(path.join(m, topic, '调动'))) {
      if (name === '清单') CATALOG[topic] = data.items ?? []
      else MOVES.push({ ...data, file: data.file ?? name, topic: data.topic ?? topic })
    }
  }
  return { AGGS, CATALOG, MOVES }
}

function modeling(dir, P) {
  const out = { CONTEXTS: P.contexts, TOPICS: {}, AGGS: [], CATALOG: {}, MOVES: [], FLOW_STEPS: {}, GRAPHS: {}, BY_CX: {} }
  // GRAPHS：每个上下文的 模型/全图.json（起骨架时写，聚合之间的指向），键是上下文名；没有的不列
  for (const name of P.names) { const g = readJson(path.join(P.cx(name), '模型', '全图.json'), null); if (g) out.GRAPHS[name] = g }
  // BY_CX：每个有模型的上下文一份（主题、聚合、清单、调动、流程步骤），页面换上下文时换着用；
  // 顶层那几栏照旧是第一个有业务或模型的上下文的
  for (const name of P.names) {
    const cx = P.cx(name)
    if (!exists(path.join(cx, '模型')) && !exists(path.join(cx, '业务'))) continue
    // 聚合上的问题挂在成员上，或者成员的一个行为上；没答的带上记号。角色正在改的那一份记 locked，页面上先答不了
    const d = { TOPICS: {}, ...modelFiles(cx, (a, file) => {
      const w = writerOf(dir, file); if (w) a.locked = w
      for (const [m, b, q] of asksInAgg(a)) if (!q.answer) q.sig = askSig([a.id, m.id, b?.name ?? null], q)
    }), FLOW_STEPS: {} }
    const map = readJson(path.join(cx, '业务', '全局图.json'), { topics: [] })
    // x、y 是业务全局图上主题框的格子位置，聚合全图照它排
    for (const t of map.topics) d.TOPICS[t.id] = { title: t.title, c: t.c, x: t.x, y: t.y }
    for (const { name: file, data } of listJson(path.join(cx, '业务', '流程'))) {
      const steps = {}
      for (const s of data.steps ?? []) steps[s.id] = s.title
      d.FLOW_STEPS[data.file ?? file] = { title: String(data.title ?? '').split('：')[0], steps }
    }
    // NOTES：他在成员页属性后面留的话；UNMODELED：业务概念在模型里找不到自己的元素
    d.NOTES = notesOf(cx); d.UNMODELED = unmodeled(cx, d.AGGS)
    if (exists(path.join(cx, '模型'))) out.BY_CX[name] = d
    if (!out.MODEL_CX) { Object.assign(out, d); out.MODEL_CX = name }
  }
  return out
}

// 一份聚合上所有的问题：[成员, 行为或 null, 问题]
const asksInAgg = (a) => (a.members ?? []).flatMap((m) => [...(m.asks ?? []).map((q) => [m, null, q]), ...(m.behaviors ?? []).flatMap((b) => (b.asks ?? []).map((q) => [m, b, q]))])
// 聚合上还没答的问题：按聚合数（键 <上下文>/<聚合 id>），给指挥页「等你答」那一行用。读不出来的文件跳过，免得首页打不开
function openInModels(dir, P) {
  const byAgg = {}
  let total = 0
  for (const name of P.names) {
    let aggs = []
    try { aggs = modelFiles(P.cx(name)).AGGS } catch { continue }
    for (const a of aggs) { const n = asksInAgg(a).filter(([, , q]) => !q.answer).length; if (n) { byAgg[name + '/' + a.id] = n; total += n } }
  }
  return { byAgg, total }
}
// 伪代码上还没答的问题：挂在块上；按文件数（键 <上下文>/<代码文件路径>）
function openInPseudo(dir, P) {
  const byFile = {}
  let total = 0
  for (const name of P.names) {
    const k = path.join(P.cx(name), '代码', '伪代码')
    for (const f of walk(k)) {
      if (!f.endsWith('.json')) continue
      let d; try { d = readJson(path.join(k, f)) } catch { continue }
      const n = (d.blocks ?? []).flatMap((b) => b.asks ?? []).filter((q) => !q.answer).length
      if (n) { byFile[name + '/' + (d.file ?? f.slice(0, -5))] = n; total += n }
    }
  }
  return { byFile, total }
}

// 留言：上下文/<名>/模型/留言.json { items: [{ id, agg, member, field, text, at, reply?, repliedAt?, status: 待处理 | 已处理 }] }
// 不放进 聚合/ 文件夹：那下面每份 json 都当聚合读
const notesPath = (cx) => path.join(cx, '模型', '留言.json')
const notesOf = (cx) => readJson(notesPath(cx), { items: [] }).items ?? []

// 业务概念在模型里找不到自己的元素：概念名对不上任何聚合名、成员名，也没有成员用 concept 声明对应它。
// 只看这个上下文自己的概念（概念图里的 concepts），external 是别处的不算；aggs 是 concepts 里列了它、却没给它元素的聚合
function unmodeled(cx, AGGS) {
  if (!exists(path.join(cx, '模型'))) return []
  const has = new Set(AGGS.flatMap((a) => [a.title, ...(a.members ?? []).flatMap((m) => [m.name, ...[].concat(m.concept ?? [])])]))
  const out = []
  for (const { name: file, data } of conceptFiles(path.join(cx, '业务'))) for (const c of data.concepts ?? []) {
    if (!c.title || has.has(c.title)) continue
    out.push({ topic: data.topic ?? file, concept: c.title, aggs: AGGS.filter((a) => (a.concepts ?? []).includes(c.title)).map((a) => a.id) })
  }
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
    const vs = [].concat(i.via ?? []).map((v) => v.name).filter(Boolean)
    if (vs.length) x.via = vs
    if (i.on ?? i.in?.event) x.on = i.on ?? i.in.event
    return x
  })
  const flows = MOVES.map((mv) => ({ file: mv.file, title: mv.title, topic: mv.topic, rows: (mv.rows ?? []).map((r) => r.ref) }))
  return { topics, aggs, items, flows }
}

// 代码在哪：结构.json 的 base 是文件路径从哪算起，从工作区的根算起（代码在项目自己的代码库里时，比如 ../packages）；不写就是 上下文/<名>/代码
const codeBase = (dir, cx, STRUCT) => (STRUCT.base ? path.resolve(dir, STRUCT.base) : path.join(cx, '代码'))
// 进度：结构.json 里每个文件指回模型的哪几条；源码在就是「已写」，有测试文件列着它就是「有测试」；跑没跑过这里不知道
function codeProgress(dir, cx, STRUCT) {
  const status = {}, src = codeBase(dir, cx, STRUCT)
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

// 规范不用人按「定下」：上面没有挂着的待定项就算定了。老文件里的 decidedAt、decidedSig 照原样留着，页面不看
const readSpec = (p) => readJson(p, null)

// 一个上下文的代码这一头：模型压扁的几栏、文件结构、进度、伪代码、代码预览
function codeOf(dir, cx, emptyStruct) {
  const k = path.join(cx, '代码'), STRUCT = readJson(path.join(k, '结构.json'), emptyStruct), PSEUDO = {}, CODE = {}
  // 伪代码块上没答的问题带记号；有没答的问题、又有角色正在改的那一份记 locked
  for (const f of walk(path.join(k, '伪代码'))) if (f.endsWith('.json')) {
    const pf = path.join(k, '伪代码', f), { file, ...rest } = readJson(pf), key = file ?? f.slice(0, -5)
    let open = 0
    for (const b of rest.blocks ?? []) for (const q of b.asks ?? []) if (!q.answer) { q.sig = askSig([key, b.name], q); open++ }
    if (open) { const w = writerOf(dir, pf); if (w) rest.locked = w }
    PSEUDO[key] = rest
  }
  // 代码预览：结构.json 里列着、代码库里也有的文件
  const base = codeBase(dir, cx, STRUCT)
  for (const f of STRUCT.files ?? []) if (exists(path.join(base, f.path))) CODE[f.path] = readText(path.join(base, f.path))
  return { MODEL: codeModel(cx), STRUCT, PROGRESS: codeProgress(dir, cx, STRUCT), PSEUDO, CODE }
}

function coding(dir, P) {
  const out = { CONTEXTS: P.contexts, MODEL: { topics: {}, aggs: [], items: [], flows: [] }, STRUCT: { lang: '', root: 'src', files: [] }, PROGRESS: { updatedAt: '', status: {}, runs: [] },
    QUESTIONS: { '技术选型': readJson(path.join(ROOT, 'templates', '技术选型.json'), { questions: [] }).questions },
    STRUCTURE: readJson(path.join(ROOT, 'templates', '结构设计.json'), {}), NAMING: readJson(path.join(ROOT, 'templates', '文件命名.json'), {}), ANSWERS: { '技术选型': { answers: {} } }, PSEUDO: {}, CODE: {} }
  // 全局结构整个项目一份，在项目根；还没有就给模板，标出来
  out.GLOBAL = readSpec(globalSpecPath(dir)) ?? { ...readJson(path.join(ROOT, 'templates', '全局结构.json'), { nodes: [], edges: [] }), fromTemplate: true }
  // MODELS：每个有模型的上下文一份，文件的 model.context 指到别的上下文时页面从这里找
  out.MODELS = {}
  for (const name of P.names) if (exists(path.join(P.cx(name), '模型'))) out.MODELS[name] = codeModel(P.cx(name))
  for (const name of P.names) {
    const cx = P.cx(name), k = path.join(cx, '代码')
    if (!exists(k) && !exists(path.join(cx, '模型'))) continue
    Object.assign(out, codeOf(dir, cx, out.STRUCT))
    const spec = (kind) => readSpec(path.join(k, '规范', kind + '.json'))
    if (spec('结构设计')) out.STRUCTURE = spec('结构设计')
    if (spec('文件命名')) out.NAMING = spec('文件命名')
    if (spec('技术选型')) out.ANSWERS['技术选型'] = spec('技术选型')
    out.CODE_CX = name
    break
  }
  // BY_CX：顶层那几样（MODEL、STRUCT、PROGRESS、PSEUDO、CODE）是 CODE_CX 那个上下文的；别的有文件结构的上下文各一份，页面换上下文时换着用
  out.BY_CX = {}
  for (const name of P.names) if (name !== out.CODE_CX && exists(path.join(P.cx(name), '代码', '结构.json'))) out.BY_CX[name] = codeOf(dir, P.cx(name), { lang: '', root: 'src', files: [] })
  // 别的上下文还没有代码，规范可能先起草了：一个上下文一份，页面照着列
  out.SPECS = {}
  for (const name of P.names) {
    const got = {}
    for (const kind of ['结构设计', '文件命名', '技术选型']) { const j = readSpec(path.join(P.cx(name), '代码', '规范', kind + '.json')); if (j) got[kind] = j }
    if (Object.keys(got).length) out.SPECS[name] = got
  }
  return out
}

// 等你定：只有界面的小样要人按「定下」，这里列每条需求还没定下的屏；首页和 scene.js pending 共用
// { page, title, hash, ref?, note? }：ref 是需求编号（只作佐证）
function pendingDecisions(dir, P = project(dir)) {
  const out = []
  for (const name of P.names) for (const { name: id, data } of listJson(path.join(P.cx(name), '界面'))) {
    const req = data.req ?? id, scs = (data.views ?? []).flatMap((v) => v.screens ?? []), left = scs.filter((sc) => !sc.decidedAt)
    if (left.length) out.push({ page: '界面', title: `${data.title ?? req} · 小样`, hash: `${name}/${req}/${left[0].id}`, ref: req, note: `${left.length} / ${scs.length} 屏没定` })
  }
  return out
}

function command(dir, P, opts) {
  const now = opts.now ?? localNow()
  const scene = readJson(path.join(dir, '现场.json'), { now: [], waiting: [] })
  const readLog = (ymd) => { const f = path.join(dir, '日志', ymd + '.jsonl'); return exists(f) ? readText(f).split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [] }
  const today = readLog(now.slice(0, 10))
  // RECENT：流水只看最近 3 天（含今天），一天一组；泳道还是只画今天
  const RECENT = [0, 1, 2].map((k) => { const d = new Date(now.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - k); const ymd = d.toISOString().slice(0, 10); return { date: ymd, rows: k ? readLog(ymd) : today } }).filter((g) => g.rows.length)
  const ITEMS = {}
  for (const i of 需求Of(dir).items) ITEMS[i.id] = { title: i.title, context: i.context ?? null }
  // PAGE_ASKS：问题留在各自页上的角色，这里只给条数（业务的挂在流程步骤上，UI 设计的挂在小样那一屏上，建模的挂在聚合的成员或行为上，软件工程师的挂在伪代码的块上）
  // DECIDES：等你定的（不按期过滤）；CURRENT：当期的里程碑 id，首页的进度和左边栏的任务数只看这一期
  const PLAN = 日程With(dir, P)
  return { CONTEXTS: P.contexts, NOW_TS: now, SCENE: { ...scene, today }, RECENT, ITEMS, PLAN, CURRENT: currentMilestone(PLAN, now.slice(0, 10)), DECIDES: pendingDecisions(dir, P), PAGE_ASKS: { '业务': openInFlows(dir, P).total, '界面': openInMockups(dir, P).total, '建模': openInModels(dir, P).total, '编码': openInPseudo(dir, P).total } }
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
      const locked = writerOf(dir, path.join(u, id + '.json')) ?? writerOf(dir, path.join(u, req.req, '_'))
      if (locked) req.locked = locked
      for (const v of req.views ?? []) for (const sc of v.screens ?? []) sc.sig = screenSig(u, req.req, sc)
      // 屏的 step 指 flow 那段流程的第几步：那一步的标题记进 stepTitle，页头写「对着流程第几步：标题」
      // flow 是数组（一条需求跨几段流程）时 step 写「<流程文件名>/<步号>」，另记 stepFlow（流程名去掉编号）和 stepNo
      const multi = Array.isArray(req.flow)
      const flows = {}
      const flowOf = (file) => {
        if (!(file in flows)) { const f = path.join(P.cx(name), '业务', '流程', file + '.json'); flows[file] = exists(f) ? readJson(f) : null }
        return flows[file]
      }
      for (const v of req.views ?? []) for (const sc of v.screens ?? []) {
        let file = multi ? null : req.flow, no = sc.step == null ? null : String(sc.step)
        if (multi && no != null) { const k = no.lastIndexOf('/'); if (k > 0) { file = no.slice(0, k); no = no.slice(k + 1) } }
        const flow = file ? flowOf(file) : null
        const st = flow && no != null ? (flow.steps ?? []).find((s) => String(s.id) === no) : null
        if (st) sc.stepTitle = st.title
        if (multi && file) { sc.stepFlow = file.replace(/^\d+[a-z]?-/, ''); sc.stepNo = no }
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
    const P = project(dir), 日程 = 日程With(dir, P), 需求 = 需求Of(dir), prog = progressOf(dir, P)
    const reqOf = {}; for (const r of 需求.items) reqOf[r.id] = r
    const planned = new Set()
    // 拆了任务的功能，阶段日期取所有任务都定了的那一天（最晚的）；没拆的用自己的
    const stagesOf = (it) => {
      if (!it.tasks?.length) return it.stages
      const st = {}
      for (const s of STAGES) st[s] = it.tasks.every((t) => t.stages?.[s]) ? it.tasks.map((t) => t.stages[s]).sort().at(-1) : null
      st._doing = STAGES.filter((s) => !st[s] && it.tasks.some((t) => t.stages?.[s] || t.stages?._doing?.includes(s)))
      return st
    }
    const itemOf = (it) => { planned.add(it.id); const r = reqOf[it.id] ?? {}; return { id: it.id, title: r.title ?? it.id, context: r.context ?? null, decision: r.decision ?? '做', moscow: r.moscow ?? null, outcome: r.outcome, stages: stagesOf(it) } }
    const milestones = 日程.milestones.map((m) => ({ id: m.id, title: m.title, goal: m.goal ?? null, due: dueOf(日程, m), items: (m.items ?? []).map(itemOf) }))
    const unplanned = 需求.items.filter((r) => !planned.has(r.id)).map((r) => ({ id: r.id, title: r.title, context: r.context ?? null, decision: r.decision ?? '再看', moscow: r.moscow ?? null, outcome: r.outcome, stages: prog(r.id, null) }))
    const scene = readJson(path.join(dir, '现场.json'), { now: [], waiting: [] })
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
  const uiDir = path.dirname(p), w = writerOf(dir, p) ?? writerOf(dir, path.join(uiDir, data.req ?? body.mockup, '_'))
  if (w) return { ok: false, error: lockedMsg(w) }
  if (body.sig && body.sig !== screenSig(uiDir, data.req ?? body.mockup, hit)) return { ok: false, error: staleMsg }
  hit.decidedAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '定下', role: '你', context: body.context, task: body.mockup, text: `定下 ${body.mockup} 的小样 ${hit.title ?? body.screen}` })
  return { ok: true, mockup: body.mockup, screen: body.screen, date: hit.decidedAt }
}

// 定下：只有界面的小样要人按，一次一屏
function decide(dir, body, now) {
  if (!body.mockup) return { ok: false, error: '只有界面的小样要按定下：别的东西上没有挂着的待定项，就算定了' }
  return decideMockup(dir, body, now)
}

// 业务页的地址 <上下文>/flow/<流程文件名>、<上下文>/concepts/<主题>、<上下文>/map 对应的文件；
// 建模页的 <上下文>/all（聚合全图）、<上下文>/agg/<聚合 id 或名>、<上下文>/list/<主题>、<上下文>/move/<流程文件名>：聚合和流程不知道在哪个主题下，挨个主题找
function bizFileOf(dir, hash) {
  const [cx, kind, id, sub] = hash.split('/'), b = path.join(dir, '上下文', cx, '业务'), m = path.join(dir, '上下文', cx, '模型')
  if (kind === 'flow') return path.join(b, '流程', id + '.json')
  if (kind === 'concepts') return sub ? path.join(b, '概念', id, sub + '.json') : path.join(b, '概念', id + '.json')
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

// 答：从 现场.json 的 waiting 里拿掉这个问题，日志记一条；流程、小样、聚合、伪代码上的问题各写回各自的文件
// 答流程里的规则或问题：body { flow: 流程文件名, context, step, rule | ask: id, text }；写回那一步的 answer，规则的 status 变定了；日志记一条
function answerInFlow(dir, body, now) {
  const p = path.join(dir, '上下文', body.context ?? '', '业务', '流程', body.flow + '.json')
  if (!body.context || !exists(p)) return { ok: false, error: `没有 ${body.context ?? '?'} 的流程 ${body.flow}` }
  const data = readJson(p)
  const step = (data.steps ?? []).find((s) => String(s.id) === String(body.step))
  if (!step) return { ok: false, error: `${body.flow} 里没有第 ${body.step} 步` }
  const hit = body.rule ? (step.rules ?? []).find((r) => r.id === body.rule) : (step.asks ?? []).find((a) => a.id === body.ask)
  if (!hit) return { ok: false, error: `第 ${body.step} 步上没有 ${body.rule ?? body.ask}` }
  const w = writerOf(dir, p)
  if (w) return { ok: false, error: lockedMsg(w) }
  if (body.sig && body.sig !== qaSig(step, hit)) return { ok: false, error: staleMsg }
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
  const uiDir = path.dirname(p), w = writerOf(dir, p) ?? writerOf(dir, path.join(uiDir, data.req ?? body.mockup, '_'))
  if (w) return { ok: false, error: lockedMsg(w) }
  if (body.sig && body.sig !== screenSig(uiDir, data.req ?? body.mockup, sc)) return { ok: false, error: staleMsg }
  hit.answer = body.text; hit.answeredAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '答', role: '你', context: body.context, q: `${body.mockup}/${body.screen}/${hit.id}`, text: body.text })
  return { ok: true, id: hit.id }
}

// 答聚合上的问题：body { context, agg: 聚合 id 或名, ask: 问题 id, text, sig }；问题号在一份聚合里不重复，挂在哪个成员、哪个行为上从文件里找
function answerInModel(dir, body, now) {
  const p = body.context ? bizFileOf(dir, `${body.context}/agg/${body.agg}`) : null
  if (!p || !exists(p)) return { ok: false, error: `${body.context ?? '?'} 里没有聚合 ${body.agg ?? '?'}` }
  if (!body.text) return { ok: false, error: '答案是空的' }
  const data = readJson(p), found = asksInAgg(data).find(([, , q]) => q.id === body.ask)
  if (!found) return { ok: false, error: `${data.title} 上没有问题 ${body.ask}` }
  const [m, b, hit] = found, where = [data.title, m.name, ...(b ? [b.name] : [])]
  if (hit.answer) return { ok: false, error: `${where.join(' · ')} 的 ${hit.id} 已经答过了（${hit.answeredAt ?? ''}）` }
  const w = writerOf(dir, p)
  if (w) return { ok: false, error: lockedMsg(w) }
  if (body.sig && body.sig !== askSig([data.id, m.id, b?.name ?? null], hit)) return { ok: false, error: staleMsg }
  hit.answer = body.text; hit.answeredAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '答', role: '你', context: body.context, q: [...where, hit.id].join('/'), text: body.text })
  return { ok: true, id: hit.id }
}
// 一份代码文件的伪代码在哪：代码/伪代码/ 下照代码文件的路径摆；没照路径摆的，看文件里的 file 写的是不是它
function pseudoFileOf(dir, context, file) {
  const k = path.resolve(dir, '上下文', context, '代码', '伪代码'), direct = path.resolve(k, file + '.json')
  if (direct.startsWith(k + path.sep) && exists(direct)) return direct
  const hit = walk(k).find((f) => { if (!f.endsWith('.json')) return false; try { return readJson(path.join(k, f)).file === file } catch { return false } })
  return hit ? path.join(k, hit) : null
}
// 答伪代码上的问题：body { context, pseudo: 代码文件的路径, ask: 问题 id, text, sig }；问题号在一份伪代码里不重复，挂在哪一块上从文件里找
function answerInPseudo(dir, body, now) {
  const p = body.context ? pseudoFileOf(dir, body.context, String(body.pseudo)) : null
  if (!p) return { ok: false, error: `${body.context ?? '?'} 里没有 ${body.pseudo} 的伪代码` }
  if (!body.text) return { ok: false, error: '答案是空的' }
  const data = readJson(p), blk = (data.blocks ?? []).find((x) => (x.asks ?? []).some((a) => a.id === body.ask))
  if (!blk) return { ok: false, error: `${body.pseudo} 的伪代码上没有问题 ${body.ask}` }
  const hit = blk.asks.find((a) => a.id === body.ask)
  if (hit.answer) return { ok: false, error: `${body.pseudo} · ${blk.name} 的 ${hit.id} 已经答过了（${hit.answeredAt ?? ''}）` }
  const w = writerOf(dir, p)
  if (w) return { ok: false, error: lockedMsg(w) }
  if (body.sig && body.sig !== askSig([String(body.pseudo), blk.name], hit)) return { ok: false, error: staleMsg }
  hit.answer = body.text; hit.answeredAt = now.slice(0, 10)
  writeJson(p, data)
  appendLog(dir, now, { kind: '答', role: '你', context: body.context, q: `${body.pseudo}/${blk.name}/${hit.id}`, text: body.text })
  return { ok: true, id: hit.id }
}

function answer(dir, body, now) {
  if (body.mockup) return answerInMockup(dir, body, now)
  if (body.agg) return answerInModel(dir, body, now)
  if (body.pseudo) return answerInPseudo(dir, body, now)
  if (body.flow) return answerInFlow(dir, body, now)
  const scenePath = path.join(dir, '现场.json'), scene = readJson(scenePath, { now: [], waiting: [] })
  const q = scene.waiting.find((x) => x.id === body.q)
  if (!q) return { ok: false, error: '没有这个问题：' + body.q }
  scene.waiting = scene.waiting.filter((x) => x.id !== body.q)
  writeJson(scenePath, scene)
  appendLog(dir, now, { kind: '答', role: '你', context: q.context, task: q.task, stage: q.stage, q: q.id, text: body.text })
  return { ok: true }
}

// 全局结构是项目根那一份，不带上下文
const globalSpecPath = (dir) => path.join(dir, '代码', '规范', '全局结构.json')

// 在属性后面留言：body { context, agg, member, field, text }；留言.json 重读、追加一条、写回（不整份覆盖别人刚写的），日志记一条
function leaveNote(dir, body, now) {
  const cx = path.join(dir, '上下文', body.context ?? '')
  if (!body.context || !exists(path.join(cx, '模型'))) return { ok: false, error: `没有 ${body.context ?? '?'} 的模型` }
  const text = String(body.text ?? '').trim()
  if (!text) return { ok: false, error: '留言是空的' }
  const f = body.agg && bizFileOf(dir, `${body.context}/agg/${body.agg}`)
  if (!f || !exists(f)) return { ok: false, error: `${body.context} 里没有聚合 ${body.agg ?? '?'}` }
  const a = readJson(f), m = (a.members ?? []).find((x) => x.id === body.member || x.name === body.member)
  if (!m) return { ok: false, error: `${a.title} 里没有成员 ${body.member ?? '?'}` }
  if (!body.field) return { ok: false, error: '要说留在哪个属性后面' }
  const w = writerOf(dir, notesPath(cx))
  if (w) return { ok: false, error: lockedMsg(w) }
  const data = readJson(notesPath(cx), { items: [] }); data.items ??= []
  const n = Math.max(0, ...data.items.map((x) => parseInt(String(x.id ?? '').replace(/\D/g, ''), 10) || 0)) + 1
  const note = { id: 'n-' + n, agg: a.id, member: m.id, field: body.field, text, at: now, status: '待处理' }
  data.items.push(note)
  writeJson(notesPath(cx), data)
  appendLog(dir, now, { kind: '留言', role: '你', context: body.context, text: `${a.title} · ${m.name} · ${body.field}：${text}` })
  return { ok: true, id: note.id }
}
// 还没处理的留言，聚合、成员换成名字：scene.js notes / pending 用
function pendingNotes(dir) {
  const P = project(dir), out = []
  for (const name of P.names) {
    const items = notesOf(P.cx(name)).filter((x) => x.status !== '已处理')
    if (!items.length) continue
    const aggs = modelFiles(P.cx(name)).AGGS
    for (const x of items) {
      const a = aggs.find((y) => y.id === x.agg || y.title === x.agg), m = a?.members?.find((y) => y.id === x.member || y.name === x.member)
      out.push({ context: name, id: x.id, agg: a?.title ?? x.agg, member: m?.name ?? x.member, field: x.field, text: x.text, at: x.at })
    }
  }
  return out
}

const ACTIONS = { '定下': decide, '答': answer, '留言': leaveNote }
function applyAction(dir, action, body, opts = {}) {
  const fn = ACTIONS[action]; if (!fn) throw new Error('没有这个动作：' + action)
  return fn(dir, body, opts.now ?? localNow())
}

// 各上下文的原型：上下文/<名>/代码/原型.json { url, start, note? }，没有这份就是还没有原型；顶栏的「原型」入口用
function prototypes(dir) {
  const P = project(dir)
  return P.names.flatMap((name) => {
    const p = readJson(path.join(P.cx(name), '代码', '原型.json'), null)
    return p?.url ? [{ context: name, url: p.url, start: p.start ?? '', note: p.note ?? '' }] : []
  })
}

module.exports = { pageData, applyAction, localNow, prototypes, pendingDecisions, pendingNotes, currentMilestone, writerOf }
