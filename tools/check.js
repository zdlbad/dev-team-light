// 查工作区里角色交出的文件有没有硬伤：读不出的 JSON、指不到的引用、缺的文件。只看形状和引用，不看内容写得对不对。
// 用法：node tools/check.js <工作区> [<上下文名>]
//   角色交回之前自己跑一遍；指挥收活时再跑一遍，有「错」就退回给写那份文件的角色。
//   「错」是页面会画坏、下游会照着错的；「提醒」是不一定错、看一眼的。有「错」退出码 1。
// 查什么：
//   全部    每份 .json 读不读得出（原料/、_wip/ 不看）
//   业务    一份流程里步号、规则号、问题号有没有重复；分了子主题的主题：子主题号重不重复、撞不撞主题号，每个子主题有没有概念文件，子主题之间的线两头在不在，子文件夹里有没有图上没有的文件
//           流程：topic 是不是全局图上的主题（没写是提醒）；入口、出口接的步在不在，写了 flow 的那一份在不在、那一份有没有写回来对上；alt 的步写没写 case
//           概念图：同样两样数据之间有几条线（提醒，并成一条）；概念的 fields 是不是一列栏，每一项是栏名或者带 title 的对象（不是是错）；栏名带不带括号（带是提醒）
//           全局图：写没写整个上下文的背景（提醒）
//           业务目的：每个主题写没写、对着背景哪一句、有没有出处或待定（都是提醒）；更细的目的落到的核心数据、别的数据、功能、响应在不在（不在是错）；
//           每条写没写更细的目的（aim）、每样核心数据有没有目的落到它上面、每项功能和每条响应有没有挂到哪条目的上、更细的目的有没有出处或待定（都是提醒）
//           目的的固定的号（业务目的的 id 写「p-1」，更细的目的的 id 写「p-1.1」）：只要有一条目的写了号就查。号有没有重复（业务目的之间、更细的目的之间、这两种之间）、是不是有的写了有的没写（都是错）；
//           更细的目的的号点前面是不是它所在的业务目的的号、号是不是「p-数字」「p-数字.数字」的样子（都是提醒，各并成一条）
//           模块业务：主题号对不对；功能号、响应号、状态转换流程号、待定号有没有重复；每项功能写没写业务数据（subject 带 to）和操作意图（intent）；
//           功能指着的流程步在不在；状态转换流程的线两头是不是它的状态，分了段的（stages）每个状态是不是正好在一段里（不是是错）；要用到的数据写没写名字（没写是错）、写没写解释或例子（提醒）；
//           主要流程速览（tours）里用到的功能在不在（不在是错）；
//           拆过的主题（模块文件写了顶层 rules）才查这些，不对的是错：规则号、行为号（core[].actions，整个主题里）、服务号（services）有没有重复；规则的 kind 是不是那四种；
//           核心数据的 keeps 和行为、响应、服务、功能的 rules 里挂着的规则号在不在（功能的 rules 里不是「r-数字」样子的旧话不查），每条规则有没有挂在这五处的哪一处；
//           功能、响应的 calls 和响应的 callsWhen 里的行为号在不在；功能的 services 里的服务号在不在；功能的步骤里接着办的功能（steps[].fn）在不在；状态转换流程的线（moves[].act）指着的行为在不在；
//           规则、行为、服务、概念的栏写的 for 指着的目的在不在：目的写了固定的号的，for 照号找；一条都没写号的，for 照先后数（「1.2」是第 1 条业务目的下面的第 2 条更细的目的，只写「1」的指着第 1 条业务目的），
//           这时主题里有东西写了 for 就提醒给目的写上固定的号（一个主题一条）；
//           拆过的主题里提醒的有：规则没有例子也没有 items；规则的出处写在 from 里而没写 source（出处写在 source 里，和别处一样）；行为没有哪项功能或响应叫它；功能、行为、服务的 steps[].on 对不上它自己 edits 冒号前面的名字、也对不上它自己 out 的 title 冒号前面的名字
//           提醒的还有：核心数据的 parts 和概念图上的上下层线对不对得上；概念图上的概念在业务文件里出没出现；状态转换流程的名字对不对得上一个概念；用到的资料写没写说明；
//           去到别的主题的数据写没写功能号；功能的业务数据名字里是不是认得出不止一个概念名；没写 calls 的功能列没列动了业务数据的哪几项（subject.edits）；功能的出处和别的主题的功能是不是同一个代码文件
//           业务概述（intro）写没写、缺哪几样、使用角色写没写按先后做的事（都是提醒）
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
  const gmap = exists(gp) ? load(gp, cx, '业务') : null, topicList = gmap?.topics ?? []
  if (topicList.length && !String(gmap.background ?? '').trim()) say('提醒', cx, '业务', gp, '全局图没写背景（background）：用一两句话写整个上下文所处的情形')
  const topicIds = topicList.map((t) => t.id), topicTitles = topicList.map((t) => t.title)
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

  // 概念图：同样两样数据之间只画一条线；业务容易从两头各记一遍同一件事
  const conceptJson = [...jsonIn(cdir), ...dirsIn(cdir).flatMap((t) => jsonIn(path.join(cdir, t)))]
  for (const { file } of conceptJson) {
    const d = load(file, cx, '业务'); if (!d || Array.isArray(d.subs)) continue
    const pairs = (d.edges ?? []).map((e) => [e.from, e.to].sort().join(' ↔ '))
    for (const k of d.concepts ?? []) {
      if (k.fields == null) continue
      const okField = (x) => (typeof x === 'string' ? !!x.trim() : !!x && typeof x === 'object' && !Array.isArray(x) && typeof x.title === 'string' && !!x.title.trim())
      if (!(Array.isArray(k.fields) && k.fields.every(okField))) { say('错', cx, '业务', file, `概念「${k.title ?? k.id ?? '?'}」的 fields 要写成一列栏：每一项是一个栏名，或者带 title 的对象 { title, note?, ref?, topic? }`); continue }
      const bracket = k.fields.map((x) => (typeof x === 'string' ? x : x.title)).filter((t) => /[（(]/.test(t))
      if (bracket.length) say('提醒', cx, '业务', file, `概念「${k.title ?? k.id ?? '?'}」的栏名带括号：${bracket.join('、')}。栏名里不带括号，取值之类的话写进这一栏的 note`)
    }
    for (const x of dups(pairs)) say('提醒', cx, '业务', file, `${x} 之间有 ${pairs.filter((p) => p === x).length} 条线：同样两样数据之间并成一条，几句话写进一个 label`)
  }

  // 流程：主题、入口出口、旁支
  for (const [fname, { file, data }] of Object.entries(IDX[cx].flows)) {
    if (data.topic == null) say('提醒', cx, '业务', file, '没写 topic：这一份讲的是哪个主题里的哪一段')
    else if (topicIds.length && !topicIds.includes(data.topic)) say('错', cx, '业务', file, `topic 写的 ${data.topic} 不是全局图上的主题`)
    for (const s of data.steps ?? []) if (s.alt && !s.case) say('错', cx, '业务', file, `第 ${s.id} 步写了 alt，没写 case：这一支是什么情况`)
    for (const [key, back, word] of [['entries', 'exits', '入口'], ['exits', 'entries', '出口']]) for (const x of data[key] ?? []) {
      if (!stepIn(cx, fname, x.step)) say('错', cx, '业务', file, `${word}「${x.text ?? ''}」接的第 ${x.step} 步这一份里没有`)
      if (x.flow == null) continue
      const other = IDX[cx].flows[x.flow]
      if (!other) { say('错', cx, '业务', file, `${word}「${x.text ?? ''}」写的流程「${x.flow}」在 业务/流程/ 下没有`); continue }
      if (!(other.data[back] ?? []).some((y) => y.flow === fname)) say('错', cx, '业务', file, `${word}接着「${x.flow}」，那一份的 ${back} 里没写回到「${fname}」：两边都要写`)
    }
  }

  // 功能的出处里写着的代码文件：同一个文件出现在两个主题的功能里，可能有一项放错了主题
  const codeIn = (t) => [...new Set(String(t ?? '').match(/[\w\-./\\]+\.(?:tsx?|jsx?|vue|py|java|cs|go|rb|php|kt|swift|sql)\b/g) ?? [])]
  const srcTopics = new Map()
  for (const { name, file } of jsonIn(path.join(c, '业务', '模块业务'))) for (const f of (load(file, cx, '业务')?.groups ?? []).flatMap((g) => g.functions ?? [])) for (const p of codeIn(f.source)) srcTopics.set(p, (srcTopics.get(p) ?? new Set()).add(name))
  // 模块业务：一个主题一份
  for (const { name, file } of jsonIn(path.join(c, '业务', '模块业务'))) {
    const d = load(file, cx, '业务'); if (!d) continue
    if (d.topic !== name) say('错', cx, '业务', file, `topic 要写主题号 ${name}，写的是 ${d.topic}`)
    if (topicIds.length && !topicIds.includes(name)) say('错', cx, '业务', file, `${name} 不是全局图上的主题`)
    // 业务概述：五样，使用角色带按先后做的几件事
    const INTRO = [['context', '业务背景'], ['duty', '模块职责'], ['concepts', '核心概念'], ['users', '使用角色'], ['usual', '一般怎么用']]
    const filled = (v) => (Array.isArray(v) ? v.length > 0 : !!String(v ?? '').trim())
    if (!d.intro) say('提醒', cx, '业务', file, '没写介绍（intro）')
    else {
      const miss = INTRO.filter(([k]) => !filled(d.intro[k]))
      if (miss.length) say('提醒', cx, '业务', file, '介绍缺了：' + miss.map(([k, t]) => `${t}（${k}）`).join('、'))
      for (const u of d.intro.users ?? []) if (!filled(u.steps)) say('提醒', cx, '业务', file, `介绍里的「${u.who ?? '?'}」没写按先后做哪几件事`)
    }
    const fns = (d.groups ?? []).flatMap((g) => g.functions ?? [])
    const nm = (xs) => (xs ?? []).map((x) => (typeof x === 'string' ? x : x?.title)).filter(Boolean)
    // 这个主题的概念图：没分子主题的是一份，分了子主题的是每个子主题一份
    const cmain = path.join(cdir, name + '.json'), cmainDoc = exists(cmain) ? load(cmain, cx, '业务') : null
    const cdocs = (!cmainDoc ? [] : Array.isArray(cmainDoc.subs) ? jsonIn(path.join(cdir, name)).map((x) => load(x.file, cx, '业务')) : [cmainDoc]).filter(Boolean)
    const conTitles = new Set(cdocs.flatMap((x) => nm(x.concepts)))
    const conFields = new Map(cdocs.flatMap((x) => x.concepts ?? []).filter((k) => k?.title).map((k) => [k.title, new Set(Array.isArray(k.fields) ? nm(k.fields) : [])]))
    const allNames = new Set([...conTitles, ...nm(d.core), ...(d.core ?? []).flatMap((k) => nm(k.parts)), ...nm(d.uses), ...nm(d.intro?.concepts)])
    for (const x of dups(fns.map((f) => f.id))) say('错', cx, '业务', file, `功能号重复：${x}`)
    // 核心数据：每个主题都要认出来；写了的要写全，指着的功能要有，去到别的主题的要写对主题名；来路碰到另一样核心数据要停
    if (!(d.core ?? []).length) say('提醒', cx, '业务', file, '没写核心数据（core）：这块业务最后要留下的是哪样数据、它从哪来、去到哪')
    const OPS = ['创建', '更新', '删除']
    for (const c of d.core ?? []) {
      const who = `核心数据「${c.title ?? '?'}」`
      if (!String(c.title ?? '').trim()) say('错', cx, '业务', file, '有一样核心数据没写名字（title）')
      if (!String(c.why ?? '').trim()) say('提醒', cx, '业务', file, `${who}没写为什么是它（why）`)
      const segs = [...(c.sources ?? []).flatMap((s) => [...(s.heads ?? []).flatMap((h) => h.steps ?? []), ...(s.steps ?? [])]), ...(c.targets ?? [])]
      // 线上都要标做了什么：创建、更新、删除；看板只画把它新建出来的来路，所以每条来路的最后一步是创建
      const badOp = segs.filter((x) => x.op && !OPS.includes(x.op))
      for (const x of badOp) say('错', cx, '业务', file, `${who}的来路、去处上 op 写的是「${x.op}」：只能写创建、更新、删除`)
      const noOp = segs.filter((x) => !x.op).length
      if (noOp) say('提醒', cx, '业务', file, `${who}的来路、去处有 ${noOp} 段没标做了什么（op）：创建、更新或删除`)
      for (const s of c.sources ?? []) {
        if (s.change) say('提醒', cx, '业务', file, `${who}有一条来路标着 change：改动已有数据的事不上看板，删掉这一条，写到那项功能的业务数据上`)
        const last = (s.steps ?? []).at(-1)
        if (!s.change && last?.op && last.op !== '创建') say('提醒', cx, '业务', file, `${who}有一条来路的最后一步是「${last.op}」：看板只画把它新建出来的来路，最后一步是创建；改动它的事在功能里看`)
      }
      // 一条来路只有头一站可以是另一样核心数据（从它起）；写了 heads 的，头一站在每个起点里
      const others = new Set((d.core ?? []).filter((x) => x !== c).map((x) => x.title))
      for (const s of c.sources ?? []) {
        const runs = (s.heads ?? []).length ? [...s.heads.map((h) => h.steps ?? []), (s.steps ?? []).map((x) => ({ ...x, mid: true }))] : [s.steps ?? []]
        for (const r of runs) r.forEach((x, i) => { if ((i > 0 || x.mid) && others.has(x.data)) say('提醒', cx, '业务', file, `${who}的来路中途经过了另一样核心数据「${x.data}」：从它起就好，它前面的事在它自己的图上看`) })
      }
      for (const x of segs) {
        if (!String(x.data ?? '').trim() || !String(x.by ?? '').trim()) say('错', cx, '业务', file, `${who}的来路、去处里有一段没写全：每一段要有数据（data）和那件业务（by）`)
        // 别的上下文的主题写成「主题名（上下文名）」，这里不查；本上下文的主题名要对得上全局图
        if (x.topic && !/（.+）$/.test(x.topic) && topicTitles.length && !topicTitles.includes(x.topic)) say('错', cx, '业务', file, `${who}的来路或去处写的主题「${x.topic}」不是全局图上的主题名（别的上下文的主题写成「主题名（上下文名）」）`)
        if (x.fn && !fns.some((f) => f.id === x.fn)) say('错', cx, '业务', file, `${who}指着的功能 ${x.fn} 在这个主题里没有`)
      }
      for (const x of c.targets ?? []) if (x.topic && !x.fn) say('提醒', cx, '业务', file, `${who}去到主题「${x.topic}」的「${x.data ?? '?'}」没写功能号（fn）：交给别的主题的数据，是这里的哪项功能让它新建或改变的`)
      // 装着的概念（parts）和概念图上的上下层线（tree：from 装着 to）要对得上；另一样核心数据下面的不算它的
      if (conTitles.has(c.title)) {
        const titleIn = (doc, id) => [...(doc.concepts ?? []), ...(doc.external ?? [])].find((k) => k.id === id)?.title
        const kids = new Map(), cores = new Set(nm(d.core))
        for (const doc of cdocs) for (const e of doc.edges ?? []) if (e.tree) { const a = titleIn(doc, e.from), b = titleIn(doc, e.to); if (a && b) kids.set(a, [...(kids.get(a) ?? []), b]) }
        const under = new Set(), walk = (t) => { for (const k of kids.get(t) ?? []) if (!under.has(k) && !cores.has(k)) { under.add(k); walk(k) } }
        walk(c.title)
        const parts = nm(c.parts), lost = parts.filter((k) => !under.has(k)), extra = [...under].filter((k) => !parts.includes(k))
        if (lost.length) say('提醒', cx, '业务', file, `${who}的 parts 里写着「${lost.join('、')}」，概念图上没有用上下层的线（tree）把它连到这样核心数据下面`)
        if (extra.length) say('提醒', cx, '业务', file, `概念图上「${extra.join('、')}」用上下层的线连在${who}下面，它的 parts 里没写`)
      }
    }
    for (const u of d.uses ?? []) if (typeof u === 'string' || !String(u.note ?? '').trim()) say('提醒', cx, '业务', file, `用到的资料「${typeof u === 'string' ? u : u.title ?? '?'}」没写说明（note）：用一句话说它是什么`)
    // 概念图上的概念都要在业务文件里出现：是一样核心数据、装在哪一样里、是用到的资料，或者是业务概述里的概念
    if ((d.core ?? []).length && conTitles.size) {
      const inBiz = new Set([...nm(d.core), ...d.core.flatMap((k) => nm(k.parts)), ...nm(d.uses), ...nm(d.intro?.concepts)])
      const out = [...conTitles].filter((k) => !inBiz.has(k))
      if (out.length) say('提醒', cx, '业务', file, `概念图上的「${out.join('、')}」在这份业务里没有出现：它该是一样核心数据、装在哪一样里（parts）、是用到的资料（uses），或者是业务概述里的概念`)
    }
    // 概述里的核心概念都要在看板上找得到：是一样核心数据、装在哪一样里、是用到的资料，或者是来路去处上的一站
    if ((d.core ?? []).length) {
      const names = (xs) => (xs ?? []).map((x) => (typeof x === 'string' ? x : x?.title)).filter(Boolean)
      const onBoard = new Set([...names(d.core), ...d.core.flatMap((c) => names(c.parts)), ...names(d.uses),
        ...d.core.flatMap((c) => [...(c.sources ?? []).flatMap((s) => [...(s.heads ?? []).flatMap((h) => h.steps ?? []), ...(s.steps ?? [])]).filter((x) => !x.event).map((x) => x.data), ...(c.targets ?? []).map((x) => x.data)])])
      for (const k of names(d.intro?.concepts)) if (!onBoard.has(k)) say('提醒', cx, '业务', file, `核心概念「${k}」在核心数据的看板上找不到：它该是一样核心数据、装在哪一样里（parts）、是用到的资料（uses），或者是来路、去处上的一站`)
    }
    // 目的的固定的号：业务目的的 id 写「p-1」，更细的目的的 id 写「p-1.1」，for 照这个号找目的。一条都没写号的是旧写法，for 照先后数
    const aimId = (x) => (x?.id == null ? '' : String(x.id).trim())
    const aims = (d.purposes ?? []).flatMap((p, i) => [{ id: aimId(p), who: `第 ${i + 1} 条业务目的` },
      ...(p?.needs ?? []).map((n, j) => ({ id: aimId(n), who: `第 ${i + 1} 条业务目的下面的第 ${j + 1} 条更细的目的`, up: aimId(p), sub: true }))])
    const numbered = aims.some((a) => a.id)
    // 业务目的和更细的目的：每个主题都要写；目的落到的核心数据、别的数据、功能、响应要找得到；每样核心数据、每项功能、每条响应都要有目的落到它上面
    {
      const ps = d.purposes ?? [], names = (xs) => (xs ?? []).map((x) => (typeof x === 'string' ? x : x?.title)).filter(Boolean)
      const coreNames = names(d.core), landed = new Set(), asking = (d.asks ?? []).some((a) => !a.answer)
      const known = new Set([...coreNames, ...names(d.intro?.concepts), ...names(d.uses), ...(d.core ?? []).flatMap((c) => [...names(c.parts),
        ...(c.sources ?? []).flatMap((s) => [...(s.heads ?? []).flatMap((h) => h.steps ?? []), ...(s.steps ?? [])]).filter((x) => !x.event).map((x) => x.data), ...(c.targets ?? []).map((x) => x.data)]), ...conTitles])
      const chainIds = (d.chains ?? []).map((ch) => ch.id), hungF = new Set(), hungC = new Set()
      if (!ps.length) say('提醒', cx, '业务', file, '没写业务目的（purposes）：背景里外面的人对这块业务提了哪几项要求，各落到哪样核心数据、哪项功能上')
      else if (!String(d.intro?.context ?? '').trim()) say('提醒', cx, '业务', file, '写了业务目的却没写背景（intro.context）：业务目的是从背景里挖出来的')
      ps.forEach((p, i) => {
        const who = `第 ${i + 1} 条业务目的`
        if (!String(p.text ?? '').trim()) say('错', cx, '业务', file, `${who}没写内容（text）`)
        if (!String(p.from ?? '').trim()) say('提醒', cx, '业务', file, `${who}没写它对着背景里的哪一句（from）`)
        if (!String(p.source ?? '').trim() && !asking) say('提醒', cx, '业务', file, `${who}没写出处（source），待定里也没有问人：推出来的业务目的要等人确认`)
        if (!(p.needs ?? []).length) say('提醒', cx, '业务', file, `${who}下面没有更细的目的（needs）`)
        for (const n of p.needs ?? []) {
          const nw = `${who}下面的目的「${String(n.aim ?? n.text ?? '').slice(0, 16)}」`
          if (!String(n.aim ?? '').trim() && !String(n.text ?? '').trim()) say('错', cx, '业务', file, `${who}下面有一条既没写更细的目的（aim）也没写做法（text）`)
          else if (!String(n.aim ?? '').trim()) say('提醒', cx, '业务', file, `${nw}没写更细的目的（aim）：aim 回答为了什么，text 是怎么做到的`)
          for (const k of n.cores ?? []) { if (coreNames.includes(k)) landed.add(k); else say('错', cx, '业务', file, `${nw}落到的「${k}」不是这个主题的核心数据`) }
          for (const k of n.fns ?? []) { if (fns.some((f) => f.id === k)) hungF.add(k); else say('错', cx, '业务', file, `${nw}落到的功能 ${k} 在这个主题里没有`) }
          for (const k of n.chains ?? []) { if (chainIds.includes(k)) hungC.add(k); else say('错', cx, '业务', file, `${nw}落到的响应 ${k} 在这个主题里没有`) }
          for (const k of n.data ?? []) if (!known.has(k)) say('错', cx, '业务', file, `${nw}落到的数据「${k}」在概念图、核心概念和看板上都找不到`)
          if (!(n.cores ?? []).length && !(n.fns ?? []).length && !(n.data ?? []).length && !(n.chains ?? []).length) say('提醒', cx, '业务', file, `${nw}没写落到哪里（cores、data、fns、chains）`)
        }
      })
      // 目的的固定的号：只要有一条目的写了号就查。号不能重、要写就每一条都写（不对的是错）；号的样子不对的只提醒
      if (numbered) {
        const dupIds = dups(aims.map((a) => a.id || null)), noId = aims.filter((a) => !a.id).map((a) => a.who)
        const offUp = aims.filter((a) => a.sub && a.id && a.up && !(a.id.startsWith(a.up + '.') && a.id.length > a.up.length + 1)).map((a) => `业务目的 ${a.up} 下面的 ${a.id}`)
        const offShape = aims.filter((a) => a.id && !(a.sub ? /^p-\d+\.\d+$/ : /^p-\d+$/).test(a.id)).map((a) => `${a.who}的「${a.id}」`)
        if (dupIds.length) say('错', cx, '业务', file, `目的的号（id）重复：${dupIds.join('、')}。业务目的的号之间、更细的目的的号之间、这两种之间都不能重：for 靠这个号认是哪一条目的。新加的一条用还没用过的号`)
        if (noId.length) say('错', cx, '业务', file, `有的目的写了号（id）、有的没写，没写的有 ${noId.length} 条：${noId.join('、')}。业务目的和更细的目的要写号就每一条都写：for 照号找目的，没写号的那几条指不到`)
        if (offUp.length) say('提醒', cx, '业务', file, `有 ${offUp.length} 条更细的目的的号（id）点前面不是它所在的业务目的的号：${offUp.join('、')}。更细的目的的号是它所在的业务目的的号加一个点再加一段，比如业务目的 p-2 下面的写「p-2.1」「p-2.2」`)
        if (offShape.length) say('提醒', cx, '业务', file, `有 ${offShape.length} 条目的的号（id）不是规定的样子：${offShape.join('、')}。业务目的的号写成「p-数字」，比如「p-1」「p-2」；更细的目的的号写成「p-数字.数字」，比如「p-1.1」「p-1.2」，点前面是它所在的业务目的的号`)
      }
      const bare = ps.flatMap((p) => p.needs ?? []).filter((n) => String(n.aim ?? '').trim() && !String(n.source ?? '').trim()).length
      if (bare && !asking) say('提醒', cx, '业务', file, `有 ${bare} 条更细的目的没写出处（source），待定里也没有问人：只在现成的做法里看到、原料和人都没讲的，记成待定问人`)
      if (ps.length) for (const k of coreNames) if (!landed.has(k) && !(d.asks ?? []).some((a) => !a.answer && String(a.q ?? '').includes(k))) say('提醒', cx, '业务', file, `核心数据「${k}」没有哪一条更细的目的落到它上面：它是为了什么，分不出来就记成待定问人`)
      // 每项功能、每条响应都要挂到某一条更细的目的上
      if (ps.some((p) => (p.needs ?? []).length)) {
        const looseF = fns.filter((f) => f.id && !hungF.has(f.id)).map((f) => f.id), looseC = chainIds.filter((k) => k && !hungC.has(k))
        if (looseF.length) say('提醒', cx, '业务', file, `有 ${looseF.length} 项功能没有挂到哪一条更细的目的上：${looseF.join('、')}。说不出它为了什么的，在待定里问人，不编一句话填上`)
        if (looseC.length) say('提醒', cx, '业务', file, `有 ${looseC.length} 条响应没有挂到哪一条更细的目的上：${looseC.join('、')}`)
      }
    }
    for (const f of fns) {
      const who = `功能 ${f.id ?? '?'}（${f.title ?? ''}）`
      if (!f.id) say('错', cx, '业务', file, `有一项功能没写号（id）：${f.title ?? ''}`)
      if (!f.subject?.title || !f.subject?.to) say('错', cx, '业务', file, `${who}没写业务数据：subject 写它主要动的那样数据（title）和变成什么（to）`)
      if (f.subject?.op && !['创建', '更新', '删除'].includes(f.subject.op)) say('错', cx, '业务', file, `${who}的业务数据 op 写的是「${f.subject.op}」：只能写创建、更新、删除`)
      else if (f.subject?.title && !f.subject.op) say('提醒', cx, '业务', file, `${who}的业务数据没标做了什么（subject.op）：创建、更新或删除`)
      // 写了 calls 的功能是拆过的：动了哪几项写在它叫的行为的 edits 里，subject 上不再列
      else if (['创建', '更新'].includes(f.subject?.op) && !(f.subject.edits ?? []).length && !Array.isArray(f.calls)) say('提醒', cx, '业务', file, `${who}没列出动了业务数据的哪几项（subject.edits）`)
      {
        const lost = (f.subject?.edits ?? []).map((e) => /^\s*([^›：:]+?)\s*›\s*([^：:]+?)\s*[：:]/.exec(String(e))).filter((m) => m && conFields.has(m[1]) && !conFields.get(m[1]).has(m[2])).map((m) => `${m[1]} › ${m[2]}`)
        if (lost.length) say('提醒', cx, '业务', file, `${who}的 edits 里「${lost.join('」「')}」的栏名在那个概念的栏（fields）里找不到：栏名要和 fields 里的 title 一样，一栏一条，不并写`)
      }
      if (!String(f.intent ?? '').trim()) say('错', cx, '业务', file, `${who}没写操作意图（intent）`)
      if (f.subject?.title) {
        const t = String(f.subject.title).replace(/（[^（）]*）$/, ''), hit = [...allNames].filter((k) => t.includes(k)), top = hit.filter((k) => !hit.some((o) => o !== k && o.includes(k)))
        if (top.length > 1) say('提醒', cx, '业务', file, `${who}的业务数据名字（subject.title）里认得出不止一个概念名：${top.join('、')}。只带它主要动的那一样的名字，页面从名字里认主数据`)
      }
      {
        const shared = codeIn(f.source).filter((p) => [...(srcTopics.get(p) ?? [])].some((t) => t !== name))
        if (shared.length) say('提醒', cx, '业务', file, `${who}的出处 ${shared.join('、')} 也是别的主题（${[...new Set(shared.flatMap((p) => [...srcTopics.get(p)]).filter((t) => t !== name))].join('、')}）里功能的出处：看一看这项功能是不是放错了主题，归属看谁在哪张单据上发起`)
      }
      // 要用到的数据：一样一条 { title, note }；只写名字的旧写法照认，提醒补解释
      for (const x of f.in ?? []) {
        const name = typeof x === 'string' ? x : x?.title
        if (!String(name ?? '').trim()) { say('错', cx, '业务', file, `${who}要用到的数据有一样没写名字（title）`); continue }
        if (typeof x === 'string' || !String(x.note ?? '').trim()) say('提醒', cx, '业务', file, `${who}要用到的「${name}」没写解释或例子`)
      }
      for (const u of f.uses ?? []) {
        if (!IDX[cx].flows[u.flow]) say('错', cx, '业务', file, `${who}指着的流程「${u.flow}」在 业务/流程/ 下没有`)
        else if (!stepIn(cx, u.flow, u.step)) say('错', cx, '业务', file, `${who}指着的「${u.flow}」第 ${u.step} 步没有`)
      }
    }
    for (const x of dups((d.chains ?? []).map((ch) => ch.id))) say('错', cx, '业务', file, `响应号重复：${x}`)
    for (const x of dups((d.workflows ?? []).map((w) => w.id))) say('错', cx, '业务', file, `状态转换流程号重复：${x}`)
    for (const w of d.workflows ?? []) {
      const ids = (w.states ?? []).map((st) => st.id)
      for (const x of dups(ids)) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）的状态号重复：${x}`)
      for (const m of w.moves ?? []) for (const end of [m.from, m.to]) if (!ids.includes(end)) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）的线 ${m.from} → ${m.to}：${end} 不是它的状态`)
      if (w.title && !allNames.has(w.title)) say('提醒', cx, '业务', file, `状态转换流程 ${w.id}（${w.title}）的名字对不上任何一个概念：title 写它讲的那个概念的名字，页面靠名字把状态图挂到概念后面`)
      // 分了段的：每个状态正好在一段里
      if (Array.isArray(w.stages) && w.stages.length) {
        const staged = w.stages.flatMap((st) => st.states ?? [])
        for (const x of [...new Set(staged.filter((k) => !ids.includes(k)))]) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）分段（stages）里的 ${x} 不是它的状态`)
        for (const x of dups(staged)) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）的状态 ${x} 分进了不止一段`)
        const miss = ids.filter((k) => !staged.includes(k))
        if (miss.length) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）的状态 ${miss.join('、')} 没有分进哪一段`)
      }
    }
    for (const [i, t] of (d.tours ?? []).entries()) for (const st of t.steps ?? []) for (const k of st.fns ?? []) if (!fns.some((f) => f.id === k)) say('错', cx, '业务', file, `主要流程速览「${t.title ?? i + 1}」里用到的功能 ${k} 在这个主题里没有`)
    // 拆过的主题（写了顶层 rules）：规则、行为、服务的号不重复，各处指着的规则、行为、服务、目的都要找得到
    if (Array.isArray(d.rules)) {
      const KINDS = ['一直要守的', '做之前要满足的', '状态能不能走', '怎么算的']
      const list = (v) => (Array.isArray(v) ? v : []), obj = (x) => !!x && typeof x === 'object'
      const rules = d.rules.filter(obj), acts = (d.core ?? []).flatMap((k) => list(k?.actions)).filter(obj), svcs = list(d.services).filter(obj), chs = list(d.chains).filter(obj)
      const ruleIds = new Set(rules.map((x) => x.id)), actIds = new Set(acts.map((a) => a.id)), svcIds = new Set(svcs.map((s) => s.id))
      const tag = (word, x) => `${word} ${x.id ?? '?'}（${x.title ?? ''}）`
      for (const x of dups(rules.map((x) => x.id))) say('错', cx, '业务', file, `规则号重复：${x}`)
      for (const x of dups(acts.map((a) => a.id))) say('错', cx, '业务', file, `行为号重复：${x}`)
      for (const x of dups(svcs.map((s) => s.id))) say('错', cx, '业务', file, `服务号重复：${x}`)
      for (const x of rules) if (!KINDS.includes(x.kind)) say('错', cx, '业务', file, `规则 ${x.id ?? '?'} ${x.kind == null ? '没写 kind' : `的 kind 写的是「${x.kind}」`}：只能写${KINDS.join('、')}`)
      // 规则挂在做它的那一个上，一共五处；功能的 rules 里不是「r-数字」样子的是没拆完的旧话，不查
      const hangs = [
        ...(d.core ?? []).filter(obj).map((k) => [`核心数据「${k.title ?? '?'}」的 keeps`, list(k.keeps)]),
        ...acts.map((a) => [`${tag('行为', a)}的 rules`, list(a.rules)]),
        ...chs.map((ch) => [`${tag('响应', ch)}的 rules`, list(ch.rules)]),
        ...svcs.map((s) => [`${tag('服务', s)}的 rules`, list(s.rules)]),
        ...fns.map((f) => [`${tag('功能', f)}的 rules`, list(f.rules).filter((x) => typeof x === 'string' && /^r-\d+$/.test(x))]),
      ]
      const hung = new Set()
      for (const [where, ids] of hangs) for (const x of ids) {
        if (ruleIds.has(x)) hung.add(x)
        else if (typeof x === 'string' && /^r-\d+$/.test(x)) say('错', cx, '业务', file, `${where} 里挂着的规则 ${x} 在这个主题的 rules 里没有`)
        else say('错', cx, '业务', file, `${where} 里写的「${typeof x === 'string' ? x : JSON.stringify(x)}」不是这个主题的规则号：这里只挂规则号，规则的话写在顶层 rules 里`)
      }
      const loose = [...new Set(rules.map((x) => x.id).filter((k) => k && !hung.has(k)))]
      if (loose.length) say('错', cx, '业务', file, `有 ${loose.length} 条规则没有挂在任何一处：${loose.join('、')}。规则挂在做它的那一个上：核心数据的 keeps，或者行为、响应、服务、功能的 rules`)
      // 功能和响应叫的行为、功能用的服务、状态转换流程的线指着的行为
      const called = new Set()
      for (const [word, xs] of [['功能', fns], ['响应', chs]]) for (const x of xs) for (const k of list(x.calls)) { if (actIds.has(k)) called.add(k); else say('错', cx, '业务', file, `${tag(word, x)}叫的行为 ${k} 在这个主题里没有`) }
      for (const ch of chs) for (const k of Object.keys(obj(ch.callsWhen) ? ch.callsWhen : {})) if (!actIds.has(k)) say('错', cx, '业务', file, `${tag('响应', ch)}的 callsWhen 里写的 ${k} 不是这个主题的行为号`)
      for (const f of fns) for (const k of list(f.services)) if (!svcIds.has(k)) say('错', cx, '业务', file, `${tag('功能', f)}用的服务 ${k} 在这个主题里没有`)
      for (const f of fns) for (const st of list(f.steps)) if (obj(st) && st.fn && !fns.some((x) => x.id === st.fn)) say('错', cx, '业务', file, `${tag('功能', f)}的步骤里接着办的功能 ${st.fn} 在这个主题里没有`)
      for (const w of d.workflows ?? []) for (const m of w.moves ?? []) if (m.act != null && !actIds.has(m.act)) say('错', cx, '业务', file, `状态转换流程 ${w.id}（${w.title ?? ''}）的线 ${m.from} → ${m.to} 指着的行为 ${m.act} 在这个主题里没有`)
      // for 指着一条目的。目的写了固定的号的照号找；一条都没写号的照先后数：「1.2」是第 1 条业务目的下面的第 2 条更细的目的，只写「1」的指着第 1 条业务目的
      const ps = d.purposes ?? [], aimIds = new Set(aims.map((a) => a.id).filter(Boolean))
      let forN = 0
      const forOk = (v) => {
        if (numbered) return aimIds.has(String(v).trim())
        const m = /^(\d+)(?:\.(\d+))?$/.exec(String(v).trim()), p = m && ps[+m[1] - 1]
        return !!p && (m[2] == null || !!(p.needs ?? [])[+m[2] - 1])
      }
      const forCheck = (who, v, at) => {
        if (v == null || !String(v).trim()) return
        forN++
        if (forOk(v)) return
        say('错', cx, '业务', at, numbered
          ? `${who}的 for 写的是「${v}」，主题 ${name} 的业务目的（purposes）里没有这个号的目的：for 写的是一条业务目的的号（id）或者一条更细的目的的号（id），比如业务目的「p-1」、它下面的更细的目的「p-1.2」`
          : `${who}的 for 写的是「${v}」，主题 ${name} 的业务目的（purposes）里没有这一条：for 写成「业务目的的序号.更细的目的的序号」，从 1 数起，比如「1.2」是第 1 条业务目的下面的第 2 条更细的目的，只指业务目的的写「1」`)
      }
      for (const x of rules) forCheck(`规则 ${x.id ?? '?'} `, x.for, file)
      for (const a of acts) forCheck(tag('行为', a), a.for, file)
      for (const s of svcs) forCheck(tag('服务', s), s.for, file)
      const cfiles = !cmainDoc ? [] : Array.isArray(cmainDoc.subs) ? jsonIn(path.join(cdir, name)).map((x) => x.file) : [cmain]
      for (const cf of cfiles) for (const k of load(cf, cx, '业务')?.concepts ?? []) for (const x of list(k?.fields)) if (obj(x)) forCheck(`概念「${k.title ?? k.id ?? '?'}」的栏「${x.title ?? '?'}」`, x.for, cf)
      // 旧写法（目的一条都没写号）而主题里有东西写了 for：一个主题提醒一条
      if (forN && aims.length && !numbered) say('提醒', cx, '业务', file, `这个主题的规则、行为、服务和概念的栏里有 ${forN} 处写了 for，而业务目的和更细的目的都没写固定的号（id）：for 现在是照先后数的，在中间插一条目的，后面的指向都会错位。给业务目的和更细的目的各写一个固定的号：业务目的写「p-1」「p-2」，更细的目的写「p-1.1」「p-1.2」（点前面是它所在的业务目的的号），for 写这个号；号定了就不改，新加的一条用还没用过的号`)
      // 提醒：并成一条说
      const noEx = rules.filter((x) => !list(x.examples).length && !list(x.items).length).map((x) => x.id ?? '?')
      if (noEx.length) say('提醒', cx, '业务', file, `有 ${noEx.length} 条规则没有例子（examples），也没有并着的几小条（items）：${noEx.join('、')}。一个例子写在什么前提下（given）、做了什么（when）、结果怎样（then）`)
      // 规则的出处写在 source 里，和别处的出处叫法一样；只写了 from 的是旧写法
      const oldSrc = rules.filter((x) => String(x.from ?? '').trim() && !String(x.source ?? '').trim()).map((x) => x.id ?? '?')
      if (oldSrc.length) say('提醒', cx, '业务', file, `有 ${oldSrc.length} 条规则写了 from 而没写 source：${oldSrc.join('、')}。规则的出处写在 source 里，和别处一样；from 是旧写法`)
      const idle = acts.filter((a) => a.id && !called.has(a.id)).map((a) => `${a.id}（${a.title ?? ''}）`)
      if (idle.length) say('提醒', cx, '业务', file, `有 ${idle.length} 个行为没有哪项功能或响应叫它（不在任何 calls 里）：${idle.join('、')}`)
      // 步骤的 on 是这一步引起的副作用的名字：等于它自己 edits 某一项冒号前面的名字，或者它自己 out 某一项 title 冒号前面的名字（没有冒号的是整个 title）
      const before = (e) => String(e ?? '').split(/[：:]/)[0].trim(), off = []
      const onCheck = (who, x, edits) => {
        const known = new Set([...list(edits), ...list(x.out).map((o) => (typeof o === 'string' ? o : o?.title))].map(before).filter(Boolean))
        const lost = [...new Set(list(x.steps).flatMap((st) => list(st?.on)).filter((k) => !known.has(String(k).trim())))]
        if (lost.length) off.push(`${who}的「${lost.join('」「')}」`)
      }
      for (const f of fns) onCheck(tag('功能', f), f, list(f.edits).length ? f.edits : f.subject?.edits)
      for (const a of acts) onCheck(tag('行为', a), a, a.edits)
      for (const s of svcs) onCheck(tag('服务', s), s, s.edits)
      if (off.length) say('提醒', cx, '业务', file, `有 ${off.length} 处步骤（steps）的 on 里写的名字对不上副作用：${off.join('、')}。on 里的名字要和它自己 edits 某一项冒号前面的名字、或者它自己 out 某一项 title 冒号前面的名字一样（title 里没有冒号的是整个 title），页面照这个名字把副作用挂到那一步下面，对不上就挂不上`)
    }
    askCheck(d.asks ?? [], cx, '业务', file)
  }

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
