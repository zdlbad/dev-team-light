// 给 document、location 装个假的，把页面脚本跑一遍，各视图 render 一次；报错就说明页面会白板
const fs = require('fs');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
global.document = { getElementById: (id) => el(id), querySelector: (id) => el(id), addEventListener() {} };
// MAIN_W：主区宽（clientWidth），量全图放不放得下时给；不给页面按 1240 算
const el = (id) => (els[id] ??= { innerHTML: '', hidden: false, addEventListener() {}, dataset: {}, className: '', style: {}, clientWidth: id === 'main' ? global.MAIN_W : undefined });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document.addEventListener = () => {};
global.window = { addEventListener() {} };
global.location = { hash: '' };
global.innerWidth = 1200; global.innerHeight = 800;
// data：当作工作台注入的 window.DATA；不给就是单开小样
const run = (hash, tail = '', data) => { global.location.hash = hash; global.window.DATA = data; els.main = undefined; els.nav = undefined; eval(script + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML; };
// 样板项目经 lib/project.js 读出来的建模页数据：聚合全图、骨架聚合用它测
const path = require('path'), os = require('os');
const { pageData, applyAction } = require('../../lib/project.js');
const SAMPLE = path.join(__dirname, '..', '..', 'sample');
const S = pageData(SAMPLE, '建模', { now: '2026-11-09 16:20' });
const graphWith = (g) => ({ ...S, GRAPHS: { 养老系统: { ...S.GRAPHS['养老系统'], ...g } } });
// svg 里的矩形：主题框、聚合小框、线上的小卡；画布的 viewBox 和整体平移，用来看小卡出没出画布
const num = '(-?[\\d.]+)';
const rects = (s, head) => [...s.matchAll(new RegExp(head + `<rect x="${num}" y="${num}" width="${num}" height="${num}"`, 'g'))].map((m) => ({ id: m[1], x: +m[m.length - 4], y: +m[m.length - 3], w: +m[m.length - 2], h: +m[m.length - 1] }));
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const apart = (a, b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
/** 小卡都在画布里：小卡矩形加上整体平移，落在 viewBox 以内 */
function labelsInCanvas(s) {
  const m = s.match(/<svg width="[\d.]+" height="[\d.]+" viewBox="0 0 ([\d.]+) ([\d.]+)"><g transform="translate\(([-\d.]+) ([-\d.]+)\)">/);
  const [vw, vh, tx, ty] = m ? m.slice(1).map(Number) : [0, 0, 0, 0];
  const lbs = rects(s, '<g class="lb">(?:<path[^>]*/>)?()');
  return lbs.length > 0 && lbs.every((r) => r.x + tx >= 0 && r.y + ty >= 0 && r.x + r.w + tx <= vw && r.y + r.h + ty <= vh);
}
/** 聚合全图：每个聚合的小框落在它的主题框里、小框互不压、成员都列在自己的框里，线的条数对。
 *  页面上不摆 summary、没有右边栏，底下一句怎么用。没选中：线上一张小卡都没有；选中 focus：高亮的线正是它进出的那几条、每条一张小卡（写着那条的为什么）且没出画布 */
/** 全图上每个聚合框里：根以外的成员一个不少，每个成员的字（按汉字 11.5、别的 6 宽估）落在这个聚合框里，种类小标也在 */
function membersOk(s, data) {
  return data.AGGS.every((a) => {
    const i = s.search(new RegExp(`<g class="ag[^"]*" data-agg="${a.id}"`)); if (i < 0) return false;
    const g = s.slice(i, s.indexOf('</g>', i)), r = rects(g, '<g class="ag[^"]*" data-agg="([^"]+)" data-t="[^"]+">')[0];
    const texts = [...g.matchAll(/<text class="m" data-m="([^"]+)" x="([\d.]+)" y="([\d.]+)">([^<]*)<\/text>/g)].map((m) => ({ id: m[1], x: +m[2], y: +m[3], w: [...m[4]].reduce((t, ch) => t + (/[^\x00-\xff]/.test(ch) ? 11.5 : 6), 0) }));
    const others = (a.members ?? []).filter((m) => m.kind !== '根');
    return r && others.every((m) => texts.some((t) => t.id === m.id) && g.includes(`>${m.kind}</text>`))
      && texts.every((t) => t.x >= r.x && t.x + t.w <= r.x + r.w && t.y - 11 >= r.y && t.y + 3 <= r.y + r.h);
  });
}
function allOk(s, data, focus) {
  const frames = Object.fromEntries(rects(s, '<g class="tp" data-g="([^"]+)">').map((r) => [r.id, r]));
  const cards = rects(s, '<g class="ag[^"]*" data-agg="([^"]+)" data-t="[^"]+">');
  const byId = Object.fromEntries(cards.map((c) => [c.id, c]));
  const g = data.GRAPHS['养老系统'], mine = g.edges.filter((e) => e.from === focus || e.to === focus);
  const base = data.AGGS.every((a) => byId[a.id] && frames[a.topic] && inside(byId[a.id], frames[a.topic])) && membersOk(s, data)
    && cards.every((a, i) => cards.every((b, j) => i === j || apart(a, b)))
    && Object.values(frames).every((f, i, fs) => fs.every((h, j) => i === j || apart(f, h)))
    && (s.match(/<g class="ed( on)?"/g) ?? []).length === g.edges.length
    && !(g.summary && s.includes(g.summary.slice(0, 20))) && !s.includes('class="side') && s.includes('移到一个聚合上看它连着谁；点框钉住，点名字进它的总览');
  if (!focus) return base && !s.includes('<g class="lb">');
  const lbs = s.slice(s.indexOf('<g class="lbs">'));
  return base && (s.match(/<g class="ed on"/g) ?? []).length === mine.length && (s.match(/<g class="lb">/g) ?? []).length === mine.length && labelsInCanvas(s)
    && s.includes(`class="ag sel" data-agg="${focus}"`) && mine.every((e) => lbs.includes('>' + e.label.slice(0, 4)));
}
const svgSize = (s) => { const m = s.match(/<svg width="([\d.]+)" height="([\d.]+)" viewBox="0 0 ([\d.]+) ([\d.]+)"/); return m ? m.slice(1).map(Number) : [0, 0, 0, 0] };
// 像 sample-care 那样九个主题排成五列两排、一个聚合被十几条线指着；全图.json 不带 summary
const crowd = (() => {
  const grid = [['g0', 0, 0], ['g1', 1, 0], ['g2', 2, 0], ['g4', 3, 0], ['g5', 4, 0], ['g3', 1, 1], ['g6', 2, 1], ['g7', 3, 1], ['g8', 4, 1]];
  const TOPICS = Object.fromEntries(grid.map(([id, x, y], i) => [id, { title: '第' + i + '个主题的名字', c: (i % 5) + 1, x, y }]));
  const AGGS = grid.flatMap(([id], i) => Array.from({ length: (i % 3) + 1 }, (_, k) => ({ id: `${id}a${k}`, title: `${id} 的第${k + 1}个聚合`, topic: id, concepts: [], summary: '', members: [{ id: 'root', name: '根' + k, kind: '根', desc: '' }, ...Array.from({ length: (i + k) % 3 === 0 ? 7 : 3 }, (_, j) => ({ id: 'm' + j, name: j % 2 ? '值对象' + j : '一个名字比较长的实体成员' + j, kind: j % 2 ? '值对象' : '实体', desc: '' }))], links: [] })));
  const hub = AGGS.find((a) => a.topic === 'g2').id;
  const edges = AGGS.filter((a) => a.id !== hub).map((a) => ({ from: a.id, to: hub, label: '记着她的档案编号，靠它找回她' }))
    .concat(AGGS.slice(0, 10).map((a, i) => ({ from: a.id, to: AGGS[(i + 7) % AGGS.length].id, label: '一行对一条' })).filter((e) => e.from !== e.to));
  return { ...S, TOPICS, AGGS, CATALOG: {}, MOVES: [], GRAPHS: { 养老系统: { edges } }, hub };
})();
/** 图不比 maxW 宽（不横滚），缩放不低于 minK */
const fitsIn = (maxW, minK) => (s) => { const [w, , vw] = svgSize(s); return w > 0 && w <= maxW && w / vw >= minK - 1e-9 };
// 七个、八个成员的聚合：一层一排三个往下折，画布不比主区宽，小卡都在画布里
const many = (n) => { const ns = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'].slice(0, n); return { AGGS: [{ id: 'many', title: '很多', topic: 'g2', concepts: [], summary: '',
  members: [{ id: 'root', name: '根', kind: '根', desc: '根' }, ...ns.map((x) => ({ id: x, name: '成员' + x, kind: '值对象', desc: x }))],
  links: ns.map((x) => ({ from: 'root', to: x, label: '通知到了记上第' + x + '部分' })) }] } };
const manyOk = (n) => (s) => { const w = +s.match(/<svg width="([\d.]+)"/)[1]; return ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛'].slice(0, n).every((x) => s.includes(`>成员${x}</text>`)) && w <= 850 && labelsInCanvas(s) };
const cases = [
  ['#agg/file', (s) => s.includes('<svg') && s.includes('聚合边界守的规则') && s.includes('分级与路径') && s.includes('她的钱另起一个聚合') && s.includes('class="side"') && s.includes('class="grp"') && s.includes('点图上一个成员')],
  ['#agg/file', (s) => s.includes('class="side"') && s.includes('整个换掉') && s.includes('class="mb vo sel"'), "selected = 'level'; render()"],
  ['#agg/fund', (s) => s.includes('<svg') && s.includes('基金账户') && s.includes('class="stub" data-agg="file"') && s.includes('参与者编号')],
  ['#member/file/root', (s) => s.includes('class="cls"') && s.includes('身份') && s.includes('My Aged Care 编号') && s.includes('class="src"') && s.includes('政府发了通知书') && s.includes('class="k 角色">角色</em>照护伙伴') && s.includes('class="bh"') && s.includes('记签协议') && s.includes('class="tabs"')],
  ['#member/file/root', (s) => s.includes('<svg') && s.includes('待评估') && !s.includes('class="cls"'), "tab = 'life'; render()"],
  ['#member/fund/acct', (s) => s.includes('<svg') && s.includes('已用完'), "tab = 'life'; render()"],
  ['#member/fund/acct', (s) => s.includes('额度减去扣过的') && s.includes('上门做了一次服务') && s.includes('class="k 事件">事件</em>资金已分到'), "tab = 'attr'; render()"],
  ['#member/file/level', (s) => s.includes('整个换') && !s.includes('class="tabs"') && s.includes('class="src"') && s.includes('新通知书') && s.includes('class="cls"') && !s.includes('class="bh"')],
  ['#member/file/copay', (s) => s.includes('Services Australia') && s.includes('data-f="临床"')],
  ['#list/g2', (s) => s.includes('class="attrs list"') && s.includes('资金到了开基金') && s.includes('href="#move/01-老人注册"') && s.includes('这个编号已有档案')],
  ['#聊天 app/agg/file', (s) => s.includes('还没建') && s.includes('聊天 app') && s.split('<!--nav-->')[1].includes('class="cx on" data-cx="聊天 app"') && s.split('<!--nav-->')[1].includes('还没有')],
  ['#共享内核/agg/file', (s) => s.includes('只有概念')],
  ['#agg/file', (s) => s.split('<!--nav-->')[1].includes('class="cx on" data-cx="养老系统"') && s.split('<!--nav-->')[1].includes('▸</span>排版系统') && s.split('<!--nav-->')[1].includes('调动 · 清单')],
  ['#养老系统/move/01-老人注册', (s) => s.includes('<svg') && s.includes('参与者登记')],
  ['#move/01-老人注册', (s) => s.includes('<svg') && s.includes('参与者登记') && s.includes('听 资金已分到') && s.includes('返回 档案') && s.includes('建档(通知书, 支持计划)')],
  // 建模页不用人按「定下」：标题旁没有定下按钮、没有未定和定了；老现场里留着 decide、清单上记着 decidedAt 也一样
  ['#agg/file', (s) => !s.includes('class="act"') && !s.includes('>未定<') && !s.includes('>定了 ') && s.includes('<h1>')],
  ['#养老系统/agg/file', (s) => !s.includes('class="act"') && !s.includes('>未定<') && !s.includes('>定了 '), '', { DECIDE: { page: '建模', hash: '养老系统/agg/参与者档案' } }],
  ['#养老系统/list/g2', (s) => !s.includes('class="act"') && !s.includes('>未定<') && !s.includes('>定了 '), '', { CATALOG_AT: { g2: '2026-11-02' }, DECIDE: { page: '建模', hash: '养老系统/list/g2' } }],
  ['#养老系统/move/01-老人注册', (s) => !s.includes('class="act"') && !s.includes('>未定<') && !s.includes('>定了 '), '', { DECIDE: { page: '建模', hash: '养老系统/agg/file' } }],
  // 五个成员的聚合折成两排：五个都画出来，画布不比主区宽（主区去掉右边说明栏约 850）
  ['#agg/five', (s) => { const w = +s.match(/<svg width="([\d.]+)"/)[1]; return ['甲', '乙', '丙', '丁', '戊'].every((n) => s.includes(`>成员${n}</text>`)) && w <= 850 }, '', { AGGS: [{ id: 'five', title: '五个', topic: 'g2', concepts: [], summary: '', rules: [],
    members: [{ id: 'root', name: '根', kind: '根', desc: '根' }, ...['甲', '乙', '丙', '丁', '戊'].map((n) => ({ id: n, name: '成员' + n, kind: '值对象', desc: n }))],
    links: ['甲', '乙', '丙', '丁', '戊'].map((n) => ({ from: 'root', to: n, label: '第' + n + '部分，必填' })) }] }],
  // 调动图：名字长了折行、框跟着长高；查询右边的返回说明折成几行，画布给够宽
  ['#move/m', (s) => { const w = +s.match(/<svg width="([\d.]+)"/)[1]; return s.includes('>找她的登记表(姓名、</text>') && s.includes('>返回 找到的几张：姓名、出生日期、Medicare') && s.split('class="sub"').length >= 4 && w >= 780 + 280 }, '', { CATALOG: { g2: [
    { id: 'find', kind: '查询', name: '找她的登记表', in: { params: ['姓名、出生日期', 'Medicare 卡号'] }, call: { aggregate: '登记表', read: true }, out: '找到的几张：姓名、出生日期、Medicare 卡号、登记日期；没有就空', note: '两种找法任用一种；找到了也不拦，照样可以新登记' }] },
    MOVES: [{ file: 'm', title: '长名字', topic: 'g2', summary: '', rows: [{ ref: 'find' }] }] }],
  // 七个、八个成员也不裁
  ['#agg/many', manyOk(7), '', many(7)],
  ['#agg/many', manyOk(8), '', many(8)],
  // 聚合全图：样板项目四个聚合（两个是骨架）落在各自主题框里，四条线，小卡不出画布；左边栏最上面一条聚合全图
  ['#养老系统/all', (s) => allOk(s, S) && s.split('<!--nav-->')[1].includes('<a href="#all" class="sub on">聚合全图</a>') && s.includes('class="ag" data-agg="record" data-t="g5"'), '', S],
  // 选中：钉在地址里（all/<聚合>）或鼠标指着（hoverAgg）都一样；选中前后画布一样大，不跳
  ['#养老系统/all/file', (s) => allOk(s, S, 'file') && s.split('<!--nav-->')[1].includes('<a href="#all" class="sub on">聚合全图</a>'), '', S],
  ['#养老系统/all', (s) => allOk(s, S, 'record'), "hoverAgg = 'record'; render()", S],
  ['#养老系统/all', (s) => { const t = run('#养老系统/all/file', '', S); return svgSize(s).join() === svgSize(t).join() }, '', S],
  // 全图.json 没有 summary：照样画，页面上没有 undefined
  ['#养老系统/all', (s) => allOk(s, { ...S, GRAPHS: { 养老系统: { edges: S.GRAPHS['养老系统'].edges } } }) && !s.includes('undefined'), '', { ...S, GRAPHS: { 养老系统: { edges: S.GRAPHS['养老系统'].edges } } }],
  ['#养老系统/all/file', (s) => allOk(s, { ...S, GRAPHS: { 养老系统: { edges: S.GRAPHS['养老系统'].edges } } }, 'file') && !s.includes('undefined'), '', { ...S, GRAPHS: { 养老系统: { edges: S.GRAPHS['养老系统'].edges } } }],
  // 有全图.json 进页默认落在全图上；没有就落在聚合上，全图那页只摆框不画线、不给定下
  ['', (s) => s.includes('<h1>聚合全图') && s.split('<!--nav-->')[1].indexOf('聚合全图') < s.split('<!--nav-->')[1].indexOf('聚合 · 按主题'), '', S],
  ['', (s) => s.includes('<span class="kind">聚合</span>') && !s.includes('<h1>聚合全图'), '', { ...S, GRAPHS: {} }],
  ['#养老系统/all', (s) => s.includes('还没有 全图.json') && !s.includes('<g class="ed">') && s.includes('data-agg="agreement"') && !s.includes('class="badge'), '', { ...S, GRAPHS: {} }],
  // 骨架聚合：没有 rules 也能显示（不画规则卡）；成员页只说一句还没长，状态 tab 也不报错
  ['#养老系统/agg/agreement', (s) => s.includes('<svg') && s.includes('协议服务项') && !s.includes('聚合边界守的规则'), '', S],
  ['#养老系统/member/agreement/item', (s) => s.includes('还没长属性和行为') && !s.includes('class="cls"'), '', S],
  ['#养老系统/member/record/root', (s) => s.includes('还没长属性和行为'), "tab = 'life'; render()", S],
  // 聚合上的问题：挂在成员上的、挂在行为上的，都摆在成员那一页顶上，写明问的是谁；有问题的行为卡带红点；左边栏成员那行带条数
  ['#member/file/root', (s) => s.includes('问的是行为 开始服务') && s.includes('延期到 84 天') && s.includes('class="bh asked"') && s.includes('class="opt b" data-ask="a-1"') && s.split('<!--nav-->')[1].includes('参与者档案<i class="open"')],
  ['#member/fund/acct', (s) => s.includes('问的是实体 基金账户') && s.includes('data-other="1"') && !s.includes('disabled') && !s.includes('class="bh asked"')],
  ['#member/file/level', (s) => !s.includes('class="ask"')],
  ['#agg/fund', (s) => s.includes('这个聚合上有 1 条没答的问题') && s.includes('href="#member/fund/acct">基金账户<i class="open"')],
  // 收着的聚合，条数挂在聚合那一行上
  ['#agg/fund', (s) => /▸<\/span>参与者档案<i class="open"/.test(s.split('<!--nav-->')[1])],
  // 单开时点一个选项：这条问题收起
  ['#member/fund/acct', (s) => !s.includes('class="ask"') && !s.split('<!--nav-->')[1].includes('基金账户<i class="open"') && s.split('<!--nav-->')[1].includes('参与者档案<i class="open"'), "answerAsk({ ask: 'a-1', opt: '不带：下一季照通知书重新开' })"],
  // 工作台上：答的时候带着聚合、问题号、这一版的记号
  ['#养老系统/member/fund/acct', () => SENT.url === 'api/答' && SENT.body.agg === 'fund' && SENT.body.ask === 'a-1' && SENT.body.context === '养老系统' && SENT.body.sig?.length === 12 && SENT.body.text === '带', "answerAsk({ ask: 'a-1', opt: '带' })", S],
  // 角色正在改这份聚合：说明是谁，选项按不了
  ['#养老系统/member/fund/acct', (s) => s.includes('建模正在改这份聚合（改基金）') && s.includes('disabled'), '', { ...S, AGGS: S.AGGS.map((a) => a.id === 'fund' ? { ...a, locked: { role: '建模', step: '改基金' } } : a) }],
  // 全图不用定下（随着聚合改而变）：现场等他定的就是全图、钉住了、文件上记着 decidedAt，标题旁都没有定下按钮、没有未定标、也不写定了
  ...[['#养老系统/all', { ...S, DECIDE: { page: '建模', hash: '养老系统/all' } }], ['#养老系统/all/fund', { ...S, DECIDE: { page: '建模', hash: '养老系统/all' } }], ['#养老系统/all', graphWith({ decidedAt: '2026-11-09' })], ['#养老系统/all', S]]
    .map(([h, d]) => [h, (s) => s.includes('<h1>聚合全图') && !s.includes('class="act"') && !s.includes('class="badge'), '', d]),
];
// 工作台上页面发出去的请求记在 SENT 里，不真发
let SENT = {};
global.fetch = (url, o) => { SENT = { url, body: JSON.parse(o.body) }; return { then: () => ({ then() {} }) } };
let bad = 0;
for (const [h, ok, tail, data] of cases) {
  let out;
  try { out = run(h, tail, data) } catch (e) { console.log(h, 'ERROR', e.message); bad++; continue }
  const pass = out.length > 0 && ok(out);
  console.log(h, tail ? `(${tail.split(';')[0]})` : '', out.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}
// 左边栏聚合的折叠：点 ▸/▾ 合得上；合上后同一页重画不撑开；换到别的聚合它不开；换回它那一项里的页才开；合着点名字展开；记在本机
{
  const store = {}
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v } }
  const fx = "const tg = (k) => navClick({ target: { closest: (q) => q.startsWith('[data-tg]') ? { dataset: { tg: k } } : null }, preventDefault() {}, stopPropagation() {} });" +
    "const nm = (k, h) => navClick({ target: { closest: (q) => q.startsWith('a[') ? { dataset: { k }, getAttribute: () => h } : null }, preventDefault() {}, stopPropagation() {} });"
  const nav = (s) => s.split('<!--nav-->')[1]
  const openOf = (s, a) => nav(s).includes('data-tg="养老系统/' + a + '" title="收起">▾') && nav(s).includes('href="#member/' + a + '/')
  const shutOf = (s, a) => nav(s).includes('data-tg="养老系统/' + a + '" title="展开">▸') && !nav(s).includes('href="#member/' + a + '/')
  const fold = [
    ['当前聚合进页时展开', '', (s) => openOf(s, 'file') && shutOf(s, 'fund')],
    ['点 ▸/▾ 合上', "tg('养老系统/file')", (s) => shutOf(s, 'file')],
    ['合上后同一页重画不撑开', "tg('养老系统/file'); render(); render()", (s) => shutOf(s, 'file')],
    ['合上后换到别的聚合它不开', "tg('养老系统/file'); view = 'agg/fund'; render()", (s) => shutOf(s, 'file') && openOf(s, 'fund')],
    ['换回它那一项里的页才开', "tg('养老系统/file'); view = 'agg/fund'; render(); view = 'member/file/root'; render()", (s) => openOf(s, 'file')],
    ['点 ▸ 展开别的聚合、不跳页', "tg('养老系统/fund')", (s) => openOf(s, 'file') && openOf(s, 'fund') && nav(s).includes('href="#agg/file" data-k="养老系统/file" class="sub on"')],
    ['合着点名字展开', "tg('养老系统/file'); nm('养老系统/file', '#agg/file')", (s) => openOf(s, 'file')],
  ]
  for (const [name, tail, ok] of fold) {
    for (const k in store) delete store[k]
    const out = run('#养老系统/agg/file', fx + tail), pass = ok(out)
    console.log('左边栏折叠', name, pass ? 'ok' : 'FAIL'); if (!pass) bad++
  }
  // 记在本机：合上后重开页面（没换页）——上一次的记录在，进页仍替当前聚合展开一次
  {
    for (const k in store) delete store[k]
    run('#养老系统/agg/file', fx + "tg('养老系统/fund')")
    const out = run('#养老系统/agg/fund'), pass = JSON.parse(store['dev-team-lite/建模/左边栏开着的项'] ?? '{}')['养老系统/fund'] === true && openOf(out, 'fund') && openOf(out, 'file')
    console.log('左边栏折叠 记在本机', pass ? 'ok' : 'FAIL'); if (!pass) bad++
  }
  // 主题那层：默认只有当前主题展开；点主题行合得上；合上后同一页重画不撑开；换到别的主题的聚合页，那个主题自动展开（样板项目 g2 有 file、fund，g3 有 agreement，g5 有 record）
  const tOpen = (s, t) => nav(s).includes('data-tg="养老系统/主题/' + t + '" title="收起"><span class="tri">▾')
  const tShut = (s, t) => nav(s).includes('data-tg="养老系统/主题/' + t + '" title="展开"><span class="tri">▸')
  const topic = [
    ['默认只有当前主题展开', '#养老系统/agg/file', '', (s) => tOpen(s, 'g2') && tShut(s, 'g3') && tShut(s, 'g5') && nav(s).includes('href="#agg/file"') && !nav(s).includes('href="#agg/record"')],
    ['点主题行合上', '#养老系统/agg/file', "tg('养老系统/主题/g2')", (s) => tShut(s, 'g2') && !nav(s).includes('href="#agg/file"')],
    ['主题合上后同一页重画不撑开', '#养老系统/agg/file', "tg('养老系统/主题/g2'); render(); render()", (s) => tShut(s, 'g2')],
    ['换到别的主题的聚合页，那个主题展开', '#养老系统/agg/file', "view = 'agg/record'; render()", (s) => tOpen(s, 'g5') && nav(s).includes('href="#agg/record"')],
    ['点主题行展开别的主题、不跳页', '#养老系统/agg/file', "tg('养老系统/主题/g3')", (s) => tOpen(s, 'g3') && tOpen(s, 'g2') && nav(s).includes('href="#agg/agreement"') && nav(s).includes('href="#agg/file" data-k="养老系统/file" class="sub on"')],
  ]
  for (const [name, hash, tail, ok] of topic) {
    for (const k in store) delete store[k]
    const out = run(hash, fx + tail, S), pass = ok(out)
    console.log('左边栏主题折叠', name, pass ? 'ok' : 'FAIL'); if (!pass) bad++
  }
  delete global.localStorage
}
// 九个主题五列、一个聚合被十几条线指着：主区 1200（1500 宽的窗口）里图占满主区（能用的宽 1124）不横滚、缩放不低于 0.8；没选中、选中那个聚合都看，两种一样大
{
  global.MAIN_W = 1200;
  for (const f of [null, crowd.hub]) {
    const s = run('#养老系统/all' + (f ? '/' + f : ''), '', crowd), [w, h, vw] = svgSize(s), pass = fitsIn(1124, 0.8)(s) && allOk(s, crowd, f ?? undefined);
    console.log('挤的全图', f ?? '没选中', w + '×' + h, '缩放', (w / vw).toFixed(2), pass ? 'ok' : 'FAIL');
    if (!pass) bad++;
  }
  global.MAIN_W = undefined;
}
// 定下骨架：现在不用按，按了被拒，全图、现场、日志、日程都不动；在样板项目的拷贝上做
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '建模-'));
  fs.cpSync(SAMPLE, tmp, { recursive: true });
  const at = (...p) => path.join(tmp, ...p), read = (p) => fs.readFileSync(p, 'utf8');
  const scene = JSON.parse(read(at('现场.json')));
  scene.decide = { role: '建模', context: '养老系统', task: null, stage: '骨架', page: '建模', hash: '养老系统/all', text: '定下养老系统的骨架' };
  fs.writeFileSync(at('现场.json'), JSON.stringify(scene, null, 2));
  const plan0 = read(at('项目管理', '日程.json'));
  const log0 = read(at('日志', '2026-11-09.jsonl'));
  const r = applyAction(tmp, '定下', {}, { now: '2026-11-09 16:30' });
  const g = JSON.parse(read(at('上下文', '养老系统', '模型', '全图.json')));
  const pass = !r.ok && !g.decidedAt && JSON.parse(read(at('现场.json'))).decide?.hash === '养老系统/all' && read(at('日志', '2026-11-09.jsonl')) === log0 && read(at('项目管理', '日程.json')) === plan0;
  console.log('按定下骨架被拒，什么都不写', pass ? 'ok' : 'FAIL', r.error ?? '');
  if (!pass) bad++;
  fs.rmSync(tmp, { recursive: true, force: true });
}
// 第二个有模型的上下文：工作台在 BY_CX 里给它一套，切过去画它自己的聚合、清单；左边栏两边各列各的，别的上下文下面的链接带上下文名
{
  const two = { ...S, BY_CX: { ...S.BY_CX, '聊天 app': { TOPICS: { c0: { title: '群', c: 1, x: 0, y: 0 } }, AGGS: [{ id: 'grp', title: '群', topic: 'c0', concepts: [], summary: '', members: [{ id: 'root', name: '群', kind: '根', desc: '' }], links: [] }],
    CATALOG: { c0: [{ id: 'open', kind: '命令', name: '建群', in: { params: ['名字'] }, call: { aggregate: '群', behavior: '建' }, out: '群建好了', asks: [{ id: 'a-1', q: '谁能建？' }] }] }, CATALOG_AT: {},
    MOVES: [{ file: '00-建群', title: '建群', topic: 'c0', summary: '建群', rows: [{ ref: 'open' }], later: ['重名'] }], FLOW_STEPS: {} } }, GRAPHS: { ...S.GRAPHS, '聊天 app': { edges: [] } } };
  const tail = "Shell.open.add('聊天 app'); Shell.open.add('养老系统'); Shell.nav()";
  for (const [name, hash, ok] of [
    ['第二个上下文的全图', '#聊天 app/all', (s) => s.includes('data-agg="grp"') && !s.includes('data-agg="file"') && !s.includes('这个上下文的模型还没建')],
    ['第二个上下文的清单（带 asks 不报错）', '#聊天 app/list/c0', (s) => s.includes('建群') && s.includes('群建好了')],
    ['第二个上下文的调动（带 later 不报错）', '#聊天 app/move/00-建群', (s) => s.includes('建群')],
    ['左边栏两边各列各的', '#养老系统/all', (s) => { const n = s.split('<!--nav-->')[1]; return n.includes('<a href="#all" class="sub on">聚合全图</a>') && n.includes('href="#聊天 app/move/00-建群"') && n.includes('href="#聊天 app/all"') }],
    ['回到第一个上下文照旧', '#养老系统/agg/file', (s) => s.includes('参与者档案') || s.includes('data-k="养老系统/file"')]]) {
    let s = '', err = ''
    try { s = run(hash, tail, two) } catch (e) { err = e.message }
    const pass = !err && ok(s)
    console.log(name, pass ? 'ok' : 'FAIL', err)
    if (!pass) bad++
  }
}
// via 写成一串（按先后过几个领域服务）：清单里两个都列、各带抛的；调动图上领域服务那格两个名字按先后；旧的单个照旧
{
  const vias = [{ name: '管理员核对', does: '查他是不是管理员', throws: ['只有管理员加得了账户'] }, { name: '账户唯一核对', does: '查手机号有没有开过', throws: ['这个手机号开过账户了'] }]
  const one = { ...S, CONTEXTS: [...S.CONTEXTS, '账户'], BY_CX: { ...S.BY_CX, '账户': { TOPICS: { z0: { title: '账户', c: 1, x: 0, y: 0 } }, AGGS: [{ id: 'acct', title: '账户', topic: 'z0', concepts: [], summary: '', members: [{ id: 'root', name: '账户', kind: '根', desc: '' }], links: [] }],
    CATALOG: { z0: [{ id: 'add', kind: '命令', name: '管理员加账户', in: { params: ['手机号', '名字'] }, via: vias, call: { aggregate: '账户', behavior: '新建' }, out: '账户开好了' }] }, CATALOG_AT: {},
    MOVES: [{ file: '00-开账户', title: '开账户', topic: 'z0', summary: '', rows: [{ ref: 'add' }] }], FLOW_STEPS: {} } }, GRAPHS: { ...S.GRAPHS, '账户': { edges: [] } } };
  for (const [name, hash, ok] of [
    ['via 一串：清单两个都列、各带抛的', '#账户/list/z0', (s) => s.includes('管理员核对') && s.includes('账户唯一核对') && s.includes('只有管理员加得了账户') && s.includes('这个手机号开过账户了') && s.indexOf('管理员核对') < s.indexOf('账户唯一核对')],
    ['via 一串：调动图上按先后', '#账户/move/00-开账户', (s) => s.includes('管理员核对 → 账户唯一核对') || (s.includes('管理员核对') && s.includes('账户唯一核对') && s.indexOf('管理员核对') < s.indexOf('账户唯一核对'))]]) {
    let s = '', err = ''
    try { s = run(hash, "Shell.open.add('账户'); Shell.nav()", one) } catch (e) { err = e.message }
    const pass = !err && ok(s)
    console.log(name, pass ? 'ok' : 'FAIL', err)
    if (!pass) bad++
  }
}
process.exit(bad ? 1 : 0);
