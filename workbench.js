#!/usr/bin/env node
// 指挥的工作台：一个地址，可以开好几个项目；每个项目六页。项目管理页里的「总览」把开着的项目一页列全。
// 页面代码在 pages/<页名>/小样.html，数据从项目目录读出来注进去。
// 用法：node workbench.js <项目目录> [<项目目录>…] [--port 4870] [--now "2026-11-09 16:20"]
// 地址：/<项目目录名>/<页>；/ 跳到第一个项目的「谁在干什么」。小样里 const X = DATA.X ?? …：单开时 DATA 是空的、用写死的；工作台里 DATA 由 data/<页>.js 先定义。
// 按「定下」「答」是 POST <项目目录名>/api/…（小样里写的是相对地址 api/…），写回那个项目的文件。
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { pageData, applyAction, prototypes } = require('./lib/project.js')

const args = process.argv.slice(2)
const flagAt = (f) => args.indexOf(f)
const dirs = args.filter((a, i) => !a.startsWith('--') && !['--port', '--now'].includes(args[i - 1]))
if (!dirs.length || dirs.some((d) => !fs.existsSync(d))) { console.error('用法：node workbench.js <项目目录> [<项目目录>…] [--port 4870] [--now "…"]'); process.exit(1) }
// 项目目录名 → 绝对路径；地址里用目录名
const PROJECTS = {}
for (const d of dirs) PROJECTS[path.basename(path.resolve(d))] = path.resolve(d)
const FIRST = Object.keys(PROJECTS)[0]
const PORT = flagAt('--port') >= 0 ? Number(args[flagAt('--port') + 1]) : 4870
// --now '2026-11-09 16:20'：把「现在」钉在某个时刻，对着样板项目看页面用；平时不传。dirs 给项目管理页的总览列所有项目
const OPTS = { ...(flagAt('--now') >= 0 ? { now: args[flagAt('--now') + 1] } : {}), dirs: Object.values(PROJECTS) }

// 六页；地址栏用页名，页面代码在 pages/<页名>/小样.html
const PAGES = Object.fromEntries(['谁在干什么', '项目管理', '业务', '界面', '建模', '编码'].map((p) => [p, p]))
const samplePath = (page) => path.join(__dirname, 'pages', PAGES[page], '小样.html')

// 小样 → 工作台页面：小样引的 ../../lib/ 改成 /lib/，<script> 前插一个 data/<页>.js（相对地址，跟着项目前缀走）；顶栏、左边栏由 lib/shell.js 画
// ?view=<hash> 是给无头截图用的（截图时地址里的 # 带不过去）：页面脚本跑之前先把它写进 location.hash
function renderPage(page, view) {
  let html = fs.readFileSync(samplePath(page), 'utf8')
  html = html.split('../../lib/').join('/lib/')
  const pre = view ? `<script>location.hash = ${JSON.stringify(view)}</script>\n` : ''
  html = html.replace('<script>', `${pre}<script src="data/${encodeURIComponent(page)}.js"></script>\n<script>`)
  return html
}
// 原型开没开：对地址探一下，半秒不回就算没开；结果记几秒，翻页不用每次都等
const probed = new Map()
function probe(url) {
  const hit = probed.get(url)
  if (hit && Date.now() - hit.at < 5000) return hit.up
  const up = new Promise((ok) => {
    const req = http.get(url, { timeout: 500 }, (res) => { res.resume(); ok(true) })
    req.on('timeout', () => { req.destroy(); ok(false) })
    req.on('error', () => ok(false))
  })
  probed.set(url, { at: Date.now(), up })
  return up
}
const protosFor = async (proj) => Promise.all(prototypes(PROJECTS[proj]).map(async (p) => ({ ...p, up: await probe(p.url) })))
// 页面数据外加 WB：项目名、六页、这一页、地址前缀、各上下文的原型；shell 拿它画顶栏的真链接和「原型」入口
const dataFor = async (proj, page) => ({ ...pageData(PROJECTS[proj], page, OPTS), WB: { project: projectName(proj), pages: Object.keys(PAGES), current: page, base: '/' + encodeURIComponent(proj), protos: await protosFor(proj) } })
function projectName(proj) {
  try { return JSON.parse(fs.readFileSync(path.join(PROJECTS[proj], '项目.json'), 'utf8')).name ?? proj } catch { return proj }
}

const send = (res, code, body, type = 'text/html; charset=utf-8') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body) }
const redirect = (res, to) => { res.writeHead(302, { location: to }); res.end() }
const readBody = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)) })
const text = 'text/plain; charset=utf-8'

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const segs = url.pathname.slice(1).split('/').map(decodeURIComponent)
  try {
    // 框架文件
    if (req.method === 'GET' && segs[0] === 'lib' && segs.length === 2 && /^[\w.-]+\.(js|css)$/.test(segs[1])) {
      const p = path.join(__dirname, 'lib', segs[1])
      if (!fs.existsSync(p)) return send(res, 404, 'not found', text)
      return send(res, 200, fs.readFileSync(p, 'utf8'), (segs[1].endsWith('.css') ? 'text/css' : 'text/javascript') + '; charset=utf-8')
    }
    // 首页：第一个项目的「谁在干什么」
    if (req.method === 'GET' && segs[0] === '') return redirect(res, `/${encodeURIComponent(FIRST)}/${encodeURIComponent("谁在干什么")}`)
    // 一个项目：/<目录名>/<页>、/<目录名>/data/<页>.js、POST /<目录名>/api/<动作>
    const proj = segs[0]
    if (!PROJECTS[proj]) return send(res, 404, '没有这个项目：' + proj, text)
    if (req.method === 'GET' && segs.length === 1) return redirect(res, `/${encodeURIComponent(proj)}/${encodeURIComponent("谁在干什么")}`)
    if (req.method === 'GET' && segs.length === 2 && (segs[1] === '' || PAGES[segs[1]])) return send(res, 200, renderPage(segs[1] || '谁在干什么', url.searchParams.get('view')))
    if (req.method === 'GET' && segs[1] === 'data' && segs.length === 3 && segs[2].endsWith('.js')) {
      const page = segs[2].slice(0, -3)
      if (!PAGES[page]) return send(res, 404, 'no such page', text)
      return send(res, 200, `window.DATA = ${JSON.stringify(await dataFor(proj, page))}`, 'text/javascript; charset=utf-8')
    }
    if (req.method === 'POST' && segs[1] === 'api' && segs.length === 3) {
      const out = applyAction(PROJECTS[proj], segs[2], JSON.parse((await readBody(req)) || '{}'), OPTS)
      return send(res, 200, JSON.stringify(out), 'application/json; charset=utf-8')
    }
    send(res, 404, 'not found', text)
  } catch (e) {
    console.error(e)
    send(res, 500, String(e.stack ?? e), text)
  }
}).listen(PORT, '127.0.0.1', () => console.log(`工作台 http://localhost:${PORT}  项目 ${Object.values(PROJECTS).join('  ')}`))
