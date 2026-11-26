// tools/check.js 的检查：先起一个干净的小项目，应该一处毛病都查不出；再一次弄坏一处，看它说不说得出是哪一处。
// 用法：node tools/check.check.js   （全过退出码 0；有不过的列出来、退出码 1）
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const P = fs.mkdtempSync(path.join(os.tmpdir(), 'check-check-'))
const write = (rel, data) => { const p = path.join(P, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2)) }
const read = (rel) => JSON.parse(fs.readFileSync(path.join(P, rel), 'utf8'))
const edit = (rel, fn) => { const d = read(rel); fn(d); write(rel, d) }
const run = (...args) => { const r = spawnSync(process.execPath, [path.join(__dirname, 'check.js'), P, ...args], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') } }

const A = '上下文/后台/', B = '上下文/手机/'
function clean() {
  fs.rmSync(P, { recursive: true, force: true })
  write('项目.json', { name: '检查用', contexts: [{ id: 'c1', name: '后台' }, { id: 'c2', name: '手机' }], kernel: { concepts: [] } })
  write('现场.json', { now: [], waiting: [] })
  write(A + '业务/流程/01-开户.json', { file: '01-开户', title: '开户', steps: [{ id: 1, title: '填表', rules: [{ id: 'r-1', text: 'x', status: '定了' }], asks: [{ id: 'a-1', q: 'x' }] }, { id: 2, title: '存' }] })
  write(B + '业务/流程/02-登录.json', { file: '02-登录', title: '登录', steps: [{ id: 1, title: '填号' }] })
  write(A + '界面/N-1.json', { req: 'N-1', title: '开账户', flow: '01-开户', views: [{ who: '管理员', screens: [
    { id: 'a', title: '填表', file: 'a.html', step: 1, shows: [], does: [{ act: '保存', to: 'b' }], asks: [{ id: 'a-1', q: '放几栏？' }] },
    { id: 'b', title: '存好了', step: 2, shows: [], does: [{ act: '完', to: '完' }] }] }] })
  write(A + '界面/N-1/a.html', '<input data-ask="a-1">')
  write(A + '界面/N-1/b.html', '<p>好了</p>')
  write(B + '界面/N-2.json', { req: 'N-2', title: '登录', flow: ['02-登录'], views: [{ who: '老人', screens: [{ id: 'x', title: '填号', step: '02-登录/1', shows: [], does: [] }] }] })
  write(B + '界面/N-2/x.html', '<p>填号</p>')
  write(A + '模型/全图.json', { edges: [{ from: 'acct', to: 'acct', label: 'x' }] })
  write(A + '模型/g1/聚合/账户.json', { id: 'acct', title: '账户', members: [{ id: 'root', name: '账户', kind: '根', behaviors: [{ name: '换手机号' }] }, { id: 'code', name: '验证码', kind: '值对象' }], links: [{ from: 'root', to: 'code', label: 'x' }] })
  write(A + '模型/g1/调动/清单.json', { topic: 'g1', items: [
    { id: 'open', kind: '命令', name: '开账户', call: { aggregate: '账户', behavior: '新建' } },
    { id: 'change', kind: '命令', name: '改手机号', call: { aggregate: 'acct', behavior: '换手机号' } },
    { id: 'all', kind: '查询', name: '所有账户', call: { aggregate: '账户', read: true } }] })
  write(A + '模型/g1/调动/01-开户.json', { file: '01-开户', rows: [{ ref: 'open', trace: { flow: '01-开户', step: '1' } }, { ref: 'all', trace: { flow: '手机 02-登录', step: 1 } }] })
  write(A + '代码/结构.json', { base: '../packages', files: [
    { path: 'backend/src/account.ts', kind: '聚合根', model: { aggregate: 'acct', member: 'root', behaviors: ['换手机号'] } },
    { path: 'backend/src/change.ts', kind: '命令', model: { item: 'change' } },
    { path: 'backend/tests/account.test.ts', kind: '测试' },
    { path: 'web/src/Open.tsx', kind: '页面', screen: 'N-1/a、N-1/b' }] })
  for (const f of ['backend/src/account.ts', 'backend/src/change.ts', 'web/src/Open.tsx']) write(A + '代码/伪代码/' + f + '.json', { file: f, blocks: [] })
  // 业务：两个主题，g2 分了两个子主题
  write(A + '业务/全局图.json', { background: '银行替人存钱，存了多少、取了多少都要记得清', topics: [{ id: 'g1', title: '开户', x: 0, y: 0, does: [], concepts: [] }, { id: 'g2', title: '记账', x: 1, y: 0, does: [], concepts: [] }], edges: [] })
  write(A + '业务/概念/g1.json', { topic: 'g1', title: '开户', concepts: [{ id: 'acct', title: '账户', fields: ['户名', { title: '开户日期', note: '柜员照开户表开立账户的那一天' }, { title: '客户', note: '这个账户是谁的', ref: '客户档案', topic: '客户' }] }], external: [], edges: [] })
  write(A + '业务/概念/g2.json', { topic: 'g2', title: '记账', subs: [{ id: 'g2-1', title: '入账', x: 0, y: 0 }, { id: 'g2-2', title: '对账', x: 1, y: 0 }], edges: [{ from: 'g2-1', to: 'g2-2', label: 'x' }] })
  write(A + '业务/概念/g2/g2-1.json', { topic: 'g2', sub: 'g2-1', title: '入账', concepts: [], external: [], edges: [] })
  write(A + '业务/概念/g2/g2-2.json', { topic: 'g2', sub: 'g2-2', title: '对账', concepts: [], external: [], edges: [] })
  // 模块业务：g1 一份；两份流程接上：开户的出口接存钱的入口
  write(A + '业务/模块业务/g1.json', { topic: 'g1', title: '开户',
    core: [{ title: '账户', why: '开户最后留下的是账户', sources: [{ steps: [{ data: '客户交来开户表', event: true, op: '创建', by: '柜员照开户表开立账户', fn: 'f-1' }] }], targets: [] }],
    purposes: [{ text: '每位客户的钱都记在他自己的账户上', from: '银行替人存钱', source: '人 2026-01-05 说：钱要记到人头上', needs: [{ aim: '客户来存钱的时候，已经有一个记在他名下的账户', text: '开户时照开户表给客户开立一个账户', source: '人 2026-01-05 说：来了就能存', cores: ['账户'], fns: ['f-1'], chains: ['c-1'] }] }],
    intro: { context: '银行替人存钱', duty: '管开户，不管存取', concepts: [{ title: '账户', note: '一人存钱的那一份' }], users: [{ who: '柜员', aim: '开户', steps: ['照开户表开立账户'] }], usual: ['柜员照开户表开立账户'] },
    groups: [{ title: '账户', functions: [
    { id: 'f-1', title: '开立账户', intent: '给新客户开一个账户', subject: { title: '这位客户的账户', op: '创建', to: '账户开着，可以存钱', edits: ['户名：照开户表记下'] }, in: [{ title: '开户表', note: '客户填好交来的那一张' }], out: [], uses: [{ flow: '01-开户', step: 1 }] }] }],
    chains: [{ id: 'c-1', title: '开了以后', after: { title: '账户', to: '开着' }, then: [{ kind: '新记录', title: '卡' }] }],
    workflows: [{ id: 'w-1', title: '账户', states: [{ id: 's-1', title: '开着' }, { id: 's-2', title: '销了' }], moves: [{ from: 's-1', to: 's-2', label: '销户' }] }],
    asks: [{ id: 'q-1', q: '一人能开几个？', lean: '一个', options: ['一个', '不限'] }] })
  edit(A + '业务/流程/01-开户.json', (d) => { d.topic = 'g1'; d.exits = [{ text: '开好了去存钱', step: 2, flow: 'g1-02-存钱' }] })
  write(A + '业务/流程/g1-02-存钱.json', { file: 'g1-02-存钱', title: '存钱', topic: 'g1', entries: [{ text: '开好了户', step: 1, flow: '01-开户' }], steps: [{ id: 1, title: '存' }, { id: '1a', title: '存不进', alt: '存得进吗', case: '存不进' }] })
  write(B + '业务/全局图.json', { background: '用的人要先登录才能聊天', topics: [{ id: 'm1', title: '登录' }], edges: [] })
  edit(B + '业务/流程/02-登录.json', (d) => { d.topic = 'm1' })
  write(B + '代码/结构.json', { files: [{ path: 'src/Login.tsx', kind: '页面', screen: 'N-2/x' }, { path: 'src/push.ts', kind: '事件处理器', model: { context: '后台', item: 'open' } }] })
  for (const f of ['src/Login.tsx', 'src/push.ts']) write(B + '代码/伪代码/' + f + '.json', { file: f, blocks: [] })
  write('原料/坏的.json', '{ 这不是 JSON')   // 原料不看
}

const fails = []
let n = 0
function check(name, ok, detail) { n++; if (!ok) fails.push(name + (detail ? '\n    ' + String(detail).trim().split('\n').join('\n    ') : '')) }
// 弄坏一处，输出里要有这几个字，退出码 1
function broken(name, breakIt, ...words) {
  clean(); breakIt()
  const r = run()
  check(name, r.code === 1 && words.every((w) => r.out.includes(w)), r.out)
}

clean()
let r = run()
check('干净的项目：没查出毛病，退出码 0（原料里的不看；别的上下文的流程、连着写的几屏都认）', r.code === 0 && r.out.includes('没查出毛病'), r.out)
r = run('不存在')
check('上下文名写错了就说有哪几个', r.code === 1 && r.out.includes('后台'), r.out)
r = spawnSync(process.execPath, [path.join(__dirname, 'check.js'), path.join(P, '上下文')], { encoding: 'utf8' })
check('给的不是工作区就说用法', r.status === 1 && (r.stderr ?? '').includes('用法'))

broken('JSON 读不出', () => write(A + '界面/N-1.json', '{ "req": '), 'JSON 读不出', 'N-1.json')
broken('流程里规则号重复', () => edit(A + '业务/流程/01-开户.json', (d) => d.steps[1].rules = [{ id: 'r-1', text: 'y' }]), '规则号重复：r-1')
broken('屏的小样文件不在', () => fs.rmSync(path.join(P, A, '界面/N-1/b.html')), '屏 b 的小样文件不在')
broken('does 的 to 指不到屏', () => edit(A + '界面/N-1.json', (d) => d.views[0].screens[0].does[0].to = 'zz'), '指到的屏 zz')
broken('flow 那份流程不在', () => edit(A + '界面/N-1.json', (d) => d.flow = '09-没有'), '「09-没有」')
broken('step 那一步不在', () => edit(A + '界面/N-1.json', (d) => d.views[0].screens[1].step = 7), '没有第 7 步')
broken('一段流程时 step 带了流程名', () => edit(A + '界面/N-1.json', (d) => d.views[0].screens[0].step = '01-开户/1'), '只写步号')
broken('几段流程时 step 没带流程名', () => edit(B + '界面/N-2.json', (d) => d.views[0].screens[0].step = 1), '流程名/步号')
broken('小样里标的问题不在 asks 里', () => edit(A + '界面/N-1.json', (d) => d.views[0].screens[0].asks = []), 'data-ask="a-1"')
broken('清单项调的聚合不在', () => edit(A + '模型/g1/调动/清单.json', (d) => d.items[0].call.aggregate = '基金'), '聚合「基金」')
broken('清单项调的行为不在', () => edit(A + '模型/g1/调动/清单.json', (d) => d.items[1].call.behavior = '销号'), '行为「销号」')
broken('流程索引引的清单项不在', () => edit(A + '模型/g1/调动/01-开户.json', (d) => d.rows[0].ref = 'nope'), '清单项「nope」')
broken('流程索引对着的步不在', () => edit(A + '模型/g1/调动/01-开户.json', (d) => d.rows[1].trace.step = 9), '「手机 02-登录」里没有第 9 步')
broken('全图的线连着的不是聚合', () => edit(A + '模型/全图.json', (d) => d.edges[0].to = 'ghost'), '「ghost」不是这个上下文的聚合')
broken('聚合里 links 的一头不是成员', () => edit(A + '模型/g1/聚合/账户.json', (d) => d.links[0].to = 'gone'), 'gone 不是这个聚合的成员')
broken('结构指回的成员不在', () => edit(A + '代码/结构.json', (d) => d.files[0].model.member = 'entity'), '没有成员「entity」')
broken('结构指回的行为不在', () => edit(A + '代码/结构.json', (d) => d.files[0].model.behaviors = ['销号']), '没有行为「销号」')
broken('结构指回的清单项不在（指到别的上下文）', () => edit(B + '代码/结构.json', (d) => d.files[1].model.item = 'nope'), '清单项「nope」在后台的清单里没有')
broken('结构对着的屏不在', () => edit(A + '代码/结构.json', (d) => d.files[3].screen = 'N-1/a、N-1/zz'), '屏「N-1/zz」')
broken('聚合上的问题号重复（成员上一条、行为上一条）', () => edit(A + '模型/g1/聚合/账户.json', (d) => { d.members[0].asks = [{ id: 'a-1', q: '甲？', lean: '是' }]; d.members[0].behaviors[0].asks = [{ id: 'a-1', q: '乙？', lean: '否' }] }), '问题号重复：a-1', '账户.json')
broken('聚合上的问题没写问的是什么', () => edit(A + '模型/g1/聚合/账户.json', (d) => d.members[1].asks = [{ id: 'a-1', lean: '是' }]), '问题 a-1 没写问的是什么')
broken('伪代码上的问题号重复', () => write(A + '代码/伪代码/backend/src/change.ts.json', { file: 'backend/src/change.ts', blocks: [{ name: '换', steps: [], asks: [{ id: 'a-1', q: '甲？' }] }, { name: '查', steps: [], asks: [{ id: 'a-1', q: '乙？' }] }] }), '问题号重复：a-1', 'change.ts.json')
broken('伪代码上问题的 options 不是一串', () => write(A + '代码/伪代码/backend/src/change.ts.json', { file: 'backend/src/change.ts', blocks: [{ name: '换', steps: [], asks: [{ id: 'a-1', q: '甲？', options: '是' }] }] }), 'options 要写成一串')
broken('除了测试都要有伪代码', () => fs.rmSync(path.join(P, A, '代码/伪代码/backend/src/change.ts.json')), 'backend/src/change.ts：没有伪代码')

const G2 = A + '业务/概念/g2.json'
broken('子主题号重复', () => edit(G2, (d) => d.subs.push({ id: 'g2-1', title: '又一个' })), '子主题号重复：g2-1', 'g2.json')
broken('子主题号跟主题号撞了', () => { edit(G2, (d) => d.subs.push({ id: 'g1', title: '撞了' })); write(A + '业务/概念/g2/g1.json', { topic: 'g2', sub: 'g1' }) }, '子主题号 g1 跟全局图上的主题号撞了')
broken('子主题没有自己的概念文件', () => fs.rmSync(path.join(P, A, '业务/概念/g2/g2-2.json')), '子主题 g2-2（对账）没有自己的概念文件')
broken('子主题之间的线一头不是子主题', () => edit(G2, (d) => d.edges.push({ from: 'g2-1', to: 'g9', label: 'x' })), 'g9 不是这个主题的子主题')
broken('子文件夹里有图上没有的文件', () => write(A + '业务/概念/g2/g2-3.json', { topic: 'g2', sub: 'g2-3' }), '子主题图上没有 g2-3', 'g2-3.json')
broken('子主题文件的 sub 写错了', () => edit(A + '业务/概念/g2/g2-2.json', (d) => { d.sub = 'g2-1' }), 'sub 要写子主题号 g2-2', 'g2-2.json')
broken('主题没分子主题却有子文件夹', () => write(A + '业务/概念/g1/g1-1.json', { topic: 'g1', sub: 'g1-1' }), '概念/g1/ 下有子主题的文件', 'g1.json')

const M1 = A + '业务/模块业务/g1.json', fn1 = (d) => d.groups[0].functions[0]
broken('功能号重复', () => edit(M1, (d) => d.groups.push({ title: '卡', functions: [{ ...fn1(d), title: '又一项' }] })), '功能号重复：f-1', 'g1.json')
broken('核心数据指着没有的功能', () => edit(M1, (d) => { d.core = [{ title: '账户', why: '为什么', sources: [{ steps: [{ data: '申请', by: '照申请开立', fn: 'f-99' }] }], targets: [] }] }), '指着的功能 f-99 在这个主题里没有')
broken('核心数据的起点指着没有的功能', () => edit(M1, (d) => { d.core[0].sources = [{ heads: [{ steps: [{ data: '客户来电', event: true, by: '柜员记下', fn: 'f-98' }] }, { steps: [{ data: '客户上门', event: true, by: '柜员记下', fn: 'f-1' }] }], steps: [{ data: '开户表', by: '照开户表开立账户', fn: 'f-1' }] }] }), '指着的功能 f-98 在这个主题里没有')
broken('核心数据的去处写的主题对不上全局图', () => edit(M1, (d) => { d.core[0].targets.push({ by: '柜员记进总账', data: '总账', topic: '没有的主题' }) }), '来路或去处写的主题「没有的主题」不是全局图上的主题名')
broken('看板线上的 op 不是那三个词', () => edit(M1, (d) => { d.core[0].sources[0].steps[0].op = '新增' }), 'op 写的是「新增」：只能写创建、更新、删除')
broken('功能业务数据的 op 不是那三个词', () => edit(M1, (d) => { fn1(d).subject.op = '修改' }), '业务数据 op 写的是「修改」')
broken('功能没写业务数据', () => edit(M1, (d) => { delete fn1(d).subject }), '功能 f-1（开立账户）没写业务数据')
broken('功能没写操作意图', () => edit(M1, (d) => { fn1(d).intent = '' }), '没写操作意图')
broken('更细的目的落到的不是这个主题的核心数据', () => edit(M1, (d) => { d.purposes[0].needs[0].cores = ['总账'] }), '落到的「总账」不是这个主题的核心数据')
broken('更细的目的落到的功能没有', () => edit(M1, (d) => { d.purposes[0].needs[0].fns = ['f-77'] }), '落到的功能 f-77 在这个主题里没有')
clean(); edit(M1, (d) => { delete d.purposes })
r = run()
check('没写业务目的：只提醒', r.code === 0 && r.out.includes('没写业务目的（purposes）'), r.out)
clean(); edit(M1, (d) => { const p = d.purposes[0]; delete p.from; delete p.source; d.asks = []; p.needs[0].cores = [] })
r = run()
check('业务目的没写对着背景哪一句、没出处也没问人、核心数据没有目的落到它上面：只提醒', r.code === 0 && r.out.includes('没写它对着背景里的哪一句') && r.out.includes('没写出处（source），待定里也没有问人') && r.out.includes('核心数据「账户」没有哪一条更细的目的落到它上面'), r.out)
clean(); edit(M1, (d) => { delete d.purposes[0].source; d.asks = [{ id: 'q-9', q: '这条业务目的对不对？' }] })
r = run()
check('业务目的没出处、但待定里问着人：不提醒出处', r.code === 0 && !r.out.includes('没写出处（source）'), r.out)
clean(); edit(M1, (d) => { d.purposes[0].needs[0].cores = []; d.asks = [{ id: 'q-9', q: '账户接不上业务目的，它是为了什么？' }] })
r = run()
check('核心数据没有目的落到它上面、但待定里问着它：不提醒', r.code === 0 && !r.out.includes('没有哪一条更细的目的落到它上面'), r.out)
clean(); edit(A + '业务/全局图.json', (d) => { delete d.background })
r = run()
check('全局图没写背景：只提醒', r.code === 0 && r.out.includes('全局图没写背景（background）'), r.out)
broken('功能指着的流程步没有', () => edit(M1, (d) => { fn1(d).uses = [{ flow: '01-开户', step: 9 }] }), '「01-开户」第 9 步没有')
broken('功能指着的流程没有', () => edit(M1, (d) => { fn1(d).uses = [{ flow: '99-没有', step: 1 }] }), '「99-没有」在 业务/流程/ 下没有')
broken('要用到的数据没写名字', () => edit(M1, (d) => { fn1(d).in.push({ note: '没名字' }) }), '功能 f-1（开立账户）要用到的数据有一样没写名字')
clean(); edit(M1, (d) => { fn1(d).in = ['开户表', { title: '身份证' }] })
r = run()
check('要用到的数据没写解释或例子：只提醒，只写名字的旧写法也认', r.code === 0 && r.out.includes('要用到的「开户表」没写解释或例子') && r.out.includes('要用到的「身份证」没写解释或例子'), r.out)
clean(); edit(M1, (d) => { d.core.push({ title: '开户表', why: '也要留下', sources: [], targets: [] }); d.core[0].sources = [{ steps: [{ data: '客户上门', event: true, by: '柜员发一张开户表', fn: 'f-1' }, { data: '开户表', by: '照开户表开立账户', fn: 'f-1' }] }] })
r = run()
check('核心数据的来路中途经过另一样核心数据：只提醒', r.code === 0 && r.out.includes('来路中途经过了另一样核心数据「开户表」'), r.out)
clean(); edit(M1, (d) => { delete d.core[0].sources[0].steps[0].op; delete fn1(d).subject.op })
r = run()
check('线上和功能上没标做了什么：只提醒', r.code === 0 && r.out.includes('有 1 段没标做了什么（op）') && r.out.includes('业务数据没标做了什么（subject.op）'), r.out)
clean(); edit(M1, (d) => { d.core[0].sources[0].steps[0].op = '更新'; delete fn1(d).subject.edits; d.core[0].sources.push({ change: true, steps: [{ data: '客户改名', event: true, op: '更新', by: '柜员改户名', fn: 'f-1' }] }) })
r = run()
check('来路最后一步不是创建、标着 change 的来路、没列动了哪几项：只提醒', r.code === 0 && r.out.includes('最后一步是「更新」') && r.out.includes('标着 change') && r.out.includes('没列出动了业务数据的哪几项'), r.out)
clean(); edit(M1, (d) => { d.intro.concepts.push({ title: '开户表', note: '客户填的那一张' }, { title: '利率表', note: '照它算利息' }, { title: '户名', note: '账户上写的名字' }); d.uses = [{ title: '利率表' }]; d.core[0].parts = ['户名'] })
r = run()
check('核心概念在看板上找不到：只提醒；装着的、用到的资料算找得到', r.code === 0 && r.out.includes('核心概念「开户表」在核心数据的看板上找不到') && !r.out.includes('核心概念「利率表」') && !r.out.includes('核心概念「户名」'), r.out)
clean(); edit(M1, (d) => { delete d.intro })
r = run()
check('没写介绍：只提醒', r.code === 0 && r.out.includes('没写介绍（intro）'), r.out)
clean(); edit(M1, (d) => { delete d.intro.usual; d.intro.concepts = []; d.intro.users.push({ who: '主管', aim: '批' }) })
r = run()
check('介绍缺了哪几样、使用角色没写步骤：只提醒', r.code === 0 && r.out.includes('介绍缺了：核心概念（concepts）、一般怎么用（usual）') && r.out.includes('介绍里的「主管」没写按先后做哪几件事'), r.out)
broken('响应号重复', () => edit(M1, (d) => d.chains.push({ ...d.chains[0] })), '响应号重复：c-1')
broken('状态转换流程的线一头不是状态', () => edit(M1, (d) => d.workflows[0].moves.push({ from: 's-2', to: 's-9', label: 'x' })), 's-9 不是它的状态')
broken('更细的目的落到的响应没有', () => edit(M1, (d) => { d.purposes[0].needs[0].chains = ['c-9'] }), '落到的响应 c-9 在这个主题里没有')
broken('更细的目的落到的数据找不到', () => edit(M1, (d) => { d.purposes[0].needs[0].data = ['总账'] }), '落到的数据「总账」在概念图、核心概念和看板上都找不到')
broken('更细的目的和做法都没写', () => edit(M1, (d) => { const n = d.purposes[0].needs[0]; delete n.aim; delete n.text }), '既没写更细的目的（aim）也没写做法（text）')
broken('主要流程速览用到的功能没有', () => edit(M1, (d) => { d.tours = [{ title: '开一个户', note: '最常走的', steps: [{ by: '柜员', text: '照开户表开立账户', concepts: ['账户'], fns: ['f-1'] }, { by: '柜员', text: '发卡', fns: ['f-8'] }] }] }), '主要流程速览「开一个户」里用到的功能 f-8 在这个主题里没有')
broken('分段里的状态不是它的状态、分进两段、漏了一个', () => edit(M1, (d) => { d.workflows[0].states.push({ id: 's-3', title: '冻着' }); d.workflows[0].stages = [{ title: '前', states: ['s-1', 's-2'] }, { title: '后', states: ['s-2', 's-7'] }] }), '分段（stages）里的 s-7 不是它的状态', '状态 s-2 分进了不止一段', '状态 s-3 没有分进哪一段')
broken('概念的 fields 不是一列栏名', () => edit(A + '业务/概念/g1.json', (d) => { d.concepts[0].fields = '户名、开户日期' }), '概念「账户」的 fields 要写成一列栏')
clean(); edit(M1, (d) => { d.tours = [{ title: '开一个户', note: '最常走的', steps: [{ by: '柜员', text: '照开户表开立账户', concepts: ['账户'], fns: ['f-1'] }, { by: '发卡中心', text: '照账户制卡' }] }]; d.workflows[0].stages = [{ title: '前', states: ['s-1'] }, { title: '后', states: ['s-2'] }] })
r = run()
check('写了主要流程速览、分了段的状态图：查不出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
clean(); edit(M1, (d) => { delete d.purposes[0].needs[0].aim; d.purposes[0].needs[0].chains = []; d.groups[0].functions.push({ id: 'f-2', title: '销户', intent: '客户不再用这个账户的时候把它关掉', subject: { title: '这位客户的账户', op: '更新', to: '账户销了', edits: ['状态：开着 → 销了'] }, in: [], out: [] }) })
r = run()
check('没写更细的目的、功能和响应没挂上：只提醒', r.code === 0 && r.out.includes('没写更细的目的（aim）') && r.out.includes('有 1 项功能没有挂到哪一条更细的目的上：f-2') && r.out.includes('有 1 条响应没有挂到哪一条更细的目的上：c-1'), r.out)
clean(); edit(A + '业务/概念/g1.json', (d) => { d.concepts.push({ id: 'name', title: '户名' }, { id: 'card', title: '卡' }, { id: 'rate', title: '利率表' }); d.edges = [{ id: 'e1', from: 'acct', to: 'card', label: '装着', tree: true }] }); edit(M1, (d) => { d.core[0].parts = ['户名'] })
r = run()
check('parts 和上下层的线对不上、概念图上的概念业务里没出现：只提醒', r.code === 0 && r.out.includes('parts 里写着「户名」，概念图上没有用上下层的线') && r.out.includes('概念图上「卡」用上下层的线连在核心数据「账户」下面，它的 parts 里没写') && r.out.includes('概念图上的「卡、利率表」在这份业务里没有出现'), r.out)
clean(); edit(M1, (d) => { d.workflows[0].title = '账户的一生'; d.uses = [{ title: '利率表' }]; d.core[0].targets.push({ op: '创建', by: '柜员照账户请记账那边开一本分户账', data: '分户账', topic: '记账' }) })
r = run()
check('状态转换流程的名字对不上概念、用到的资料没写说明、交给别的主题的数据没写功能号：只提醒', r.code === 0 && r.out.includes('状态转换流程 w-1（账户的一生）的名字对不上任何一个概念') && r.out.includes('用到的资料「利率表」没写说明（note）') && r.out.includes('去到主题「记账」的「分户账」没写功能号（fn）'), r.out)
clean(); edit(A + '业务/概念/g1.json', (d) => { d.concepts.push({ id: 'form', title: '开户表' }) }); edit(M1, (d) => { d.intro.concepts.push({ title: '开户表', note: '客户填的那一张' }); d.core[0].sources[0].steps[0].data = '开户表'; delete d.core[0].sources[0].steps[0].event; fn1(d).subject.title = '照这张开户表开出来的账户'; fn1(d).source = '代码 src/account/open.ts' }); write(A + '业务/模块业务/g2.json', { topic: 'g2', title: '记账', groups: [{ title: '分户账', functions: [{ id: 'f-1', title: '开分户账', intent: '给新账户开一本分户账', subject: { title: '分户账', op: '创建', to: '分户账开好', edits: ['余额：记下 0'] }, in: [], out: [], source: '代码 src/account/open.ts' }] }] })
r = run()
check('业务数据名字里不止一个概念名、出处和别的主题的功能是同一个代码文件：只提醒', r.code === 0 && r.out.includes('认得出不止一个概念名：账户、开户表') || r.out.includes('认得出不止一个概念名：开户表、账户'), r.out)
check('出处和别的主题的功能是同一个代码文件：提醒里写着文件和主题', r.out.includes('的出处 src/account/open.ts 也是别的主题（g2）里功能的出处'), r.out)
clean(); edit(M1, (d) => { fn1(d).subject.title = '已发邮件（消息通知）'; d.intro.concepts.push({ title: '已发邮件', note: '发出去的一封' }, { title: '消息通知', note: '别的主题' }); d.uses = [{ title: '已发邮件', note: '发出去的一封' }, { title: '消息通知', note: '别的主题' }] })
r = run()
check('业务数据名字后面括号里的主题名不算概念名', r.code === 0 && !r.out.includes('认得出不止一个概念名'), r.out)
broken('概念的栏是对象却没写 title', () => edit(A + '业务/概念/g1.json', (d) => { d.concepts[0].fields = ['户名', { note: '开户的那一天' }] }), '概念「账户」的 fields 要写成一列栏')
clean(); edit(A + '业务/概念/g1.json', (d) => { d.concepts[0].fields.push('状态（开着、销了）') }); edit(M1, (d) => { fn1(d).subject.edits = ['账户 › 户名：照开户表记下', '账户 › 开户日期：记下当天', '账户 › 余额、利率：记下 0', '卡 › 卡号：照号段发一个'] })
r = run()
check('栏名带括号、edits 里的栏名在概念的栏里找不到：只提醒', r.code === 0 && r.out.includes('概念「账户」的栏名带括号：状态（开着、销了）') && r.out.includes('的 edits 里「账户 › 余额、利率」的栏名在那个概念的栏（fields）里找不到'), r.out)
check('edits 里对得上的栏、这个主题的概念图上没有的概念：不提醒', !r.out.includes('账户 › 户名') && !r.out.includes('账户 › 开户日期') && !r.out.includes('卡 › 卡号'), r.out)
clean(); edit(M1, (d) => { delete d.purposes[0].needs[0].source; d.asks = [] })
r = run()
check('更细的目的没出处也没问人：只提醒', r.code === 0 && r.out.includes('有 1 条更细的目的没写出处（source），待定里也没有问人'), r.out)
clean(); edit(M1, (d) => { delete d.purposes[0].needs[0].source })
r = run()
check('更细的目的没出处、但待定里问着人：不提醒', r.code === 0 && !r.out.includes('条更细的目的没写出处'), r.out)
clean(); edit(A + '业务/概念/g1.json', (d) => { d.concepts.push({ id: 'slip', title: '回单' }) }); edit(M1, (d) => { d.concepts = [{ title: '回单', actions: [] }] })
r = run()
check('只列在模块文件 concepts 里的概念，算在这份业务里出现了', r.code === 0 && !r.out.includes('在这份业务里没有出现'), r.out)
broken('模块业务的待定号重复', () => edit(M1, (d) => d.asks.push({ id: 'q-1', q: '又一个？' })), '问题号重复：q-1', 'g1.json')
broken('模块业务的主题号写错', () => edit(M1, (d) => { d.topic = 'g2' }), 'topic 要写主题号 g1')
broken('模块业务的文件不是全局图上的主题', () => write(A + '业务/模块业务/g7.json', { topic: 'g7', groups: [] }), 'g7 不是全局图上的主题')
broken('流程的主题不在全局图上', () => edit(A + '业务/流程/01-开户.json', (d) => { d.topic = 'g9' }), 'topic 写的 g9 不是全局图上的主题')
broken('出口接的步没有', () => edit(A + '业务/流程/01-开户.json', (d) => { d.exits[0].step = 7 }), '出口「开好了去存钱」接的第 7 步这一份里没有')
broken('出口那一头没写回来', () => edit(A + '业务/流程/g1-02-存钱.json', (d) => { d.entries = [] }), '出口接着「g1-02-存钱」，那一份的 entries 里没写回到「01-开户」')
broken('入口写的流程没有', () => edit(A + '业务/流程/g1-02-存钱.json', (d) => { d.entries[0].flow = '00-没有' }), '入口「开好了户」写的流程「00-没有」')
broken('alt 的步没写 case', () => edit(A + '业务/流程/g1-02-存钱.json', (d) => { delete d.steps[1].case }), '第 1a 步写了 alt，没写 case')
clean(); edit(A + '业务/流程/01-开户.json', (d) => { delete d.topic })
r = run()
check('流程没写 topic：只提醒', r.code === 0 && r.out.includes('提醒') && r.out.includes('没写 topic'), r.out)
clean(); edit(A + '业务/概念/g1.json', (d) => { d.concepts = [{ id: 'a', title: '账户' }, { id: 'b', title: '卡' }]; d.edges = [{ id: '1', from: 'a', to: 'b', label: '开了发卡' }, { id: '2', from: 'b', to: 'a', label: '卡挂在账户下' }] })
r = run()
check('同样两样数据之间两条线：提醒并成一条', r.code === 0 && r.out.includes('a ↔ b 之间有 2 条线'), r.out)

// —— 拆过的写法：主题的模块文件写了顶层 rules，才查规则、行为、服务这一层 ——
clean(); edit(M1, (d) => { delete fn1(d).subject.edits; fn1(d).calls = [] })
r = run()
check('写了 calls 的功能（哪怕是空的一列）：不提醒没列 subject.edits', r.code === 0 && r.out.includes('没查出毛病'), r.out)
clean(); edit(M1, (d) => { delete fn1(d).subject.edits })
r = run()
check('没写 calls 的功能：照旧提醒没列 subject.edits', r.code === 0 && r.out.includes('功能 f-1（开立账户）没列出动了业务数据的哪几项（subject.edits）'), r.out)
clean(); edit(M1, (d) => {
  d.core[0].keeps = ['r-91']
  d.core[0].actions = [{ id: 'act-1', title: '开立', rules: ['r-92'], for: '9.9', steps: [{ text: '记下户名', on: ['没有的名字'] }] }, { id: 'act-1', title: '又一个' }]
  fn1(d).rules = ['r-93']; fn1(d).services = ['s-9']
  Object.assign(d.chains[0], { rules: ['r-94'], calls: ['act-9'], callsWhen: { 'act-8': '账户开着' } })
  d.services = [{ id: 's-1', title: '取号', rules: ['r-95'], for: '7' }, { id: 's-1', title: '又取号' }]
  d.workflows[0].moves[0].act = 'act-7'
  d.concepts = [{ title: '账户', keeps: ['r-96'], actions: [{ id: 'act-1', title: '又一个', rules: ['r-97'], for: '9.9' }] }, { keeps: [] }]
})
r = run()
check('没写顶层 rules 的主题：规则、行为、服务这一层一条都不查（顶层 concepts 也不查）', r.code === 0 && r.out.includes('没查出毛病'), r.out)

const C1 = A + '业务/概念/g1.json'
const EX = [{ given: '开户表上户名没填', when: '柜员开立账户', then: '开不了，告诉柜员缺户名' }]
// 在干净的小项目上把 g1 改成拆过的写法：目的写了固定的号（p-1、p-1.1），for 照号写。
// 开户表不是核心数据、但自己有状态（交来了、办结了）：它列在顶层 concepts 里，有自己的 keeps 和一个行为 act-4，功能 f-1 叫这个行为
function split() {
  clean()
  edit(C1, (d) => { d.concepts.push({ id: 'form', title: '开户表', fields: ['状态'] }); d.edges.push({ id: '1', from: 'acct', to: 'form', label: '照哪一张开户表开的', tree: true }) })
  edit(C1, (d) => { d.concepts[0].fields = [{ title: '户名', note: '账户上写的名字', for: 'p-1', why: '钱记到人头上，要知道是谁的' }, { title: '开户日期', note: '柜员照开户表开立账户的那一天', for: 'p-1.1', why: '知道从哪一天起可以存钱' }, { title: '客户', note: '这个账户是谁的', ref: '客户档案', topic: '客户' }] })
  edit(M1, (d) => {
    d.rules = [
      { id: 'r-1', kind: '做之前要满足的', short: '检查开户表，填全了才能开', text: '开户表上的每一栏都填了，才能开立账户。', source: '人 2026-01-05 说', for: 'p-1.1', why: '账户要记到人头上', examples: EX },
      { id: 'r-2', kind: '一直要守的', short: '户名不能空', text: '账户的户名一直不能是空的。', source: '人 2026-01-05 说', for: 'p-1', examples: EX },
      { id: 'r-3', kind: '状态能不能走', short: '检查状态，开着才能销', text: '账户开着才能销户。', source: '人 2026-01-05 说', for: 'p-1.1', examples: [{ given: '账户已经销了', when: '柜员再销一次', then: '销不了' }] },
      { id: 'r-4', kind: '怎么算的', short: '定出账号，照开户的日子和当天的序号', text: '账号是开户的日子加上当天的序号。', source: '人 2026-01-05 说', for: 'p-1.1', items: ['日子写成八位数字', '序号从 1 起，一天之内不重'] },
      { id: 'r-5', kind: '做之前要满足的', short: '检查账户，开着才发卡', text: '账户开着才给它发卡。', source: '人 2026-01-05 说', examples: [{ given: '账户销了', when: '账户已开的消息到了', then: '不发卡' }] },
      { id: 'r-6', kind: '一直要守的', short: '开户表办结以后不改', text: '开户表办结以后，上面的内容不再改。', source: '人 2026-01-05 说', examples: [{ given: '开户表已经办结了', when: '柜员改上面的户名', then: '改不了' }] },
      { id: 'r-7', kind: '状态能不能走', short: '检查开户表的状态，交来了才能办结', text: '开户表交来了才能办结。', source: '人 2026-01-05 说', examples: [{ given: '开户表已经办结了', when: '柜员再办结一次', then: '办不了' }] }]
    d.core[0].keeps = ['r-2']
    d.core[0].parts = ['开户表']
    d.concepts = [{ title: '开户表', keeps: ['r-6'], actions: [
      { id: 'act-4', title: '走到办结了', from: '交来了', to: '办结了', for: 'p-1.1', why: '照它开好了账户的开户表不再办第二次', does: '账户开好以后，把这张开户表记成办结了', rules: ['r-7'], edits: ['状态：交来了 → 办结了'], steps: [{ text: '把状态改成办结了', on: ['状态'] }] }] }]
    d.core[0].actions = [
      { id: 'act-1', title: '开立', to: '开着', for: 'p-1.1', why: '客户来了就能存', does: '照开户表记下户名，账户开着', rules: [], in: [{ title: '开户表', note: '客户填好交来的那一张' }],
        edits: ['户名：照开户表记下', '开户日期: 记下当天'], out: [{ kind: '事件', title: '账户已开：带着户名和开户日期' }],
        steps: [{ text: '记下户名和开户日期', on: ['户名', '开户日期'] }, { text: '告知账户已开', on: ['账户已开'] }] },
      { id: 'act-2', title: '记下发了卡', for: 'p-1', does: '记下这个账户发了一张卡', rules: [], out: [{ kind: '新记录', title: '卡' }], steps: [{ text: '记下发的那一张卡', on: ['卡'] }] },
      { id: 'act-3', title: '走到销了', from: '开着', to: '销了', for: 'p-1.1', does: '账户销了，不能再存钱', rules: ['r-3'], edits: ['状态：开着 → 销了'], steps: [{ text: '把状态改成销了', on: ['状态'] }] }]
    const f = fn1(d)
    delete f.subject.edits
    Object.assign(f, { who: '柜员', rules: ['r-1'], services: ['s-1'], calls: ['act-1', 'act-4'], out: [{ kind: '通知', title: '开户通知:告诉客户账号' }],
      steps: [{ text: '取一个新的账号' }, { call: { topic: '客户', title: '查客户档案' }, text: '调用客户的功能：查客户档案' }, { text: '通知客户账户开好了', on: ['开户通知'] }] })
    d.groups[0].functions.push({ id: 'f-2', title: '销户', intent: '客户不再用这个账户的时候把它关掉', subject: { title: '这位客户的账户', op: '更新', to: '账户销了' }, in: [], out: [],
      rules: ['客户本人来才能销'], calls: ['act-3'], steps: [{ text: '核对来的人是客户本人' }] })
    d.purposes[0].id = 'p-1'
    Object.assign(d.purposes[0].needs[0], { id: 'p-1.1', fns: ['f-1', 'f-2'] })
    Object.assign(d.chains[0], { rules: ['r-5'], calls: ['act-2'] })
    d.services = [{ id: 's-1', title: '取一个新的账号', does: '给新开的账户取一个不重的账号', for: 'p-1.1', why: '每个账户要认得出来', in: [{ title: '开户的日子', note: '柜员开立账户的那一天' }], rules: ['r-4'], steps: [{ text: '照当天已经开出的账户数往后排一个' }], returns: '账号' }]
    d.workflows[0].moves[0].act = 'act-3'
    d.workflows.push({ id: 'w-2', title: '开户表', states: [{ id: 's-1', title: '交来了' }, { id: 's-2', title: '办结了' }], moves: [{ from: 's-1', to: 's-2', label: '账户开好了', act: 'act-4' }] })
  })
}
const fn2 = (d) => d.groups[0].functions[1], act = (d, i) => d.core[0].actions[i]
// 顶层 concepts 里的那个概念（开户表）和它的行为；整个主题的行为：核心数据的和概念的
const con = (d) => d.concepts[0], cact = (d) => d.concepts[0].actions[0], acts = (d) => [...d.core[0].actions, ...d.concepts.flatMap((k) => k.actions ?? [])]
// 在拆过的写法上弄坏一处：退出码 1，输出里要有这几个字
function brokenS(name, breakIt, ...words) {
  split(); breakIt()
  const r = run()
  check(name, r.code === 1 && words.every((w) => r.out.includes(w)), r.out)
  return r
}
// 在拆过的写法上改一处，只该出提醒：退出码 0，输出里要有这几个字
function warnS(name, changeIt, ...words) {
  split(); changeIt()
  const r = run()
  check(name, r.code === 0 && words.every((w) => r.out.includes(w)), r.out)
  return r
}

split()
r = run()
check('拆过的写法（顶层 rules、keeps 和行为、功能的 rules 和 calls 和 steps、响应的 rules 和 calls、服务、moves 的 act、概念的栏带 for、顶层 concepts 里一个有自己的 keeps 和行为的概念）：没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
brokenS('拆过的主题：规则号重复', () => edit(M1, (d) => d.rules.push({ ...d.rules[0] })), '规则号重复：r-1', '模块业务/g1.json')
brokenS('拆过的主题：行为号重复（两样核心数据下各一个，整个主题里算）', () => edit(M1, (d) => d.core.push({ title: '卡', why: '发给客户取钱用的', sources: [], targets: [], actions: [{ ...act(d, 0) }] })), '行为号重复：act-1')
brokenS('拆过的主题：服务号重复', () => edit(M1, (d) => d.services.push({ ...d.services[0] })), '服务号重复：s-1')
brokenS('规则的 kind 不是那四种、没写 kind', () => edit(M1, (d) => { d.rules[0].kind = '检查'; delete d.rules[1].kind }), '规则 r-1 的 kind 写的是「检查」：只能写一直要守的、做之前要满足的、状态能不能走、怎么算的', '规则 r-2 没写 kind：只能写')
brokenS('拆过的主题：功能的步骤里接着办的功能不存在', () => edit(M1, (d) => { fn1(d).steps = [...(fn1(d).steps ?? []), { fn: 'f-9', text: '接着办销户' }] }), '的步骤里接着办的功能 f-9 在这个主题里没有')
brokenS('核心数据的 keeps 里挂着没有的规则', () => edit(M1, (d) => d.core[0].keeps.push('r-91')), '核心数据「账户」的 keeps 里挂着的规则 r-91 在这个主题的 rules 里没有')
brokenS('行为的 rules 里挂着没有的规则', () => edit(M1, (d) => act(d, 0).rules.push('r-92')), '行为 act-1（开立）的 rules 里挂着的规则 r-92 在这个主题的 rules 里没有')
brokenS('响应的 rules 里挂着没有的规则', () => edit(M1, (d) => d.chains[0].rules.push('r-93')), '响应 c-1（开了以后）的 rules 里挂着的规则 r-93 在这个主题的 rules 里没有')
brokenS('服务的 rules 里挂着没有的规则', () => edit(M1, (d) => d.services[0].rules.push('r-94')), '服务 s-1（取一个新的账号）的 rules 里挂着的规则 r-94 在这个主题的 rules 里没有')
brokenS('功能的 rules 里挂着没有的规则', () => edit(M1, (d) => fn1(d).rules.push('r-95')), '功能 f-1（开立账户）的 rules 里挂着的规则 r-95 在这个主题的 rules 里没有')
r = brokenS('行为的 rules 里不是「r-数字」样子的话也当规则号查；功能的 rules 里的旧话不查', () => edit(M1, (d) => { act(d, 0).rules.push('开着才能改'); fn1(d).rules.push('一位客户只开一个账户') }), '行为 act-1（开立）的 rules 里写的「开着才能改」不是这个主题的规则号：这里只挂规则号，规则的话写在顶层 rules 里')
check('功能的 rules 里的旧话不报', !r.out.includes('一位客户只开一个账户') && !r.out.includes('客户本人来才能销') && r.out.includes('1 处错，0 处提醒'), r.out)
brokenS('规则没有挂在任何一处：并成一条说', () => edit(M1, (d) => { d.rules.push({ id: 'r-9', kind: '怎么算的', short: '定出利息', examples: EX }); d.core[0].keeps = [] }), '有 2 条规则没有挂在任何一处：r-2、r-9。规则挂在做它的那一个上')
brokenS('功能叫的行为不存在', () => edit(M1, (d) => fn1(d).calls.push('act-9')), '功能 f-1（开立账户）叫的行为 act-9 在这个主题里没有')
brokenS('响应叫的行为不存在', () => edit(M1, (d) => d.chains[0].calls.push('act-8')), '响应 c-1（开了以后）叫的行为 act-8 在这个主题里没有')
r = brokenS('响应的 callsWhen 的键不是存在的行为号', () => edit(M1, (d) => Object.assign(d.chains[0], { alt: true, calls: ['act-2', 'act-3'], callsWhen: { 'act-2': '账户还开着', 'act-7': '账户已经销了' } })), '响应 c-1（开了以后）的 callsWhen 里写的 act-7 不是这个主题的行为号')
check('callsWhen 里存在的行为号不报', !r.out.includes('callsWhen 里写的 act-2') && r.out.includes('1 处错，0 处提醒'), r.out)
brokenS('功能用的服务不存在', () => edit(M1, (d) => fn1(d).services.push('s-9')), '功能 f-1（开立账户）用的服务 s-9 在这个主题里没有')
brokenS('状态转换流程的线指着的行为不存在', () => edit(M1, (d) => { d.workflows[0].moves[0].act = 'act-9' }), '状态转换流程 w-1（账户）的线 s-1 → s-2 指着的行为 act-9 在这个主题里没有')
// —— 顶层 concepts：不是核心数据、但自己有状态的概念，它的 keeps 和行为跟核心数据的一样查 ——
brokenS('行为号重复：核心数据的行为和概念的行为一起算', () => edit(M1, (d) => con(d).actions.push({ id: 'act-1', title: '又一个' })), '行为号重复：act-1')
brokenS('概念的 keeps 里挂着没有的规则', () => edit(M1, (d) => con(d).keeps.push('r-96')), '概念「开户表」的 keeps 里挂着的规则 r-96 在这个主题的 rules 里没有')
brokenS('概念的行为的 rules 里挂着没有的规则', () => edit(M1, (d) => cact(d).rules.push('r-97')), '行为 act-4（走到办结了）的 rules 里挂着的规则 r-97 在这个主题的 rules 里没有')
r = brokenS('只挂在概念的 keeps、概念的行为的 rules 上的规则，从这两处拿掉就没有挂在任何一处', () => edit(M1, (d) => { con(d).keeps = []; cact(d).rules = [] }), '有 2 条规则没有挂在任何一处：r-6、r-7。规则挂在做它的那一个上：核心数据或者概念的 keeps，或者行为、响应、服务、功能的 rules')
check('规则从概念上拿掉：只报这一处', r.out.includes('1 处错，0 处提醒'), r.out)
split(); edit(M1, (d) => Object.assign(d.chains[0], { alt: true, calls: ['act-2', 'act-4'], callsWhen: { 'act-2': '账户还开着', 'act-4': '开户表还没办结' } }))
r = run()
check('响应的 calls 和 callsWhen 指着概念的行为：算在，没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
r = brokenS('概念的行为从 concepts 里拿掉：功能的 calls、状态转换流程的线指着的就不在了', () => edit(M1, (d) => { con(d).actions = [] }), '功能 f-1（开立账户）叫的行为 act-4 在这个主题里没有', '状态转换流程 w-2（开户表）的线 s-1 → s-2 指着的行为 act-4 在这个主题里没有')
warnS('概念的行为没有哪项功能或响应叫它：只提醒', () => edit(M1, (d) => { fn1(d).calls = ['act-1'] }), '有 1 个行为没有哪项功能或响应叫它（不在任何 calls 里）：act-4（走到办结了）', '0 处错，1 处提醒')
brokenS('概念的行为的 for 指着的号不存在', () => edit(M1, (d) => { cact(d).for = 'p-9.9' }), '行为 act-4（走到办结了）的 for 写的是「p-9.9」，主题 g1 的业务目的（purposes）里没有这个号的目的')
warnS('概念的行为的 steps[].on 对不上它自己的 edits 和 out：只提醒', () => edit(M1, (d) => { cact(d).steps[0].on = ['状态', '办结日期'] }), '有 1 处步骤（steps）的 on 里写的名字对不上副作用：行为 act-4（走到办结了）的「办结日期」。', '0 处错，1 处提醒')
warnS('concepts 里的名字在这个主题的概念图里找不到：只提醒', () => edit(M1, (d) => { con(d).title = '开户申请' }), '顶层 concepts 里的「开户申请」在这个主题的概念图里找不到这个名字的概念：title 写它在概念图里的名字', '0 处错，1 处提醒')
r = brokenS('concepts 里的名字和一样核心数据同名', () => edit(M1, (d) => { con(d).title = '账户' }), '顶层 concepts 里的「账户」和核心数据同名：核心数据的行为（actions）和一直要守的规则（keeps）写在 core 里它自己那一项上')
check('concepts 里的名字和核心数据同名：只报这一处', r.out.includes('1 处错，0 处提醒'), r.out)
brokenS('concepts 里有一项没写名字', () => edit(M1, (d) => { delete con(d).title }), '顶层 concepts 里有一项没写名字（title）')
// —— 目的的固定的号：业务目的 p-1，更细的目的 p-1.1；for 照号找目的 ——
// 再添的一条更细的目的、一条业务目的（不给号就不写 id）
const NEED2 = (id) => ({ ...(id ? { id } : {}), aim: '账户不用了能关掉', text: '客户本人来销户', source: '人 2026-01-05 说：不用了要能销', cores: ['账户'] })
const PUR2 = (id, needIds) => ({ id, text: '客户不用的账户能关掉', from: '银行替人存钱', source: '人 2026-01-05 说：不用了要能销', needs: needIds.map((k) => NEED2(k)) })
// 把拆过的小项目改回旧写法：目的不写号，for 照先后数（p-1.1 写回 1.1）
function splitOld() {
  split()
  const strip = (x) => { if (typeof x?.for === 'string') x.for = x.for.replace(/^p-/, '') }
  edit(C1, (d) => d.concepts[0].fields.forEach(strip))
  edit(M1, (d) => { for (const p of d.purposes) { delete p.id; for (const n of p.needs) delete n.id } [...d.rules, ...acts(d), ...d.services].forEach(strip) })
}
brokenS('规则的 for 指着的号没有哪一条目的用', () => edit(M1, (d) => { d.rules[0].for = 'p-1.2' }), '规则 r-1 的 for 写的是「p-1.2」，主题 g1 的业务目的（purposes）里没有这个号的目的：for 写的是一条业务目的的号（id）或者一条更细的目的的号（id）')
brokenS('行为、服务的 for 指着的号不存在、写的不是号', () => edit(M1, (d) => { act(d, 0).for = 'p-2'; d.services[0].for = '头一条' }), '行为 act-1（开立）的 for 写的是「p-2」，主题 g1 的业务目的（purposes）里没有这个号的目的', '服务 s-1（取一个新的账号）的 for 写的是「头一条」')
r = brokenS('概念的栏的 for 指着的号不存在：报在概念文件上', () => edit(C1, (d) => { d.concepts[0].fields[1].for = 'p-1.5' }), '概念「账户」的栏「开户日期」的 for 写的是「p-1.5」，主题 g1 的业务目的（purposes）里没有这个号的目的', '业务/概念/g1.json')
check('概念的栏的 for 写业务目的的号「p-1」：不报', !r.out.includes('栏「户名」') && r.out.includes('1 处错，0 处提醒'), r.out)
r = brokenS('目的写了号以后 for 不再照先后数：写「1.1」的指不到', () => edit(M1, (d) => { d.rules[0].for = '1.1' }), '规则 r-1 的 for 写的是「1.1」，主题 g1 的业务目的（purposes）里没有这个号的目的')
check('目的写了号以后只报指不到的那一处，不提醒「没写固定的号」', r.out.includes('1 处错，0 处提醒') && !r.out.includes('没写固定的号'), r.out)
split(); edit(M1, (d) => { d.purposes[0].needs.unshift(NEED2('p-1.2')) })
r = run()
check('在第 1 条业务目的的最前面插一条新的更细的目的（号用没用过的 p-1.2）：原来的 for 都还指得到，没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
split(); edit(M1, (d) => { d.purposes[0].needs.unshift(NEED2('p-1.2')); d.rules[2].for = 'p-1.2'; act(d, 2).for = 'p-1.2' })
r = run()
check('for 写新插的那一条的号 p-1.2：指得到，没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
r = brokenS('目的的号重复：两条业务目的用了同一个号', () => edit(M1, (d) => d.purposes.push(PUR2('p-1', ['p-1.2']))), '目的的号（id）重复：p-1。业务目的的号之间、更细的目的的号之间、这两种之间都不能重')
check('两条业务目的用了同一个号：只报这一处', r.out.includes('1 处错，0 处提醒'), r.out)
brokenS('目的的号重复：两条更细的目的用了同一个号', () => edit(M1, (d) => d.purposes[0].needs.push(NEED2('p-1.1'))), '目的的号（id）重复：p-1.1。')
brokenS('目的的号重复：一条业务目的和一条更细的目的用了同一个号', () => edit(M1, (d) => d.purposes.push(PUR2('p-1.1', ['p-1.1.1']))), '目的的号（id）重复：p-1.1。')
r = brokenS('有的目的写了号、有的没写', () => edit(M1, (d) => d.purposes[0].needs.push(NEED2())), '有的目的写了号（id）、有的没写，没写的有 1 条：第 1 条业务目的下面的第 2 条更细的目的。业务目的和更细的目的要写号就每一条都写')
check('有的目的写了号、有的没写：只报这一处', r.out.includes('1 处错，0 处提醒'), r.out)
broken('没拆过的主题（没写顶层 rules）也查目的的号：只有业务目的写了号', () => edit(M1, (d) => { d.purposes[0].id = 'p-1' }), '有的目的写了号（id）、有的没写，没写的有 1 条：第 1 条业务目的下面的第 1 条更细的目的。')
clean(); edit(M1, (d) => { d.purposes[0].id = 'p-1'; d.purposes[0].needs[0].id = 'p-1.1' })
r = run()
check('没拆过的主题、目的都写了号：没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)
warnS('更细的目的的号点前面不是它所在的业务目的的号：只提醒，并成一条说', () => edit(M1, (d) => d.purposes.push(PUR2('p-2', ['p-1.3', 'p-2.1', 'p-1.4']))),
  '有 2 条更细的目的的号（id）点前面不是它所在的业务目的的号：业务目的 p-2 下面的 p-1.3、业务目的 p-2 下面的 p-1.4。更细的目的的号是它所在的业务目的的号加一个点再加一段', '0 处错，1 处提醒')
warnS('目的的号不是「p-数字」「p-数字.数字」的样子：只提醒，并成一条说', () => edit(M1, (d) => d.purposes.push(PUR2('x-2', ['x-2.1', 'p-2.b']))),
  '有 3 条目的的号（id）不是规定的样子：第 2 条业务目的的「x-2」、第 2 条业务目的下面的第 1 条更细的目的的「x-2.1」、第 2 条业务目的下面的第 2 条更细的目的的「p-2.b」。业务目的的号写成「p-数字」，比如「p-1」「p-2」；更细的目的的号写成「p-数字.数字」',
  '有 1 条更细的目的的号（id）点前面不是它所在的业务目的的号：业务目的 x-2 下面的 p-2.b。', '0 处错，2 处提醒')
clean(); edit(M1, (d) => { d.purposes[0].id = '1'; d.purposes[0].needs[0].id = '1.1' })
r = run()
check('号写成纯数字「1」「1.1」：只提醒号不是规定的样子', r.code === 0 && r.out.includes('有 2 条目的的号（id）不是规定的样子：第 1 条业务目的的「1」、第 1 条业务目的下面的第 1 条更细的目的的「1.1」。') && r.out.includes('0 处错，1 处提醒'), r.out)
splitOld()
r = run()
check('旧写法（目的不写号，for 写「1.1」照先后数）：for 指得到，不算错；提醒给目的写上固定的号，一个主题一条',
  r.code === 0 && r.out.includes('有 11 处写了 for，而业务目的和更细的目的都没写固定的号（id）：for 现在是照先后数的，在中间插一条目的，后面的指向都会错位。给业务目的和更细的目的各写一个固定的号') && r.out.includes('0 处错，1 处提醒'), r.out)
splitOld(); edit(M1, (d) => { d.rules[0].for = '1.2' })
r = run()
check('旧写法：for 指着的更细的目的不存在，照先后数的话报', r.code === 1 && r.out.includes('规则 r-1 的 for 写的是「1.2」，主题 g1 的业务目的（purposes）里没有这一条：for 写成「业务目的的序号.更细的目的的序号」，从 1 数起') && r.out.includes('1 处错，1 处提醒'), r.out)
splitOld(); edit(M1, (d) => { d.purposes[0].needs.push(NEED2()); d.rules[2].for = '1.2'; act(d, 2).for = '1.2' })
r = run()
check('旧写法：for 写「1.2」、第 1 条业务目的下面有第 2 条更细的目的：指得到，只有「没写固定的号」那一条提醒', r.code === 0 && r.out.includes('没写固定的号') && r.out.includes('0 处错，1 处提醒'), r.out)
splitOld(); edit(C1, (d) => d.concepts[0].fields.forEach((x) => { delete x.for })); edit(M1, (d) => [...d.rules, ...acts(d), ...d.services].forEach((x) => { delete x.for }))
r = run()
check('旧写法、主题里没有东西写 for：不提醒「没写固定的号」', r.code === 0 && r.out.includes('没查出毛病'), r.out)
splitOld(); edit(M1, (d) => [...d.rules, ...acts(d), ...d.services].forEach((x) => { delete x.for }))
r = run()
check('旧写法、只有概念的栏写了 for：也提醒，报在模块文件上', r.code === 0 && r.out.includes('有 2 处写了 for，而业务目的和更细的目的都没写固定的号（id）') && r.out.includes('0 处错，1 处提醒'), r.out)
warnS('规则没有例子也没有 items：只提醒，并成一条说；只有 items 的不算', () => edit(M1, (d) => { delete d.rules[0].examples; d.rules[2].examples = [] }), '有 2 条规则没有例子（examples），也没有并着的几小条（items）：r-1、r-3。', '0 处错，1 处提醒')
warnS('规则的出处写在 from 里而没写 source：只提醒，并成一条说；两样都写了的不算', () => edit(M1, (d) => { for (const x of [d.rules[0], d.rules[1]]) { x.from = x.source; delete x.source } d.rules[2].from = '旧的出处' }),
  '有 2 条规则写了 from 而没写 source：r-1、r-2。规则的出处写在 source 里，和别处一样；from 是旧写法', '0 处错，1 处提醒')
warnS('行为没有哪项功能或响应叫它：只提醒，并成一条说', () => edit(M1, (d) => { d.chains[0].calls = []; fn2(d).calls = [] }), '有 2 个行为没有哪项功能或响应叫它（不在任何 calls 里）：act-2（记下发了卡）、act-3（走到销了）', '0 处错，1 处提醒')
warnS('功能、行为、服务的 steps[].on 对不上它自己的 edits 和 out：只提醒，并成一条说', () => edit(M1, (d) => { fn1(d).steps.push({ text: '发短信', on: ['开户通知', '短信'] }); act(d, 0).steps[0].on = ['户名', '余额']; act(d, 0).steps[1].on = ['账户已开：带着户名和开户日期']; d.services[0].steps[0].on = ['序号'] }),
  '有 3 处步骤（steps）的 on 里写的名字对不上副作用：功能 f-1（开立账户）的「短信」、行为 act-1（开立）的「余额」「账户已开：带着户名和开户日期」、服务 s-1（取一个新的账号）的「序号」。', '0 处错，1 处提醒')
split(); edit(M1, (d) => { fn2(d).subject.edits = ['销户日期：记下当天']; fn2(d).steps.push({ text: '记下销户的日子', on: ['销户日期'] }) })
r = run()
check('功能没有自己的 edits 时，steps[].on 对着 subject.edits 冒号前面的名字看：没查出毛病', r.code === 0 && r.out.includes('没查出毛病'), r.out)

clean(); write(A + '界面/N-1/旧的.html', '<p>没人用</p>')
r = run()
check('哪一屏都没用到的小样文件：只提醒，不算错', r.code === 0 && r.out.includes('提醒') && r.out.includes('旧的.html'), r.out)
clean(); edit(B + '界面/N-2.json', (d) => d.views[0].screens[0].does = [{ act: 'x', to: 'nope' }])
r = run('后台')
check('只查一个上下文时，别的上下文的毛病不报', r.code === 0, r.out)

fs.rmSync(P, { recursive: true, force: true })
if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
