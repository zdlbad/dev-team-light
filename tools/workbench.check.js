// 工作台写回文件那几样的检查：按「定下」、答问题、留言时，核对是不是现在这一版；角色正在改的那一份先按不了。
// 在临时目录里起一个小项目，直接调 lib/project.js 的 pageData 和 applyAction。
// 用法：node tools/workbench.check.js   （全过退出码 0；有不过的列出来、退出码 1）
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pageData, applyAction, writerOf } = require('../lib/project.js')

const P = fs.mkdtempSync(path.join(os.tmpdir(), 'workbench-check-'))
const write = (rel, data) => { const p = path.join(P, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return p }
const read = (rel) => JSON.parse(fs.readFileSync(path.join(P, rel), 'utf8'))
const UI = '上下文/后台/界面/', FLOW = '上下文/后台/业务/流程/01-开户.json'

function reset() {
  write('项目.json', { name: '检查用', contexts: [{ id: 'c1', name: '后台', role: '', c: 2 }], kernel: { concepts: [] } })
  write('现场.json', { now: [], waiting: [] })
  write(UI + 'N-1.json', { req: 'N-1', title: '开账户', flow: '01-开户', views: [{ who: '管理员', screens: [
    { id: 'a', title: '填表', file: 'a.html', step: 1, shows: ['名字'], does: [{ act: '保存', to: 'b' }], asks: [{ id: 'a-1', q: '放几栏？', lean: '两栏', options: ['两栏', '三栏'] }] },
    { id: 'b', title: '存好了', file: 'b.html', shows: [], does: [{ act: '完', to: '完' }] }] }] })
  write(UI + 'N-1/a.html', '<p>填表</p>')
  write(UI + 'N-1/b.html', '<p>存好了</p>')
  write(UI + 'N-2.json', { req: 'N-2', title: '另一条', views: [{ who: '管理员', screens: [{ id: 'x', title: '一屏', file: 'x.html', shows: [], does: [] }] }] })
  write(UI + 'N-2/x.html', '<p>一屏</p>')
  write(FLOW, { file: '01-开户', title: '开户', summary: '', parties: [], steps: [{ id: 1, from: 'p', to: 'q', title: '填表',
    rules: [{ id: 'r-1', text: '号不能重', source: '原料', status: '定了' }, { id: 'r-2', text: '收不收验证码', source: '', status: '待定', lean: '不收', options: ['不收', '收'] }],
    asks: [{ id: 'a-1', q: '谁来填？', lean: '管理员', options: ['管理员', '本人'] }] }] })
  write('上下文/后台/模型/g1/聚合/账户.json', { id: 'account', title: '账户', topic: 'g1', concepts: [], summary: '', members: [{ id: 'm1', name: '账户', kind: '根', desc: '' }], links: [] })
}
const screen = (req, id) => pageData(P, '界面').REQS['后台'].find((r) => r.req === req).views.flatMap((v) => v.screens).find((s) => s.id === id)
const reqOf = (req) => pageData(P, '界面').REQS['后台'].find((r) => r.req === req)
const flow = () => pageData(P, '业务').BIZ['后台'].FLOWS.find((f) => f.file === '01-开户')
const act = (action, body) => applyAction(P, action, { context: '后台', ...body })
const working = (...writes) => write('现场.json', { now: [{ role: 'UI 设计', context: '后台', step: '改小样', since: '2026-01-01 09:00', writes }], waiting: [] })
const decided = (id) => read(UI + 'N-1.json').views[0].screens.find((s) => s.id === id).decidedAt

const fails = []
let n = 0
function check(name, ok, detail) { n++; if (!ok) fails.push(name + (detail ? '\n    ' + JSON.stringify(detail) : '')) }

// —— 定下：是不是现在这一版 ——
reset()
let sig = screen('N-1', 'a').sig, r
check('屏带着这一版的记号', typeof sig === 'string' && sig.length === 12 && sig !== screen('N-1', 'b').sig)
r = act('定下', { mockup: 'N-1', screen: 'a', sig })
check('记号对得上：定下了', r.ok && decided('a'), r)

reset(); sig = screen('N-1', 'a').sig
write(UI + 'N-1/a.html', '<p>填表（改过）</p>')
r = act('定下', { mockup: 'N-1', screen: 'a', sig })
check('页面开着时小样文件改过：不记，提示刷新', !r.ok && r.error.includes('刷新') && !decided('a'), r)
check('刷新以后的记号是新的，再按就定下', screen('N-1', 'a').sig !== sig && act('定下', { mockup: 'N-1', screen: 'a', sig: screen('N-1', 'a').sig }).ok)

reset(); sig = screen('N-1', 'a').sig
{ const d = read(UI + 'N-1.json'); d.views[0].screens[0].shows.push('手机号'); write(UI + 'N-1.json', d) }
r = act('定下', { mockup: 'N-1', screen: 'a', sig })
check('页面开着时这一屏的内容改过：不记', !r.ok && !decided('a'), r)

reset(); sig = screen('N-1', 'b').sig
{ const d = read(UI + 'N-1.json'); d.views[0].screens[0].shows.push('手机号'); write(UI + 'N-1.json', d) }
check('别的屏改了不碍这一屏', act('定下', { mockup: 'N-1', screen: 'b', sig }).ok)

reset(); sig = screen('N-1', 'a').sig
r = act('答', { mockup: 'N-1', screen: 'a', ask: 'a-1', text: '两栏', sig })
check('答屏上的问题：记号对得上就记', r.ok && read(UI + 'N-1.json').views[0].screens[0].asks[0].answer === '两栏', r)
check('人自己答了问题，这一屏的记号不变，接着能定下', screen('N-1', 'a').sig === sig && act('定下', { mockup: 'N-1', screen: 'a', sig }).ok)

reset(); sig = screen('N-1', 'a').sig
{ const d = read(UI + 'N-1.json'); d.views[0].screens[0].asks[0].q = '放几栏、哪几栏？'; write(UI + 'N-1.json', d) }
r = act('答', { mockup: 'N-1', screen: 'a', ask: 'a-1', text: '两栏', sig })
check('问题在页面开着时改写过：不记', !r.ok && r.error.includes('刷新'), r)

reset()
check('不带记号（命令行、旧页面）照旧能定下', act('定下', { mockup: 'N-1', screen: 'a' }).ok)

// —— 角色正在改的那一份先按不了 ——
const locks = [
  ['文件和文件夹连着写', '上下文/后台/界面/N-1.json、N-1/'],
  ['只列了屏的文件夹', '上下文/后台/界面/N-1/'],
  ['列的是上一层文件夹', '上下文/后台/界面/'],
  ['带占位的一类文件', '上下文/<名>/界面/<需求编号>.json'],
  ['后面带括号的补充', '上下文/后台/界面/N-1.json（只动 a 屏）'],
  ['完整路径', path.join(P, UI, 'N-1.json').split(path.sep).join('/')],
]
for (const [name, w] of locks) {
  reset(); sig = screen('N-1', 'a').sig; working(w)
  r = act('定下', { mockup: 'N-1', screen: 'a', sig })
  check(`在改（${name}）：定下按不了，说是谁在改`, !r.ok && r.error.includes('UI 设计') && !decided('a') && reqOf('N-1').locked?.role === 'UI 设计', r)
}
reset(); working('上下文/后台/界面/N-1.json、N-1/')
r = act('答', { mockup: 'N-1', screen: 'a', ask: 'a-1', text: '两栏' })
check('在改：屏上的问题也先答不了', !r.ok && r.error.includes('UI 设计'), r)
check('在改的是 N-1：N-2 不受影响', !reqOf('N-2').locked && act('定下', { mockup: 'N-2', screen: 'x', sig: screen('N-2', 'x').sig }).ok)
reset(); working('上下文/后台/业务/流程/01-开户.json')
check('在改的是流程：小样不受影响', !reqOf('N-1').locked && act('定下', { mockup: 'N-1', screen: 'a' }).ok)
reset(); write('现场.json', { now: [], waiting: [] })
check('交回以后就放开', !reqOf('N-1').locked && act('定下', { mockup: 'N-1', screen: 'a' }).ok)

// —— 流程上的规则和问题 ——
reset()
let st = flow().steps[0]
check('没答的规则和问题带记号，定了的不带', st.rules[1].sig && st.asks[0].sig && !st.rules[0].sig)
r = act('答', { flow: '01-开户', step: 1, rule: 'r-2', text: '不收', sig: st.rules[1].sig })
check('答待定的规则：记号对得上就记', r.ok && read(FLOW).steps[0].rules[1].answer === '不收' && read(FLOW).steps[0].rules[1].status === '定了', r)
reset(); st = flow().steps[0]
{ const d = read(FLOW); d.steps[0].asks[0].options = ['管理员', '本人', '照护伙伴']; write(FLOW, d) }
r = act('答', { flow: '01-开户', step: 1, ask: 'a-1', text: '管理员', sig: st.asks[0].sig })
check('问题在页面开着时改过：不记', !r.ok && r.error.includes('刷新') && !read(FLOW).steps[0].asks[0].answer, r)
r = act('答', { flow: '01-开户', step: 1, rule: 'r-2', text: '不收', sig: st.rules[1].sig })
check('同一份流程里别的条没改：照记', r.ok, r)
reset(); st = flow().steps[0]
write('现场.json', { now: [{ role: '业务', context: '后台', step: '补规则', since: '2026-01-01 09:00', writes: ['上下文/后台/业务/流程/01-开户.json'] }], waiting: [] })
r = act('答', { flow: '01-开户', step: 1, ask: 'a-1', text: '管理员', sig: st.asks[0].sig })
check('业务正在改这份流程：先答不了', !r.ok && r.error.includes('业务') && flow().locked?.role === '业务', r)

// —— 留言 ——
reset()
r = act('留言', { agg: 'account', member: 'm1', field: '手机号', text: '要不要唯一？' })
check('留言：没人在改就记下', r.ok && read('上下文/后台/模型/留言.json').items.length === 1, r)
write('现场.json', { now: [{ role: '建模', context: '后台', step: '处理留言', since: '2026-01-01 09:00', writes: ['上下文/后台/模型/留言.json'] }], waiting: [] })
r = act('留言', { agg: 'account', member: 'm1', field: '手机号', text: '再补一句' })
check('建模正在处理留言：先留不了', !r.ok && r.error.includes('建模') && read('上下文/后台/模型/留言.json').items.length === 1, r)

// —— 聚合上的问题：挂在成员上，或者成员的一个行为上 ——
const AGG = '上下文/后台/模型/g1/聚合/账户.json', PS = '上下文/后台/代码/伪代码/src/account.ts.json'
function withAsks() {
  reset()
  write(AGG, { id: 'account', title: '账户', topic: 'g1', concepts: [], summary: '', links: [], members: [{ id: 'm1', name: '账户', kind: '根', desc: '',
    asks: [{ id: 'a-1', q: '手机号要不要唯一？', lean: '要', options: ['要', '不要'] }],
    behaviors: [{ name: '改手机号', params: ['新号'], guards: [], throws: [], emits: [], asks: [{ id: 'a-2', q: '旧号留不留？', lean: '不留', options: ['不留', '留'] }] }] }] })
  write(PS, { file: 'src/account.ts', blocks: [{ name: '改手机号', params: ['新号'], steps: ['手机号 ← 新号'], asks: [{ id: 'a-1', q: '新号和旧号一样时抛不抛？', lean: '不抛', options: ['不抛', '抛'] }] }, { name: '开户', steps: ['新建 账户'] }] })
  write('上下文/后台/代码/结构.json', { lang: 'TypeScript', root: 'src', files: [{ path: 'src/account.ts', kind: '聚合' }] })
}
const aggPage = () => pageData(P, '建模').BY_CX['后台'].AGGS.find((x) => x.id === 'account')
const psPage = () => pageData(P, '编码').PSEUDO['src/account.ts']
const aggWorking = (...writes) => write('现场.json', { now: [{ role: '建模', context: '后台', step: '改聚合', since: '2026-01-01 09:00', writes }], waiting: [] })
withAsks()
{ const m = aggPage().members[0]
  check('聚合上没答的问题带着记号：成员上的、行为上的各一个', m.asks[0].sig?.length === 12 && m.behaviors[0].asks[0].sig?.length === 12 && m.asks[0].sig !== m.behaviors[0].asks[0].sig, m)
  check('「等你答」数进聚合和伪代码上的问题', pageData(P, '总览').PAGE_ASKS['建模'] === 2 && pageData(P, '总览').PAGE_ASKS['编码'] === 1, pageData(P, '总览').PAGE_ASKS)
  r = act('答', { agg: 'account', ask: 'a-2', text: '不留', sig: m.behaviors[0].asks[0].sig })
  const now = read(AGG).members[0]
  check('答行为上的问题：写回那一条，别的问题不动', r.ok && now.behaviors[0].asks[0].answer === '不留' && now.behaviors[0].asks[0].answeredAt && !now.asks[0].answer, r)
  check('答了的不再数', pageData(P, '总览').PAGE_ASKS['建模'] === 1)
  check('答过的不能再答', !act('答', { agg: 'account', ask: 'a-2', text: '留' }).ok)
  check('没有的问题号：说没有', !act('答', { agg: 'account', ask: 'a-9', text: '要' }).ok && !act('答', { agg: '没有的聚合', ask: 'a-1', text: '要' }).ok) }
withAsks(); sig = aggPage().members[0].asks[0].sig
{ const d = read(AGG); d.members[0].asks[0].q = '手机号要不要全系统唯一？'; write(AGG, d) }
r = act('答', { agg: 'account', ask: 'a-1', text: '要', sig })
check('页面开着时这条问题改过：不记，提示刷新', !r.ok && r.error.includes('刷新') && !read(AGG).members[0].asks[0].answer, r)
withAsks(); sig = aggPage().members[0].asks[0].sig
{ const d = read(AGG); d.summary = '改了一句总述'; write(AGG, d) }
check('聚合别处改了不碍这条问题', act('答', { agg: 'account', ask: 'a-1', text: '要', sig }).ok)
withAsks(); sig = aggPage().members[0].asks[0].sig
aggWorking('上下文/后台/模型/g1/聚合/')
r = act('答', { agg: 'account', ask: 'a-1', text: '要', sig })
check('建模正在改这份聚合：先答不了，页面上带着是谁', !r.ok && r.error.includes('建模') && aggPage().locked?.role === '建模' && !read(AGG).members[0].asks[0].answer, r)

// —— 伪代码上的问题：挂在块上 ——
withAsks()
{ const q = psPage().blocks[0].asks[0]
  check('伪代码上没答的问题带着记号', q.sig?.length === 12 && pageData(P, '编码').CODE_CX === '后台', q)
  r = act('答', { pseudo: 'src/account.ts', ask: 'a-1', text: '不抛', sig: q.sig })
  check('答伪代码上的问题：写回那一块的那一条', r.ok && read(PS).blocks[0].asks[0].answer === '不抛', r)
  check('伪代码答了的不再数', pageData(P, '总览').PAGE_ASKS['编码'] === 0)
  check('没有伪代码的文件、往外指的路径：说没有', !act('答', { pseudo: 'src/none.ts', ask: 'a-1', text: 'x' }).ok && !act('答', { pseudo: '../../../项目', ask: 'a-1', text: 'x' }).ok) }
withAsks(); sig = psPage().blocks[0].asks[0].sig
{ const d = read(PS); d.blocks[0].name = '换手机号'; write(PS, d) }
r = act('答', { pseudo: 'src/account.ts', ask: 'a-1', text: '不抛', sig })
check('页面开着时这一块改了名：不记，提示刷新', !r.ok && r.error.includes('刷新'), r)
const logRows = () => fs.readdirSync(path.join(P, '日志')).flatMap((f) => fs.readFileSync(path.join(P, '日志', f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
withAsks(); sig = psPage().blocks[0].asks[0].sig
const logBefore = logRows().length
write('现场.json', { now: [{ role: '软件工程师', context: '后台', step: '改伪代码', since: '2026-01-01 09:00', writes: ['上下文/后台/代码/伪代码/'] }], waiting: [] })
r = act('答', { pseudo: 'src/account.ts', ask: 'a-1', text: '不抛', sig })
check('软件工程师正在改伪代码：先答不了，页面上带着是谁', !r.ok && r.error.includes('软件工程师') && psPage().locked?.role === '软件工程师', r)
check('没答成的不记日志', logRows().length === logBefore)
withAsks(); act('答', { agg: 'account', ask: 'a-1', text: '要' })
{ const log = logRows().at(-1)
  check('答了记一条日志，写明挂在哪', log?.kind === '答' && log.q === '账户/账户/a-1' && log.text === '要', log) }

// —— 第二个有文件结构的上下文：编码页也带着它的文件、伪代码和问题，答的时候写回它自己的文件 ——
withAsks()
write('项目.json', { name: '检查用', contexts: [{ id: 'c1', name: '后台', role: '', c: 2 }, { id: 'c2', name: '手机', role: '', c: 3 }], kernel: { concepts: [] } })
write('上下文/手机/代码/结构.json', { lang: 'TypeScript', root: 'app', files: [{ path: 'app/chat.ts', kind: '技术件' }] })
write('上下文/手机/代码/伪代码/app/chat.ts.json', { file: 'app/chat.ts', blocks: [{ name: '发消息', steps: ['发出去'], asks: [{ id: 'a-1', q: '发不出去要不要重试？', lean: '要' }] }] })
{ const d = pageData(P, '编码'), other = d.BY_CX['手机']
  check('编码页：第一个上下文照旧在顶层，第二个在 BY_CX 里各带各的', d.CODE_CX === '后台' && !!d.PSEUDO['src/account.ts'] && other?.STRUCT.files.length === 1 && other.PSEUDO['app/chat.ts'].blocks[0].asks[0].sig?.length === 12 && !d.BY_CX['后台'], Object.keys(d.BY_CX))
  r = applyAction(P, '答', { context: '手机', pseudo: 'app/chat.ts', ask: 'a-1', text: '要', sig: other.PSEUDO['app/chat.ts'].blocks[0].asks[0].sig })
  check('答第二个上下文伪代码上的问题：写回它自己的文件', r.ok && read('上下文/手机/代码/伪代码/app/chat.ts.json').blocks[0].asks[0].answer === '要' && !read(PS).blocks[0].asks[0].answer, r) }

check('writerOf：没人写的文件是 null', writerOf(P, path.join(P, '项目.json')) === null)

// —— 一个任务四段做到哪：从日志和屏算 ——
const logRow = (date, row) => { const p = path.join(P, '日志', date + '.jsonl'); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.appendFileSync(p, JSON.stringify({ ts: '09:00', ...row }) + '\n') }
const out = (role, date, task = 'N-1') => logRow(date, { kind: '派出', role, context: '后台', task, text: 'x' })
const prog = (id = 'N-1') => pageData(P, '项目管理').PROG[id]
const show = (st) => ['业务', '建模', '界面', '编码'].map((k) => (st[k] ? '绿' : st._doing.includes(k) ? '黄' : '灰')).join('')
function fresh() {
  reset()
  write('项目管理/需求.json', { items: [{ id: 'N-1', title: '开账户', context: '后台', decision: '做' }, { id: 'N-2', title: '另一条', context: '后台', decision: '做' }, { id: 'N-9', title: '没动过的', decision: '再看' }] })
  write('项目管理/日程.json', { updatedAt: null, milestones: [{ id: 'M1', phase: 1, title: '第一期', date: '2026-12-31', items: [{ id: 'N-1', start: '2026-11-01', end: '2026-11-30', stages: { 业务: null, 建模: null, 编码: null } }] }], drift: [] })
  fs.rmSync(path.join(P, '日志'), { recursive: true, force: true })
  // 这条需求没有小样时界面那一段是灰的：先把屏拿掉，要的那几条再放回去
}
const noScreens = () => { for (const f of ['N-1.json', 'N-2.json']) fs.rmSync(path.join(P, UI, f)) }
const decideAll = (date) => { const d = read(UI + 'N-1.json'); for (const s of d.views[0].screens) s.decidedAt = date; write(UI + 'N-1.json', d) }

fresh(); noScreens()
check('什么都没派过：四段全灰', show(prog()) === '灰灰灰灰' && show(prog('N-9')) === '灰灰灰灰', prog())
out('业务', '2026-11-02')
check('业务派出过：业务黄', show(prog()) === '黄灰灰灰', prog())
out('建模', '2026-11-03'); out('UI 设计', '2026-11-03')
check('建模、界面派出过：业务绿，建模和界面同时黄', show(prog()) === '绿黄黄灰' && prog().业务 === '2026-11-03', prog())
out('软件工程师', '2026-11-05')
check('编码派出过：建模绿，编码黄；界面不因为编码开始了就绿', show(prog()) === '绿绿黄黄', prog())
check('别的任务的派出不算到这一条上', (out('业务', '2026-11-05', 'N-2'), show(prog()) === '绿绿黄黄' && show(prog('N-2')) === '黄灰灰灰'))
logRow('2026-11-06', { kind: '派出', role: '项目管理', task: 'N-1', text: 'x' })
check('项目管理、指挥的派出不算哪一段', show(prog()) === '绿绿黄黄')

fresh(); out('业务', '2026-11-02'); out('UI 设计', '2026-11-03')
check('有小样、屏没定全：界面黄', show(prog()) === '绿灰黄灰', prog())
decideAll('2026-11-04')
check('屏全定下了：界面绿，日期是最后定下的那天', show(prog()) === '绿灰绿灰' && prog().界面 === '2026-11-04', prog())
{ const d = read(UI + 'N-1.json'); delete d.views[0].screens[0].decidedAt; write(UI + 'N-1.json', d) }
check('定下以后有一屏改了、掉回没定：界面回到黄', show(prog()) === '绿灰黄灰', prog())

fresh(); out('业务', '2026-11-02'); out('软件工程师', '2026-11-05')
logRow('2026-11-08', { kind: '做完', role: '指挥', task: 'N-1', text: '测试过了' })
check('记了做完：四段全绿，没有在做的', show(prog()) === '绿绿绿绿' && prog()._doing.length === 0 && prog().编码 === '2026-11-08', prog())
check('日程里的任务带着同一份四段，页面照它画', show(pageData(P, '项目管理').日程.milestones[0].items[0].stages) === '绿绿绿绿' && show(pageData(P, '总览').PLAN.milestones[0].items[0].stages) === '绿绿绿绿')
check('没排进日程的需求也算得出', (out('业务', '2026-11-09', 'N-2'), show(prog('N-2')) === '黄灰黄灰'))

fresh(); noScreens()
{ const d = read('项目管理/日程.json'); d.milestones[0].items[0].stages = { 业务: '2026-10-01', 建模: '2026-10-02', 编码: '2026-10-03' }; write('项目管理/日程.json', d) }
let old = pageData(P, '项目管理').日程.milestones[0].items[0].stages
check('日程里老数据填过三段的日期：照旧认，界面那一段跟着编码', show(old) === '绿绿绿绿' && old.界面 === '2026-10-03', old)
{ const d = read('项目管理/日程.json'); d.milestones[0].items[0].stages = { 业务: '2026-10-01', 建模: null, 编码: null }; write('项目管理/日程.json', d) }
old = pageData(P, '项目管理').日程.milestones[0].items[0].stages
check('老数据只填了业务：业务绿，别的照日志算', show(old) === '绿灰灰灰', old)

fs.rmSync(P, { recursive: true, force: true })
if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
