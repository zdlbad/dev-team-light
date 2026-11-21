// 工作台的框架：顶栏、左边栏由这里画，页面只交内容。五页共用，小样单开也用它（相对路径引）。
// 页面交三样：top() 顶上项目级的几条、badge(cx) 上下文行右边的小字、items(cx) 展开后这个上下文下面列什么；
// 点上下文那行：框架记展开收起（跨页记住），再叫页面的 pick(cx)，页面决定切过去还是筛选。
;(function (root) {
  // 深浅三档。各页的深色写在 @media (prefers-color-scheme: dark) 里、选择器都带 :root:not([data-theme="light"])：
  // 选浅色就在 <html> 上标 data-theme="light"，深色那几段自己不生效；选深色就把那几段里的规则原样抄进一个 <style>、不受系统设置管
  const THEMES = ['auto', 'light', 'dark'], THEME_KEY = 'dev-team-lite/外观'
  const THEME_NAME = { auto: '跟系统', light: '浅色', dark: '深色' }, THEME_ICON = { auto: '◐', light: '☀', dark: '☾' }
  function darkRules() {
    const out = []
    const walk = (rules) => { for (const r of rules) { if (r.media && /prefers-color-scheme:\s*dark/.test(r.media.mediaText)) for (const x of r.cssRules) out.push(x.cssText); else if (r.cssRules && !r.media) walk(r.cssRules) } }
    for (const sh of document.styleSheets) { if (sh.ownerNode?.id === 'force-dark') continue; try { walk(sh.cssRules) } catch {} }
    return out.join('\n')
  }
  function applyTheme(mode) {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    if (mode === 'auto') html.removeAttribute('data-theme'); else html.setAttribute('data-theme', mode)
    document.getElementById('force-dark')?.remove()
    if (mode !== 'dark') return
    const st = document.createElement('style'); st.id = 'force-dark'; st.textContent = darkRules(); document.head.appendChild(st)
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const Shell = {
    contexts: [], current: null, open: new Set(), page: {},
    // opts: { contexts: [名字], current?, page: { top?, badge?, items?, pick? }, topbar?: { project, pages, current, live } }
    init(opts) {
      this.contexts = opts.contexts
      this.current = opts.current ?? null
      this.page = opts.page ?? {}
      // 每次进页面都全折叠，不记上一次开过谁；页面自己 Shell.show(当前上下文) 才展开那一个
      this.open = new Set()
      if (opts.topbar) this.topbar(opts.topbar)
      this.bind()
      return this
    },
    // 顶栏：项目名加六页；工作台里是真链接，单开是摆着看的。
    // 工作台一次开好几个项目，页的地址是 /<项目目录名>/<页>：base 是那个前缀。
    // 页面只交 project/pages/current/live；base、protos 从工作台注进来的 window.DATA.WB 拿，页面不用管。
    topbar({ project, pages, current, live, base, protos }) {
      const el = document.getElementById('topbar'); if (!el) return
      const WB = (typeof window !== 'undefined' && window.DATA?.WB) || {}
      base ??= WB.base ?? ''
      protos ??= WB.protos ?? []
      el.className = 'topbar'
      el.innerHTML = `<b>${esc(project)}</b>` + pages.map((p) => live
        ? `<a href="${esc(base)}/${encodeURIComponent(p)}"${p === current ? ' class="on"' : ''}>${esc(p)}</a>`
        : `<span${p === current ? ' class="on"' : ''}>${esc(p)}</span>`).join('') + this.protoLink(protos) + this.themeButton()
      el.querySelector?.('.theme')?.addEventListener('click', () => { this.setTheme(THEMES[(THEMES.indexOf(this.theme()) + 1) % THEMES.length]); this.topbar({ project, pages, current, live, base, protos }) })
    },
    // 深浅：跟系统、浅色、深色三档，点顶栏右边那个按钮轮着换，记在本机，换页、刷新都照旧
    theme() { try { return THEMES.includes(localStorage.getItem(THEME_KEY)) ? localStorage.getItem(THEME_KEY) : 'auto' } catch { return 'auto' } },
    setTheme(mode) { try { localStorage.setItem(THEME_KEY, mode) } catch {} applyTheme(mode) },
    themeButton() { const m = this.theme(); return `<button class="theme" type="button" title="外观：点一下换成${THEME_NAME[THEMES[(THEMES.indexOf(m) + 1) % THEMES.length]]}">${THEME_ICON[m]} ${THEME_NAME[m]}</button>` },
    // 六页后面的「原型」：一个上下文有原型就直接链过去，几个就点开一个小单子；圆点绿＝开着、灰＝没开，没开时提示怎么起
    protoLink(protos) {
      if (!protos.length) return ''
      const tip = (p) => p.up ? `${p.context} · 开着 ${p.url}` : `${p.context} · 没开：${p.start}${p.note ? '（' + p.note + '）' : ''}`
      const dot = (p) => `<i class="dot${p.up ? ' up' : ''}"></i>`
      if (protos.length === 1) { const p = protos[0]; return `<a class="proto" href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(tip(p))}">${dot(p)}原型</a>` }
      return `<details class="proto"><summary>${dot({ up: protos.some((p) => p.up) })}原型 ▾</summary><div>${protos.map((p) =>
        `<a href="${esc(p.url)}" target="_blank" rel="noopener" title="${esc(tip(p))}">${dot(p)}${esc(p.context)} · ${p.up ? '开着' : '没开'}</a>`).join('')}</div></details>`
    },
    // 左边栏：顶上项目级的几条，然后一个上下文一行，展开的下面接页面给的内容
    nav() {
      const el = document.getElementById('nav'); if (!el) return
      const top = (this.page.top?.() ?? []).map((t) => `<a class="cx proj${t.on ? ' on' : ''}" href="${esc(t.href ?? '#')}"${t.act ? ` data-act="${esc(t.act)}"` : ''}>${esc(t.text)}${t.badge ? `<small>${esc(t.badge)}</small>` : ''}</a>`).join('')
      const rows = this.contexts.map((cx) => {
        const open = this.open.has(cx), badge = this.page.badge?.(cx) ?? ''
        const inner = open ? (this.page.items?.(cx) || this.line('还没有', true)) : ''
        return `<div class="cx${cx === this.current ? ' on' : ''}" data-cx="${esc(cx)}"><span class="tri">${open ? '▾' : '▸'}</span>${esc(cx)}${badge ? `<small>${esc(badge)}</small>` : ''}</div>${inner}`
      }).join('')
      el.innerHTML = top + rows
    },
    // 页面要把某个上下文展开（比如地址里切了上下文）：开它
    show(cx) {
      if (!cx || this.open.has(cx)) return
      this.open.add(cx)
    },
    // 页面拼展开内容用的几块
    group: (title) => `<div class="gn">${esc(title)}</div>`,
    link: (href, text, on, cls = 'sub') => `<a href="${esc(href)}" class="${cls}${on ? ' on' : ''}">${esc(text)}</a>`,
    line: (html, muted) => `<div class="tn${muted ? ' none' : ''}">${html}</div>`,
    bar: (done, total) => `<span class="bar"><i style="width:${total ? Math.round(done / total * 100) : 0}%"></i></span>`,
    bind() {
      const el = document.getElementById('nav'); if (!el || el.dataset.shellBound) return
      el.dataset.shellBound = '1'
      el.addEventListener('click', (ev) => {
        const t = ev.target.closest('.cx.proj[data-act]')
        if (t) { ev.preventDefault(); this.page.pickTop?.(t.dataset.act); return }
        const h = ev.target.closest('.cx[data-cx]'); if (!h) return
        const cx = h.dataset.cx
        this.open.has(cx) ? this.open.delete(cx) : this.open.add(cx)
          this.page.pick ? this.page.pick(cx) : this.nav()
      })
    },
    esc }
  if (typeof document !== 'undefined') {
    // 地址带 ?theme=light|dark|auto 的照它换并记下（截图时用得上）
    try { const q = new URLSearchParams(location.search).get('theme'); if (THEMES.includes(q)) localStorage.setItem(THEME_KEY, q) } catch {}
    const saved = Shell.theme()
    if (saved !== 'auto') { applyTheme(saved); document.addEventListener('DOMContentLoaded', () => applyTheme(saved)) }
  }
  root.Shell = Shell
})(typeof window !== 'undefined' ? window : module.exports)
