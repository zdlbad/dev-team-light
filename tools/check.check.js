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
broken('内部流程号重复', () => edit(M1, (d) => d.chains.push({ ...d.chains[0] })), '内部流程号重复：c-1')
broken('状态转换流程的线一头不是状态', () => edit(M1, (d) => d.workflows[0].moves.push({ from: 's-2', to: 's-9', label: 'x' })), 's-9 不是它的状态')
broken('更细的目的落到的内部流程没有', () => edit(M1, (d) => { d.purposes[0].needs[0].chains = ['c-9'] }), '落到的内部流程 c-9 在这个主题里没有')
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
check('没写更细的目的、功能和内部流程没挂上：只提醒', r.code === 0 && r.out.includes('没写更细的目的（aim）') && r.out.includes('有 1 项功能没有挂到哪一条更细的目的上：f-2') && r.out.includes('有 1 条内部流程没有挂到哪一条更细的目的上：c-1'), r.out)
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

clean(); write(A + '界面/N-1/旧的.html', '<p>没人用</p>')
r = run()
check('哪一屏都没用到的小样文件：只提醒，不算错', r.code === 0 && r.out.includes('提醒') && r.out.includes('旧的.html'), r.out)
clean(); edit(B + '界面/N-2.json', (d) => d.views[0].screens[0].does = [{ act: 'x', to: 'nope' }])
r = run('后台')
check('只查一个上下文时，别的上下文的毛病不报', r.code === 0, r.out)

fs.rmSync(P, { recursive: true, force: true })
if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
