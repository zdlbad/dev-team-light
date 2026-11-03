// 项目管理小样直接操作 DOM（createElement / appendChild），给它一个最小的假 DOM 跑一遍；报错就说明页面会白板
// 筛上下文靠点左边栏：假元素记下 addEventListener 的回调，用假事件去点
// 总览并在同一页里：先点左边栏「总览」那行，主区换成总览再断言；一个项目一段，段里一个上下文一个小节（section.ov-cx），小节里一张期的表，
// 展开靠点期那一行（onclick）；地址定位靠 location.hash 加 hashchange 的回调；滚动只记下滚到了哪个元素
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
let scrolled = null;   // 最后一次 scrollIntoView 的元素
const mk = (tag = 'div') => {
  let inner = '';
  const e = { tag, children: [], textContent: '', className: '', id: '', style: {}, dataset: {}, handlers: {}, classList: { toggle() {}, add() {} },
    appendChild(c) { e.children.push(c); return c }, querySelector() { return mk() }, addEventListener(k, f) { e.handlers[k] = f }, scrollIntoView() { scrolled = e } };
  Object.defineProperty(e, 'innerHTML', { get: () => inner, set: (v) => { inner = v; if (v === '') e.children = [] } });
  return e;
};
const els = {};
const get = (id) => (els[id] ??= mk());
global.document = { getElementById: get, querySelector: (q) => get(q), createElement: (t) => mk(t), addEventListener() {} };
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏（要在假 window 之前引，不然它挂到 window 上去）
global.location = { hash: '' };
const win = { handlers: {}, addEventListener(k, f) { win.handlers[k] = f } };   // 假 window：只接 hashchange 的回调
global.window = win;
const text = (e) => e.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
// 连子元素一起的文字：总览的段里套着小节，小节里套着表，表里套着行
const deepText = (e) => (e.innerHTML + ' ' + e.children.map(deepText).join(' ')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
eval(script);
// 点左边栏：cx 是上下文名，'' 是顶上的「全项目」；clickTop 点顶上某一行（overview / all）
const click = (cx) => els.nav.handlers.click({ preventDefault() {}, target: { closest: (sel) => sel.includes('data-act') ? (cx === '' ? { dataset: { act: 'all' } } : null) : { dataset: { cx } } } });
const clickTop = (act) => els.nav.handlers.click({ preventDefault() {}, target: { closest: (sel) => sel.includes('data-act') ? { dataset: { act } } : null } });
const rowsText = () => els.gantt.children.map(text), tableText = () => els['#reqs tbody'].children.map(text);
const reqRows = () => tableText().filter((r) => /^ N-\d\d /.test(r));
// 总览：第 i 个项目的段、段里的上下文小节、小节表里的行（期行 ov-ms、需求行 ov-req）
const secs = () => els['ov-main'].children;
const cxSecs = (i) => secs()[i].children.filter((c) => c.className === 'ov-cx');
const cxSec = (dir, cx) => secs().flatMap((s) => s.children).find((c) => c.className === 'ov-cx' && c.dataset.key === `${dir}/${cx}`);
const rowsIn = (cs) => { const t = cs.children.find((c) => c.tag === 'table'); return t ? t.children[0].children : [] };
const ovRows = (dir, cx) => rowsIn(cxSec(dir, cx));
const ovMs = (dir, cx) => ovRows(dir, cx).filter((r) => r.className.startsWith('ov-ms'));
const ovReq = (dir, cx) => ovRows(dir, cx).filter((r) => r.className.startsWith('ov-req'));
const ovReqAll = (i) => cxSecs(i).flatMap((cs) => rowsIn(cs)).filter((r) => r.className.startsWith('ov-req'));
const msRow = (dir, cx, mid) => ovRows(dir, cx).find((r) => r.dataset.key === `${dir}/${cx}/${mid}`);
// 进度那一栏：三段的宽度 + 合起来的数
const seg = (a, b, c, got) => `<i><b style="width:${a}%"></b></i><i><b style="width:${b}%"></b></i><i><b style="width:${c}%"></b></i></span><small>${got}</small>`;
const cases = [
  // 甘特图 + 需求清单（默认进来就是它）
  ['全项目', () => text(els.nav).includes('全项目') && text(els.nav).includes('聊天 app') && reqRows().length === 7 && tableText().some((r) => r.includes('N-07.2') && r.includes('聊天 app')) && tableText().some((r) => r.includes('N-05') && r.includes('排版系统'))],
  ['只看 聊天 app', () => { click('聊天 app'); return reqRows().length === 1 && tableText().some((r) => r.includes('N-07.2')) && !tableText().some((r) => r.includes('N-07.1')) && rowsText().filter((r) => / N-0/.test(r)).length === 2 && els.cxh.textContent.includes('聊天 app') }],
  ['只看 排版系统', () => { click('排版系统'); return reqRows().length === 1 && tableText().some((r) => r.includes('N-05.2')) && !tableText().some((r) => r.includes('N-01')) }],
  ['回全项目', () => { click(''); return reqRows().length === 7 && els.cxh.textContent.includes('全项目') }],
  ['点一条出细节', () => { els.gantt.children.find((r) => r.dataset.id === 'N-02').onclick(); const i = els.gantt.children.findIndex((r) => r.dataset.id === 'N-02'), pr = els.gantt.children.find((r) => r.className === 'g-row pickrow'), t = pr ? pr.innerHTML : ''; return els.gantt.children.indexOf(pr) > i && t.includes('N-02 · 记下分到她名下的基金和额度') && t.includes('<b>做完后</b>每位老人名下有几笔基金') && t.includes('通知书上写着她分到哪几笔基金') && t.includes('N-02.2') && t.includes('<b>依赖</b>N-01') && els.gantt.children.some((r) => r.className.includes(' sel')) }],
  ['再点收起', () => { els.gantt.children.find((r) => r.dataset.id === 'N-02').onclick(); return !els.gantt.children.some((r) => r.className === 'g-row pickrow') }],
  ['清单里点', () => { els['#reqs tbody'].children.find((r) => r.dataset.id === 'N-01').onclick(); const rows = els['#reqs tbody'].children, i = rows.findIndex((r) => r.dataset.id === 'N-01'); return rows[i + 1].className === 'pickrow' && rows[i + 1].innerHTML.includes('N-01 · ') && !els.gantt.children.some((r) => r.className === 'g-row pickrow') }],
  ['清单里再点收起', () => { els['#reqs tbody'].children.find((r) => r.dataset.id === 'N-01').onclick(); return !els['#reqs tbody'].children.some((r) => r.className === 'pickrow') }],
  ['按期折叠', () => { const before = els.gantt.children.length; els.gantt.children.find((r) => r.className.includes('ms')).onclick(); const ms = els.gantt.children.find((r) => r.className.includes('ms')); return els.gantt.children.length < before && ms.innerHTML.includes('▸') && ms.innerHTML.includes('条') }],
  ['再点展开', () => { const before = els.gantt.children.length; els.gantt.children.find((r) => r.className.includes('ms')).onclick(); return els.gantt.children.length > before }],
  ['状态从阶段算', () => { const rows = tableText(); const n02 = rows.find((r) => /^ N-02 /.test(r)), n022 = rows.find((r) => r.includes('N-02.2')), n01 = rows.find((r) => /^ N-01 /.test(r)), n021 = rows.find((r) => r.includes('N-02.1'));
    return n02.includes('进行中') && !n02.includes('业务') && n022.includes('进行中') && n022.includes('业务 ✓ 建模 ● 编码 ○') && n01.includes('已完成') && n01.includes('2026-11-05') && n021.includes('已完成') && n021.includes('2026-11-06') && els.gantt.children.some((e) => e.innerHTML.includes('class="s done"></i><i class="s doing"></i><i class="s"></i>')) }],

  // 总览：点左边栏「总览」那行，甘特图、清单藏起来，主区换成一个项目一段；两个项目：养老系统（养老系统 + 沟通 app 两个上下文）、聊天 app（消息 + 通讯录）
  ['点总览：两个项目都画出来', () => { clickTop('overview');
    return els['pm-view'].hidden === true && els['ov-view'].hidden === false && els.nav.innerHTML.includes('class="cx proj on" href="#总览" data-act="overview"') && els.nav.innerHTML.includes('class="cx proj" href="#" data-act="all"')
      && secs().length === 2 && secs()[0].id === 'sample-care' && secs()[1].id === 'sample-chat' && deepText(secs()[0]).includes('养老系统') && deepText(secs()[1]).includes('聊天 app') }],
  // 段里一个上下文一个小节：照 PROJECTS[].contexts 的顺序；小节的 id 是 <dir>/<上下文名>
  ['养老段下面两个小节', () => { const a = cxSecs(0), c = cxSecs(1);
    return a.length === 2 && a.map((s) => s.dataset.cx).join('|') === '养老系统|沟通 app' && a[0].id === 'sample-care/养老系统' && a[1].dataset.key === 'sample-care/沟通 app' && a[0].innerHTML.startsWith('<h3>养老系统<small>')
      && c.length === 2 && c.map((s) => s.dataset.cx).join('|') === '消息|通讯录' && c[0].id === 'sample-chat/消息' }],
  // 段头一期一行的目标：编号、全名、目标、截止；目标只在段头出现一次，小节的表里不再写
  ['三期的目标在段头一期一行', () => { const a = deepText(secs()[0]), c = deepText(secs()[1]);
    return a.includes('M1 第一期：建档记账与聊天 — 能给一位老人建档、签协议、记下她名下的基金，录一笔服务后看到还剩多少钱；签了协议，老人和家属有一个聊天 · 截止 2026-12-11') && a.includes('M3 第三期：申报与付款 — ') && a.includes('截止 2027-03-19')
      && (a.match(/能给一位老人建档、签协议/g) || []).length === 1 && c.includes('M2 第二期：群聊与拉黑 — 能拉群聊，能把人拉黑 · 截止 2026-12-18') && secs()[0].innerHTML.includes('<ul class="goals"><li><b>M1</b>') }],
  // 每个小节各自的期行：只列这个上下文有需求的那几期；期那一栏只写编号和冒号前的短名
  ['各小节的期行', () => ovMs('sample-care', '养老系统').length === 3 && ovMs('sample-care', '沟通 app').length === 3 && ovMs('sample-chat', '消息').length === 2 && ovMs('sample-chat', '通讯录').length === 2
    && msRow('sample-care', '养老系统', 'M1').innerHTML.includes('<b>M1</b>第一期</td>') && !msRow('sample-care', '养老系统', 'M1').innerHTML.includes('建档记账与聊天') && msRow('sample-care', '沟通 app', 'M3').dataset.mid === 'M3' && msRow('sample-care', '沟通 app', 'M3').id === 'sample-care/沟通 app/M3'
    && cxSec('sample-care', '养老系统').children.find((c) => c.tag === 'table').innerHTML.includes('<th>期</th><th>这一期做什么</th><th>截止</th><th>需求</th><th>进度</th>')],
  ['项目那行小字', () => { const a = deepText(secs()[0]), c = deepText(secs()[1]);
    return a.includes('2 个上下文（养老系统、沟通 app）') && a.includes('没人在干') && a.includes('等你答 0 条') && a.includes('需求做 20 条 / 共 24 条') && a.includes('任务完成 1 条')
      && c.includes('2 个上下文（消息、通讯录）') && c.includes('建模 在做 C-02 ：照流程「发一条消息」起草聚合骨架； 业务 在做 C-04 ：照第二期的目标画群聊的流程') && c.includes('等你答 1 条') && c.includes('需求做 4 条 / 共 6 条') && c.includes('任务完成 1 条') }],
  // 小节标题后那串小字：只数这个上下文的；在干谁看 scene.now 里的 task 落在哪个上下文的需求上（C-02、C-04 都是 消息 的）
  ['小节那串小字', () => { const a = cxSec('sample-care', '养老系统').innerHTML, k = cxSec('sample-care', '沟通 app').innerHTML, m = cxSec('sample-chat', '消息').innerHTML, t = cxSec('sample-chat', '通讯录').innerHTML;
    return a.includes('做 <b>16</b> 条 / 共 16 条') && a.includes('任务完成 <b>1</b> 条') && a.includes('没人在干')
      && k.includes('做 <b>4</b> 条 / 共 4 条') && k.includes('任务完成 <b>0</b> 条') && k.includes('没人在干')
      && m.includes('做 <b>2</b> 条 / 共 4 条') && m.includes('任务完成 <b>0</b> 条') && m.includes('在干：<b>建模</b>（C-02）、<b>业务</b>（C-04）')
      && t.includes('做 <b>2</b> 条 / 共 2 条') && t.includes('任务完成 <b>1</b> 条') && t.includes('没人在干') }],
  // 截止标红按上下文算：聊天 M1 截止 10-30 过了，消息 的 C-02 没完 → 红；通讯录 的 C-01 三段全定 → 同一期不红；养老 M1 截止还没到
  ['截止过期标红按上下文算', () => msRow('sample-chat', '消息', 'M1').innerHTML.includes('class="due late"') && msRow('sample-chat', '消息', 'M1').innerHTML.includes('过了') && !msRow('sample-chat', '通讯录', 'M1').innerHTML.includes('late') && msRow('sample-chat', '通讯录', 'M1').innerHTML.includes('class="due">2026-10-30')
    && msRow('sample-chat', '消息', 'M2').innerHTML.includes('class="due"') && !msRow('sample-care', '养老系统', 'M1').innerHTML.includes('late') && !msRow('sample-care', '沟通 app', 'M1').innerHTML.includes('late')],
  ['默认折起', () => ovReqAll(0).length === 0 && ovReqAll(1).length === 0 && [0, 1].every((i) => cxSecs(i).every((cs) => rowsIn(cs).every((r) => r.innerHTML.includes('▸') && r.className === 'ov-ms')))],
  // 手算一个小节一期：养老系统 M1 要做 6 条（N-21、N-22 是沟通 app 的，不算进来），业务定了 3 条 = 50%，建模 1 条 = 17%，编码 1 条 = 17%，合起来 5/18；
  // 聊天 消息 M1 两条只做 1 条（C-03 再看），业务 1/1 = 100%，1/3；通讯录 M1 一条三段全定，3/3
  ['做几条和进度只算这个上下文', () => { const a = msRow('sample-care', '养老系统', 'M1').innerHTML, m = msRow('sample-chat', '消息', 'M1').innerHTML, t = msRow('sample-chat', '通讯录', 'M1').innerHTML;
    return a.includes('做 6 / 6') && a.includes(seg(50, 17, 17, '5/18')) && m.includes('做 1 / 2') && m.includes(seg(100, 0, 0, '1/3')) && t.includes('做 1 / 1') && t.includes(seg(100, 100, 100, '3/3')) }],
  // 沟通 app 小节：M1 两条都做，业务定了 1 条 = 50%，1/6；M2、M3 各一条，什么都没定，0/3；「这一期做什么」是它的需求标题串，截止是项目的
  ['沟通 app 小节的期行', () => { const a = msRow('sample-care', '沟通 app', 'M1').innerHTML, b = msRow('sample-care', '沟通 app', 'M2').innerHTML, c = msRow('sample-care', '沟通 app', 'M3').innerHTML;
    return a.includes('做 2 / 2') && a.includes(seg(50, 0, 0, '1/6')) && b.includes('做 1 / 1') && b.includes(seg(0, 0, 0, '0/3')) && c.includes('做 1 / 1') && c.includes(seg(0, 0, 0, '0/3')) && a.includes('2026-12-11') && c.includes('2027-03-19')
      && a.includes('<td class="goal">签了协议，给老人和家属开一个聊天、家属在聊天里看到她的协议和基金</td>') && msRow('sample-care', '养老系统', 'M1').innerHTML.includes('<td class="goal">给老人建档，记下支持计划和决定通知书、跟老人签服务协议、维护公司价目表和每位老人的协议价等</td>') }],
  // 点期行：只列这个上下文这一期的需求，紧跟期行，下一行就是下一期；另一个上下文的小节不动
  ['点期行只展开这个上下文的需求', () => { msRow('sample-care', '养老系统', 'M1').onclick(); const rs = ovReq('sample-care', '养老系统'), rows = ovRows('sample-care', '养老系统'), i = rows.findIndex((r) => r.dataset.key === 'sample-care/养老系统/M1');
    return rs.length === 6 && rs.map((r) => r.dataset.id).join('|') === 'N-01|N-02|N-03|N-04|N-05|N-06' && rows[i + 1].dataset.id === 'N-01' && rows[i + 6].dataset.id === 'N-06' && rows[i + 7].dataset.key === 'sample-care/养老系统/M2'
      && msRow('sample-care', '养老系统', 'M1').className === 'ov-ms open' && msRow('sample-care', '养老系统', 'M1').innerHTML.includes('▾')
      && rs[0].innerHTML.includes('给老人建档，记下支持计划和决定通知书') && rs[0].innerHTML.includes('<span class="cxt">养老系统</span>') && rs[0].innerHTML.includes('class="tag Must"') && (rs[0].innerHTML.match(/class="done"/g) || []).length === 3
      && (rs[1].innerHTML.match(/class="done"/g) || []).length === 1 && (rs[3].innerHTML.match(/class="done"/g) || []).length === 0
      && ovReq('sample-care', '沟通 app').length === 0 && ovReqAll(1).length === 0 }],
  ['再点期行收起', () => { msRow('sample-care', '养老系统', 'M1').onclick(); return ovReqAll(0).length === 0 && msRow('sample-care', '养老系统', 'M1').className === 'ov-ms' && msRow('sample-care', '养老系统', 'M1').innerHTML.includes('▸') }],
  ['另一个小节点期行', () => { msRow('sample-care', '沟通 app', 'M1').onclick(); const rs = ovReq('sample-care', '沟通 app'), rows = ovRows('sample-care', '沟通 app'), i = rows.findIndex((r) => r.dataset.key === 'sample-care/沟通 app/M1');
    const ok = rs.length === 2 && rs.map((r) => r.dataset.id).join('|') === 'N-21|N-22' && rows[i + 1].dataset.id === 'N-21' && rows[i + 3].dataset.key === 'sample-care/沟通 app/M2' && rs[0].innerHTML.includes('<span class="cxt">沟通 app</span>') && ovReq('sample-care', '养老系统').length === 0;
    msRow('sample-care', '沟通 app', 'M1').onclick(); return ok && ovReqAll(0).length === 0 }],
  // 聊天 消息 M2 展开：C-04、C-06（不做，灰掉）；C-04 带 outcome
  ['不做的带 outcome 的', () => { msRow('sample-chat', '消息', 'M2').onclick(); const rs = ovReq('sample-chat', '消息'); const ok = rs.length === 2 && rs.map((r) => r.dataset.id).join('|') === 'C-04|C-06' && rs[1].className === 'ov-req ov-wont' && rs[1].innerHTML.includes('不做') && rs[0].innerHTML.includes('<small>三个以上的人在一个聊天里说话</small>') && ovReq('sample-chat', '通讯录').length === 0; msRow('sample-chat', '消息', 'M2').onclick(); return ok }],
  // 没排期的一行在段底，在所有小节后面
  ['没排期的列在段底', () => { const kids = secs()[0].children; return deepText(secs()[0]).includes('没排进期里的') && deepText(secs()[0]).includes('N-20 直接对接政府 B2G 接口申报（不做）') && kids[kids.length - 1].className === 'unplanned' && kids[kids.length - 2].className === 'ov-cx' && !deepText(secs()[1]).includes('没排进期里的') }],
  // 地址三种：项目、小节、一期（展开那一行）
  ['地址定位到项目', () => { location.hash = '#总览/sample-care'; win.handlers.hashchange(); return els['ov-view'].hidden === false && scrolled && scrolled.id === 'sample-care' && ovReqAll(0).length === 0 && ovReqAll(1).length === 0 }],
  ['地址定位到小节', () => { location.hash = '#总览/sample-chat/通讯录'; win.handlers.hashchange(); return scrolled && scrolled.className === 'ov-cx' && scrolled.dataset.key === 'sample-chat/通讯录' && ovReqAll(1).length === 0 }],
  ['地址定位到一期', () => { location.hash = '#总览/sample-chat/通讯录/M1'; win.handlers.hashchange(); const rs = ovReq('sample-chat', '通讯录');
    return rs.length === 1 && rs[0].dataset.id === 'C-01' && msRow('sample-chat', '通讯录', 'M1').className === 'ov-ms open' && msRow('sample-chat', '消息', 'M1').className === 'ov-ms' && ovReq('sample-chat', '消息').length === 0 && ovReqAll(0).length === 0
      && scrolled && scrolled.dataset.key === 'sample-chat/通讯录/M1' }],
  ['从总览点回全项目', () => { click('');
    return els['pm-view'].hidden === false && els['ov-view'].hidden === true && els.nav.innerHTML.includes('class="cx proj on" href="#" data-act="all"') && els.nav.innerHTML.includes('class="cx proj" href="#总览" data-act="overview"')
      && els.gantt.children.some((r) => r.className.includes('ms')) && reqRows().length === 7 && els.cxh.textContent.includes('全项目') }],
];
let bad = 0;
for (const [name, ok] of cases) {
  let pass = false;
  try { pass = ok() } catch (e) { console.log(name, 'ERROR', e.message); bad++; continue }
  console.log(name, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
process.exit(bad ? 1 : 0);
