// scene.js 的检查：在临时目录里起一个空项目，把每个命令跑一遍，看印出来的、现场.json、派工/、日志/ 对不对。
// 用法：node tools/scene.check.js   （全过退出码 0；有不过的列出来、退出码 1）
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SCENE = path.join(__dirname, 'scene.js')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-check-'))
const P = path.join(root, 'design')          // 工作区
const pad = (n) => String(n).padStart(2, '0')
const d = new Date(), today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const write = (rel, data) => { const p = path.join(P, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2)); return p }
const read = (rel) => JSON.parse(fs.readFileSync(path.join(P, rel), 'utf8'))
const logs = () => { const p = path.join(P, '日志', today + '.jsonl'); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [] }
const run = (...args) => { const r = spawnSync(process.execPath, [SCENE, P, ...args], { encoding: 'utf8' }); return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') } }
const brief = (name, data) => write(`_briefs/${name}.json`, data)

// 空项目：两个上下文，代码都在工作区上一层的 packages/ 里
write('现场.json', { now: [], waiting: [] })
write('上下文/后台/代码/结构.json', { base: '../packages', files: [{ path: 'backend/src/a.ts' }, { path: 'web/src/b.tsx' }] })
write('上下文/手机/代码/结构.json', { base: '../packages', files: [{ path: 'mobile/src/c.tsx' }] })
// 没写 base 的上下文：代码就在 上下文/<名>/代码/ 下
write('上下文/库内/代码/结构.json', { files: [{ path: 'src/d.ts' }] })

const fails = []
let n = 0
function check(name, ok, detail) { n++; if (!ok) fails.push(name + (detail ? '\n    ' + String(detail).trim().split('\n').join('\n    ') : '')) }

// —— dispatch ——
let r = run('dispatch', brief('biz', { role: '业务', context: '后台', task: 'N-1', stage: '业务', step: '画流程', reads: ['a'], writes: ['上下文/后台/业务/流程/01.json'], stop: '停' }))
check('dispatch：印派出和「现在就起」', r.code === 0 && r.out.includes('派出 业务') && r.out.includes(`派工/${today}-01.json`) && r.out.includes('现在就起业务'), r.out)
check('dispatch：现场多一项、派工书存一份、日志记派出', read('现场.json').now.length === 1 && read('现场.json').now[0].step === '画流程' && read(`派工/${today}-01.json`).role === '业务' && logs().at(-1).kind === '派出')
r = run('dispatch', brief('biz2', { role: '业务', context: '后台', step: '再来一件' }))
check('dispatch：同一个角色同一个上下文还在干就不让派', r.code === 1 && r.out.includes('还在干'), r.out)
r = run('dispatch', brief('biz3', { role: '业务', context: '手机', step: '另一个上下文的' }))
check('dispatch：同一个角色换一个上下文可以派', r.code === 0 && r.out.includes('同时在干'), r.out)
fs.writeFileSync(path.join(P, '派工', '备注.txt'), 'x')
r = run('dispatch', brief('ui', { role: 'UI 设计', context: '后台', step: '出小样', writes: ['上下文/后台/界面/N-1.json、N-1/'] }))
check('dispatch：序号接着当天最大的往下排，夹着别的文件也不撞', r.code === 0 && r.out.includes(`派工/${today}-03.json`), r.out)

// —— dispatch 提醒漏列伪代码 ——
const remind = (writes) => { const x = run('dispatch', brief('eng', { role: '软件工程师', context: '后台', step: '写代码', writes })); run('back', 'x', '--role', '软件工程师'); return x.out }
let o = remind(['../packages/backend/src/（只动账户模块）', '../packages/mobile/src/', '上下文/后台/代码/伪代码/'])
check('提醒：列了手机的代码、没列手机的伪代码', o.includes('提醒') && o.includes('手机') && !o.includes('后台的代码'), o)
o = remind([path.join(root, 'packages', 'mobile', 'src').split(path.sep).join('/') + '/', '上下文/后台/代码/伪代码/'])
check('提醒：代码写成完整路径也认得出', o.includes('提醒') && o.includes('手机'), o)
o = remind(['../packages/backend/src/', '../packages/mobile/src/', '上下文/后台/代码/伪代码/backend/', '上下文/手机/代码/'])
check('提醒：伪代码目录或者它的上一层列了就不提醒', !o.includes('提醒'), o)
o = remind(['上下文/后台/业务/流程/01.json', '../packages/别的/'])
check('提醒：没列代码、或者列的不是哪个上下文的代码，不提醒', !o.includes('提醒'), o)
o = remind(['上下文/库内/代码/src/d.ts'])
check('提醒：没写 base 的上下文，代码在工作区里也认', o.includes('提醒') && o.includes('库内'), o)
o = remind(['上下文/库内/代码/结构.json', '上下文/库内/代码/伪代码/src/d.ts.json'])
check('提醒：只写结构和伪代码不提醒', !o.includes('提醒'), o)

// —— back ——
r = run('back', '交了')
check('back：几个人在干时要 --role', r.code === 1 && r.out.includes('要 --role'), r.out)
r = run('back', '交了', '--role', '业务')
check('back：同一个角色在几个上下文都在干时要 --context', r.code === 1 && r.out.includes('要 --context'), r.out)
const asks = brief('asks', [{ q: '这一屏放哪些栏？', lean: '放三栏' }, { to: '业务', q: '这一步谁做？' }, { to: '你', q: '这个小样的 a-1 怎么办？' }])
r = run('back', '小样出了', '--role', 'UI 设计', '--asks', asks, '--files', 'a,b')
check('back：问人的进等你答，问上游的不进、印一行转给谁', r.code === 0 && r.out.includes('1 条转给 业务') && read('现场.json').waiting.length === 2 && read('现场.json').waiting.map((q) => q.id).join() === 'q-1,q-3', r.out)
check('back：问题带内部字眼就提醒', r.out.includes('q-3 带内部字眼') && r.out.includes('小样'), r.out)
check('back：日志记交回（带 files）和每条问，问上游的带 to', logs().filter((e) => e.kind === '问').length === 3 && logs().find((e) => e.q === 'q-2').to === '业务' && logs().find((e) => e.kind === '交回' && e.role === 'UI 设计').files.join() === 'a,b')
check('back：交回的角色从现场去掉，别人还在', read('现场.json').now.map((x) => x.role + x.context).join() === '业务后台,业务手机')

// —— upstream、--answers、answered ——
r = run('upstream')
check('upstream：列还开着的问上游的问题，按问谁分组', r.out.includes('问业务') && r.out.includes('q-2') && r.out.includes('UI 设计问') && !r.out.includes('q-1 '), r.out)
const before = logs().length
r = run('back', '答了', '--role', '业务', '--context', '后台', '--answers', 'q-2,q-9')
check('--answers：编号不在开着的里就报错，什么都不记', r.code === 1 && r.out.includes('q-9') && logs().length === before && read('现场.json').now.length === 2, r.out)
r = run('back', '答了', '--role', '业务', '--context', '后台', '--answers', 'q-2')
check('--answers：日志记一条答，role 是答的角色', r.code === 0 && logs().at(-1).kind === '答' && logs().at(-1).role === '业务' && logs().at(-1).q === 'q-2', r.out)
check('upstream：答了就不再列', run('upstream').out.includes('没有开着的'))
run('ask', brief('asks2', [{ to: '建模', q: '这个行为归谁？' }, { to: '业务', q: '这条规则怎么算？' }]), '--role', '软件工程师', '--context', '后台')
r = run('answered', 'q-4', '--role', '建模', '看了模型')
check('answered：事后补记答了', r.code === 0 && logs().at(-1).kind === '答' && logs().at(-1).role === '建模' && logs().at(-1).text.includes('看了模型'), r.out)
r = run('answered', 'q-4', '--role', '建模')
check('answered：答过的再记就报错', r.code === 1, r.out)
r = run('answered', 'q-5')
check('answered：要 --role', r.code === 1, r.out)

// —— ask、drop ——
r = run('ask', brief('asks3', [{ q: '先做哪一条？' }]), '--role', '指挥')
check('ask：不交回也能挂给人', r.code === 0 && read('现场.json').waiting.at(-1).role === '指挥' && r.out.includes('挂上 1'), r.out)
r = run('ask', brief('asks4', [{ q: 'x' }]))
check('ask：要 --role', r.code === 1, r.out)
r = run('drop', 'q-1', '挂到流程上了')
check('drop：撤等你答里的，日志记撤问', r.code === 0 && !read('现场.json').waiting.some((q) => q.id === 'q-1') && logs().at(-1).kind === '撤问' && logs().at(-1).q === 'q-1', r.out)
r = run('drop', 'q-5', '转给项目管理记成候选')
check('drop：也能撤还开着的问上游的问题', r.code === 0 && logs().at(-1).kind === '撤问' && logs().at(-1).q === 'q-5' && run('upstream').out.includes('没有开着的'), r.out)
r = run('drop', 'q-99', 'x')
check('drop：两边都没有的编号报错', r.code === 1 && r.out.includes('q-99'), r.out)

// —— done ——
write('项目管理/需求.json', { items: [{ id: 'N-1', title: '开账户' }] })
write('项目管理/日程.json', { milestones: [{ id: 'M1', items: [{ id: 'N-2', tasks: [{ id: 'N-2.1' }] }] }] })
r = run('done', 'N-1', '代码交回，测试过了，原型打得开')
check('done：日志记一条做完，带任务编号', r.code === 0 && logs().at(-1).kind === '做完' && logs().at(-1).task === 'N-1' && logs().at(-1).role === '指挥', r.out)
r = run('done', 'N-1')
check('done：记过的再记就报错', r.code === 1 && r.out.includes('已经记过'), r.out)
check('done：日程里的任务编号也认', run('done', 'N-2.1').code === 0)
r = run('done', 'N-9')
check('done：清单和日程里都没有的编号报错', r.code === 1 && r.out.includes('N-9'), r.out)
check('done：要说哪个任务', run('done').code === 1)

// —— show、pending 之外的 ——
const sc = read('现场.json'); sc.now.push({ role: '建模', context: '后台', step: '老的一件', since: '2020-01-01 08:00' }); write('现场.json', sc)
r = run('show')
check('show：一行一个在干的角色，派出很久的标出来', r.out.includes('建模（后台） 在干') && r.out.includes('很久了') && r.out.split('\n').find((l) => l.startsWith('业务（手机）')) && !r.out.split('\n').find((l) => l.startsWith('业务（手机）')).includes('很久了'), r.out)
check('show：后面照旧是整份现场', (() => { try { return JSON.parse(r.out.slice(r.out.indexOf('{'))).now.length === 2 } catch { return false } })(), r.out)
r = run('没有的命令')
check('不认识的命令报错', r.code === 1, r.out)

fs.rmSync(root, { recursive: true, force: true })
if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
