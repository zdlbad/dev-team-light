// 指挥记现场、写派工书、追加日志：每个动作之前写，做完清掉。
//   node tools/scene.js <项目> dispatch <派工书.json>        现场.now 加一项（几个角色可以同时在干）；派工/<日期>-<序号>.json 存一份；日志记「派出」
//                                                           writes 里有代码、却没列它对着的伪代码目录，就印一行提醒，不拦（只改测试这类本来就不碰伪代码的）
//   node tools/scene.js <项目> back "<一句话>" [--role <角色>] [--files a,b] [--asks <问题.json>] [--answers q-5,q-6]
//                                                           那个角色从 现场.now 里去掉（几个人在干时要 --role，同一角色在几个上下文时再要 --context）；asks 并进 waiting；日志记「交回」和每个「问」
//                                                           问题带 to（建模 | 业务）的是问上游角色，不进 waiting，只记日志，等指挥派；没写 to 或 to 是「你」才挂给他
//                                                           answers 是这一趟答了的问上游的问题：日志每条记「答」，答的是交回的这个角色；编号不在还开着的里就报错
//                                                           挂给他的问题 q、why 里带内部字眼（in/out、小样、伪代码、问题号、文件名、英文代号）就印一行提醒，不拦
//   node tools/scene.js <项目> ask <问题.json> --role <角色> [--context <上下文>]
//                                                           不交回也能挂问题（比如角色交回后才发现页面上答不了）：并进 waiting、日志记「问」
//   node tools/scene.js <项目> drop <q-1,q-2…> "<为什么>"     撤下没答的问题：等你答里的（比如改挂到流程上了），或者还开着的问上游的（比如转给项目管理记成候选了）；日志每条记「撤问」
//   node tools/scene.js <项目> answered <q-1,q-2…> --role <答的角色> "<一句话：答在哪>"
//                                                           事后补记问上游的问题答了（交回时忘了带 --answers）；日志每条记「答」
//   node tools/scene.js <项目> done <任务> "<一句话>"          记一个任务做完了（软件工程师交回了它的代码、测试跑过、原型打得开）；日志记「做完」，页面上这个任务四段全绿
//                                                           任务是需求编号，拆了功能的是功能的编号；清单和日程里都没有的编号、已经记过做完的，报错
//   node tools/scene.js <项目> upstream                      打印还开着的问上游的问题，按问谁分组：问了什么、谁问的、哪天问的（派那个角色之前看一眼，顺路带上）
//   node tools/scene.js <项目> show                          打印现场；先一行一个在干的角色、派出去多久，超过 30 分钟没交回的标出来（起了吗）
//   node tools/scene.js <项目> pending                       打印等你定的：界面的小样里还没按定下的屏，一条需求一行（和首页「等你定」同一份）；末尾带一行待处理留言几条
//   node tools/scene.js <项目> notes                         打印他在建模页属性后面留的、还没处理的话：上下文、聚合、成员、属性、原话；有就派建模
const fs = require('node:fs')
const path = require('node:path')
const [dir, cmd, ...rest] = process.argv.slice(2)
if (!dir || !cmd) { console.error('用法见文件头'); process.exit(1) }
const P = path.resolve(dir)
const pad = (n) => String(n).padStart(2, '0')
const d = new Date(), today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, now = `${today} ${pad(d.getHours())}:${pad(d.getMinutes())}`
const scenePath = path.join(P, '现场.json')
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'))
const save = () => fs.writeFileSync(scenePath, JSON.stringify(scene, null, 2) + '\n')
const log = (row) => { const p = path.join(P, '日志', today + '.jsonl'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, JSON.stringify({ ts: now.slice(11), ...row }) + '\n') }
const opt = (name) => { const i = rest.indexOf(name); return i < 0 ? null : rest[i + 1] }

// 问题编号由现场统一发（_qn 是发到几号了），角色自己写的编号不算：几个角色同时交回会撞号
// 问题沿上游一级一级问：to 是上游角色的不挂给他，只记日志，指挥照日志派
// 挂给他的问题要他看得懂：粗查内部字眼，只提醒不拦
const JARGON = [/\b(in|out)\b/g, /小样/g, /伪代码/g, /问题\s*\d+/g, /\b[qa]-\d+\b/g, /[\w.-]+\.(ts|js|json|html)\b/g, /\b[a-z]+(?:-[a-z]+)+\b/g]
const jargon = (text) => [...new Set(JARGON.flatMap((re) => text.match(re) ?? []))]
function addAsks(asks, n) {
  scene._qn ??= 0
  const up = {}
  for (const q of asks) {
    q.id = 'q-' + (++scene._qn); q.role ??= n.role; q.context ??= n.context
    const to = q.to && q.to !== '你' ? q.to : null
    if (to) up[to] = (up[to] ?? 0) + 1
    else {
      scene.waiting.push(q)
      const hit = jargon([q.q, q.why].filter(Boolean).join(' '))
      if (hit.length) console.log(`${q.id} 带内部字眼：${hit.join('、')}，读得懂吗？`)
    }
    log({ kind: '问', role: n.role, context: n.context, task: n.task, stage: n.stage, q: q.id, text: q.q, ...(to ? { to } : {}) })
  }
  for (const [to, k] of Object.entries(up)) console.log(`${k} 条转给 ${to}，等指挥派`)
}
// 代码和伪代码成对：照各上下文 结构.json 的 base（没写就是 上下文/<名>/代码）和 files 的头一段，认出代码目录属于哪个上下文
function missingPseudo(writes) {
  const ctxRoot = path.join(P, '上下文')
  const pieces = writes.flatMap((w) => String(w).split('（')[0].split('、')).map((x) => x.trim()).filter(Boolean)
    .map((x) => path.resolve(P, x).split(path.sep).join('/').replace(/[/]+$/, ''))
  const under = (p, dir) => p === dir || p.startsWith(dir + '/')
  const out = []
  for (const cx of fs.existsSync(ctxRoot) ? fs.readdirSync(ctxRoot) : []) {
    const sp = path.join(ctxRoot, cx, '代码', '结构.json')
    if (!fs.existsSync(sp)) continue
    const st = JSON.parse(fs.readFileSync(sp, 'utf8'))
    const norm = (p) => p.split(path.sep).join('/').replace(/[/]+$/, '')
    const root = norm(st.base ? path.resolve(P, st.base) : path.join(ctxRoot, cx, '代码'))
    const pseudo = norm(path.join(ctxRoot, cx, '代码', '伪代码'))
    const heads = new Set((st.files ?? []).map((f) => f.path.split('/')[0]))
    const code = pieces.filter((p) => under(p, root) && !under(p, pseudo) && !p.endsWith('.json') && (p === root || heads.has(p.slice(root.length + 1).split('/')[0])))
    if (code.length && !pieces.some((p) => under(p, pseudo) || under(pseudo, p))) out.push(`writes 里有${cx}的代码（${[...new Set(code.map((p) => p.slice(root.length + 1).split('/')[0] || p))].join('、')}），没列它对着的 上下文/${cx}/代码/伪代码/`)
  }
  return out
}
// 问上游的问题不进 waiting，开着的从日志算：「问」带 to 的打开，同一编号的「答」「撤问」关上
function upstreamOpen() {
  const dir = path.join(P, '日志'), open = new Map()
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.jsonl')).sort() : []) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
      if (!line.trim()) continue
      const e = JSON.parse(line)
      if (e.kind === '问' && e.to && e.to !== '你') open.set(e.q, { ...e, date: f.slice(0, -6) })
      else if ((e.kind === '答' || e.kind === '撤问') && e.q) open.delete(e.q)
    }
  }
  return [...open.values()]
}
if (cmd === 'dispatch') {
  const brief = JSON.parse(fs.readFileSync(rest[0], 'utf8'))
  // 序号取当天已有最大的加一：数个数会在删过文件、夹着别的文件时撞号
  const seq = fs.existsSync(path.join(P, '派工')) ? fs.readdirSync(path.join(P, '派工')).filter((f) => f.startsWith(today + '-') && /^\d+\.json$/.test(f.slice(today.length + 1))).map((f) => parseInt(f.slice(today.length + 1), 10)) : []
  const n = Math.max(0, ...seq) + 1
  const file = `派工/${today}-${pad(n)}.json`
  // 几个角色可以同时在干：now 是一排；同一个角色在同一个上下文不能派两次，不同上下文可以
  if (!Array.isArray(scene.now)) scene.now = scene.now ? [scene.now] : []
  if (scene.now.some((x) => x.role === brief.role && (x.context ?? null) === (brief.context ?? null))) { console.error(`${brief.role}${brief.context ? '（' + brief.context + '）' : ''} 还在干，先 back 再派`); process.exit(1) }
  for (const w of missingPseudo(brief.writes ?? [])) console.log('提醒：' + w)
  fs.mkdirSync(path.join(P, '派工'), { recursive: true })
  fs.writeFileSync(path.join(P, file), JSON.stringify(brief, null, 2) + '\n')
  scene.now.push({ role: brief.role, context: brief.context ?? null, task: brief.task ?? null, stage: brief.stage ?? null, step: brief.step, since: now, reads: brief.reads ?? [], writes: brief.writes ?? [], stop: brief.stop ?? '' })
  save()
  log({ kind: '派出', role: brief.role, context: brief.context ?? null, task: brief.task ?? null, stage: brief.stage ?? null, text: brief.step, files: brief.writes ?? [] })
  console.log('派出', brief.role, '→', file, scene.now.length > 1 ? `（同时在干：${scene.now.map((x) => x.role).join('、')}）` : '')
  // 现场只记了「在干」，角色要指挥另外起；记了不起，现场显示在干、其实没人
  console.log(`现在就起${brief.role}，提示词给派工书的路径：${path.join(P, file).split(path.sep).join('/')}`)
} else if (cmd === 'back') {
  // 几个人在干时要说是谁交回：--role <角色>；只有一个人时可以省
  if (!Array.isArray(scene.now)) scene.now = scene.now ? [scene.now] : []
  if (!scene.now.length) { console.error('现场没人在干'); process.exit(1) }
  const who = opt('--role')
  if (!who && scene.now.length > 1) { console.error(`几个人在干（${scene.now.map((x) => x.role).join('、')}），要 --role 说是谁交回`); process.exit(1) }
  // 同一个角色在几个上下文都在干时，再要 --context
  const ctx = opt('--context')
  const mine = who ? scene.now.filter((x) => x.role === who && (!ctx || x.context === ctx)) : [scene.now[0]]
  if (mine.length > 1) { console.error(`${who} 在几个上下文都在干（${mine.map((x) => x.context).join('、')}），要 --context 说是哪个`); process.exit(1) }
  const n = mine[0]
  if (!n) { console.error(`${who}${ctx ? '（' + ctx + '）' : ''} 没在干`); process.exit(1) }
  const files = opt('--files') ? opt('--files').split(',') : undefined
  const answers = opt('--answers') ? opt('--answers').split(',').filter(Boolean) : []
  const openUp = answers.length ? upstreamOpen() : []
  const notOpen = answers.filter((id) => !openUp.some((q) => q.q === id))
  if (notOpen.length) { console.error('不在还开着的问上游的问题里：' + notOpen.join('、') + '（upstream 看全）'); process.exit(1) }
  log({ kind: '交回', role: n.role, context: n.context, task: n.task, stage: n.stage, text: rest[0], ...(files ? { files } : {}) })
  for (const id of answers) { const q = openUp.find((x) => x.q === id); log({ kind: '答', role: n.role, context: n.context, task: n.task, stage: n.stage, q: id, text: '答了' + q.role + '问的：' + q.text }) }
  if (opt('--asks')) {
    addAsks(JSON.parse(fs.readFileSync(opt('--asks'), 'utf8')), n)
  }
  scene.now = scene.now.filter((x) => x !== n)
  save()
  console.log('交回', n.role, scene.waiting.length ? `· ${scene.waiting.length} 个等你答` : '', scene.now.length ? `· 还在干：${scene.now.map((x) => x.role).join('、')}` : '')
} else if (cmd === 'ask') {
  if (!opt('--role')) { console.error('要 --role 说是谁问的'); process.exit(1) }
  const asks = JSON.parse(fs.readFileSync(rest[0], 'utf8'))
  addAsks(asks, { role: opt('--role'), context: opt('--context') ?? null })
  save()
  const mine = asks.filter((q) => !q.to || q.to === '你').length
  if (mine) console.log('挂上', mine, '个问题', `· ${scene.waiting.length} 个等你答`)
} else if (cmd === 'drop') {
  const ids = (rest[0] ?? '').split(',').filter(Boolean), why = rest[1] ?? ''
  const openUp = upstreamOpen().map((q) => ({ ...q, id: q.q }))
  const miss = ids.filter((id) => !scene.waiting.some((q) => q.id === id) && !openUp.some((q) => q.id === id))
  if (!ids.length || miss.length) { console.error('不在等你答里，也不在还开着的问上游的问题里：' + (miss.join('、') || '（没给编号）')); process.exit(1) }
  for (const id of ids) { const q = scene.waiting.find((x) => x.id === id) ?? openUp.find((x) => x.id === id); log({ kind: '撤问', role: q.role, context: q.context, q: id, text: why }) }
  scene.waiting = scene.waiting.filter((q) => !ids.includes(q.id))
  save()
  console.log('撤下', ids.length, '个', `· ${scene.waiting.length} 个等你答`)
} else if (cmd === 'pending') {
  const items = require('../lib/project.js').pendingDecisions(P)
  if (!items.length) console.log('没有等你定的')
  for (const pg of [...new Set(items.map((x) => x.page))]) {
    console.log(`「${pg}」页`)
    for (const x of items.filter((y) => y.page === pg)) console.log(`  ${x.title}${x.ref ? '  ' + x.ref : ''}${x.note ? '  · ' + x.note : ''}  → #${x.hash}`)
  }
  const notes = require('../lib/project.js').pendingNotes(P)
  if (notes.length) console.log(`待处理留言 ${notes.length} 条（notes 看全）`)
} else if (cmd === 'notes') {
  const notes = require('../lib/project.js').pendingNotes(P)
  if (!notes.length) console.log('没有待处理的留言')
  for (const cx of [...new Set(notes.map((x) => x.context))]) {
    console.log(`「${cx}」`)
    for (const x of notes.filter((y) => y.context === cx)) console.log(`  ${x.id}  ${x.agg} · ${x.member} · ${x.field}：${x.text}  （${x.at ?? ''}）`)
  }
} else if (cmd === 'answered') {
  const ids = (rest[0] ?? '').split(',').filter(Boolean), who = opt('--role'), why = rest.find((x, i) => i > 0 && !x.startsWith('--') && rest[i - 1] !== '--role') ?? ''
  if (!ids.length || !who) { console.error('要编号和 --role'); process.exit(1) }
  const openUp = upstreamOpen(), notOpen = ids.filter((id) => !openUp.some((q) => q.q === id))
  if (notOpen.length) { console.error('不在还开着的问上游的问题里：' + notOpen.join('、')); process.exit(1) }
  for (const id of ids) { const q = openUp.find((x) => x.q === id); log({ kind: '答', role: who, context: q.context, q: id, text: '答了' + q.role + '问的：' + q.text + (why ? '（' + why + '）' : '') }) }
  console.log('记了', ids.length, '条答', `· 还开着 ${openUp.length - ids.length} 条`)
} else if (cmd === 'done') {
  const id = rest[0], why = rest[1] ?? ''
  if (!id) { console.error('要说哪个任务：done <任务> "<一句话>"'); process.exit(1) }
  const readOr = (rel, dflt) => { const p = path.join(P, rel); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : dflt }
  const known = new Set([...(readOr('项目管理/需求.json', { items: [] }).items ?? []).map((r) => r.id), ...(readOr('项目管理/日程.json', { milestones: [] }).milestones ?? []).flatMap((m) => (m.items ?? []).flatMap((it) => [it.id, ...(it.tasks ?? []).map((t) => t.id)]))])
  if (!known.has(id)) { console.error('需求清单和日程里都没有这个任务：' + id); process.exit(1) }
  const logDir = path.join(P, '日志')
  const was = (fs.existsSync(logDir) ? fs.readdirSync(logDir).filter((x) => x.endsWith('.jsonl')).sort() : []).find((f) => fs.readFileSync(path.join(logDir, f), 'utf8').split(/\r?\n/).some((l) => l.trim() && ((e) => e.kind === '做完' && e.task === id)(JSON.parse(l))))
  if (was) { console.error(id + ' 已经记过做完了（' + was.slice(0, -6) + '）'); process.exit(1) }
  log({ kind: '做完', role: '指挥', context: null, task: id, text: why })
  console.log('做完', id)
} else if (cmd === 'upstream') {
  const qs = upstreamOpen()
  if (!qs.length) console.log('没有开着的问上游的问题')
  for (const to of [...new Set(qs.map((q) => q.to))]) {
    console.log(`问${to}`)
    for (const q of qs.filter((x) => x.to === to)) console.log(`  ${q.q}  ${q.role}问（${q.date}）：${q.text}`)
  }
} else if (cmd === 'show') {
  const LONG = 30
  for (const x of Array.isArray(scene.now) ? scene.now : []) {
    const min = Math.round((d - new Date(String(x.since).replace(' ', 'T'))) / 60000)
    console.log(`${x.role}${x.context ? '（' + x.context + '）' : ''} 在干，派出 ${Number.isNaN(min) ? '？' : min} 分钟${min > LONG ? '  ⚠ 很久了，角色起了吗？' : ''}  · ${x.step}`)
  }
  console.log(JSON.stringify(scene, null, 2))
} else { console.error('没有这个命令：' + cmd); process.exit(1) }
