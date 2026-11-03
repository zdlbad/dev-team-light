// 把一份小样的 <script> 在假 DOM 里跑一遍，把里面写死的数据常量取出来。
// 导出样板项目（tools/export-fixture.js）用它；工作台不用。
const fs = require('node:fs')
const path = require('node:path')

function fakeEl() {
  const el = {
    innerHTML: '', hidden: false, dataset: {}, style: {}, className: '', textContent: '', children: [], handlers: {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener(k, f) { el.handlers[k] = f }, appendChild() {}, removeChild() {}, remove() {},
    querySelector: () => fakeEl(), querySelectorAll: () => [], closest: () => null,
    clientWidth: 1200, clientHeight: 800, offsetWidth: 1200, scrollIntoView() {}, focus() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1200, height: 800 }) }
  return new Proxy(el, { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => undefined : undefined) })
}

// 取 names 里列的常量；脚本里引用的浏览器全局临时挂到 global 上，跑完摘掉
function sampleData(sampleDir, names, extra = {}) {
  const html = fs.readFileSync(path.join(sampleDir, '小样.html'), 'utf8')
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
  const els = {}
  const globals = {
    document: { getElementById: (id) => (els[id] ??= fakeEl()), querySelector: () => fakeEl(), querySelectorAll: () => [], createElement: () => fakeEl(), addEventListener() {}, body: fakeEl() },
    window: { addEventListener() {} }, location: { hash: '' }, innerWidth: 1400, innerHeight: 900,
    requestAnimationFrame: (f) => f(), prompt: () => null, Shell: require('../lib/shell.js').Shell, ...extra }
  const saved = {}
  for (const [k, v] of Object.entries(globals)) { saved[k] = global[k]; global[k] = v }
  try {
    return new Function(script + `\n;return { ${names.join(', ')} }`)()
  } finally {
    for (const k of Object.keys(globals)) { if (saved[k] === undefined) delete global[k]; else global[k] = saved[k] }
  }
}
module.exports = { sampleData }
