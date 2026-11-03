// 指挥记现场、写派工书、追加日志：每个动作之前写，做完清掉。
//   node tools/scene.js <项目> dispatch <派工书.json>        现场.now 加一项（几个角色可以同时在干）；派工/<日期>-<序号>.json 存一份；日志记「派出」
//   node tools/scene.js <项目> back "<一句话>" [--role <角色>] [--files a,b] [--decide <页> <hash> "<一句话>"] [--asks <问题.json>]
//                                                           那个角色从 现场.now 里去掉（几个人在干时要 --role）；有 decide 就写 decide；asks 并进 waiting；日志记「交回」和每个「问」
//                                                           问题带 to（建模 | 业务）的是问上游角色，不进 waiting，只记日志，等指挥派；没写 to 或 to 是「你」才挂给他
//                                                           挂给他的问题 q、why 里带内部字眼（in/out、小样、伪代码、问题号、文件名、英文代号）就印一行提醒，不拦
//   node tools/scene.js <项目> ask <问题.json> --role <角色> [--context <上下文>]
//                                                           不交回也能挂问题（比如角色交回后才发现页面上答不了）：并进 waiting、日志记「问」
//   node tools/scene.js <项目> drop <q-1,q-2…> "<为什么>"     从 waiting 撤下没答的问题（比如改挂到流程上了）；日志每条记「撤问」
//   node tools/scene.js <项目> show                          打印现场
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
if (cmd === 'dispatch') {
  const brief = JSON.parse(fs.readFileSync(rest[0], 'utf8'))
  const n = fs.existsSync(path.join(P, '派工')) ? fs.readdirSync(path.join(P, '派工')).filter((f) => f.startsWith(today)).length + 1 : 1
  const file = `派工/${today}-${pad(n)}.json`
  fs.mkdirSync(path.join(P, '派工'), { recursive: true })
  fs.writeFileSync(path.join(P, file), JSON.stringify(brief, null, 2) + '\n')
  // 几个角色可以同时在干：now 是一排，一个角色一项；同一个角色不能派两次
  if (!Array.isArray(scene.now)) scene.now = scene.now ? [scene.now] : []
  if (scene.now.some((x) => x.role === brief.role)) { console.error(`${brief.role} 还在干，先 back 再派`); process.exit(1) }
  scene.now.push({ role: brief.role, context: brief.context ?? null, task: brief.task ?? null, stage: brief.stage ?? null, step: brief.step, since: now, reads: brief.reads ?? [], writes: brief.writes ?? [], stop: brief.stop ?? '' })
  save()
  log({ kind: '派出', role: brief.role, context: brief.context ?? null, task: brief.task ?? null, stage: brief.stage ?? null, text: brief.step, files: brief.writes ?? [] })
  console.log('派出', brief.role, '→', file, scene.now.length > 1 ? `（同时在干：${scene.now.map((x) => x.role).join('、')}）` : '')
} else if (cmd === 'back') {
  // 几个人在干时要说是谁交回：--role <角色>；只有一个人时可以省
  if (!Array.isArray(scene.now)) scene.now = scene.now ? [scene.now] : []
  if (!scene.now.length) { console.error('现场没人在干'); process.exit(1) }
  const who = opt('--role')
  if (!who && scene.now.length > 1) { console.error(`几个人在干（${scene.now.map((x) => x.role).join('、')}），要 --role 说是谁交回`); process.exit(1) }
  const n = who ? scene.now.find((x) => x.role === who) : scene.now[0]
  if (!n) { console.error(`${who} 没在干`); process.exit(1) }
  const files = opt('--files') ? opt('--files').split(',') : undefined
  log({ kind: '交回', role: n.role, context: n.context, task: n.task, stage: n.stage, text: rest[0], ...(files ? { files } : {}) })
  const i = rest.indexOf('--decide')
  if (i >= 0) { scene.decide = { role: n.role, context: n.context, task: n.task, stage: n.stage, page: rest[i + 1], hash: rest[i + 2], text: rest[i + 3] } }
  if (opt('--asks')) {
    addAsks(JSON.parse(fs.readFileSync(opt('--asks'), 'utf8')), n)
  }
  scene.now = scene.now.filter((x) => x !== n)
  save()
  console.log('交回', n.role, scene.decide ? '→ 等你定下' : '', scene.waiting.length ? `· ${scene.waiting.length} 个等你答` : '', scene.now.length ? `· 还在干：${scene.now.map((x) => x.role).join('、')}` : '')
} else if (cmd === 'ask') {
  if (!opt('--role')) { console.error('要 --role 说是谁问的'); process.exit(1) }
  const asks = JSON.parse(fs.readFileSync(rest[0], 'utf8'))
  addAsks(asks, { role: opt('--role'), context: opt('--context') ?? null })
  save()
  const mine = asks.filter((q) => !q.to || q.to === '你').length
  if (mine) console.log('挂上', mine, '个问题', `· ${scene.waiting.length} 个等你答`)
} else if (cmd === 'drop') {
  const ids = (rest[0] ?? '').split(',').filter(Boolean), why = rest[1] ?? ''
  const miss = ids.filter((id) => !scene.waiting.some((q) => q.id === id))
  if (!ids.length || miss.length) { console.error('不在等你答里：' + (miss.join('、') || '（没给编号）')); process.exit(1) }
  for (const id of ids) { const q = scene.waiting.find((x) => x.id === id); log({ kind: '撤问', role: q.role, context: q.context, q: id, text: why }) }
  scene.waiting = scene.waiting.filter((q) => !ids.includes(q.id))
  save()
  console.log('撤下', ids.length, '个', `· ${scene.waiting.length} 个等你答`)
} else if (cmd === 'show') {
  console.log(JSON.stringify(scene, null, 2))
} else { console.error('没有这个命令：' + cmd); process.exit(1) }
