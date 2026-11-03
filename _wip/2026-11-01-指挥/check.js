// 给 document 装个假的，把页面脚本跑一遍；按缩放、按一个「等你答」的按钮、把 now 清空再 render 几次；报错就说明页面会白板
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
const el = (id) => (els[id] ??= { innerHTML: '', handlers: {}, dataset: {}, className: '', addEventListener(k, f) { this.handlers[k] = f } });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, addEventListener() {} };
global.window = { addEventListener() {} };
const T = eval(script + '\n;({ SCENE })');   // 脚本里的 const 出不了 eval，末尾把现场数据带出来给用例改
const main = () => els.main.innerHTML, navHtml = () => els.nav.innerHTML;
const count = (re) => (main().match(re) || []).length;
const click = (target) => els.main.handlers.click({ target });
const before = (a, b) => main().indexOf(a) >= 0 && main().indexOf(a) < main().indexOf(b);
const cases = [
  ['「等你答」里问题留在各页的：业务、界面各一行（单开链接是占位）', () => main().includes('<a class="onpage" href="#">「业务」页还有 <b>3</b> 条待答 ›</a><a class="onpage" href="#">「界面」页还有 <b>2</b> 条待答 ›</a>')],
  ['首页两张「现在」卡', () => count(/class="now"/g) === 2 && main().includes('照流程「服务发生与申报」拆解调动') && main().includes('40 分钟') && main().includes('<b>N-02.2</b> 看她名下各笔基金还剩多少') && main().includes('第一期 11/21 还差 12 天')
    && main().includes('写聊天 app 的概念「聊天」') && main().includes('25 分钟') && main().includes('<b>N-07.2</b> 听到协议已签，开聊天') && main().includes('第二期 12/5 还差 26 天') && main().includes('class="stg doing">业务 ● 在做</span>') && main().includes('class="stg">建模 ○</span>') && main().includes('业务/概念/聊天.json')
    && count(/class="ask" /g) === 3 && main().includes('class="act lean-on"') && main().includes('← 交回')],
  ['「现在」按 since 先后排', () => { if (!before('拆解调动', '写聊天 app 的概念')) return false; T.SCENE.now.reverse(); render(); const ok = before('拆解调动', '写聊天 app 的概念') && T.SCENE.now[0].role === '业务'; T.SCENE.now.reverse(); render(); return ok }],
  ['左边栏按上下文', () => { Shell.show('养老系统'); render(); return navHtml().includes('data-cx="养老系统"') && navHtml().includes('1 等你答') && navHtml().includes('▸</span>聊天 app') && navHtml().includes('任务 <b>2</b> / 8') && navHtml().includes('在干</b> N-02.2') && !navHtml().includes('N-07.2') && (navHtml().match(/在干<\/b>/g) || []).length === 1 }],
  ['左边栏展开聊天 app', () => { Shell.show('聊天 app'); render(); return navHtml().includes('▾</span>聊天 app') && navHtml().includes('在干</b> N-07.2 照 N-07 拆出的功能') && navHtml().includes('在干</b> N-02.2') && (navHtml().match(/在干<\/b>/g) || []).length === 2 && (navHtml().match(/1 等你答/g) || []).length === 2 }],
  ['泳道', () => count(/class="trip"/g) === 6 && count(/class="trip mark"/g) === 1 && main().includes('定下 N-02.2 业务：你在业务页按了定下') && main().includes('style="fill:var(--data-line)"/></g>') && count(/<rect class="live"/g) === 5 && main().includes('建模 已 40 分钟　业务 已 25 分钟') && main().includes('fill:var(--red)"><title>业务 问，等了 25 分钟') && main().includes('已等 15 分钟：「扣」') && main().includes('>10:00</text>') && main().includes('class="act sm on" data-z="0"') && main().includes('15:55–还在跑（25 分钟）N-07.2 照 N-07 拆出的功能')],
  ['缩放 1 小时', () => { click({ closest: (sel) => sel === 'button[data-z]' ? { dataset: { z: '60' } } : null }); return main().includes('class="act sm on" data-z="60"') && count(/class="trip"/g) === 2 && !main().includes('>10:00</text>') && main().includes('>15:30</text>') }],
  ['进度两个圆点', () => main().includes('class="lab mile">第一期：建档、分钱、录一笔服务') && main().includes('11/21 · 还差 12 天') && main().includes('任务 2 / 5 完成，1 在做') && main().includes('落后 3 天：N-02') && main().includes('>今天</text>')
    && count(/ 在干<\/title>/g) === 2 && main().includes('style="fill:var(--data-line)"><title>建模 在干</title>') && main().includes('style="fill:var(--c1l)"><title>业务 在干</title>')
    && main().includes('fill:var(--accent)"><title>N-02.2 看她名下各笔基金还剩多少\n建模：在做') && main().includes('fill:var(--data-line)"><title>N-02.2 看她名下各笔基金还剩多少\n业务：2026-11-09') && main().includes('stroke-dasharray:3 2"><title>N-05.2') && count(/<g class="seg/g) === 10 && main().includes('class="stg done">业务 ✓ 11-09</span>') && main().includes('◆ 定下') && main().includes('class="role 你">你</span>') && main().includes('class="stg doing">建模 ● 在做</span>') && main().includes('N-02.2 · 建模</span>') && main().includes('>11/16</text>') && main().includes('第三期：月结单</td><td class="n">12/19 · 还差 40 天')],
  ['按一个答案', () => { click({ closest: (sel) => sel === 'button[data-ans]' ? { dataset: { ans: '基金.扣(账户类型, 金额)' }, closest: () => ({ dataset: { q: 'q-1' } }) } : null }); return count(/class="ask" /g) === 2 && main().includes('你答：基金.扣') && main().includes('2 个，角色各写了偏向') && main().includes('fill:var(--red)"><title>建模 问，等了 15 分钟') }],
  ['now 空着：没人在干', () => { T.SCENE.now = []; render(); return main().includes('没人在干。我按日程提一个') && count(/class="now"/g) === 0 && count(/ 在干<\/title>/g) === 0 && (navHtml().match(/没人在干/g) || []).length === 2 && !navHtml().includes('在干</b>') }],
  ['now 空着、有交回：等你定下的卡', () => { T.SCENE.decide = { role: '业务', context: '养老系统', task: 'N-02.2', stage: '业务', page: '业务', hash: '养老系统/flow/04', text: '业务画完了 N-02.2 的流程' }; render(); return count(/class="now"/g) === 1 && main().includes('业务画完了 N-02.2 的流程，去「业务」页看，按定下') && main().includes('日程里 N-02.2 的 业务 填今天') && main().includes('href="#养老系统/flow/04"') && !main().includes('没人在干。') }],
  ['两人在干、又有交回：交回卡在前，三张都在', () => { T.SCENE.now = [
      { role: '建模', context: '养老系统', task: 'N-02.2', stage: '建模', step: '还在拆调动', since: '2026-11-09 15:40', reads: [], writes: [], stop: '停' },
      { role: '软件工程师', context: '养老系统', task: 'N-02.1', stage: '编码', step: '写基金额度的代码', since: '2026-11-09 16:00', reads: [], writes: [], stop: '测试跑过' } ]; render();
    return count(/class="now"/g) === 3 && before('按定下</div>', '还在拆调动') && before('还在拆调动', '写基金额度的代码') && main().includes('业务画完了 N-02.2 的流程，去「业务」页看，按定下') && main().includes('20 分钟') && !main().includes('没人在干。') }],
  // 放最后：换成工作台注入的数据重跑一遍页面
  ['工作台：PAGE_ASKS 里界面有数就一行，链到 <base>/界面；0 条的页不出', () => {
    global.window.DATA = { WB: { base: '/sample-care', project: '养老', pages: ['谁在干什么', '业务', '界面'] }, PAGE_ASKS: { '业务': 0, '界面': 5 } }
    eval(script)
    return main().includes('<a class="onpage" href="/sample-care/%E7%95%8C%E9%9D%A2">「界面」页还有 <b>5</b> 条待答 ›</a>') && !main().includes('「业务」页还有') && (main().match(/class="onpage"/g) || []).length === 1
  }],
];
let bad = 0;
for (const [name, ok] of cases) {
  let pass = false;
  try { pass = ok() } catch (e) { console.log(name, 'ERROR', e.message); bad++; continue }
  console.log(name, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
process.exit(bad ? 1 : 0);
