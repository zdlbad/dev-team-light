// 查工作区里角色交出的文件有没有硬伤：读不出的 JSON、指不到的引用、缺的文件。只看形状和引用，不看内容写得对不对。
// 用法：node tools/check.js <工作区> [<上下文名>]
//   角色交回之前自己跑一遍；指挥收活时再跑一遍，有「错」就退回给写那份文件的角色。
//   「错」是页面会画坏、下游会照着错的；「提醒」是不一定错、看一眼的。有「错」退出码 1。
// 查什么：
//   全部    每份 .json 读不读得出（原料/、_wip/ 不看）
//   业务    一份流程里步号、规则号、问题号有没有重复；分了子主题的主题：子主题号重不重复、撞不撞主题号，每个子主题有没有概念文件，子主题之间的线两头在不在，子文件夹里有没有图上没有的文件
//   界面    屏号、问题号有没有重复；每一屏的小样文件在不在；does 的 to 指不指得到屏；flow 那份流程在不在、step 那一步在不在；
//           小样里 data-ask 标的问题在不在这一屏的 asks 里；文件夹里有没有哪一屏都不用的小样文件（提醒）
//   模型    清单项的号有没有重复；清单项调的聚合、行为在不在；流程索引引的清单项在不在本主题清单里、对着的流程和步在不在；
//           聚合的成员、行为上挂的问题：号在一份聚合里重不重复、有没有写问的是什么（伪代码的块上挂的问题也这样查）
//           全图的线两头是不是聚合；聚合里 links 的两头是不是成员
//   代码    结构.json 里路径有没有重复；每个文件指回的聚合、成员、行为、清单项、屏在不在；除了测试，每个文件有没有伪代码
const fs = require('node:fs')
const path = require('node:path')

const [dirArg, onlyCx] = process.argv.slice(2)
if (!dirArg || !fs.existsSync(path.join(dirArg, '项目.json'))) { console.error('用法：node tools/check.js <工作区> [<上下文名>]（工作区是放着 项目.json 的目录）'); process.exit(1) }
const P = path.resolve(dirArg)
const rel = (p) => path.relative(P, p).split(path.sep).join('/')
const exists = (p) => fs.existsSync(p)
const found = []   // { level: 错 | 提醒, cx, part, file, text }
const say = (level, cx, part, file, text) => found.push({ level, cx, part, file: rel(file), text })

// —— 全部：每份 JSON 读得出 ——
const cache = new Map()
function load(p, cx = '项目', part = '全部') {
  if (cache.has(p)) return cache.get(p)
  let data = null
  try { data = JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { say('错', cx, part, p, 'JSON 读不出：' + String(e.message).split('\n')[0]) }
  cache.set(p, data)
  return data
}
const SKIP = new Set(['原料', '_wip', 'node_modules', '.git'])
function walkJson(dir, cx, part) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (d.isDirectory()) { if (!SKIP.has(d.name)) walkJson(path.join(dir, d.name), cx, part) }
    else if (d.name.endsWith('.json')) load(path.join(dir, d.name), cx, part)
  }
}
const jsonIn = (dir) => (exists(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ name: f.slice(0, -5), file: path.join(dir, f) })) : [])
const dirsIn = (dir) => (exists(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort() : [])
const dups = (xs) => [...new Set(xs.filter((x, i) => x != null && xs.indexOf(x) !== i))]
// 一份聚合、一份伪代码上挂的问题：号不重复，每条写了问的是什么，options 是一串
function askCheck(asks, cx, part, file) {
  for (const x of dups(asks.map((a) => a.id))) say('错', cx, part, file, `问题号重复：${x}`)
  for (const a of asks) {
    if (!a.id) say('错', cx, part, file, `有一条问题没写号（id）：${String(a.q ?? '').slice(0, 20)}`)
    if (!String(a.q ?? '').trim()) say('错', cx, part, file, `问题 ${a.id ?? '?'} 没写问的是什么（q）`)
    if (a.options != null && !Array.isArray(a.options)) say('错', cx, part, file, `问题 ${a.id ?? '?'} 的 options 要写成一串`)
  }
}

const project = load(path.join(P, '项目.json'))
const names = (project?.contexts ?? []).map((c) => c.name)
if (onlyCx && !names.includes(onlyCx)) { console.error(`项目.json 里没有上下文「${onlyCx}」：有 ${names.join('、')}`); process.exit(1) }
const cxDir = (cx) => path.join(P, '上下文', cx)

// 读成索引：每个上下文的流程、屏、聚合、清单项（代码那一头会指到别的上下文，所以先全读）
const IDX = {}
for (const cx of names) {
  const c = cxDir(cx), ix = (IDX[cx] = { flows: {}, screens: new Set(), aggs: [], items: new Set() })
  for (const { name, file } of jsonIn(path.join(c, '业务', '流程'))) { const d = load(file, cx, '业务'); if (d) ix.flows[d.file ?? name] = { file, data: d } }
  for (const { name, file } of jsonIn(path.join(c, '界面'))) { const d = load(file, cx, '界面'); for (const v of d?.views ?? []) for (const sc of v.screens ?? []) ix.screens.add((d.req ?? name) + '/' + sc.id) }
  for (const topic of dirsIn(path.join(c, '模型'))) {
    for (const { file } of jsonIn(path.join(c, '模型', topic, '聚合'))) { const d = load(file, cx, '模型'); if (d) ix.aggs.push({ file, data: d }) }
    const lp = path.join(c, '模型', topic, '调动', '清单.json')
    if (exists(lp)) for (const it of load(lp, cx, '模型')?.items ?? []) ix.items.add(it.id)
  }
}
const aggOf = (cx, key) => IDX[cx]?.aggs.find((a) => a.data.id === key || a.data.title === key)?.data
const memberOf = (agg, key) => (agg.members ?? []).find((m) => m.id === key || m.name === key)
const behaviorsOf = (agg, member) => (member ? [member] : agg.members ?? []).flatMap((m) => (m.behaviors ?? []).map((b) => b.name))
const stepIn = (cx, flow, step) => (IDX[cx]?.flows[flow]?.data.steps ?? []).some((s) => String(s.id) === String(step))
// 流程索引对着的流程可以是别的上下文的：写成「<上下文名> <流程名>」（中间一个空格）。回 { cx, flow }，找不到回 null
function flowAt(cx, name) {
  if (IDX[cx].flows[name]) return { cx, flow: name }
  const other = names.find((n) => n !== cx && name.startsWith(n + ' ') && IDX[n].flows[name.slice(n.length + 1)])
  return other ? { cx: other, flow: name.slice(other.length + 1) } : null
}

for (const cx of names) {
  if (onlyCx && cx !== onlyCx) continue
  const c = cxDir(cx)
  if (!exists(c)) continue
  walkJson(c, cx, '全部')

  // —— 业务 ——
  for (const { file, data } of Object.values(IDX[cx].flows)) {
    const steps = data.steps ?? []
    for (const x of dups(steps.map((s) => String(s.id)))) say('错', cx, '业务', file, `步号重复：${x}`)
    for (const x of dups(steps.flatMap((s) => (s.rules ?? []).map((r) => r.id)))) say('错', cx, '业务', file, `规则号重复：${x}`)
    for (const x of dups(steps.flatMap((s) => (s.asks ?? []).map((a) => a.id)))) say('错', cx, '业务', file, `问题号重复：${x}`)
  }

  // 子主题：主题那份概念文件里有 subs 的，每个子主题一份 概念/<主题>/<子主题>.json
  const cdir = path.join(c, '业务', '概念'), gp = path.join(c, '业务', '全局图.json')
  const topicIds = (exists(gp) ? load(gp, cx, '业务')?.topics ?? [] : []).map((t) => t.id)
  const allSubs = []
  for (const { name, file } of jsonIn(cdir)) {
    const d = load(file, cx, '业务'); if (!d) continue
    const folder = path.join(cdir, name)
    if (!Array.isArray(d.subs)) {
      if (exists(folder)) say('错', cx, '业务', file, `概念/${name}/ 下有子主题的文件，这一份却没写 subs：要么写上子主题图，要么把子文件夹拿掉`)
      continue
    }
    const ids = d.subs.map((x) => x.id)
    for (const x of d.subs) if (!x.id) say('错', cx, '业务', file, `有一个子主题没写号（id）：${x.title ?? ''}`)
    for (const x of dups(ids)) say('错', cx, '业务', file, `子主题号重复：${x}`)
    for (const x of ids.filter((i) => i && topicIds.includes(i))) say('错', cx, '业务', file, `子主题号 ${x} 跟全局图上的主题号撞了`)
    for (const e of d.edges ?? []) for (const end of [e.from, e.to]) if (!ids.includes(end)) say('错', cx, '业务', file, `子主题之间的线 ${e.from} → ${e.to}：${end} 不是这个主题的子主题`)
    for (const x of d.subs) if (x.id && !exists(path.join(folder, x.id + '.json'))) say('错', cx, '业务', file, `子主题 ${x.id}（${x.title ?? ''}）没有自己的概念文件：概念/${name}/${x.id}.json`)
    for (const { name: f, file: sf } of jsonIn(folder)) {
      if (!ids.includes(f)) { say('错', cx, '业务', sf, `子主题图上没有 ${f}：在 ${name}.json 的 subs 里加上，或者把这份拿掉`); continue }
      const sd = load(sf, cx, '业务'); if (!sd) continue
      if (sd.topic !== name) say('错', cx, '业务', sf, `topic 要写主题号 ${name}，写的是 ${sd.topic}`)
      if (sd.sub !== f) say('错', cx, '业务', sf, `sub 要写子主题号 ${f}，写的是 ${sd.sub}`)
    }
    allSubs.push(...[...new Set(ids.filter(Boolean))].map((i) => ({ id: i, file })))
  }
  for (const x of dups(allSubs.map((a) => a.id))) say('错', cx, '业务', allSubs.find((a) => a.id === x).file, `子主题号 ${x} 在几个主题里都用了`)

  // —— 界面 ——
  for (const { name, file } of jsonIn(path.join(c, '界面'))) {
    const d = load(file, cx, '界面'); if (!d) continue
    const req = d.req ?? name, folder = path.join(c, '界面', req)
    const screens = (d.views ?? []).flatMap((v) => v.screens ?? []), ids = screens.map((s) => s.id)
    for (const x of dups(ids)) say('错', cx, '界面', file, `屏号重复：${x}`)
    for (const x of dups(screens.flatMap((s) => (s.asks ?? []).map((a) => a.id)))) say('错', cx, '界面', file, `问题号重复：${x}`)
    const flows = d.flow == null ? [] : [].concat(d.flow), multi = Array.isArray(d.flow)
    for (const f of flows) if (!IDX[cx].flows[f]) say('错', cx, '界面', file, `flow 写的流程「${f}」在 业务/流程/ 下没有`)
    const used = new Set()
    for (const sc of screens) {
      const html = path.join(folder, sc.file ?? sc.id + '.html')
      used.add(path.basename(html))
      if (!exists(html)) say('错', cx, '界面', file, `屏 ${sc.id} 的小样文件不在：${rel(html)}`)
      for (const dd of sc.does ?? []) if (dd.to !== '完' && !ids.includes(dd.to)) say('错', cx, '界面', file, `屏 ${sc.id} 的「${dd.act}」指到的屏 ${dd.to} 这一份里没有`)
      if (sc.step != null) {
        let f = multi ? null : flows[0], no = String(sc.step)
        if (multi) { const k = no.lastIndexOf('/'); if (k > 0) { f = no.slice(0, k); no = no.slice(k + 1) } else say('错', cx, '界面', file, `屏 ${sc.id} 的 step「${sc.step}」：flow 是几段流程时要写成「流程名/步号」`) }
        else if (no.includes('/')) { say('错', cx, '界面', file, `屏 ${sc.id} 的 step「${sc.step}」：flow 只有一段流程时 step 只写步号，不带流程名（带了，页面上这一屏就标不出对着哪一步）`); continue }
        if (!flows.length) say('错', cx, '界面', file, `屏 ${sc.id} 写了 step，这一份却没写 flow`)
        else if (f && !flows.includes(f)) say('错', cx, '界面', file, `屏 ${sc.id} 的 step 指的流程「${f}」不在这一份的 flow 里`)
        else if (f && IDX[cx].flows[f] && !stepIn(cx, f, no)) say('错', cx, '界面', file, `屏 ${sc.id} 对着的流程「${f}」里没有第 ${no} 步`)
      }
      if (exists(html)) {
        const marked = [...fs.readFileSync(html, 'utf8').matchAll(/data-ask="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean))
        const asks = (sc.asks ?? []).map((a) => a.id)
        for (const x of new Set(marked)) if (!asks.includes(x)) say('错', cx, '界面', html, `小样里标着 data-ask="${x}"，这一屏的 asks 里没有这条问题`)
      }
    }
    if (exists(folder)) for (const f of fs.readdirSync(folder)) if (f.endsWith('.html') && !used.has(f)) say('提醒', cx, '界面', path.join(folder, f), '哪一屏都没用到这份小样文件')
  }

  // —— 模型 ——
  const allItems = []
  for (const { file, data } of IDX[cx].aggs) {
    const mids = (data.members ?? []).map((m) => m.id)
    for (const x of dups(mids)) say('错', cx, '模型', file, `成员号重复：${x}`)
    for (const l of data.links ?? []) for (const end of [l.from, l.to]) if (!mids.includes(end)) say('错', cx, '模型', file, `links 里的 ${end} 不是这个聚合的成员`)
    // 聚合上的问题挂在成员上，或者成员的一个行为上；问题号在一份聚合里不重复
    askCheck((data.members ?? []).flatMap((m) => [...(m.asks ?? []), ...(m.behaviors ?? []).flatMap((b) => b.asks ?? [])]), cx, '模型', file)
  }
  const whole = path.join(c, '模型', '全图.json')
  if (exists(whole)) for (const e of load(whole, cx, '模型')?.edges ?? []) for (const end of [e.from, e.to]) if (!aggOf(cx, end)) say('错', cx, '模型', whole, `全图的线连着的「${end}」不是这个上下文的聚合`)
  for (const topic of dirsIn(path.join(c, '模型'))) {
    const mv = path.join(c, '模型', topic, '调动'), lp = path.join(mv, '清单.json')
    const items = exists(lp) ? load(lp, cx, '模型')?.items ?? [] : []
    for (const it of items) {
      allItems.push({ id: it.id, file: lp })
      const a = it.call?.aggregate
      if (!a) { say('错', cx, '模型', lp, `清单项 ${it.id}「${it.name}」没写 call 调哪个聚合`); continue }
      const agg = aggOf(cx, a)
      if (!agg) { say('错', cx, '模型', lp, `清单项 ${it.id}「${it.name}」调的聚合「${a}」这个上下文里没有`); continue }
      const b = it.call.behavior
      if (b && b !== '新建' && !behaviorsOf(agg).includes(b)) say('错', cx, '模型', lp, `清单项 ${it.id}「${it.name}」调的行为「${b}」在聚合「${agg.title}」里没有`)
      if (!b && !it.call.read) say('错', cx, '模型', lp, `清单项 ${it.id}「${it.name}」的 call 既没写 behavior 也没写 read`)
    }
    const ids = items.map((i) => i.id)
    for (const { name, file } of jsonIn(mv)) {
      if (name === '清单') continue
      const d = load(file, cx, '模型'); if (!d) continue
      for (const [i, r] of (d.rows ?? []).entries()) {
        if (!ids.includes(r.ref)) say('错', cx, '模型', file, `第 ${i + 1} 行引的清单项「${r.ref}」不在本主题的清单里`)
        if (r.trace?.flow) {
          const at = flowAt(cx, r.trace.flow)
          if (!at) say('错', cx, '模型', file, `第 ${i + 1} 行对着的流程「${r.trace.flow}」在 业务/流程/ 下没有（别的上下文的流程写成「上下文名 流程名」）`)
          else if (r.trace.step != null && !stepIn(at.cx, at.flow, r.trace.step)) say('错', cx, '模型', file, `第 ${i + 1} 行对着的流程「${r.trace.flow}」里没有第 ${r.trace.step} 步`)
        }
      }
    }
  }
  for (const x of dups(allItems.map((i) => i.id))) say('错', cx, '模型', allItems.find((i) => i.id === x).file, `清单项的号在这个上下文里重复：${x}`)

  // —— 代码 ——
  const sp = path.join(c, '代码', '结构.json')
  if (exists(sp)) {
    const st = load(sp, cx, '代码')
    const files = st?.files ?? []
    for (const x of dups(files.map((f) => f.path))) say('错', cx, '代码', sp, `路径重复：${x}`)
    const anyScreen = (s) => names.some((n) => IDX[n].screens.has(s))
    for (const f of files) {
      const m = f.model ?? {}, mcx = m.context ?? cx
      if (m.context && !IDX[mcx]) { say('错', cx, '代码', sp, `${f.path}：model.context「${mcx}」不是项目里的上下文`); continue }
      if (m.aggregate) {
        const agg = aggOf(mcx, m.aggregate)
        if (!agg) say('错', cx, '代码', sp, `${f.path}：指回的聚合「${m.aggregate}」在${mcx}的模型里没有`)
        else {
          const mem = m.member ? memberOf(agg, m.member) : null
          if (m.member && !mem) say('错', cx, '代码', sp, `${f.path}：聚合「${agg.title}」里没有成员「${m.member}」`)
          const have = behaviorsOf(agg, mem)
          for (const b of m.behaviors ?? []) if (!have.includes(b)) say('错', cx, '代码', sp, `${f.path}：${mem ? '成员「' + mem.name + '」' : '聚合「' + agg.title + '」'}里没有行为「${b}」`)
        }
      }
      if (m.item && !IDX[mcx].items.has(m.item)) say('错', cx, '代码', sp, `${f.path}：指回的清单项「${m.item}」在${mcx}的清单里没有`)
      // 一个页面文件对着几屏时，screen 用顿号连着写
      for (const s of f.screen ? String(f.screen).split('、').map((x) => x.trim()).filter(Boolean) : []) if (!anyScreen(s)) say('错', cx, '代码', sp, `${f.path}：对着的屏「${s}」在界面里没有`)
      const pp = path.join(c, '代码', '伪代码', f.path + '.json')
      if (f.kind !== '测试' && !exists(pp)) say('错', cx, '代码', sp, `${f.path}：没有伪代码（代码/伪代码/${f.path}.json）`)
      // 伪代码上的问题挂在块上；问题号在一份伪代码里不重复
      if (exists(pp)) askCheck((load(pp, cx, '代码')?.blocks ?? []).flatMap((b) => b.asks ?? []), cx, '代码', pp)
    }
  }
}
// 项目根下的几份
for (const f of ['上下文图.json', '现场.json', path.join('项目管理', '需求.json'), path.join('项目管理', '日程.json'), path.join('代码', '规范', '全局结构.json'), path.join('共享内核', '业务', '概念.json')]) if (exists(path.join(P, f))) load(path.join(P, f))

// —— 印出来：一个上下文一段，里面按业务、界面、模型、代码排，同一份文件的摆在一起 ——
const errs = found.filter((x) => x.level === '错'), notes = found.filter((x) => x.level === '提醒')
for (const cx of [...new Set(found.map((x) => x.cx))]) {
  console.log(`「${cx}」`)
  for (const part of ['全部', '业务', '界面', '模型', '代码']) {
    const rows = found.filter((x) => x.cx === cx && x.part === part)
    for (const file of [...new Set(rows.map((x) => x.file))]) {
      console.log(`  ${part === '全部' ? '' : part + ' · '}${file}`)
      for (const x of rows.filter((y) => y.file === file)) console.log(`    ${x.level}：${x.text}`)
    }
  }
}
console.log(found.length ? `${errs.length} 处错，${notes.length} 处提醒` : '没查出毛病')
process.exit(errs.length ? 1 : 0)
