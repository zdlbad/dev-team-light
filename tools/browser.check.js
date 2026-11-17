// tools/browser.js 的检查：三个系统上各找得到装在常见位置的浏览器；环境变量优先；都没有时说清楚怎么办。
// 用法：node tools/browser.check.js   （全过退出码 0）
const { findBrowser, candidates, ENV } = require('./browser.js')
const fails = []
let n = 0
function check(name, ok, detail) { n++; if (!ok) fails.push(name + (detail ? '\n    ' + JSON.stringify(detail) : '')) }
const has = (...ps) => (p) => ps.includes(p)
// Windows 的路径用反斜杠：这里拿 w() 拼，不在源码里写反斜杠
const w = (...parts) => parts.join(String.fromCharCode(92))
const WIN = { 'ProgramFiles(x86)': w('C:', 'Program Files (x86)'), ProgramFiles: w('C:', 'Program Files'), LOCALAPPDATA: w('C:', 'Users', 'u', 'AppData', 'Local') }
const EDGE = w('C:', 'Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'), CHROME = w('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe')
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', MAC_EDGE = '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'

let r = findBrowser({ platform: 'win32', env: WIN, exists: has(EDGE, CHROME) })
check('Windows：Edge 和 Chrome 都装了，先用 Edge', r.exe === EDGE, r)
r = findBrowser({ platform: 'win32', env: WIN, exists: has(CHROME) })
check('Windows：只装了 Chrome', r.exe === CHROME, r)
r = findBrowser({ platform: 'win32', env: WIN, exists: has(w('C:', 'Users', 'u', 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe')) })
check('Windows：Chrome 只给自己装的（在 LOCALAPPDATA 下）', !!r.exe, r)
r = findBrowser({ platform: 'darwin', env: {}, home: '/h/u', exists: has(MAC_CHROME, MAC_EDGE) })
check('macOS：/Applications 里的 Chrome', r.exe === MAC_CHROME, r)
r = findBrowser({ platform: 'darwin', env: {}, home: '/h/u', exists: has(MAC_EDGE) })
check('macOS：只装了 Edge', r.exe === MAC_EDGE, r)
r = findBrowser({ platform: 'darwin', env: {}, home: '/h/u', exists: has('/h/u/Applications/Chromium.app/Contents/MacOS/Chromium') })
check('macOS：装在自己的 Applications 里的 Chromium', !!r.exe, r)
r = findBrowser({ platform: 'linux', env: { PATH: '/opt/u/bin:/usr/bin' }, exists: has('/usr/bin/chromium') })
check('Linux：PATH 里的 chromium', r.exe === '/usr/bin/chromium', r)
r = findBrowser({ platform: 'linux', env: { PATH: '/opt/u/bin' }, exists: has('/snap/bin/chromium') })
check('Linux：不在 PATH 里、在 /snap/bin 里的也找', r.exe === '/snap/bin/chromium', r)
r = findBrowser({ platform: 'linux', env: { PATH: '/usr/bin', [ENV]: '/opt/my/chrome' }, exists: has('/usr/bin/chromium', '/opt/my/chrome') })
check('设了环境变量：只用它写的那个', r.exe === '/opt/my/chrome', r)
r = findBrowser({ platform: 'linux', env: { PATH: '/usr/bin', [ENV]: '/opt/gone' }, exists: has('/usr/bin/chromium') })
check('环境变量写的文件不在：不悄悄换别的，说出来', r.exe === null && r.why.includes('/opt/gone'), r)
r = findBrowser({ platform: 'darwin', env: {}, home: '/h/u', exists: () => false })
check('都没有：说装一个，或者用环境变量指明', r.exe === null && r.why.includes('Chrome') && r.why.includes(ENV), r)
check('三个系统都不去找 Safari', ['win32', 'darwin', 'linux'].every((p) => !candidates(p, { PATH: '/usr/bin' }, '/h').some((x) => /safari/i.test(x))))
r = findBrowser()
check('这台机器上找得到（没装浏览器的机器上这一条会不过）', !!r.exe, r)

if (fails.length) { for (const f of fails) console.log('✗ ' + f); console.log(`${n} 条，${fails.length} 条不过`); process.exit(1) }
console.log(`${n} 条，全过`)
