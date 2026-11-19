// 给 document、location 装个假的，把页面脚本跑一遍，各视图 render 一次；报错就说明页面会白板
// 后半截用机器上的 Chrome 或 Edge（找法在 tools/browser.js）不开窗口真排一次版：文件结构小样每行不出卡片、关系图上的字不压框、外面的框不重叠
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const html = fs.readFileSync(`${__dirname}/小样.html`, 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const els = {};
const el = (id) => (els[id] ??= { innerHTML: '', hidden: false, addEventListener() {}, dataset: {}, className: '', style: {}, classList: { toggle() {} } });
global.Shell = require('../../lib/shell.js').Shell;   // 框架：顶栏、左边栏
global.document = { getElementById: el, querySelector: el, querySelectorAll: () => [], addEventListener() {} };
global.window = { addEventListener() {} };
global.location = { hash: '' };
// data：当作工作台注入的 window.DATA；不给就是单开小样
// 后半截有的检查自己先放好 window.DATA 再调 run：这里只在给了 data 的时候换，跑完放回原样
const run = (hash, tail = '', data) => {
  const keep = global.window.DATA; if (data) global.window.DATA = data;
  try { global.location.hash = hash; els.main = undefined; els.nav = undefined; eval(script + '\n' + tail + '\n'); return els.main.innerHTML + '\n<!--nav-->\n' + els.nav.innerHTML } finally { global.window.DATA = keep }
};
// 样板项目经 lib/project.js 读出来的编码页数据，另加一个也有文件结构的上下文「聊天 app」：页面换上下文时换着用
const S = require('../../lib/project.js').pageData(path.join(__dirname, '..', '..', 'sample'), '编码', { now: '2026-11-09 16:20' });
const TWO = { ...S, BY_CX: { '聊天 app': { MODEL: { topics: {}, aggs: [], items: [], flows: [] }, STRUCT: { lang: 'TypeScript', root: 'app', files: [{ path: 'app/chat.ts', kind: '技术件' }] }, PROGRESS: { updatedAt: '2026-11-09 16:00', status: {}, runs: [] },
  PSEUDO: { 'app/chat.ts': { blocks: [{ name: '发消息', steps: ['发出去'], asks: [{ id: 'a-1', q: '发不出去要不要重试？', lean: '要：重试三次', sig: 'abcdefabcdef' }] }] } }, CODE: {} } } };
let SENT = {};
global.fetch = (url, o) => { SENT = { url, body: JSON.parse(o.body) }; return { then: () => ({ then() {} }) } };
// 关系图里的框：两两不重叠（外面的东西多于一样时竖着排，不叠在一处）
const rectsOf = (s) => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1, 5).map(Number));
const apart = (rs) => rs.every(([x, y, w, h], i) => rs.slice(i + 1).every(([x2, y2, w2, h2]) => x + w <= x2 || x2 + w2 <= x || y + h <= y2 || y2 + h2 <= y));
const SAMPLE_STRUCT = `${__dirname}/../../sample/上下文/样例系统/代码/规范/结构设计.json`;
const cases = [
  ['#tree', (s) => s.includes('class="tree"') && s.includes('participant-file.ts') && s.includes('共 21 个文件') && s.includes('清单 <b>建档</b>') && s.includes('左边点一个文件') && s.split('<!--nav-->')[1].includes('技术选型') && !s.split('<!--nav-->')[1].includes('走通一段')],
  ['#spec/结构设计', (s) => s.includes('<svg class="arch"') && (s.match(/<rect x="200"/g) || []).length === 3 && (s.match(/marker-end/g) || []).length === 6 && s.includes('政府门户') && s.includes('>银行<') && rectsOf(s).length === 6 && apart(rectsOf(s)) && s.includes('class="code tree-sample"') && s.includes('<span class="p">in-memory-participant-file-repository.ts</span>') && s.includes('style="--ind:4ch"') && !s.includes('class="decide"') && !s.includes('等你定') && !s.includes(' 定下</span>'), 'delete STRUCTURE.modules; render()'],
  // 结构图：只画一个模块看结构（不出真主题名），ports/ 经端口指到「别的模块」；infras/ 里 http/、event-bus/，两条总线都在 event-bus/ 里；依赖箭头 11 条：层与层 3 条、bootstrap → module.ts、bootstrap → 模块间总线、module.ts → event-bus/、adapters/ → event-bus/、adapters/ → http/、ports/ → 别的模块、外面两样 → http/
  ['#spec/结构设计', (s) => s.includes('<svg class="struct"') && !s.includes('class="arch2"') && (s.match(/class="fr mod"/g) || []).length === 1 && s.includes('>&lt;模块&gt;/<') && s.includes('>一个主题一个模块，每个都这样摆<') && !s.includes('>g2 参与者档案与她名下的钱<') && !s.includes('还有 ') && s.includes('class="b rest" data-id="别的模块"') && s.includes('data-id="infras/http/"') && s.includes('class="fr ev" data-id="infras/event-bus/"') && s.includes('class="b bus" data-id="bus/模块内"') && s.includes('class="b bus" data-id="bus/模块间"') && s.indexOf('data-id="bus/模块间"') > s.indexOf('data-id="infras"') && (s.match(/<path class="e/g) || []).length === 11 && (s.match(/<path class="e x"/g) || []).length === 3 && s.includes('data-from="模块/adapters/" data-to="模块/application/"') && s.includes('data-from="模块/application/" data-to="模块/domain/"') && s.includes('data-from="模块/adapters/" data-to="模块/domain/"') && s.includes('data-from="bootstrap" data-to="模块/module.ts"') && s.includes('data-from="bootstrap" data-to="bus/模块间"') && s.includes('data-from="模块/module.ts" data-to="infras/event-bus/"') && s.includes('data-from="模块/adapters/" data-to="infras/http/"') && s.includes('data-from="模块/adapters/" data-to="infras/event-bus/"') && s.includes('data-from="模块/ports/" data-to="别的模块"') && s.includes('data-from="out/银行" data-to="infras/http/"') && s.includes('>端口<') && s.includes('class="code tree-sample"') && s.includes('>modules/<')],
  // 旧数据小样里模块放在 contexts/ 下：图上照它写 contexts/
  ['#spec/结构设计', (s) => s.includes('<svg class="struct"') && s.includes('>contexts/<') && !s.includes('>modules/<'), "STRUCTURE.sample = [{ line: 'src/' }, { line: '  contexts/orders/' }, ...STRUCTURE.sample.slice(1)]; render()"],
  // 模块再多也只画一个，不列「还有几个」、不出主题名
  ['#spec/结构设计', (s) => (s.match(/class="fr mod"/g) || []).length === 1 && !s.includes('还有 ') && !s.includes('g9') && s.includes('data-to="别的模块"'), "STRUCTURE.modules = [1,2,3,4,5,6,7].map((i) => ({ topic: 'g' + i, dir: 'm' + i })); MODEL.aggs.push({ id: 'x', title: 'x', topic: 'g9', members: [] }); render()"],
  // 全局结构：左边栏顶上一条；四层一层一行；十个框（两个是嵌在父框里的小框）、虚框四个；线八条，线上几个字、note 停上去看；图例按上下文；定下按钮不带上下文
  ['#全局结构', (s) => s.includes('<svg class="glob"') && s.split('<!--nav-->')[1].includes('class="cx proj on" href="#全局结构"') && ['用的人', '前端', '后端', '存储与外部'].every((r) => s.includes('class="rw" x="14"') && s.includes('>' + r + '</text>')) && (s.match(/<g class="n /g) || []).length === 10 && (s.match(/<rect class="c"/g) || []).length === 2 && (s.match(/ later/g) || []).length === 4 && s.includes('原型没有：正式化时接') && (s.match(/<path class="e /g) || []).length === 8 && s.includes('>群和消息</text>') && s.includes('带着凭证调沟通模块的口') && s.includes('class="sw t0"></i>样例系统') && s.includes('class="sw t1"></i>沟通 app') && !s.includes('class="decide"') && !s.includes('等你定') && !s.includes(' 定下</span>') && !s.includes('class="badge">模板')],
  // 四层从上到下；写了 in 的在父框里面；外部和数据库同一行、排在右边
  ['#全局结构', (s) => { const R = Object.fromEntries([...s.matchAll(/<g class="n[^"]*" data-id="([^"]+)"[^>]*>(?:<title>[^<]*<\/title>)?<rect class="[bc]" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => [m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] }])); const ins = (k, p) => R[k].x >= R[p].x && R[k].y >= R[p].y && R[k].x + R[k].w <= R[p].x + R[p].w && R[k].y + R[k].h <= R[p].y + R[p].h; return R.cp.y < R.web.y && R.web.y < R.api.y && R.api.y < R.db.y && R.db.y === R.gov.y && R.gov.x > R.files.x && ins('dlg', 'web') && ins('chat', 'api') && s.includes('data-in="web"') && s.includes('data-in="api"') }],
  // 旧数据：没有 in、label 一长句没有 note：照样画，线上取第一小句截短，整句停上去看
  ['#全局结构', (s) => (s.match(/<rect class="c"/g) || []).length === 0 && (s.match(/<g class="n /g) || []).length === 10 && /class="lt"[^>]*>经 \/api 调各业务模块[^<]{0,4}…<\/text>/.test(s) && s.includes('经 /api 调各业务模块的命令和查询、传取文件；登录屏填的交给账号模块核') && s.includes('>电脑上用</text>'), "GLOBAL.nodes.forEach((n) => delete n.in); GLOBAL.edges[0].label = '电脑上用：录登记表、建档、签协议、排计划预算、录服务和发票、出月结单、做申报'; GLOBAL.edges[2] = { from: 'web', to: 'api', label: '经 /api 调各业务模块的命令和查询、传取文件；登录屏填的交给账号模块核、凭证放进 cookie' }; render()"],
  ['#全局结构', (s) => !s.includes('定了') && !s.includes('class="decide"') && s.includes('class="badge">模板'), 'GLOBAL.decidedAt = "2026-11-02"; GLOBAL.fromTemplate = true; render()'],
  // 样板项目的结构设计 outside 两条：两个框各在一处、各一条线
  ['#spec/结构设计', (s) => { const o = s.slice(s.indexOf('事件、查询')); return (o.match(/<rect /g) || []).length === 2 && apart(rectsOf(s)) && (o.match(/marker-end/g) || []).length === 2 && new Set(o.match(/<path d="M[\d.]+,[\d.]+/g)).size === 2 }, `delete STRUCTURE.modules; STRUCTURE.outside = JSON.parse(require('fs').readFileSync(${JSON.stringify(SAMPLE_STRUCT)}, 'utf8')).outside; render()`],
  ['#spec/文件命名', (s) => s.includes('class="code tree-sample"') && s.includes('class="g tee"') && s.includes('class="g end"') && s.includes('class="g bar"') && s.includes('class ParticipantFile<') && s.includes('in-memory-&lt;根&gt;-repository') && !s.includes('class="decide"') && !s.includes('等你定') && !s.includes(' 定下</span>') && !s.includes('class="t qa"')],
  ['#tree/src/participant-file/participant-file.ts', (s) => s.includes('class="tree"') && s.includes('class="f on"') && s.includes('class="psrow"') && s.includes('class="code ps tests"') && s.includes('抛 通知书不全') && s.includes('给  通知书 编号为空') && s.includes('style="--ind:4ch">编号 ← 通知书.编号')],
  ['#tree/src/participant-file/register.ts', (s) => s.includes('参与者登记.查唯一')],
  // 文件的 model.context 指到别的上下文：聚合名从那个上下文的模型里来，前面带上下文名；结构设计里这个模块标出归哪个上下文
  ['#tree', (s) => s.includes('聊天 app › 群 › <b>群</b>') && s.includes('data-key="聊天 app:agg/grp/root"'), "MODELS['聊天 app'] = { topics: {}, aggs: [{ id: 'grp', title: '群', topic: 'a1', members: [{ id: 'root', name: '群', kind: '根' }] }], items: [], flows: [] }; STRUCT.files.push({ path: 'src/communication/group.ts', kind: '聚合根', model: { context: '聊天 app', aggregate: 'grp', member: 'root' } }); treeToggle('样例系统:src/communication'); render()"],
  ['#spec/结构设计', (s) => s.includes('class="xcx"') && s.includes('modules/communication/</b>：模型在「聊天 app」上下文'), "STRUCTURE.modules.push({ dir: 'communication', context: '聊天 app', holds: '群和消息' }); render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('开立') && s.includes('季度结束') && !s.includes('还没写伪代码')],
  ['#tree/src/fund/fund.test.ts', (s) => s.includes('测试文件不另写伪代码')],
  // 文件树：默认只开当前文件那一串；点文件夹只开合；收起后同一个文件重画不撑开；换了文件那一串再开
  ['#tree', (s) => s.includes('data-tg="src" title="收起"') && s.includes('data-tg="src/participant-file" title="收起"') && s.includes('data-tg="src/fund" title="展开"') && !s.includes('data-path="src/fund/fund.ts"') && s.includes('class="card tree-box"')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="收起"') && s.includes('data-tg="src/participant-file" title="展开"') && s.includes('class="f on') && !s.includes('data-path="src/participant-file/register.ts"')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="展开"') && !s.includes('data-path="src/fund/fund.ts"'), "treeToggle('样例系统:src/fund'); render(); render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/fund" title="收起"') && s.includes('data-path="src/fund/fund-account.ts"'), "treeToggle('样例系统:src/fund'); render(); view = 'tree/src/fund/fund-account.ts'; render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('data-tg="src/participant-file" title="收起"') && s.includes('data-tg="src/fund" title="收起"'), "treeToggle('样例系统:src/participant-file'); render()"],
  // 树栏整栏收起：默认展开、头上有收起钮；收起后只剩窄边、记进本机；换文件仍收着；再展开回来
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col"') && s.includes('data-tree-hide') && s.includes('data-tree-show')],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col hide"') && s.includes('<!--ls:1-->'), "globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null }, setItem(k, v) { this.m[k] = String(v) } }; treeHide(true); render(); els.main.innerHTML += '<!--ls:' + localStorage.m['dev-team-lite/编码/文件树收起'] + '-->'"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col hide"') && s.includes('class="f on') , "treeHide(true); view = 'tree/src/fund/fund-account.ts'; render()"],
  ['#tree/src/fund/fund.ts', (s) => s.includes('class="l tree-col"') && s.includes('<!--ls:0-->'), "globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null }, setItem(k, v) { this.m[k] = String(v) } }; treeHide(true); render(); treeHide(false); render(); els.main.innerHTML += '<!--ls:' + localStorage.m['dev-team-lite/编码/文件树收起'] + '-->'"],
  // 伪代码不用按定下：页头没有定下钮，框头没有未定、定了，左边栏没有等你定；老文件里带着 decidedAt 也一样
  ['#tree/src/participant-file/participant-file.ts', (s) => !s.includes('data-pseudo') && !s.includes('>未定</span>') && !s.includes('>定了</span>') && !s.split('<!--nav-->')[1].includes('class="wait"') && s.includes('class="code ps"')],
  ['#tree/src/participant-file/participant-file.ts', (s) => !s.includes('data-pseudo') && !s.includes(' 定下</span>') && !s.includes('>定了</span>'), "STRUCT.decidedAt = '2026-11-04'; render()"],
  ['#spec/技术选型', (s) => s.includes('node:http') && s.includes('模板：Express') && s.includes('原型阶段没有前端') && s.split('<!--nav-->')[1].includes('class="sub on"')],
  ['#排版系统/spec/技术选型', (s) => s.includes('还没开始') && s.split('<!--nav-->')[1].includes('class="cx on" data-cx="排版系统"')],
  // 伪代码上的问题：没点开文件时右边列出有问题的文件；点开的文件里，问题跟在它说的那一块下面，选项第一个是偏向；文件树上带红点
  ['#tree', (s) => s.includes('伪代码上有 1 条问题没答') && s.includes('href="#tree/src/fund/fund-account.ts"') && s.includes('fund/<i class="open"')],
  ['#tree/src/fund/fund-account.ts', (s) => s.includes('软件工程师问的是 扣 这一块') && s.includes('class="opt b" data-ask="a-1" data-opt="不算：直接返回，不发事件"') && s.includes('data-other="1"') && s.includes('fund-account.ts<i class="open"') && !s.includes('disabled')],
  ['#tree/src/fund/fund.ts', (s) => !s.includes('class="ask"')],
  // 单开时点一个选项：这条问题收起，红点没了
  ['#tree/src/fund/fund-account.ts', (s) => !s.includes('class="ask"') && !s.includes('class="open"'), "answerAsk({ ask: 'a-1', opt: '不算：直接返回，不发事件' })"],
  // 工作台上：样板项目照样摆；别的有文件结构的上下文也看得到它的文件、伪代码和问题，答的时候带着它自己的上下文名
  ['#样例系统/tree/src/fund/fund-account.ts', (s) => s.includes('软件工程师问的是 扣 这一块') && s.includes('共 21 个文件'), '', TWO],
  ['#聊天 app/tree', (s) => s.includes('共 1 个文件') && s.includes('chat.ts') && s.includes('伪代码上有 1 条问题没答') && s.split('<!--nav-->')[1].includes('app/'), '', TWO],
  ['#聊天 app/tree/app/chat.ts', (s) => s.includes('发不出去要不要重试') && s.includes('照偏向') && !s.includes('fund-account'), '', TWO],
  ['#聊天 app/tree/app/chat.ts', () => SENT.body?.context === '聊天 app' && SENT.body.pseudo === 'app/chat.ts' && SENT.body.ask === 'a-1' && SENT.body.sig === 'abcdefabcdef' && SENT.body.text === '要：重试三次', "answerAsk({ ask: 'a-1', opt: '要：重试三次' })", TWO],
  ['#聊天 app/spec/结构设计', (s) => s.includes('共 1 个文件'), '', TWO],
  ['#排版系统/tree', (s) => s.includes('还没开始'), '', TWO],
  // 角色正在改这份伪代码：说明是谁，选项按不了
  ['#tree/src/fund/fund-account.ts', (s) => s.includes('软件工程师正在改这份伪代码（改伪代码）') && s.includes('data-opt="不算：直接返回，不发事件" disabled'), "PSEUDO['src/fund/fund-account.ts'].locked = { role: '软件工程师', step: '改伪代码' }; render()"],
];
let bad = 0;
for (const [h, ok, tail, data] of cases) {
  let out;
  try { out = run(h, tail, data) } catch (e) { console.log(h, 'ERROR', e.message); bad++; continue }
  const pass = out.length > 0 && ok(out);
  console.log(h, tail ? `(${tail.split(';')[0].slice(0, 40)})` : '', out.length, pass ? 'ok' : 'FAIL');
  if (!pass) bad++;
}

// ---------- 顶栏「原型」：没有不出；一个直接链、圆点照开没开、没开提示怎么起；几个点开挑；数据从 代码/原型.json 读 ----------
{
  const S = require('../../lib/shell.js').Shell
  const up = { context: '甲', url: 'http://127.0.0.1:5290/', start: '在 代码/ 下 npm run dev', up: true }
  const down = { context: '乙', url: 'http://127.0.0.1:5291/', start: '在 乙/代码/ 下 npm run dev', note: '后端在 3291', up: false }
  const { prototypes } = require('../../lib/project.js')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-proto-'))
  fs.writeFileSync(path.join(tmp, '项目.json'), JSON.stringify({ name: 't', contexts: [{ name: '甲' }, { name: '乙' }] }))
  fs.mkdirSync(path.join(tmp, '上下文', '甲', '代码'), { recursive: true })
  fs.writeFileSync(path.join(tmp, '上下文', '甲', '代码', '原型.json'), JSON.stringify({ url: up.url, start: up.start }))
  const read = prototypes(tmp)
  fs.rmSync(tmp, { recursive: true, force: true })
  const protoCases = [
    ['没有原型不出入口', S.protoLink([]) === ''],
    ['一个开着：直接链、新标签、绿点', ((s) => s.startsWith('<a class="proto" href="http://127.0.0.1:5290/" target="_blank"') && s.includes('class="dot up"') && s.includes('甲 · 开着'))(S.protoLink([up]))],
    ['一个没开：灰点、提示怎么起', ((s) => s.includes('class="dot"') && !s.includes('dot up') && s.includes('乙 · 没开：在 乙/代码/ 下 npm run dev（后端在 3291）'))(S.protoLink([down]))],
    ['几个：点开挑、各带开没开', ((s) => s.startsWith('<details class="proto">') && s.includes('甲 · 开着') && s.includes('乙 · 没开'))(S.protoLink([up, down]))],
    ['读 原型.json：没写的上下文不出', read.length === 1 && read[0].context === '甲' && read[0].url === up.url],
  ]
  for (const [name, pass] of protoCases) { console.log('顶栏原型', name, pass ? 'ok' : 'FAIL'); if (!pass) bad++ }
}

// ---------- 伪代码、规范都不用按定下：动作没了，按了被拒、什么都不写；等你定只列小样（首页与 scene.js pending 共用 pendingDecisions） ----------
{
  const { applyAction, pendingDecisions } = require('../../lib/project.js')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtl-nodecide-'))
  const w = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)) }
  const k = path.join(tmp, '上下文', '甲', '代码')
  w(path.join(tmp, '项目.json'), { name: 't', contexts: [{ name: '甲' }], kernel: { concepts: [] } })
  w(path.join(k, '结构.json'), { lang: 'TypeScript', root: 'src', files: [{ path: 'src/a.ts', kind: '命令' }] })
  w(path.join(k, '伪代码', 'src', 'a.ts.json'), { file: 'src/a.ts', blocks: [{ name: '处理', steps: ['一'] }] })
  w(path.join(k, '规范', '结构设计.json'), { layers: [{ name: '领域', holds: '规则' }] })
  w(path.join(tmp, '上下文', '甲', '界面', 'N-9.json'), { req: 'N-9', title: '看余额', views: [{ screens: [{ id: 's1', decidedAt: '2026-11-01' }, { id: 's2' }, { id: 's3' }] }] })
  const errs = [], now = '2026-11-05T10:00'
  try {
    for (const [act, body] of [['定伪代码', { context: '甲' }], ['定规范', { kind: '结构设计', context: '甲' }]]) {
      let threw = false; try { applyAction(tmp, act, body, { now }) } catch { threw = true }
      if (!threw) errs.push(act + ' 还在')
    }
    const r = applyAction(tmp, '定下', {}, { now })
    if (r.ok) errs.push('不带小样的定下没被拒')
    if (fs.existsSync(path.join(tmp, '日志'))) errs.push('被拒了还记了日志')
    if (JSON.parse(fs.readFileSync(path.join(k, '结构.json'), 'utf8')).decidedAt) errs.push('结构.json 被写了 decidedAt')
    const p0 = pendingDecisions(tmp)
    if (p0.length !== 1 || p0[0].page !== '界面' || p0[0].title !== '看余额 · 小样' || p0[0].hash !== '甲/N-9/s2' || p0[0].ref !== 'N-9' || p0[0].note !== '2 / 3 屏没定') errs.push('等你定 应只有小样那 1 条 ' + JSON.stringify(p0))
  } catch (e) { errs.push('出错 ' + e.message) } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
  console.log('伪代码、规范按定下被拒；等你定只列小样（临时项目）', errs.length ? 'FAIL' : 'ok'); errs.forEach((e) => console.log('   ', e)); if (errs.length) bad++
  if (html.includes("post('定伪代码'") || html.includes("post('定规范'") || html.includes('waitWord(')) { console.log('页面还留着定下的代码 FAIL'); bad++ }
}

// ---------- 别的上下文先起草的规范：结构设计、文件命名都照它自己那份画出来（总线空着、还没有模型也画） ----------
{
  const own = { between: '模块之间走事件', layers: [{ name: '外壳', holds: '页面' }, { name: '应用', holds: '调口' }], deps: [['外壳', '应用']],
    modules: [{ dir: 'chat', holds: '群和消息' }, { dir: 'files', holds: '传文件' }], parts: [{ dir: 'pages/', layer: '外壳', holds: '屏' }, { dir: 'api/', layer: '应用', holds: '调后端' }],
    top: [{ dir: 'bootstrap/', holds: '入口' }], buses: [], outside: [{ name: '推送服务', how: '锁屏提醒' }], sample: [{ line: 'src/' }, { line: '  modules/' }, { line: '    chat/' }, { line: '      pages/' }] }
  const naming = { sample: [{ line: 'src/' }, { line: '  app/main.tsx', kind: '入口', exports: 'main' }, { line: '  modules/chat/pages/ChatPage.tsx', kind: '技术件' }] }
  const sets = [['写死的', { CONTEXTS: ['样例系统', '沟通 app', '共享内核'], SPECS: { '沟通 app': { '结构设计': own, '文件命名': naming } } }]]
  if (process.env.CHECK_PROJECT) sets.push(['真项目 ' + path.basename(process.env.CHECK_PROJECT), require('../../lib/project.js').pageData(process.env.CHECK_PROJECT, '编码')])
  for (const [name, data] of sets) {
    const errs = []
    try {
      global.window.DATA = data
      const sp = data.SPECS['沟通 app'] ?? {}
      if (!sp['结构设计'] || !sp['文件命名']) errs.push('数据里没有沟通 app 的结构设计或文件命名')
      const s1 = run('#沟通 app/spec/结构设计').split('<!--nav-->')[0]
      if (s1.includes('页面还没画出来')) errs.push('结构设计还写「页面还没画出来」')
      if (!s1.includes('<svg class="struct"') && !s1.includes('<svg class="arch"')) errs.push('结构设计没画图')
      if ((s1.match(/class="ln"/g) || []).length !== (sp['结构设计']?.sample ?? []).length) errs.push('结构设计的小样行数不对')
      const s2 = run('#沟通 app/spec/文件命名').split('<!--nav-->')[0]
      if (!s2.includes('class="code tree-sample"') || (s2.match(/class="ln"/g) || []).length !== (sp['文件命名']?.sample ?? []).length) errs.push('文件命名的小样没画全')
    } catch (e) { errs.push('出错 ' + e.message) } finally { delete global.window.DATA }
    console.log('别的上下文的规范画得出来', name, errs.length ? 'FAIL' : 'ok'); errs.forEach((e) => console.log('   ', e)); if (errs.length) bad++
  }
}

// ---------- 前端的结构设计（kind: 前端）：照 React 常用的按功能分画，不套后端的模块和总线 ----------
{
  const T = (k) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'templates', k + '.json'), 'utf8'))
  const front = T('结构设计-前端'), fnaming = T('文件命名-前端')
  const errs = []
  try {
    for (const [where, data, hash] of [['本上下文', { STRUCTURE: front, NAMING: fnaming }, '#spec/结构设计'], ['别的上下文', { CONTEXTS: ['样例系统', '沟通 app', '共享内核'], SPECS: { '沟通 app': { '结构设计': front, '文件命名': fnaming } } }, '#沟通 app/spec/结构设计']]) {
      global.window.DATA = data
      const m = run(hash).split('<!--nav-->')[0]
      if (!m.includes('<svg class="struct front"')) errs.push(where + ' 没画前端的图')
      if (m.includes('class="fr mod"') || m.includes('模块内总线')) errs.push(where + ' 套了后端的模块或总线')
      if ((m.match(/<rect class="fr feat"/g) || []).length !== front.features.length) errs.push(where + ' 功能框数不对')
      if ((m.match(/<rect class="b" data-id="[^"]+\/(components|hooks|api)"/g) || []).length !== front.features.length * front.layers.length) errs.push(where + ' 功能里的几块数不对')
      if (!m.includes('>app/<') || !m.includes('>features/<') || !m.includes('data-id="shared/lib/"')) errs.push(where + ' 没有 app/、features/ 或 lib/')
      if ((m.match(/class="e x"/g) || []).length !== front.api.length || !m.includes('data-id="api/后端"')) errs.push(where + ' 调口没连到后端')
      if (!m.includes('路由 · 路径、哪一屏、谁进得了') || (m.match(/<tr><td><code>/g) || []).length !== front.routes.length) errs.push(where + ' 路由表不对')
      if ((m.match(/class="ln"/g) || []).length !== front.sample.length) errs.push(where + ' 小样行数不对')
      const n = run(hash.replace('结构设计', '文件命名')).split('<!--nav-->')[0]
      if ((n.match(/class="ln"/g) || []).length !== fnaming.sample.length || !n.includes('MessageList.tsx') || !n.includes('useMessages.ts')) errs.push(where + ' 前端文件命名没画全')
    }
  } catch (e) { errs.push('出错 ' + e.message) } finally { delete global.window.DATA }
  console.log('前端的结构设计画得出来（模板样例）', errs.length ? 'FAIL' : 'ok'); errs.forEach((e) => console.log('   ', e)); if (errs.length) bad++
}


// ---------- 真排版 ----------
// 浏览器怎么找，和截图工具共用 tools/browser.js
const { exe, why: noBrowser } = require('../../tools/browser.js').findBrowser();
// 页面里量：小样每个格子的右边不出 pre 的内容框、pre 不横向滚；图上每个字要么整个在它落脚的框里，要么不碰任何框；框两两不重叠
const PROBE = `<script>(() => {
  const out = [], VIEWS = ['spec/结构设计', 'spec/文件命名', '全局结构']
  // 别的上下文先起草的规范也排一遍（前端的结构设计在这里排）
  const RUNS = [...Object.entries(typeof SPECS === 'object' ? SPECS : {}).filter(([cx]) => cx !== context).flatMap(([cx, sp]) => ['结构设计', '文件命名'].filter((k) => sp[k]).map((k) => [cx, 'spec/' + k])), ...VIEWS.map((v) => [context, v])]
  const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5
  const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5
  for (const [cx, v] of RUNS) {
    context = cx; view = v; render()
    const main = document.getElementById('main')
    for (const pre of main.querySelectorAll('pre.tree-sample')) {
      const r = pre.getBoundingClientRect(), cs = getComputedStyle(pre)
      const right = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
      if (pre.scrollWidth > pre.clientWidth + 1) out.push(v + ' 小样横向溢出 ' + pre.scrollWidth + ' > ' + pre.clientWidth)
      pre.querySelectorAll('.ln').forEach((ln, i) => ln.querySelectorAll('span').forEach((e) => { const er = e.getBoundingClientRect(); if (er.right > right + 0.5) out.push(v + ' 第 ' + (i + 1) + ' 行「' + e.textContent.slice(0, 40) + '」出了卡片 ' + Math.round(er.right - right) + 'px') }))
    }
    // 结构图：不横向溢出；叶子格子两两不叠；线不穿过它两头以外的格子；字不压线（线上的小卡只跟别的线比）；格子里的字不出格子
    for (const svg of main.querySelectorAll('svg.struct')) {
      if (svg.getBoundingClientRect().width > svg.parentElement.clientWidth + 1) out.push(v + ' 结构图横向溢出')
      const leaf = [...svg.querySelectorAll('rect.b')].map((x) => ({ id: x.dataset.id, b: x.getBBox() }))
      leaf.forEach((a, i) => leaf.slice(i + 1).forEach((c) => { if (hit(a.b, c.b)) out.push(v + ' 结构图两个格子重叠 ' + a.id + ' 与 ' + c.id) }))
      const segs = [...svg.querySelectorAll('path.e')].flatMap((p) => { const pts = p.getAttribute('d').slice(1).split(' L').map((q) => q.split(',').map(Number)); return pts.slice(1).map((q, i) => ({ id: p.dataset.e, from: p.dataset.from, to: p.dataset.to, a: pts[i], b: q })) })
      const pts = (sg) => Array.from({ length: 61 }, (_, i) => i / 60).map((t) => [sg.a[0] + (sg.b[0] - sg.a[0]) * t, sg.a[1] + (sg.b[1] - sg.a[1]) * t])
      const inR = (r, [x, y], m) => x > r.x + m && x < r.x + r.width - m && y > r.y + m && y < r.y + r.height - m
      for (const sg of segs) for (const l of leaf) if (l.id !== sg.from && l.id !== sg.to && pts(sg).some((q) => inR(l.b, q, 1))) out.push(v + ' 结构图的线 ' + sg.from + ' → ' + sg.to + ' 穿过 ' + l.id)
      // 两条线不叠成一段：同一条横线或竖线上重合超过 2px
      const ov = (a, b) => { const H = (sg) => sg.a[1] === sg.b[1], V = (sg) => sg.a[0] === sg.b[0], o = (p, q, r, t) => Math.min(Math.max(p, q), Math.max(r, t)) - Math.max(Math.min(p, q), Math.min(r, t))
        if (H(a) && H(b) && Math.abs(a.a[1] - b.a[1]) < 1) return o(a.a[0], a.b[0], b.a[0], b.b[0]) > 2
        if (V(a) && V(b) && Math.abs(a.a[0] - b.a[0]) < 1) return o(a.a[1], a.b[1], b.a[1], b.b[1]) > 2
        return false }
      segs.forEach((a, i) => segs.slice(i + 1).forEach((b) => { if (a.id !== b.id && ov(a, b)) out.push(v + ' 结构图两条线叠在一起 ' + a.from + ' → ' + a.to + ' 与 ' + b.from + ' → ' + b.to) }))
      // 模块的 ports/（有这一格的话）有虚线到「别的模块」
      for (const m of svg.querySelectorAll('rect.fr.mod')) if (svg.querySelector('rect.b[data-id="' + m.dataset.id + '/ports/"]') && !svg.querySelector('path.e.x[data-from="' + m.dataset.id + '/ports/"][data-to="别的模块"]')) out.push(v + ' 结构图 ' + m.dataset.id + ' 的 ports/ 没有虚线到别的模块')
      // 模块的 adapters/ 都指到总线那组和 http/
      const evId = svg.querySelector('rect.fr.ev')?.dataset.id, httpId = [...svg.querySelectorAll('rect.b')].map((x) => x.dataset.id).find((d) => d.startsWith('infras/http'))
      for (const m of svg.querySelectorAll('rect.fr.mod')) for (const to of [evId, httpId]) if (to && !segs.some((sg) => sg.from === m.dataset.id + '/adapters/' && sg.to === to)) out.push(v + ' 结构图 ' + m.dataset.id + ' 的 adapters/ 没有线到 ' + to)
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox(), own = t.dataset.for
        if (segs.some((sg) => sg.id !== own && pts(sg).some((q) => inR(b, q, 0.5)))) out.push(v + ' 结构图的字「' + t.textContent + '」压在线上')
        const host = leaf.find((l) => l.b.x <= b.x + 1 && b.x + 1 <= l.b.x + l.b.width && l.b.y <= b.y + b.height / 2 && b.y + b.height / 2 <= l.b.y + l.b.height)
        if (host ? !inside(b, host.b) : leaf.some((l) => hit(b, l.b))) out.push(v + ' 结构图的字「' + t.textContent + '」出了格子或压在格子上')
      }
      const vb = svg.viewBox.baseVal; svg.querySelectorAll('text').forEach((t) => { const b = t.getBBox(); if (b.x < 0 || b.x + b.width > vb.width + 0.5) out.push(v + ' 结构图的字「' + t.textContent + '」出了图') })
    }
    for (const svg of main.querySelectorAll('svg.glob')) {
      const host = svg.parentElement
      if (svg.getBoundingClientRect().width > host.clientWidth + 1) out.push(v + ' 全局结构横向溢出')
      const nodes = [...svg.querySelectorAll('rect.b')].map((x) => x.getBBox()), kids = [...svg.querySelectorAll('rect.c')].map((x) => x.getBBox()), lbs = [...svg.querySelectorAll('rect.lb')].map((x) => x.getBBox())
      nodes.forEach((a, i) => nodes.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 全局结构两个框重叠') }))
      lbs.forEach((a, i) => { if ([...nodes, ...kids].some((b) => hit(a, b))) out.push(v + ' 线上的字压在框上 @' + Math.round(a.x) + ',' + Math.round(a.y)); lbs.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 线上的字互相压着') }) })
      // 小框在父框里面、彼此不叠
      svg.querySelectorAll('g.n.kid').forEach((g) => { const r = g.querySelector('rect.c').getBBox(), p = svg.querySelector('g.n[data-id="' + g.dataset.in + '"] rect.b')?.getBBox(); if (!p || !inside(r, p)) out.push(v + ' 小框 ' + g.dataset.id + ' 出了父框') })
      kids.forEach((a, i) => kids.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 全局结构两个小框重叠') }))
      svg.querySelectorAll('g.n').forEach((g) => { const r = g.querySelector('rect.b,rect.c').getBBox(); g.querySelectorAll('text').forEach((t) => { if (!inside(t.getBBox(), r)) out.push(v + ' 框里的字「' + t.textContent + '」出了框') }) })
      const vb = svg.viewBox.baseVal; lbs.forEach((l) => { if (l.x < 0 || l.y < 0 || l.x + l.width > vb.width + 0.5 || l.y + l.height > vb.height + 0.5) out.push(v + ' 线上的字出了图 @' + Math.round(l.x) + ',' + Math.round(l.y)) })
      svg.querySelectorAll('text.lt').forEach((t) => { const b = t.getBBox(); if (!lbs.some((l) => inside(b, l))) out.push(v + ' 线上的字「' + t.textContent + '」出了底') })
    }
    for (const svg of main.querySelectorAll('svg.arch')) {
      const rects = [...svg.querySelectorAll('rect')].map((x) => x.getBBox())
      rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => { if (hit(a, b)) out.push(v + ' 图上两个框重叠 @' + Math.round(a.x) + ',' + Math.round(a.y) + ' 与 ' + Math.round(b.x) + ',' + Math.round(b.y)) }))
      for (const t of svg.querySelectorAll('text')) {
        const b = t.getBBox(), host = rects.find((r) => r.x <= b.x + 1 && b.x + 1 <= r.x + r.width && r.y <= b.y + b.height / 2 && b.y + b.height / 2 <= r.y + r.height)
        if (host ? !inside(b, host) : rects.some((r) => hit(b, r))) out.push(v + ' 图上的字「' + t.textContent + '」压在框边上')
      }
    }
  }
  // 伪代码页头没有定下钮
  if (!LIVE && Object.keys(PSEUDO).length) {
    view = 'tree/' + Object.keys(PSEUDO)[0]; render()
    if (document.querySelector('h1 button.decide')) out.push('伪代码 页头还有定下钮')
  }
  // 文件树栏：固定高度、栏内滚，不撑长整页；文件名不横着出栏
  view = 'tree/' + STRUCT.files[STRUCT.files.length - 1].path; render()
  const box = document.querySelector('.tree-box')
  if (!box) out.push('文件树 没有树栏')
  else {
    const cs = getComputedStyle(box)
    if (!/auto|scroll/.test(cs.overflowY) || cs.maxHeight === 'none') out.push('文件树 树栏没有固定高度或不在栏内滚 ' + cs.overflowY + ' ' + cs.maxHeight)
    if (box.getBoundingClientRect().height > innerHeight - 40) out.push('文件树 树栏比一屏还高 ' + Math.round(box.getBoundingClientRect().height))
    if (box.scrollWidth > box.clientWidth + 1) out.push('文件树 文件名横着出了栏 ' + box.scrollWidth + ' > ' + box.clientWidth)
  }
  // 树栏整栏收起：点钮只剩窄边、右边变宽、记进本机；换文件仍收着；点窄边展开回来
  {
    const col = () => document.querySelector('.tree-col'), rw = () => document.querySelector('.row2>.r').getBoundingClientRect().width
    document.head.insertAdjacentHTML('beforeend', '<style>.tree-col{transition:none!important}</style>')
    const w0 = rw(), hb = document.querySelector('[data-tree-hide]')
    if (!hb) out.push('文件树 没有收起钮')
    else {
      hb.click()
      const cw = col().getBoundingClientRect().width
      if (!col().classList.contains('hide') || cw > 40) out.push('文件树 点收起后树栏没缩成窄边 ' + Math.round(cw))
      if (rw() < w0 + 300) out.push('文件树 收起后伪代码栏没变宽 ' + Math.round(w0) + ' → ' + Math.round(rw()))
      let saved = null; try { saved = localStorage.getItem('dev-team-lite/编码/文件树收起') } catch {}
      if (saved !== '1') out.push('文件树 收起没记进本机 ' + saved)
      view = 'tree/' + STRUCT.files[0].path; render()
      if (!col().classList.contains('hide')) out.push('文件树 换了文件树栏又展开了')
      if (!document.querySelector('.row2>.r .card')) out.push('文件树 收起后右边没有伪代码')
      document.querySelector('[data-tree-show]').click()
      if (col().classList.contains('hide') || col().getBoundingClientRect().width < 300) out.push('文件树 点窄边没展开')
      try { localStorage.removeItem('dev-team-lite/编码/文件树收起') } catch {}
    }
  }
  const p = document.createElement('pre'); p.id = '__layout'; p.textContent = JSON.stringify(out); document.body.appendChild(p)
})()</script>`;
function layout(data, width) {
  const page = html.replace('<head>', `<head><base href="${pathToFileURL(__dirname + '/').href}">${data ? `<script>window.DATA = ${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : ''}`).replace(/<\/body>/, PROBE + '</body>');
  const tmp = path.join(os.tmpdir(), `dtl-coding-check-${process.pid}.html`);
  fs.writeFileSync(tmp, page);
  try {
    const dom = execFileSync(exe, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--window-size=${width},1000`, '--virtual-time-budget=1500', '--dump-dom', pathToFileURL(tmp).href], { encoding: 'utf8', timeout: 30000, maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = dom.match(/<pre id="__layout">([\s\S]*?)<\/pre>/);
    if (!m) return ['没量到（页面脚本可能报错了）'];
    return JSON.parse(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  } finally { fs.rmSync(tmp, { force: true }) }
}
if (!exe) console.log('真排版', '跳过：' + noBrowser);
else {
  // 写死的数据；再换一份长的：模板默认、外面三样、一行特别长的文件名和说明
  const T = (k) => JSON.parse(fs.readFileSync(`${__dirname}/../../templates/${k}.json`, 'utf8'));
  const long = { line: '      tests/modules/visit-and-assessment-application/domain/registration-form/aggregate-root.RegistrationFormAggregateRoot.test.ts', layer: '领域', note: '这一行故意很长：文件名本身就比卡片还宽，说明也写得很长很长，看它折行之后还能不能整行看全，不被右边截掉' };
  const struct = T('结构设计'), naming = T('文件命名');
  struct.outside = [...struct.outside, { name: '银行', how: '付款' }, { name: 'Services Australia 政府门户', how: '查补贴' }];
  struct.sample = [...struct.sample, long];
  naming.sample = [...naming.sample, { ...long, kind: '测试', exports: 'describe RegistrationFormAggregateRoot, describe RegistrationFormAggregateRoot.register' }];
  const eight = { ...struct, modules: ['visit-and-assessment-application', 'participant-file-and-agreements', 'services-and-price-list', 'funds', 'care-plans-and-budgets', 'service-records', 'monthly-statements', 'claims-and-payments'].map((dir, i) => ({ topic: 'g' + i, dir })) };
  const glong = T('全局结构');
  glong.nodes = [...glong.nodes, { id: 'm', name: '手机 app', kind: '前端', context: '沟通', holds: '老人和家属在手机上看余额、聊天、看月结单，一句故意写得很长的说明，看它在框里折行', later: '第三期' }, { id: 'mb', name: '沟通模块', kind: '后端', context: '沟通', in: 'api', holds: '消息、群聊' }, { id: 'mb2', name: '账号模块', kind: '后端', context: '订单', in: 'api', holds: '账户、角色；核登录、发凭证，一句故意写得很长的说明看它截不截' }, { id: 'dlg', name: '对话框', kind: '前端', context: '沟通', in: 'web', holds: '我在的群', later: '第三期' }, { id: 'gov', name: 'Services Australia 政府门户', kind: '外部', holds: '申报' }];
  glong.edges = [...glong.edges, { from: 'm', to: 'mb', label: 'HTTP', note: '带凭证调沟通模块的口' }, { from: 'dlg', to: 'mb', label: '群和消息' }, { from: 'gov', to: 'clerk', label: '门户上看结果' }, { from: 'mb', to: 'api', label: '查询：照护伙伴和名下老人、档案、照护计划；互发事件' }, { from: 'api', to: 'gov', label: '申报、付款对账' }];
  const sets = [['写死的', null], ['模板加长行、外面三样', { STRUCTURE: struct, NAMING: naming, GLOBAL: T('全局结构') }], ['八个模块、全局结构加长', { STRUCTURE: eight, NAMING: naming, GLOBAL: glong }]]
  // 外面的东西一多，接进 http 的线要的道就宽：七样，线不能压到外面的框上
  const seven = { ...struct, outside: ['沟通 app', '短信服务', '邮件服务', '推送服务（苹果、谷歌、浏览器各家）', '银行', 'Services Australia 政府门户', '财务系统'].map((name) => ({ name, how: '接进 http' })) }
  sets.push(['外面七样', { STRUCTURE: seven, NAMING: naming, GLOBAL: T('全局结构') }])
  sets.push(['前端样例', { STRUCTURE: T('结构设计-前端'), NAMING: T('文件命名-前端'), GLOBAL: T('全局结构') }])
  if (process.env.CHECK_PROJECT) sets.push(['真项目 ' + path.basename(process.env.CHECK_PROJECT), require('../../lib/project.js').pageData(process.env.CHECK_PROJECT, '编码')])
  for (const [name, data] of sets) {
    for (const w of [1500, 1100]) {
      let errs;
      try { errs = layout(data, w) } catch (e) { errs = ['跑浏览器出错 ' + e.message] }
      console.log('真排版', name, w, errs.length ? 'FAIL' : 'ok');
      errs.forEach((e) => console.log('   ', e));
      if (errs.length) bad++;
    }
  }
}
process.exit(bad ? 1 : 0);
