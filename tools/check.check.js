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

clean(); write(A + '界面/N-1/旧的.html', '<p>没人用</p>')
r = run()
check('哪一屏都没用到的小样文件：只提醒，不算错', r.code === 0 && r.out.includes('提醒') && r.out.includes('旧的.html'), r.out)
clean(); edit(B + '界面/N-2.json', (d) => d.views[0].screens[0].does = [{ act: 'x', to: 'nope' }])
r = run('后台')
check('只查一个上下文时，别的上下文的毛病不报', r.code === 0, r.out)

fs.rmSync(P, { recursive: true, force: true })
if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
