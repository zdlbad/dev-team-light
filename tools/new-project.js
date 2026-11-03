// 新起一个项目目录：node tools/new-project.js <目录> <项目名> <第一个上下文名> [原料目录]
// 只放空壳：项目.json、上下文图.json、现场.json、项目管理/、日志/、派工/；原料目录给了就整个复制到 原料/
const fs = require('node:fs')
const path = require('node:path')
const [dir, name, cx, raw] = process.argv.slice(2)
if (!dir || !name || !cx) { console.error('用法：node tools/new-project.js <目录> <项目名> <第一个上下文名> [原料目录]'); process.exit(1) }
const P = path.resolve(dir)
const w = (rel, data) => { const p = path.join(P, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n'); console.log('写', rel) }
if (fs.existsSync(path.join(P, '项目.json'))) { console.error('已经有项目了：' + P); process.exit(1) }
w('项目.json', { name, contexts: [{ id: 'c1', name: cx, role: '', c: 2 }], kernel: { concepts: [] } })
w('上下文图.json', { edges: [] })
w('现场.json', { now: [], decide: null, waiting: [] })
for (const d of ['项目管理', '日志', '派工', path.join('上下文', cx), '共享内核']) fs.mkdirSync(path.join(P, d), { recursive: true })
if (raw) { fs.cpSync(path.resolve(raw), path.join(P, '原料'), { recursive: true }); console.log('原料复制自', raw) }
fs.writeFileSync(path.join(P, '.gitignore'), '原料/\n')
console.log('项目在', P)
