// 把六份小样里写死的数据按 README「一个项目长什么样」落成一个样板项目，工作台先对着它跑。
// 用法：node tools/export-fixture.js [目标目录]   默认 sample/
const fs = require('node:fs')
const path = require('node:path')
const { sampleData } = require('./sample-data.js')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, 'sample'))
const W = (d) => path.join(ROOT, 'pages', d)
const write = (rel, data) => {
  const p = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n')
  console.log('写', rel)
}
const CX = '上下文/样例系统/'

// 项目、上下文图、共享内核（上下文地图并在业务那份小样里）
const c = sampleData(W('业务'), ['PROJECT', 'EDGES'])
write('项目.json', c.PROJECT)
write('上下文图.json', { edges: c.EDGES })
write('共享内核/业务/概念.json', { concepts: c.PROJECT.kernel.concepts })

// 项目管理
const p = sampleData(W('项目管理'), ['需求', '日程'])
write('项目管理/需求.json', p.需求)
write('项目管理/日程.json', p.日程)

// 业务
const b = sampleData(W('业务'), ['MAP', 'CONCEPTS', 'FLOWS'])
write(CX + '业务/全局图.json', { ...b.MAP, topics: b.MAP.topics.map(({ tx, ty, ...t }) => t) })
for (const [id, cpt] of Object.entries(b.CONCEPTS)) write(CX + `业务/概念/${id}.json`, cpt)
for (const f of b.FLOWS) write(CX + `业务/流程/${f.file}.json`, f)

// 界面：一条需求一份 json（按视角分屏，屏的 decidedAt 就在里面），屏的 html 一个文件
const u = sampleData(W('界面'), ['REQS', 'MOCKS'])
for (const [cx, reqs] of Object.entries(u.REQS)) for (const r of reqs) {
  write(`上下文/${cx}/界面/${r.req}.json`, r)
  for (const v of r.views) for (const sc of v.screens) if (u.MOCKS[r.req + '/' + sc.id]) write(`上下文/${cx}/界面/${r.req}/${sc.file ?? sc.id + '.html'}`, u.MOCKS[r.req + '/' + sc.id])
}

// 建模
const m = sampleData(W('建模'), ['AGGS', 'CATALOG', 'MOVES'])
for (const a of m.AGGS) write(CX + `模型/${a.topic}/聚合/${a.title}.json`, a)
for (const [topic, items] of Object.entries(m.CATALOG)) write(CX + `模型/${topic}/调动/清单.json`, { items })
for (const mv of m.MOVES) write(CX + `模型/${mv.topic}/调动/${mv.file}.json`, mv)

// 编码
const e = sampleData(W('编码'), ['STRUCT', 'STRUCTURE', 'NAMING', 'ANSWERS', 'PSEUDO', 'CODE'])
write(CX + '代码/结构.json', e.STRUCT)
write(CX + '代码/规范/结构设计.json', e.STRUCTURE)
write(CX + '代码/规范/文件命名.json', e.NAMING)
write(CX + '代码/规范/技术选型.json', e.ANSWERS['技术选型'])
for (const [file, ps] of Object.entries(e.PSEUDO)) write(CX + `代码/伪代码/${file}.json`, { file, ...ps })
for (const [file, code] of Object.entries(e.CODE)) write(CX + `代码/${file}`, code.endsWith('\n') ? code : code + '\n')

// 指挥
const z = sampleData(W('谁在干什么'), ['SCENE', 'NOW_TS'])
const { today, ...scene } = z.SCENE
write('现场.json', scene)
write(`日志/${z.NOW_TS.slice(0, 10)}.jsonl`, today.map((r) => JSON.stringify(r)).join('\n') + '\n')
console.log('样板项目在', OUT)
