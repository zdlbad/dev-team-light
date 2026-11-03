// 指挥的眼睛：把工作台的一页无头截成 png，出图之后自己看一遍有没有遮挡、重叠、裁掉。
// 用法：node tools/shot.js <地址> <输出.png> [--w 1600] [--h 1000] [--wait 800]
//   地址可以带 #hash（页面里的视图），中文不用自己编码。
// 用机器上的 Edge（没有就找 Chrome）无头跑；--wait 是等页面画完的毫秒数。
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const pos = args.filter((a, i) => !a.startsWith('--') && !['--w', '--h', '--wait'].includes(args[i - 1]))
const opt = (f, d) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : d)
const [url, out] = pos
if (!url || !out) { console.error('用法：node tools/shot.js <地址> <输出.png> [--w 1600] [--h 1000] [--wait 800]'); process.exit(1) }

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe' ]
const exe = BROWSERS.find((p) => fs.existsSync(p))
if (!exe) { console.error('没找到 Edge 或 Chrome'); process.exit(1) }

// 无头截图时地址里的 # 带不到页面，改成 ?view=<hash>，工作台会在页面脚本跑之前写进 location.hash
const u = new URL(url)
if (u.hash) { u.searchParams.set('view', decodeURIComponent(u.hash.slice(1))); u.hash = '' }
const outPath = path.resolve(out)
fs.mkdirSync(path.dirname(outPath), { recursive: true })
const flags = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--window-size=${opt('--w', 1600)},${opt('--h', 1000)}`, `--virtual-time-budget=${opt('--wait', 800)}`, `--screenshot=${outPath}`, u.href]
try { execFileSync(exe, flags, { stdio: 'ignore', timeout: 30000 }) } catch (e) { console.error('截图失败', e.message); process.exit(1) }
console.log('截了', outPath)
