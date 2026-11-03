// 工作台的框架：顶栏、左边栏由这里画，页面只交内容。五页共用，小样单开也用它（相对路径引）。
// 页面交三样：top() 顶上项目级的几条、badge(cx) 上下文行右边的小字、items(cx) 展开后这个上下文下面列什么；
// 点上下文那行：框架记展开收起（跨页记住），再叫页面的 pick(cx)，页面决定切过去还是筛选。
;(function (root) {
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
    // 页面只交 project/pages/current/live；base 从工作台注进来的 window.DATA.WB 拿，页面不用管。
    topbar({ project, pages, current, live, base }) {
      const el = document.getElementById('topbar'); if (!el) return
      base ??= ((typeof window !== 'undefined' && window.DATA?.WB) || {}).base ?? ''
      el.className = 'topbar'
      el.innerHTML = `<b>${esc(project)}</b>` + pages.map((p) => live
        ? `<a href="${esc(base)}/${encodeURIComponent(p)}"${p === current ? ' class="on"' : ''}>${esc(p)}</a>`
        : `<span${p === current ? ' class="on"' : ''}>${esc(p)}</span>`).join('')
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
  root.Shell = Shell
})(typeof window !== 'undefined' ? window : module.exports)
