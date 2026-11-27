// Static flow tracer: FE role routes -> API calls -> BE endpoints -> functions -> collections.
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const FE = path.join(ROOT, 'ARAWMS_FE/src');
const BE = path.join(ROOT, 'ARAWMS_BE/src');
const DB_COLLECTIONS = fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/).map((l) => l.split('\t')[0]).filter(Boolean);

const read = (f) => fs.readFileSync(f, 'utf8');
const UNRESOLVED = [];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } };
function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const c of [base, base + '.js', base + '.jsx', base + '.mjs', path.join(base, 'index.js'), path.join(base, 'index.jsx')]) if (exists(c)) return c;
  return null;
}
const srcCache = new Map();
const src = (f) => { if (!srcCache.has(f)) srcCache.set(f, stripComments(read(f))); return srcCache.get(f); };

// ---------- imports ----------
function parseImports(file) {
  const s = src(file); const out = []; // {file, default, named:{local:imported}, ns}
  const re = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(s))) {
    const spec = m[2] || m[3] || m[4]; const target = resolveImport(file, spec); if (!target) continue;
    const entry = { file: target, def: null, named: {}, ns: null, all: !!(m[3] || m[4]) };
    if (m[1]) {
      let clause = m[1].trim();
      const nsm = clause.match(/\*\s+as\s+(\w+)/); if (nsm) entry.ns = nsm[1];
      const nm = clause.match(/\{([\s\S]*)\}/);
      if (nm) for (const part of nm[1].split(',')) { const p = part.trim(); if (!p) continue; const [imp, loc] = p.split(/\s+as\s+/); entry.named[(loc || imp).trim()] = imp.trim(); }
      const dm = clause.replace(/\{[\s\S]*\}/, '').replace(/\*\s+as\s+\w+/, '').replace(/,/g, ' ').trim(); if (dm) entry.def = dm.split(/\s+/)[0];
    }
    out.push(entry);
  }
  return out;
}

// ---------- FE reachability ----------
function feReach(roots) {
  const seen = new Set(); const stack = [...roots];
  while (stack.length) { const f = stack.pop(); if (seen.has(f)) continue; seen.add(f); for (const i of parseImports(f)) if (/\.(jsx?|mjs)$/.test(i.file)) stack.push(i.file); }
  return seen;
}
// definitions with their api calls
function feApiCalls(file) {
  const s = src(file); const calls = [];
  const re = /\b(\w+)\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]*)\3/g; let m;
  while ((m = re.exec(s))) {
    let p = m[4].replace(/\$\{API_BASE_URL\}|\$\{API_URL\}/g, '');
    const consts = {}; for (const cm of s.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(['"`])(\/[^'"`$]*)\2/g)) consts[cm[1]] = cm[3];
    p = p.replace(/\$\{(\w+)\}/g, (all, n) => (consts[n] !== undefined ? consts[n] : all));
    if (!p.startsWith('/')) { if (p.startsWith('${')) UNRESOLVED.push(`${path.relative(FE, file)}: ${m[4]}`); continue; }
    // owner: nearest preceding definition name
    const before = s.slice(0, m.index);
    const defs = [...before.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|(?:const|let)\s+(\w+)\s*=\s*(?:useCallback\(\s*)?(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>)|(?:^|\n)\s+(\w+)\s*:\s*(?:async\s*)?(?:\(|function|\w+\s*=>)|(?:^|\n)\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g)];
    const lastD = defs[defs.length - 1]; const ownerName = lastD ? (lastD[1] || lastD[2] || lastD[3] || lastD[4]) : null;
    const _unused = [...before.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:const|let|function)\s+(\w+)|(?:^|\n)\s+(\w+)\s*:\s*(?:async\s*)?(?:\(|function|\w+\s*=>)|(?:^|\n)\s+(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g)];
    const owner = ownerName; void _unused;
    calls.push({ method: m[2].toUpperCase(), path: p.split('?')[0], owner, file });
  }
  return calls;
}
function fePathPattern(p) { return p.replace(/\$\{[^}]*\}/g, '*').replace(/\/+$/, '') || '/'; }

function roleCalls(files) {
  const list = [...files]; const res = []; const dynamic = [];
  const texts = list.map((f) => [f, src(f)]);
  for (const f of list) {
    const isLib = /[\\/](services|hooks|utils|context)[\\/]/.test(f);
    for (const c of feApiCalls(f)) {
      let used = !isLib;
      if (isLib && c.owner) used = texts.some(([g, t]) => g !== f && new RegExp(`\\b${c.owner}\\b`).test(t));
      if (isLib && !c.owner) used = true;
      if (!used) continue;
      if (c.path.includes('/owner/${resource}')) continue; // handled below
      res.push({ ...c, pattern: fePathPattern(c.path) });
    }
    // owner dynamic resources
    const s = src(f);
    for (const m of s.matchAll(/(?:useOwnerResource|ownerService\.list)\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      let lits = [...arg.matchAll(/(['"`])([^'"`]*)\1/g)].map((x) => x[2]);
      // Only mode="reports" of OwnerRecordsPage is routed (production/samples redirect), so resource = manager-reports
      if (/OwnerRecord(s|Detail)Page|OwnerRecordsPage/.test(f) && (arg === 'c.resource' || /\$\{resourceName\}/.test(arg))) lits = arg === 'c.resource' ? ['manager-reports'] : ['manager-reports/${id}'];
      if (lits.length) for (const l of lits) res.push({ method: 'GET', path: '/owner/' + l, pattern: fePathPattern('/owner/' + l), file: f, owner: 'useOwnerResource' });
      else dynamic.push(`${path.relative(FE, f)}: ${m[0]}`);
    }
    for (const m of s.matchAll(/ownerService\.detail\(\s*([^,)]+)/g)) {
      const lits = [...m[1].matchAll(/(['"`])([^'"`]*)\1/g)].map((x) => x[2]);
      if (lits.length) for (const l of lits) res.push({ method: 'GET', path: `/owner/${l}/*`, pattern: fePathPattern(`/owner/${l}/*`), file: f, owner: 'detail' });
      else dynamic.push(`${path.relative(FE, f)}: ${m[0]}`);
    }
  }
  return { calls: res, dynamic };
}

// ---------- BE ----------
const modelFiles = fs.readdirSync(path.join(BE, 'models')).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => path.join(BE, 'models', f));
const modelInfo = new Map(); // file -> {name, coll}
for (const f of modelFiles) {
  const s = read(f); const name = (s.match(/model\(\s*['"](\w+)['"]/) || [])[1];
  let coll = (s.match(/collection:\s*['"]([\w.-]+)['"]/) || [])[1];
  if (!coll && name) coll = name.toLowerCase() + 's';
  modelInfo.set(f, { name, coll });
}
const modelByName = new Map([...modelInfo.values()].map((v) => [v.name, v.coll]));
// models/index.js named exports
const modelIndex = path.join(BE, 'models/index.js'); const indexMap = {};
for (const m of read(modelIndex).matchAll(/export\s*\{\s*default\s+as\s+(\w+)\s*\}\s*from\s*['"]([^'"]+)['"]/g)) indexMap[m[1]] = resolveImport(modelIndex, m[2]);

// top-level chunks
const chunkCache = new Map();
function chunks(file) {
  if (chunkCache.has(file)) return chunkCache.get(file);
  const s = src(file); const lines = s.split('\n'); const defs = []; // {name, start}
  const top = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:const|let|var|function\*?|class)\s+(\w+)/;
  const inner = /^ {2}(?:static\s+)?(?:async\s+)?(\w+)\s*(?:\([^)]*\)\s*\{\s*$|:\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>))/;
  lines.forEach((l, i) => { const m = l.match(top); if (m) defs.push({ name: m[1], start: i, lvl: 0 }); else { const n = l.match(inner); if (n && !['if', 'for', 'while', 'switch', 'catch', 'return', 'async', 'await', 'function', 'try', 'else', 'new', 'typeof', 'throw', 'const', 'let', 'var', 'do', 'with', 'yield', 'delete', 'void', 'in', 'of', 'super', 'this'].includes(n[1])) defs.push({ name: n[1], start: i, lvl: 1 }); } });
  const map = new Map();
  defs.forEach((d, k) => {
    let end = lines.length; for (let j = k + 1; j < defs.length; j++) { if (defs[j].lvl <= d.lvl || d.lvl === 1) { end = defs[j].start; break; } }
    if (d.lvl === 0) {
      const nxt = defs.slice(k + 1).find((x) => x.lvl === 0); end = nxt ? nxt.start : lines.length;
      // a top-level statement ends at the next line that starts a new statement in column 0
      for (let j = d.start + 1; j < end; j++) if (/^[A-Za-z_$]/.test(lines[j])) { end = j; break; }
    }
    const body = lines.slice(d.start, end).join('\n');
    map.set(d.name, (map.get(d.name) || '') + '\n' + body);
  });
  // top-level statements outside defs (module side effects)
  const covered = new Set(); defs.filter((d) => d.lvl === 0).forEach((d, k, arr) => { const end = arr[k + 1] ? arr[k + 1].start : lines.length; for (let i = d.start; i < end; i++) covered.add(i); });
  map.set('__module__', lines.filter((_, i) => !covered.has(i)).join('\n'));
  // default export
  const dm = s.match(/export\s+default\s+(\w+)\s*;?/); if (dm) map.set('default', `${dm[1]}`);
  const dobj = s.match(/export\s+default\s+\{([\s\S]*?)\};?/); if (dobj) map.set('default', dobj[1]);
  chunkCache.set(file, map); return map;
}
const importCache = new Map();
const imps = (f) => { if (!importCache.has(f)) importCache.set(f, parseImports(f)); return importCache.get(f); };

function modelColl(f) { return modelInfo.get(f)?.coll; }
function traceFrom(file, name, acc, seen, depth = 0) {
  const key = file + '#' + name; if (seen.has(key) || depth > 40) return; seen.add(key);
  if (modelInfo.has(file)) { addModel(file, acc, seen); return; }
  if (file === modelIndex) { if (indexMap[name]) addModel(indexMap[name], acc, seen); return; }
  const ch = chunks(file);
  let body = ch.get(name);
  if (body === undefined) body = name === '*' ? [...ch.values()].join('\n') : ch.get('__module__') || '';
  scanBody(file, body, acc, seen, depth);
}
function addModel(mf, acc, seen) {
  const info = modelInfo.get(mf); if (!info) return; if (acc.models.has(info.coll)) return; acc.models.add(info.coll);
  // model hooks may touch other models
  for (const i of imps(mf)) if (modelInfo.has(i.file)) addModel(i.file, acc, seen); else if (i.file.includes(path.sep + 'models' + path.sep)) traceFrom(i.file, '*', acc, seen);
}
function scanBody(file, body, acc, seen, depth) {
  // raw collection names in string literals
  for (const m of body.matchAll(/['"`]([a-z_]+)['"`]/g)) if (DB_COLLECTIONS.includes(m[1]) && /collection\(|read\(|from:|collectionName|\bname\b|db\./.test(body)) acc.raw.add(m[1]);
  // model names referenced as strings (populate / mongoose.model('X'))
  for (const m of body.matchAll(/mongoose\.model\(\s*['"](\w+)['"]\s*\)/g)) if (modelByName.has(m[1])) acc.models.add(modelByName.get(m[1]));
  const ch = chunks(file);
  const tokens = new Set(body.match(/\b[A-Za-z_$][\w$]*\b/g) || []);
  for (const t of tokens) if (ch.has(t) && !['default', 'router', 'app', 'express'].includes(t) && !/=\s*(express\.)?Router\(|=\s*ownerRouter\(/.test((ch.get(t) || '').split('\n').find((l) => l.trim()) || '')) traceFrom(file, t, acc, seen, depth + 1);
  // operation capture: Model.method( / new Model( / raw collection('x').method( / read('x')
  acc.ops = acc.ops || {};
  const addOp = (coll, op) => { if (!coll) return; (acc.ops[coll] = acc.ops[coll] || new Set()).add(op); };
  for (const i of imps(file)) {
    const locals = [];
    if (i.def && modelInfo.has(i.file)) locals.push([i.def, modelInfo.get(i.file).coll]);
    for (const [loc, orig] of Object.entries(i.named)) {
      if (i.file === modelIndex && indexMap[orig]) locals.push([loc, modelInfo.get(indexMap[orig])?.coll]);
      else if (modelInfo.has(i.file)) locals.push([loc, modelInfo.get(i.file).coll]);
    }
    for (const [loc, coll] of locals) {
      if (!tokens.has(loc)) continue;
      for (const om of body.matchAll(new RegExp(`\\b${loc}\\.(\\w+)\\(`, 'g'))) addOp(coll, om[1]);
      if (new RegExp(`new\\s+${loc}\\(`).test(body)) addOp(coll, 'new+save');
      if (new RegExp(`\\b${loc}\\.collection\\.(\\w+)`).test(body)) addOp(coll, 'collection.' + body.match(new RegExp(`\\b${loc}\\.collection\\.(\\w+)`))[1]);
    }
  }
  if (/\.save\(/.test(body)) for (const [coll, ops] of Object.entries(acc.ops)) if ([...ops].some((o) => /^find/.test(o))) ops.add('doc.save?');
  for (const rm of body.matchAll(/collection\(\s*['"`]([a-z_]+)['"`]\s*\)\.(\w+)/g)) addOp(rm[1], rm[2]);
  for (const rm of body.matchAll(/\bread\(\s*['"`]([a-z_]+)['"`]/g)) addOp(rm[1], 'find');
  for (const i of imps(file)) {
    if (i.all) { continue; }
    if (i.def && tokens.has(i.def)) {
      if (modelInfo.has(i.file)) addModel(i.file, acc, seen);
      else {
        const members = [...body.matchAll(new RegExp(`\\b${i.def}\\.(\\w+)`, 'g'))].map((x) => x[1]);
        const tch = chunks(i.file);
        if (members.length) for (const mm of members) traceFrom(i.file, tch.has(mm) ? mm : 'default', acc, seen, depth + 1);
        else traceFrom(i.file, tch.has(i.def) ? i.def : 'default', acc, seen, depth + 1);
        if (tch.has('default')) { /* default object listing names */ const d = tch.get('default'); for (const mm of members) { const r = d.match(new RegExp(`\\b${mm}\\s*:\\s*(\\w+)`)); if (r) traceFrom(i.file, r[1], acc, seen, depth + 1); } }
      }
    }
    for (const [loc, orig] of Object.entries(i.named)) if (tokens.has(loc)) {
      if (i.file === modelIndex) { if (indexMap[orig]) addModel(indexMap[orig], acc, seen); }
      else if (modelInfo.has(i.file)) addModel(i.file, acc, seen);
      else traceFrom(i.file, orig, acc, seen, depth + 1);
    }
    if (i.ns && tokens.has(i.ns)) for (const mm of body.matchAll(new RegExp(`\\b${i.ns}\\.(\\w+)`, 'g'))) traceFrom(i.file, mm[1], acc, seen, depth + 1);
  }
}

// ---------- BE endpoints ----------
const rolesIn = (txt) => { const r = []; if (/\bcan\(\s*['"]warehouse\./.test(txt || '')) r.push('OWNER', 'WAREHOUSE_MANAGER'); for (const m of (txt || '').matchAll(/\w*(?:Role|role|Roles)\w*\(([^)]*)\)/g)) for (const x of m[1].matchAll(/['"](OWNER|WAREHOUSE_MANAGER|WAREHOUSE_STAFF|GARMENT_TECHNICIAN|SELLER|ACCOUNTANT)['"]/g)) r.push(x[1]); for (const m of (txt || '').matchAll(/authorize\w*\(([^)]*)\)/g)) for (const x of m[1].matchAll(/['"]([A-Z_]+)['"]/g)) r.push(x[1]); for (const m of (txt || '').matchAll(/\b(OWNER|WAREHOUSE_MANAGER|WAREHOUSE_STAFF|GARMENT_TECHNICIAN|SELLER|ACCOUNTANT)\b/g)) if (/authorize|ROLES|roles/.test(txt)) r.push(m[1]); return [...new Set(r)]; };
const GUARDS = [];
function mountsOf(file, prefix, out, seenFiles = new Set(), inherited = []) {
  const s = src(file); const im = imps(file);
  const varFile = {}; for (const i of im) if (i.def) varFile[i.def] = i.file;
  // file-level role constants e.g. const ALLOWED = authorizeRole('A','B')
  const constRoles = {}; for (const cm of s.matchAll(/const\s+(\w+)\s*=\s*(authorize\w*\([^)]*\)|\[[^\]]*\])/g)) constRoles[cm[1]] = rolesIn('authorize(' + cm[2] + ')');
  let fileRoles = [];
  // Parse every router.METHOD( ... ) call by matching parentheses, so inline handler bodies are kept whole.
  const routeCalls = [];
  {
    const rx = /router\.(get|post|put|patch|delete|all|use)\(/g; let mm;
    while ((mm = rx.exec(s))) {
      let depth = 1, j = rx.lastIndex, q = null;
      for (; j < s.length && depth; j++) {
        const ch = s[j];
        if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
        if (ch === '(') depth++; else if (ch === ')') depth--;
      }
      const inner = s.slice(rx.lastIndex, j - 1);
      const pm = inner.match(/^\s*(['"`])([^'"`]*)\1\s*,?/);
      routeCalls.push([null, mm[1], pm ? pm[1] : undefined, pm ? pm[2] : undefined, pm ? inner.slice(pm[0].length) : inner]);
      rx.lastIndex = j;
    }
  }
  const re = { k: 0, exec() { return routeCalls[this.k++] || null; } };
  let m;
  const rolesOf = (rest) => { let r = rolesIn(rest); for (const [k, v] of Object.entries(constRoles)) if (new RegExp(`\\b${k}\\b`).test(rest)) r = r.concat(v); return [...new Set(r)]; };
  while ((m = re.exec(s))) {
    const method = m[1].toUpperCase(); const p = m[3] ?? '/'; const rest = m[4];
    if (method === 'USE') {
      const ids = rest.match(/\b\w+\b/g) || []; const sub = ids.reverse().find((x) => varFile[x] && /Router\(/.test(src(varFile[x])));
      const r = rolesOf(rest);
      if (sub) mountsOf(varFile[sub], joinP(prefix, p), out, seenFiles, r.length ? r : inherited);
      else { if (r.length) { if (m[3] === undefined) fileRoles = r; else GUARDS.push({ prefix: joinP(prefix, p), roles: r, idx: out.length }); } out.push({ method: 'USE', path: joinP(prefix, p), file, mw: rest }); }
      continue;
    }
    const own = rolesOf(rest);
    out.push({ method, path: joinP(prefix, p), file, handler: rest, roles: own.length ? own : (fileRoles.length ? fileRoles : inherited) });
  }
}
const joinP = (a, b) => ('/' + [a, b].join('/').split('/').filter(Boolean).join('/'));
const endpoints = []; mountsOf(path.join(BE, 'routes/index.js'), '/', endpoints);
endpoints.forEach((e, i) => { if (e.method === 'USE' || (e.roles && e.roles.length)) return; const g = GUARDS.filter((x) => x.idx < i && (e.path + '/').startsWith(x.prefix + '/')).pop(); if (g) e.roles = g.roles; });
const routeEndpoints = endpoints.filter((e) => e.method !== 'USE');

function matchEp(method, pattern) {
  const fs_ = pattern.split('/').filter(Boolean);
  return routeEndpoints.find((e) => {
    if (e.method !== method && e.method !== 'ALL') return false;
    const es = e.path.split('/').filter(Boolean); if (es.length !== fs_.length) return false;
    const passes = /isValid/.test(e.handler || '') && /next\(\)/.test(e.handler || '');
    return es.every((seg, i) => (fs_[i].includes('*') ? seg.startsWith(':') : ((seg.startsWith(':') && !passes) || seg === fs_[i])));
  }) || routeEndpoints.find((e) => {
    if (e.method !== method && e.method !== 'ALL') return false;
    const es = e.path.split('/').filter(Boolean); if (es.length !== fs_.length) return false;
    return es.every((seg, i) => seg.startsWith(':') || fs_[i].includes('*') || seg === fs_[i]);
  });
}
const epCache = new Map();
function epCollections(e) {
  const key = e.method + ' ' + e.path; if (epCache.has(key)) return epCache.get(key);
  const acc = { models: new Set(), raw: new Set() };
  const seenKeys = new Set(); scanBody(e.file, e.handler, acc, seenKeys);
  if (process.env.DEBUG_EP && key === process.env.DEBUG_EP) console.error('TRACE', key, '\n  ' + [...seenKeys].map((k) => path.relative(BE, k.split('#')[0]) + '#' + k.split('#')[1]).join('\n  '));
  epCache.set(key, acc); return acc;
}

// ---------- roles ----------
const P = (rel) => path.join(FE, rel);
const pages = (dir, names) => names.map((n) => P(`${dir}/${n}.jsx`));
const roles = {
  COMMON: [P('App.jsx'), P('main.jsx'), P('routes/AppRouter.jsx').replace(/x$/, 'x'), ...pages('pages', ['HomePage', 'LoginPage', 'RegisterPage', 'ForgotPasswordPage', 'ResetPasswordPage', 'AccountPage'])],
  SELLER: [P('components/seller/SellerLayout.jsx'), ...pages('pages/seller', ['SellerChatPage', 'SellerOrdersPage', 'SellerCustomersPage'])],
  ACCOUNTANT: [P('routes/AccountantRoutes.jsx')],
  WAREHOUSE_MANAGER: [P('components/warehouse/WarehouseManagerLayout.jsx'), ...pages('pages/warehouse', ['SupplierInboundPage', 'MaterialOutboundPage', 'FinishedGoodsPage', 'FinishedGoodsProductPage', 'BarcodeTrackingPage', 'DefectWarehousePage', 'WarehouseReportPage', 'TechnicalInboundPage', 'TechnicalOutboundPage', 'InboundProgressPage', 'ProductConfigurationPage', 'WarehouseLayoutPage', 'StocktakePage', 'StocktakeReportDetailPage'])],
  WAREHOUSE_STAFF: [P('components/warehouse/WarehouseStaffLayout.jsx'), ...pages('pages/warehouse', ['WarehousePutawayPage', 'MaterialOutboundPage', 'FinishedGoodsPage', 'FinishedGoodsProductPage', 'BarcodeTrackingPage', 'WarehousePackingPage', 'OrderQrPage', 'ShippingPage'])],
  GARMENT_TECHNICIAN: [P('components/garment/GarmentLayout.jsx'), ...pages('pages/garment', ['GarmentDashboardPage', 'GarmentRawMaterialsPage', 'GarmentLotManagementPage', 'MaterialInboundVerificationPage', 'FinishedGoodsInspectionPage', 'GarmentReturnInspectionPage', 'GarmentStocktakeExecutionPage', 'GarmentMaterialOutboundPage', 'GarmentCuttingAndRemnantPage'])],
  OWNER: [P('pages/Owner/OwnerLayout.jsx'), ...pages('pages/Owner', ['InboundPlanDetailPage', 'ContractDetailPage', 'ProductCatalogPage', 'OperationsPage', 'EmployeesPage', 'ActivityPage', 'OwnerRecordsPage', 'SystemSettingsPage', 'StockAdjustmentPage', 'EmployeeCreatePage', 'OwnerRecordDetailPage', 'StockAdjustmentDetailPage', 'OwnerDeviationDetailPage', 'OwnerPlanDeviationsPage'])],
};
// COMMON should not pull in role pages via AppRouter
const commonStop = new Set(Object.entries(roles).filter(([r]) => r !== 'COMMON').flatMap(([, v]) => v));
commonStop.add(P('routes/AccountantRoutes.jsx')); commonStop.add(P('routes/WarehouseRoutes.jsx'));

const result = {}; const unmatched = {}; const usedEps = new Set(); const dyn = {};
for (const [role, rootsRaw] of Object.entries(roles)) {
  const roots = rootsRaw.filter(exists);
  let files;
  if (role === 'COMMON') { const seen = new Set(); const st = [...roots]; while (st.length) { const f = st.pop(); if (seen.has(f) || commonStop.has(f) || /[\\/]pages[\\/](Owner|seller|garment|warehouse|accountant)[\\/]/.test(f)) continue; seen.add(f); for (const i of imps(f)) if (/\.(jsx?|mjs)$/.test(i.file)) st.push(i.file); } files = seen; }
  else files = feReach(roots);
  const { calls, dynamic } = roleCalls(files); dyn[role] = dynamic;
  const per = new Map(); unmatched[role] = [];
  for (const c of calls) {
    const ep = matchEp(c.method, c.pattern);
    if (!ep) { unmatched[role].push(`${c.method} ${c.pattern}  (${path.relative(FE, c.file)})`); continue; }
    usedEps.add(ep.method + ' ' + ep.path);
    const cols = epCollections(ep);
    for (const col of [...cols.models, ...cols.raw]) { if (!per.has(col)) per.set(col, new Set()); per.get(col).add(`${ep.method} /api${ep.path}`); }
  }
  result[role] = per;
}
// middleware (authenticate) — every authenticated call
const mwAcc = { models: new Set(), raw: new Set() };
const authMw = path.join(BE, 'common/middlewares/authenticate.js'); if (exists(authMw)) traceFrom(authMw, '*', mwAcc, new Set());

const out = { roles: {}, unmatched, dynamic: dyn, middleware: [...mwAcc.models, ...mwAcc.raw] };
for (const [r, per] of Object.entries(result)) out.roles[r] = Object.fromEntries([...per.entries()].sort().map(([k, v]) => [k, [...v].sort()]));
out.unusedEndpoints = routeEndpoints.filter((e) => !usedEps.has(e.method + ' ' + e.path)).map((e) => {
  const c = epCollections(e); return { ep: `${e.method} /api${e.path}`, file: path.relative(BE, e.file), cols: [...c.models, ...c.raw].sort() };
});
out.allEndpointCount = routeEndpoints.length;
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
const allUsed = new Set([...Object.values(out.roles).flatMap((o) => Object.keys(o)), ...out.middleware]);
console.log('endpoints:', routeEndpoints.length, 'used by FE:', usedEps.size);
for (const [r, o] of Object.entries(out.roles)) console.log(`\n== ${r} (${Object.keys(o).length}): ${Object.keys(o).join(', ')}`);
console.log('\nmiddleware:', out.middleware.join(', '));
console.log('\nDB collections NOT reached by any role:', DB_COLLECTIONS.filter((c) => !allUsed.has(c)).join(', '));
console.log('\nUnmatched FE calls:'); for (const [r, u] of Object.entries(unmatched)) if (u.length) console.log(' ', r, '\n    ' + [...new Set(u)].join('\n    '));
console.log('\nUnresolved FE paths:', [...new Set(UNRESOLVED)].join('\n  '));
console.log('\nDynamic owner calls:'); for (const [r, u] of Object.entries(dyn)) if (u.length) console.log(' ', r, '\n    ' + u.join('\n    '));

// ---------- per-page map ----------
function routesFrom(routerFile, roleOf) {
  const s = src(routerFile); const im = imps(routerFile); const compFile = {};
  for (const i of im) if (i.def) compFile[i.def] = i.file;
  for (const m of s.matchAll(/const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g)) compFile[m[1]] = resolveImport(routerFile, m[2]);
  const out = []; let curRole = null;
  for (const line of s.split('\n')) {
    const rm = line.match(/role="([A-Z_]+)"/); if (rm) curRole = rm[1];
    const pm = line.match(/path="([^"]+)"\s+element=\{<(\w+)([^}]*)/);
    if (pm && compFile[pm[2]] && pm[2] !== 'Navigate') out.push({ role: roleOf || curRole, url: pm[1], comp: pm[2], props: pm[3].replace(/\/>.*/, '').trim(), file: compFile[pm[2]] });
  }
  return out;
}
const pageRoutes = [
  ...routesFrom(P('routes/AppRouter.jsx')).map((r) => ({ ...r, role: r.url.startsWith('/owner') || !r.url.startsWith('/') ? 'OWNER' : r.role })),
  ...routesFrom(P('routes/AccountantRoutes.jsx'), 'ACCOUNTANT').map((r) => ({ ...r, url: '/accountant/' + r.url })),
  ...routesFrom(P('routes/WarehouseRoutes.jsx')),
];
// fix roles for AppRouter public/common routes
for (const r of pageRoutes) { if (['/login', '/register', '/forgot-password', '/reset-password', '/account', '/'].includes(r.url)) r.role = 'COMMON'; else if (r.url.startsWith('/seller')) r.role = 'SELLER'; else if (r.url.startsWith('/garment')) r.role = 'GARMENT_TECHNICIAN'; else if (!r.url.startsWith('/') ) r.role = 'OWNER'; }
const layouts = { SELLER: 'components/seller/SellerLayout.jsx', ACCOUNTANT: 'components/accountant/AccountantLayout.jsx', WAREHOUSE_MANAGER: 'components/warehouse/WarehouseManagerLayout.jsx', WAREHOUSE_STAFF: 'components/warehouse/WarehouseStaffLayout.jsx', GARMENT_TECHNICIAN: 'components/garment/GarmentLayout.jsx', OWNER: 'pages/Owner/OwnerLayout.jsx' };
const pagesOut = [];
const fmt = (c) => { const ep = matchEp(c.method, c.pattern); if (!ep) return { call: `${c.method} ${c.pattern}`, unmatched: true }; const cols = epCollections(ep); return { ep: `${ep.method} /api${ep.path}`, roles: ep.roles || [], be: path.relative(BE, ep.file), cols: [...cols.models, ...cols.raw].sort(), fe: path.relative(FE, c.file), fn: c.owner }; };
const stopShared = (f) => /[\/](App|main|AppRouter)\.jsx$/.test(f);
for (const r of pageRoutes) {
  const st = [r.file]; const seen = new Set();
  while (st.length) { const f = st.pop(); if (seen.has(f) || stopShared(f)) continue; seen.add(f); for (const i of imps(f)) if (/\.(jsx?|mjs)$/.test(i.file)) st.push(i.file); }
  // exclude files reachable from the role layout (shown separately)
  const { calls } = roleCalls(seen);
  const uniq = new Map(); for (const c of calls) { const x = fmt(c); uniq.set(x.ep || x.call, x); }
  pagesOut.push({ role: r.role, url: r.url, comp: r.comp, props: r.props, file: path.relative(FE, r.file), apis: [...uniq.values()] });
}
for (const [role, lf] of Object.entries(layouts)) { const seen = feReach([P(lf)]); const { calls } = roleCalls(seen); const uniq = new Map(); for (const c of calls) { const x = fmt(c); uniq.set(x.ep || x.call, x); } pagesOut.push({ role, url: '(layout)', comp: path.basename(lf), file: lf, apis: [...uniq.values()] }); }
fs.writeFileSync(process.argv[4].replace('.json', '_pages.json'), JSON.stringify({ pages: pagesOut, endpoints: routeEndpoints.map((e) => ({ ep: `${e.method} /api${e.path}`, roles: e.roles || [], file: path.relative(BE, e.file) })) }, null, 1));
console.log('pages:', pagesOut.length);

// ================= FINAL per-role aggregation from curated flows =================
{
  const ROLES = ['OWNER', 'ACCOUNTANT', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'GARMENT_TECHNICIAN', 'SELLER'];
  const epByKey = new Map(routeEndpoints.map((e) => [`${e.method} /api${e.path}`, e]));
  const find = (method, p) => { const e = matchEp(method, fePathPattern(p)); return e ? `${e.method} /api${e.path}` : null; };
  // Known false positives found during manual review
  const EXCLUDE = {
    WAREHOUSE_MANAGER: ['POST /api/raw-material-inbound/materials', 'POST /api/raw-material-inbound/locations', 'POST /api/garment-technical/raw-materials', 'POST /api/products/locations'],
    WAREHOUSE_STAFF: ['POST /api/shipping/handovers/:id/confirm', 'POST /api/products/locations'],
    ALL: ['POST /api/shipping/handovers/:id/confirm'],
  };
  const per = Object.fromEntries([...ROLES, 'COMMON', 'SYSTEM'].map((r) => [r, new Set()]));
  const runnerFiles = { 'components/PackingUploadRunner.jsx': ['WAREHOUSE_STAFF'], 'components/ReturnUploadRunner.jsx': ['GARMENT_TECHNICIAN', 'WAREHOUSE_MANAGER', 'OWNER'], 'components/CatalogSyncRunner.jsx': ['WAREHOUSE_MANAGER'], 'components/FinishedGoodsSyncRunner.jsx': ['WAREHOUSE_MANAGER'] };
  const allowed = (key, role) => { const e = epByKey.get(key); return !e || !e.roles || !e.roles.length || e.roles.includes(role); };
  for (const pg of pagesOut) {
    const role = pg.role === 'COMMON' ? 'COMMON' : pg.role;
    for (const a of pg.apis) {
      if (!a.ep) continue;
      if ((EXCLUDE[role] || []).includes(a.ep) || EXCLUDE.ALL.includes(a.ep)) continue;
      if (role !== 'COMMON' && !allowed(a.ep, role)) continue;
      // account/auth/notification endpoints counted as COMMON
      if (/^(GET|POST|PATCH|DELETE) \/api\/(auth|accounts|notifications)\b/.test(a.ep)) { per.COMMON.add(a.ep); continue; }
      per[role].add(a.ep);
    }
  }
  for (const [rf, rs] of Object.entries(runnerFiles)) { const files = feReach([P(rf)]); const { calls } = roleCalls(files); for (const c of calls) { const k = find(c.method, c.path); if (k) for (const r of rs) if (allowed(k, r)) per[r].add(k); } }
  // auth endpoints (login/forgot/reset pages are wrapped in PublicRoute, not captured by route parser)
  for (const [m, p] of [['POST', '/auth/login'], ['POST', '/auth/logout'], ['POST', '/auth/forgot-password'], ['POST', '/auth/reset-password'], ['GET', '/auth/google/config'], ['POST', '/auth/google/challenge'], ['POST', '/auth/google/login'], ['GET', '/accounts/me'], ['PATCH', '/accounts/me'], ['PATCH', '/accounts/me/password'], ['POST', '/accounts/me/phone/otp'], ['POST', '/accounts/me/phone/confirm'], ['POST', '/accounts/me/google/challenge'], ['POST', '/accounts/me/google'], ['DELETE', '/accounts/me/google'], ['GET', '/notifications'], ['PATCH', '/notifications/x/read'], ['PATCH', '/notifications/mark-all-read']]) { const k = find(m, p.replace('/x/', '/*/')); if (k) per.COMMON.add(k); }
  // dynamic paths
  const add = (r, m, p) => { const k = find(m, p); if (k) per[r].add(k); else console.error('MISSING', r, m, p); };
  add('OWNER', 'POST', '/owner/operations-report/payments');
  for (const a of ['lock', 'unlock', 'deactivate', 'reactivate']) add('OWNER', 'PATCH', `/owner/employees/*/${a}`);
  add('WAREHOUSE_STAFF', 'GET', '/warehouse-putaway/tasks/*/*');
  for (const a of ['location', 'scan', 'shortage', 'incident']) add('WAREHOUSE_STAFF', 'POST', `/warehouse-putaway/tasks/*/*/${a}`);
  // system / external flows
  add('SYSTEM', 'GET', '/conversations/routing/inbound-webhook'); add('SYSTEM', 'POST', '/conversations/routing/inbound-webhook');
  add('SYSTEM', 'POST', '/ghn/webhook'); add('SYSTEM', 'POST', '/carriers/ghn/webhook'); add('SYSTEM', 'POST', '/shipping/webhooks/ghn');
  const coll = (k) => { const e = epByKey.get(k); const c = epCollections(e); return { cols: [...new Set([...c.models, ...c.raw])], ops: c.ops || {} }; };
  const matrix = {}; // coll -> role -> {eps:Set, ops:Set}
  for (const [r, set] of Object.entries(per)) for (const k of set) { const { cols, ops } = coll(k); for (const c of cols) { const m = ((matrix[c] = matrix[c] || {})[r] = matrix[c][r] || { eps: new Set(), ops: new Set() }); m.eps.add(k); for (const o of (ops[c] || [])) m.ops.add(o); } }
  // middleware users / layoutPermission roles already inside endpoint traces; authenticate:
  (matrix.users = matrix.users || {}).COMMON = matrix.users.COMMON || { eps: new Set(), ops: new Set() }; matrix.users.COMMON.eps.add('middleware authenticate'); matrix.users.COMMON.ops.add('findOne');
  const out = { generatedAt: new Date().toISOString(), roleEndpoints: Object.fromEntries(Object.entries(per).map(([r, s]) => [r, [...s].sort()])), matrix: Object.fromEntries(Object.entries(matrix).sort().map(([c, rs]) => [c, Object.fromEntries(Object.entries(rs).map(([r, v]) => [r, { eps: [...v.eps].sort(), ops: [...v.ops].sort() }]))])) };
  fs.writeFileSync(process.argv[4].replace('.json', '_final.json'), JSON.stringify(out, null, 1));
  console.log('FINAL roles endpoints:', Object.entries(per).map(([r, s]) => r + '=' + s.size).join(' '));
}
