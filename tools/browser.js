// 找一个能不开窗口跑的浏览器：Chrome、Edge 或 Chromium（同一个内核，命令行参数一样）。截图工具和编码页的真排版检查共用这一份。
// 先看环境变量 DEV_TEAM_BROWSER：写浏览器可执行文件的完整路径，设了就只用它。
// 没设，就照这台机器的系统到常见的安装位置找：Windows、macOS 找固定的几个位置，Linux 照 PATH 找那几个命令名。
// Safari 不行：它不能不开窗口地跑，也没有「打开一页存成图片」的命令行参数。
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const ENV = 'DEV_TEAM_BROWSER'
const uniq = (xs) => [...new Set(xs)]

// 这个系统上该去找的位置，按先后排；env、home 可以传进来，检查脚本用
function candidates(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    const roots = uniq([env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA, 'C:/Program Files (x86)', 'C:/Program Files'].filter(Boolean))
    return [...roots.map((r) => path.win32.join(r, 'Microsoft/Edge/Application/msedge.exe')), ...roots.map((r) => path.win32.join(r, 'Google/Chrome/Application/chrome.exe'))]
  }
  if (platform === 'darwin') {
    const apps = ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Chromium.app/Contents/MacOS/Chromium']
    return ['/Applications', path.posix.join(home, 'Applications')].flatMap((d) => apps.map((a) => path.posix.join(d, a)))
  }
  const names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable']
  const dirs = uniq([...String(env.PATH ?? '').split(':').filter(Boolean), '/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome'])
  return dirs.flatMap((d) => names.map((n) => path.posix.join(d, n)))
}

// 找到就回 { exe }；找不到回 { exe: null, why }，why 是一句给人看的话
function findBrowser({ platform = process.platform, env = process.env, home = os.homedir(), exists = fs.existsSync } = {}) {
  const set = env[ENV]
  if (set) return exists(set) ? { exe: set } : { exe: null, why: `环境变量 ${ENV} 写的是 ${set}，这个文件不在` }
  const exe = candidates(platform, env, home).find((p) => exists(p))
  return exe ? { exe } : { exe: null, why: `没找到 Chrome 或 Edge：装一个；装在不常见的位置的，用环境变量 ${ENV} 写明浏览器可执行文件的完整路径` }
}

module.exports = { findBrowser, candidates, ENV }
