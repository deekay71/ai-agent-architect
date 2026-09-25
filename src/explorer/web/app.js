'use strict';
const $ = id => document.getElementById(id);
let snapshot, mode = 'memory', selected = null, traceId = null, camera = { x: 0, y: 0, k: 1 };
let positions = new Map(), layoutKey = '', nodeDrag = null, lastNodeClick = { id: null, at: 0 };
const svgNS = 'http://www.w3.org/2000/svg';
const short = (value, count = 28) => value.length > count ? value.slice(0, count - 1) + '…' : value;
function element(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function svg(tag, attrs = {}, text) { const el = document.createElementNS(svgNS, tag); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value)); if (text !== undefined) el.textContent = text; return el; }
function node(id) { return snapshot.nodes.find(item => item.id === id); }
function setSelect(id, values) { const select = $(id), first = select.firstElementChild.cloneNode(true), previous = select.value; select.replaceChildren(first); [...new Set(values)].filter(Boolean).sort().forEach(v => { const option = element('option', v); option.value = v; select.append(option); }); select.value = previous; }
function filteredNodes() { const q = $('search').value.trim().toLowerCase(); return snapshot.nodes.filter(n =>
  (!q || (n.id + ' ' + n.label + ' ' + n.statement).toLowerCase().includes(q)) &&
  (!$('kind').value || n.kind === $('kind').value) && (!$('freshness').value || n.freshness === $('freshness').value) &&
  (!$('lifecycle').value || n.lifecycle === $('lifecycle').value)); }
function updateList() {
  const list = $('list'); list.replaceChildren();
  const items = mode === 'memory' ? filteredNodes() : snapshot.traces.filter(t => (t.agentId + t.windowId + t.role).toLowerCase().includes($('search').value.toLowerCase()));
  $('list-title').textContent = mode === 'memory' ? 'BẢN GHI' : 'AGENT WINDOWS'; $('list-count').textContent = items.length;
  if (mode === 'memory' && !items.some(n => n.id === selected)) selected = items[0]?.id ?? null;
  if (mode === 'trace' && !items.some(t => t.traceId === traceId)) traceId = items[0]?.traceId ?? null;
  if (mode === 'trace') { const trace = items.find(t => t.traceId === traceId); if (trace && selected !== `context:${trace.windowId}` && !trace.entries.some(e => e.nodeId === selected)) selected = `context:${trace.windowId}`; }
  for (const item of items) {
    const active = mode === 'memory' ? item.id === selected : item.traceId === traceId;
    const button = element('button', undefined, 'record' + (active ? ' selected' : '')); button.setAttribute('aria-pressed', String(active));
    button.append(element('span', mode === 'memory' ? item.label : item.agentId, 'record-name'));
    button.append(element('small', mode === 'memory' ? item.kind + ' · ' + short(item.id, 24) : item.windowId));
    const states = element('div', undefined, 'row-state');
    for (const value of mode === 'memory' ? [item.lifecycle, item.freshness].filter(Boolean) : [item.role, item.entries.filter(e => e.state === 'loaded').length + ' loaded']) states.append(element('span', value, 'tone-' + value));
    button.append(states); button.addEventListener('click', () => { if (mode === 'memory') selected = item.id; else { traceId = item.traceId; selected = item.entries[0]?.nodeId ?? null; } resetCamera(); render(); }); list.append(button);
  }
  if (!items.length) list.append(element('p', 'Không có kết quả trong phạm vi này.', 'muted'));
}
function graphEdges() { return snapshot.edges.filter(e => mode === 'trace' || !$('edge-type').value || e.type === $('edge-type').value); }
function neighborhood() {
  if (mode === 'trace') { const trace = snapshot.traces.find(t => t.traceId === traceId); if (!trace) return new Set(); const contextId = `context:${trace.windowId}`, ids = new Set(trace.entries.map(e => e.nodeId).filter(Boolean)); ids.add(contextId); for (const edge of snapshot.edges) if (edge.from === contextId && node(edge.to)?.kind === 'constraint') ids.add(edge.to); return ids; }
  if ($('graph-mode').value === 'all') return new Set(filteredNodes().map(n => n.id));
  if (!selected) return new Set(); const allowed = new Set(filteredNodes().map(n => n.id)), ids = new Set([selected]);
  for (let i = 0; i < Number($('depth').value); i++) { const previous = new Set(ids); for (const e of graphEdges()) if (allowed.has(e.from) && allowed.has(e.to) && (previous.has(e.from) || previous.has(e.to))) { ids.add(e.from); ids.add(e.to); } }
  return ids;
}
function resetCamera() { camera = { x: 0, y: 0, k: 1 }; }
function applyCamera() { $('scene').setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.k})`); }
function forceLayout(nodes, edges) {
  const count = nodes.length, result = new Map();
  nodes.forEach((n, i) => { const a = i * 2.3999632297, r = 40 + Math.sqrt(i + 1) * 38; result.set(n.id, { x: 400 + Math.cos(a) * r, y: 300 + Math.sin(a) * r, vx: 0, vy: 0 }); });
  for (let step = 0; step < 220; step++) {
    const alpha = 1 - step / 240;
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      const a = result.get(nodes[i].id), b = result.get(nodes[j].id), dx = b.x - a.x, dy = b.y - a.y, d = Math.max(16, Math.hypot(dx, dy)), force = 4500 / (d * d * d) * alpha;
      a.vx -= dx * force; a.vy -= dy * force; b.vx += dx * force; b.vy += dy * force;
    }
    for (const e of edges) { const a = result.get(e.from), b = result.get(e.to), dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, force = (d - 135) / d * .015 * alpha; a.vx += dx * force; a.vy += dy * force; b.vx -= dx * force; b.vy -= dy * force; }
    for (const p of result.values()) { p.vx = (p.vx + (400 - p.x) * .004 * alpha) * .68; p.vy = (p.vy + (290 - p.y) * .004 * alpha) * .68; p.x = Math.min(715, Math.max(85, p.x + p.vx)); p.y = Math.min(525, Math.max(75, p.y + p.vy)); }
  }
  return result;
}
function graphPoint(event) { const point = $('graph').createSVGPoint(); point.x = event.clientX; point.y = event.clientY; const p = point.matrixTransform($('graph').getScreenCTM().inverse()); return { x: (p.x - camera.x) / camera.k, y: (p.y - camera.y) / camera.k }; }
function renderGraph() {
  const ids = neighborhood(), all = snapshot.nodes.filter(n => ids.has(n.id));
  // Cap only the visible neighborhood. The list and snapshot keep every permitted record.
  const nodes = all.slice(0, 70); if (selected && all.some(n => n.id === selected) && !nodes.some(n => n.id === selected)) nodes[69] = node(selected); const visible = new Set(nodes.map(n => n.id));
  const edges = graphEdges().filter(e => visible.has(e.from) && visible.has(e.to)), scene = $('scene'); scene.replaceChildren();
  $('empty').hidden = nodes.length !== 0;
  const trace = mode === 'trace' ? snapshot.traces.find(t => t.traceId === traceId) : null;
  $('graph-title').textContent = trace ? 'Context · ' + trace.agentId : $('graph-mode').value === 'all' ? 'Toàn bộ graph' : 'Lân cận tri thức';
  $('graph-meta').textContent = `${nodes.length} node · ${edges.length} quan hệ` + (all.length > 70 ? ' · Giới hạn hiển thị 70; thu hẹp bộ lọc' : '') + (trace ? ' · Bản pin của một window' : ' · Mũi tên trỏ tới nguồn phụ thuộc');
  const nextKey = nodes.map(n => n.id).join('|') + edges.map(e => e.id).join('|');
  if (layoutKey !== nextKey) { positions = forceLayout(nodes, edges); layoutKey = nextKey; }
  for (const e of edges) {
    const a = positions.get(e.from), b = positions.get(e.to), dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
    const inferred = e.basis === 'inferred' || e.provenanceStatus === 'unknown';
    const line = svg('line', { x1: a.x + dx / length * 10, y1: a.y + dy / length * 10, x2: b.x - dx / length * 17, y2: b.y - dy / length * 17,
      stroke: '#a7b49c', 'stroke-width': 1.2, 'stroke-dasharray': inferred ? '4 4' : '', 'marker-end': 'url(#arrow)' });
    line.append(svg('title', {}, `${e.type} · ${e.basis} · provenance ${e.provenanceStatus}`)); scene.append(line);
    if (nodes.length <= 18 && (mode === 'trace' || $('graph-mode').value === 'local' || e.from === selected || e.to === selected)) scene.append(svg('text', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - 5, 'text-anchor': 'middle', class: 'edge-label' }, e.type));
  }
  for (const n of nodes) {
    const p = positions.get(n.id), active = n.id === selected, color = n.kind === 'claim' ? '#548059' : n.kind === 'source' ? '#b18b56' : '#74939d';
    const group = svg('g', { class: 'graph-node', tabindex: '0', role: 'button', 'aria-label': n.label, transform: `translate(${p.x} ${p.y})` });
    group.append(svg('circle', { r: 23, class: 'node-hit', fill: 'transparent', stroke: 'none', 'pointer-events': 'all' }));
    if (active) group.append(svg('circle', { r: 20, fill: 'none', stroke: '#a7c9b0', 'stroke-width': 2, opacity: .45 }));
    group.append(svg('circle', { r: active ? 11 : 7 + Math.min(5, edges.filter(e => e.from === n.id || e.to === n.id).length), fill: color, stroke: '#f9fbf6', 'stroke-width': 2, opacity: n.validity === 'invalid' ? .6 : 1 }));
    group.append(svg('text', { y: 29, 'text-anchor': 'middle', class: 'node-label' }, short(n.label, active ? 30 : 23)));
    group.append(svg('title', {}, n.label + '\n' + [n.assertionType, n.lifecycle, n.freshness].filter(Boolean).join(' · ')));
    const choose = () => { selected = n.id; renderDetail(); if (mode === 'memory') render(); else renderGraph(); };
    group.addEventListener('pointerdown', event => { event.stopPropagation(); nodeDrag = { id: n.id, start: graphPoint(event), moved: false }; $('graph').setPointerCapture(event.pointerId); });
    group.addEventListener('click', event => { if (event.detail >= 2) openNote(n.id); else choose(); }); group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } }); scene.append(group);
  }
  applyCamera();
  const summary = $('trace-summary'); summary.hidden = !trace; summary.replaceChildren();
  if (trace) {
    summary.append(element('strong', 'Nguồn đã cấp cho window'), element('p', trace.accounting, 'muted'));
    if (trace.incomplete) summary.append(element('p', 'Có reference không sẵn có trong quyền đọc. Không suy diễn nội dung.', 'tone-unknown'));
    for (const entry of trace.entries) { const row = element('div', undefined, 'trace-row'), button = element('button', short(entry.ref, 40)); button.addEventListener('click', () => { selected = entry.nodeId; renderDetail(); renderGraph(); }); row.append(button, element('span', entry.state, 'tone-' + entry.state)); summary.append(row); }
  }
}
function metadata(parent, label, value) { const dl = element('dl', undefined, 'metadata'); dl.append(element('dt', label), element('dd', value ?? 'unknown')); parent.append(dl); }
function renderDetail() {
  const target = node(selected), body = $('detail-body'); body.replaceChildren(); $('proposal').disabled = !target; $('detail-kind').textContent = target?.kind ?? '—';
  if (!target) { body.append(element('h2', 'Chưa chọn bản ghi'), element('p', 'Chọn node hoặc một window để kiểm tra nguồn và trạng thái.', 'statement')); return; }
  body.append(element('h2', target.label), element('p', target.statement, 'statement'));
  const readNote = element('button', '↗ Đọc ghi chú đầy đủ', 'read-note'); readNote.addEventListener('click', () => openNote(target.id)); body.append(readNote);
  const states = element('div', undefined, 'status-grid');
  for (const [label, value] of [['Assertion', target.assertionType ?? '—'], ['Lifecycle', target.lifecycle ?? '—'], ['Freshness', target.freshness], ['Validity', target.validity]]) { const group = element('div'); group.append(element('small', label), element('b', value, 'tone-' + value)); states.append(group); } body.append(states);
  metadata(body, 'RECORD ID', target.id); if (target.sourceRef) metadata(body, 'SOURCE LOCATION', target.sourceRef); metadata(body, 'SOURCE REVISION', target.revision); metadata(body, 'CONTENT DIGEST', target.contentDigest); metadata(body, 'PROVENANCE', target.provenanceStatus);
  const trace = mode === 'trace' ? snapshot.traces.find(t => t.traceId === traceId) : null;
  if (trace) { const entry = trace.entries.find(e => e.nodeId === target.id); metadata(body, 'MANIFEST', trace.manifestRef); metadata(body, 'MANIFEST DIGEST', trace.manifestDigest); metadata(body, 'PACKET DIGEST', trace.packetDigest);
    if (entry) { metadata(body, 'LOAD STATE', entry.state); metadata(body, 'EXPECTED DIGEST', entry.expectedDigest); metadata(body, 'ACTUAL DIGEST', entry.actualDigest); metadata(body, 'LOAD RECEIPT', entry.receiptRef); metadata(body, 'RECEIPT DIGEST', entry.receiptDigest); if (entry.reason) metadata(body, 'REASON', entry.reason); } }
  body.append(element('h3', 'LIÊN KẾT & BACKLINKS', 'section-title'));
  const relations = snapshot.edges.filter(e => e.from === target.id || e.to === target.id);
  for (const e of relations) { const other = node(e.from === target.id ? e.to : e.from); if (!other) continue; const b = element('button', `${e.from === target.id ? '→' : '←'} ${e.type}`, 'relation'); b.append(element('small', other.label + ' · ' + e.basis + ' · provenance ' + e.provenanceStatus)); b.addEventListener('click', () => { selected = other.id; mode = 'memory'; setMode(); render(); }); body.append(b); }
  if (!relations.length) body.append(element('p', 'Không có quan hệ trong phạm vi được cấp.', 'muted'));
}
function render() { if (!snapshot) return; updateList(); renderGraph(); renderDetail(); }
function setMode() { for (const name of ['memory', 'trace']) { $(name + '-tab').classList.toggle('active', mode === name); $(name + '-tab').setAttribute('aria-pressed', String(mode === name)); } for (const id of ['kind', 'freshness', 'lifecycle', 'depth', 'graph-mode', 'edge-type']) $(id).disabled = mode === 'trace'; }
function openNote(id) { const target = node(id); if (!target) return; $('note-title').textContent = target.label; $('note-content').textContent = target.statement || 'Bản ghi metadata; nội dung nằm trong artifact có digest được ghi nhận.'; $('note-properties').textContent = [target.kind, target.assertionType, target.lifecycle, target.freshness, target.revision].filter(Boolean).join(' · '); const backlinks = $('note-backlinks'); backlinks.replaceChildren(); for (const edge of snapshot.edges.filter(e => e.to === id)) { const source = node(edge.from); if (!source) continue; const b = element('button', source.label + ' · ' + edge.type, 'relation'); b.addEventListener('click', () => openNote(source.id)); backlinks.append(b); } if (!backlinks.childElementCount) backlinks.append(element('p', 'Chưa có backlink trong phạm vi được cấp.', 'muted')); if (!$('note-dialog').open) $('note-dialog').showModal(); }
async function refresh() {
  $('refresh').disabled = true;
  try { const response = await fetch('/api/snapshot', { cache: 'no-store' }); if (!response.ok) throw new Error('Snapshot không sẵn có hoặc không hợp lệ. Xuất lại từ Memory.'); snapshot = await response.json();
    $('version').textContent = snapshot.memoryVersion; $('node-count').textContent = snapshot.nodes.length;
    $('scope').textContent = `${snapshot.scope.repoId} / ${snapshot.scope.branchId} · ${snapshot.scope.allowedPaths.join(', ')} · ${snapshot.scope.taskClasses.join(', ')}`;
    $('capture').textContent = 'Captured ' + new Date(snapshot.capturedAt).toLocaleString('vi-VN');
    $('snapshot-id').textContent = snapshot.snapshotId; $('warning').textContent = snapshot.warnings.join(' ');
    setSelect('kind', snapshot.nodes.map(n => n.kind)); setSelect('lifecycle', snapshot.nodes.map(n => n.lifecycle)); setSelect('edge-type', snapshot.edges.map(e => e.type));
    if (!selected) selected = snapshot.nodes.find(n => n.kind === 'claim')?.id ?? snapshot.nodes[0]?.id ?? null;
    render();
  } catch (error) { snapshot = undefined; $('scene').replaceChildren(); $('list').replaceChildren(); $('detail-body').replaceChildren(element('h2', 'Không thể đọc snapshot')); $('warning').textContent = error.message; $('proposal').disabled = true; }
  finally { $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh); for (const id of ['search', 'kind', 'freshness', 'lifecycle', 'depth', 'graph-mode', 'edge-type']) $(id).addEventListener(id === 'search' ? 'input' : 'change', render);
for (const name of ['memory', 'trace']) $(name + '-tab').addEventListener('click', () => { mode = name; $('search').value = ''; setMode(); resetCamera(); render(); });
$('fit').addEventListener('click', () => { resetCamera(); applyCamera(); });
$('graph').addEventListener('wheel', event => { event.preventDefault(); camera.k = Math.max(.5, Math.min(2.5, camera.k * (event.deltaY < 0 ? 1.1 : .9))); applyCamera(); }, { passive: false });
let drag = null;
$('graph').addEventListener('pointerdown', event => { if (event.target.closest('.graph-node')) return; drag = { x: event.clientX, y: event.clientY, cx: camera.x, cy: camera.y }; $('graph').setPointerCapture(event.pointerId); });
$('graph').addEventListener('pointermove', event => { if (nodeDrag) { const p = graphPoint(event); if (Math.hypot(p.x - nodeDrag.start.x, p.y - nodeDrag.start.y) > 3) nodeDrag.moved = true; positions.set(nodeDrag.id, { ...p, vx: 0, vy: 0 }); renderGraph(); } else if (drag) { const box = $('graph').getBoundingClientRect(); camera.x = drag.cx + (event.clientX - drag.x) * 800 / box.width; camera.y = drag.cy + (event.clientY - drag.y) * 620 / box.height; applyCamera(); } });
$('graph').addEventListener('pointerup', () => { const picked = nodeDrag && !nodeDrag.moved ? nodeDrag.id : null; nodeDrag = null; drag = null; if (picked) { const at = performance.now(); if (lastNodeClick.id === picked && at - lastNodeClick.at < 450) openNote(picked); else { selected = picked; render(); } lastNodeClick = { id: picked, at }; } }); $('graph').addEventListener('pointercancel', () => { nodeDrag = null; drag = null; });
$('close-note').addEventListener('click', () => $('note-dialog').close());
let dark = true; try { dark = localStorage.getItem('memory-explorer-theme') !== 'light'; } catch { /* Theme is optional personal view state. */ }
function applyTheme() { document.body.dataset.theme = dark ? 'dark' : 'light'; $('theme').textContent = dark ? '☀ Sáng' : '☾ Tối'; }
$('theme').addEventListener('click', () => { dark = !dark; applyTheme(); try { localStorage.setItem('memory-explorer-theme', dark ? 'dark' : 'light'); } catch { /* No canonical write. */ } }); applyTheme();
$('proposal').addEventListener('click', () => { $('proposal-text').value = ''; $('proposal-result').hidden = true; $('proposal-dialog').showModal(); }); $('cancel-proposal').addEventListener('click', () => $('proposal-dialog').close());
$('proposal-form').addEventListener('submit', event => { event.preventDefault(); if (!snapshot || !node(selected)) return; const comment = $('proposal-text').value.trim(); if (!comment) return;
  const proposal = { format: 'memory-review-proposal/1', snapshotId: snapshot.snapshotId, expectedMemoryVersion: snapshot.memoryVersion, targetNodeId: selected, comment, status: 'proposed', promotionAuthorized: false };
  $('proposal-output').value = JSON.stringify(proposal, null, 2); $('proposal-result').hidden = false;
  const url = URL.createObjectURL(new Blob([JSON.stringify(proposal, null, 2) + '\n'], { type: 'application/json' })), link = element('a'); link.href = url; link.download = 'memory-review-proposal.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
refresh();
