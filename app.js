'use strict';

// ===== STORAGE =====
const K = {
  SESSION: 'workout-app:v1:current_session',
  HISTORY: 'workout-app:v1:history',
};

function getSession() {
  try { return JSON.parse(localStorage.getItem(K.SESSION)); } catch { return null; }
}
function saveSession(s) {
  localStorage.setItem(K.SESSION, JSON.stringify(s));
  syncUrlState(s);
}
function clearSession() {
  localStorage.removeItem(K.SESSION);
  syncUrlState(null);
}
function getHistory() {
  try { return JSON.parse(localStorage.getItem(K.HISTORY)) || {}; } catch { return {}; }
}
function saveHistory(h) {
  localStorage.setItem(K.HISTORY, JSON.stringify(h));
}

// ===== URL STATE =====
function syncUrlState(session) {
  if (!el('workout-root')) return; // only on workout page
  const url = new URL(location.href);
  if (!session || !session.current_exercise_id) {
    ['ex', 'set', 'tp', 'te', 'tr', 'ts', 'done'].forEach(k => url.searchParams.delete(k));
  } else {
    url.searchParams.set('ex', session.current_exercise_id);
    url.searchParams.set('set', session.current_set);
    url.searchParams.set('tp', session.timer_phase);
    if (session.timer_ends_at) {
      url.searchParams.set('te', new Date(session.timer_ends_at).getTime());
    } else {
      url.searchParams.delete('te');
    }
    if (session.timer_remaining != null) {
      url.searchParams.set('tr', Math.round(session.timer_remaining));
    } else {
      url.searchParams.delete('tr');
    }
    if (session.current_timer_slot > 1) {
      url.searchParams.set('ts', session.current_timer_slot);
    } else {
      url.searchParams.delete('ts');
    }
    if (session.completed.length > 0) {
      url.searchParams.set('done', session.completed.join(','));
    } else {
      url.searchParams.delete('done');
    }
  }
  history.replaceState(null, '', url);
}

function getUrlSession(workoutId) {
  const params = new URLSearchParams(location.search);
  const ex = params.get('ex');
  if (!ex) return null;
  return {
    workout_id: workoutId,
    started_at: new Date().toISOString(),
    current_exercise_id: ex,
    current_set: parseInt(params.get('set') || '1', 10),
    timer_phase: params.get('tp') || 'idle',
    timer_ends_at: params.get('te') ? new Date(parseInt(params.get('te'), 10)).toISOString() : null,
    timer_remaining: params.get('tr') ? parseFloat(params.get('tr')) : null,
    current_timer_slot: parseInt(params.get('ts') || '1', 10),
    completed: params.get('done') ? params.get('done').split(',').filter(Boolean) : [],
  };
}

// ===== FORMATTING =====
function fmtSeconds(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs} sec`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs} sec`;
}

function fmtTimeSummary(reps, secondsPerRep) {
  if (!secondsPerRep) return `${reps} rep${reps !== 1 ? 's' : ''}`;
  if (reps === 1) return fmtSeconds(secondsPerRep);
  return `${reps}× ${fmtSeconds(secondsPerRep)}`;
}

function fmtTimerDisplay(remainingSeconds) {
  const s = Math.max(0, Math.ceil(remainingSeconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins === 0) return String(secs).padStart(2, '0');
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const PARAM_LABELS = {
  weight_kg:  v => `${v} kg`,
  speed_kmh:  v => `${v} km/u`,
  incline:    v => `helling ${v}%`,
  resistance: v => `weerstand ${v}`,
  band_color: v => `band: ${v}`,
};

function fmtParams(params) {
  if (!params || Object.keys(params).length === 0) return '';
  return Object.entries(params)
    .map(([k, v]) => (PARAM_LABELS[k] ? PARAM_LABELS[k](v) : `${k}: ${v}`))
    .join(' · ');
}

function fmtPlanLabel(plan) {
  const parts = [];
  parts.push(`${plan.sets}× ${fmtTimeSummary(plan.reps, plan.seconds_per_rep)}`);
  const p = fmtParams(plan.params);
  if (p) parts.push(p);
  return parts.join(' — ');
}

// ===== SOUND =====
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  return _audioCtx;
}

function playBeep(freq = 880, durationSec = 0.12, vol = 0.3) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationSec);
  } catch { /* best-effort */ }
}

function playCountdownBeep() { playBeep(660, 0.1, 0.2); }
function playStartBeep()     { playBeep(880, 0.18, 0.35); }
function playDoneBeep()      { playBeep(1047, 0.25, 0.35); setTimeout(() => playBeep(1319, 0.35, 0.3), 120); }

// ===== HELPERS =====
function el(id) { return document.getElementById(id); }
function show(elem) { if (elem) elem.classList.remove('hidden'); }
function hide(elem) { if (elem) elem.classList.add('hidden'); }
function make(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ===== FLAT EXERCISE LIST =====
function flattenWorkout(workout, blocks) {
  const flat = [];
  for (const blockId of workout.blocks) {
    const block = blocks[blockId];
    if (!block) continue;
    block.exercises.forEach((ex, i) => {
      flat.push({
        id: `${blockId}-${i}`,
        ref: ex.ref,
        variant: ex.variant,
        blockName: block.name,
        blockId: blockId,
      });
    });
  }
  return flat;
}

function resolveExercise(exEntry, exercisesData) {
  const def = exercisesData[exEntry.ref];
  if (!def) return { error: `Oefening '${exEntry.ref}' niet gevonden in exercises.json` };
  const variant = def.variants[exEntry.variant];
  if (!variant) return { error: `Variant '${exEntry.variant}' niet gevonden voor oefening '${exEntry.ref}'` };
  return { def, variant, error: null };
}

// ===== INDEX PAGE =====
async function initIndex() {
  const root = el('index-root');
  if (!root) return;

  const loadingEl = el('loading-screen');

  try {
    const ids = await fetch('data/workouts/index.json').then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    // Fetch blocks + all workouts in parallel
    const blocks = await fetch('data/blocks.json').then(r => r.json());
    const workouts = await Promise.all(ids.map(async id => {
      try {
        const data = await fetch(`data/workouts/${id}.json`).then(r => r.json());
        return { id, name: data.name, blockIds: data.blocks };
      } catch {
        return { id, name: id, blockIds: [] };
      }
    }));

    hide(loadingEl);
    renderIndex(root, workouts, blocks);
  } catch (err) {
    hide(loadingEl);
    root.innerHTML = `
      <div class="index-header">
        <h1>Workout <span>App</span></h1>
      </div>
      <div class="error-box">
        Kan workouts niet laden: ${err.message}
      </div>`;
  }
}

function renderIndex(root, workouts, blocks) {
  const totalExercises = w => w.blockIds.reduce((sum, bid) => {
    const b = blocks[bid];
    return sum + (b ? b.exercises.length : 0);
  }, 0);

  const list = workouts.map(w => {
    const n = totalExercises(w);
    return `
      <a class="workout-card" href="workout?w=${encodeURIComponent(w.id)}">
        <div class="workout-card-info">
          <div class="workout-card-name">${esc(w.name)}</div>
          <div class="workout-card-meta">${w.blockIds.length} blok${w.blockIds.length !== 1 ? 'ken' : ''} · ${n} oefening${n !== 1 ? 'en' : ''}</div>
        </div>
        <div class="workout-card-arrow">→</div>
      </a>`;
  }).join('');

  root.innerHTML = `
    <div class="index-header">
      <h1>Workout <span>App</span></h1>
      <p>Kies een workout om te starten</p>
    </div>
    <div class="workout-list">${list}</div>
    <div class="index-footer">
      <button class="btn btn-ghost" id="btn-history-index" type="button">Oefeningen & Geschiedenis</button>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== WORKOUT PAGE =====
let WS = {           // workout page state
  workoutId: null,
  workout: null,
  exercises: null,
  blocks: null,
  flat: [],          // flattenWorkout result
  timerHandle: null, // setInterval handle
};

async function initWorkout() {
  const root = el('workout-root');
  if (!root) return;

  const loadingEl = el('loading-screen');
  const params = new URLSearchParams(location.search);
  const workoutId = params.get('w');

  if (!workoutId) {
    hide(loadingEl);
    root.innerHTML = `<div class="error-box">Geen workout opgegeven. <a href="index.html">Terug naar overzicht</a></div>`;
    return;
  }

  try {
    const [workout, exercises, blocks] = await Promise.all([
      fetch(`data/workouts/${workoutId}.json`).then(r => {
        if (!r.ok) throw new Error('not_found');
        return r.json();
      }),
      fetch('data/exercises.json').then(r => r.json()),
      fetch('data/blocks.json').then(r => r.json()),
    ]);

    hide(loadingEl);
    WS.workoutId = workoutId;
    WS.workout = workout;
    WS.exercises = exercises;
    WS.blocks = blocks;
    WS.flat = flattenWorkout(workout, blocks);

    // Check URL for active session state (survives refresh)
    const urlSession = getUrlSession(workoutId);
    if (urlSession && WS.flat.some(e => e.id === urlSession.current_exercise_id)) {
      saveSession(urlSession);
      enterActiveMode(urlSession);
      return;
    }

    checkSessionConflict();
  } catch (err) {
    hide(loadingEl);
    if (err.message === 'not_found') {
      root.innerHTML = `<div style="padding:24px"><div class="error-box">Workout '${esc(workoutId)}' niet gevonden. <a href="index.html">Terug naar overzicht</a></div></div>`;
    } else {
      root.innerHTML = `<div style="padding:24px"><div class="error-box">Fout bij laden: ${esc(err.message)}</div></div>`;
    }
  }
}

function checkSessionConflict() {
  const session = getSession();

  if (!session) {
    renderListMode();
    return;
  }

  if (session.workout_id === WS.workoutId) {
    // Same workout — show inline banner
    renderListMode(session);
    return;
  }

  // Different workout — show blocking modal
  renderListMode();
  showConflictModal(session);
}

// ===== LIST MODE =====
function renderListMode(resumableSession) {
  const listMode = el('list-mode');
  show(listMode);
  hide(el('active-mode'));

  // Header
  el('list-workout-name').textContent = WS.workout.name;

  // Session banner
  const banner = el('session-banner');
  if (resumableSession) {
    show(banner);
    banner.innerHTML = `
      <p><strong>Lopende sessie gevonden.</strong> Wil je verder gaan?</p>
      <div class="banner-actions">
        <button class="btn btn-secondary" onclick="onResumeSession()">Hervatten</button>
        <button class="btn btn-ghost" onclick="onRestartSession()">Opnieuw</button>
      </div>`;
  } else {
    hide(banner);
  }

  // Blocks
  const blocksEl = el('blocks-container');
  blocksEl.innerHTML = '';

  for (const blockId of WS.workout.blocks) {
    const block = WS.blocks[blockId];
    if (!block) continue;
    const section = make('div', 'block-section');
    section.innerHTML = `<div class="block-title">${esc(block.name)}</div>`;

    for (const ex of block.exercises) {
      section.appendChild(renderExerciseRow(ex));
    }
    blocksEl.appendChild(section);
  }

  // Play button
  el('btn-play').onclick = () => {
    // Warm up AudioContext on first user interaction
    getAudioCtx();
    onStartWorkout();
  };
}

function renderExerciseRow(ex) {
  const { def, variant, error } = resolveExercise(ex, WS.exercises);

  if (error) {
    const row = make('div', 'exercise-row error');
    row.innerHTML = `<div class="exercise-row-info"><div class="exercise-row-name">⚠ ${esc(error)}</div></div>`;
    return row;
  }

  const row = make('div', 'exercise-row');
  const timeSummary = fmtTimeSummary(variant.reps, variant.seconds_per_rep);
  const paramStr = fmtParams(variant.params);
  const sideLabel = def.side_mode === 'each_side' ? ' <span style="color:var(--text-muted);font-weight:400">per been</span>' : '';

  let detailParts = [`<strong>${variant.sets}× ${timeSummary}${sideLabel}</strong>`];
  if (paramStr) detailParts.push(paramStr);
  if (variant.note) detailParts.push(`<em>${esc(variant.note)}</em>`);

  row.innerHTML = `
    <div class="exercise-row-thumb-placeholder"><span>🏋</span></div>
    <div class="exercise-row-info">
      <div class="exercise-row-name">${esc(def.name)}</div>
      <span class="exercise-row-variant">${esc(ex.variant)}</span>
      <div class="exercise-row-detail">${detailParts.join(' · ')}</div>
    </div>`;

  // Try to load image
  if (def.image) {
    const img = new Image();
    img.className = 'exercise-row-thumb';
    img.alt = def.name;
    img.onload = () => {
      row.querySelector('.exercise-row-thumb-placeholder').replaceWith(img);
    };
    img.onerror = () => { /* keep placeholder */ };
    img.src = def.image;
  }

  return row;
}

// ===== SESSION MANAGEMENT =====
function onStartWorkout() {
  clearSession();
  const firstEx = WS.flat[0];
  const session = {
    workout_id: WS.workoutId,
    started_at: new Date().toISOString(),
    current_exercise_id: firstEx.id,
    current_set: 1,
    timer_phase: 'idle',
    timer_ends_at: null,
    timer_remaining: null,
    current_timer_slot: 1,
    completed: [],
  };
  saveSession(session);
  enterActiveMode(session);
}

function onResumeSession() {
  const session = getSession();
  if (session) {
    saveSession(session); // sync URL state
    enterActiveMode(session);
  }
}

function onRestartSession() {
  clearSession();
  onStartWorkout();
}

// ===== CONFLICT MODAL =====
function showConflictModal(otherSession) {
  // Find the name of the other workout (best-effort)
  fetch(`data/workouts/${otherSession.workout_id}.json`)
    .then(r => r.json())
    .then(d => d.name)
    .catch(() => otherSession.workout_id)
    .then(name => {
      showModal({
        title: 'Lopende sessie gevonden',
        body: `Je hebt een actieve sessie van "<strong>${esc(name)}</strong>". Wil je die hervatten, of weggooien en dit schema openen?`,
        actions: [
          { label: `Hervatten (${esc(name)})`, cls: 'btn-secondary', onclick: () => {
            location.href = `workout?w=${encodeURIComponent(otherSession.workout_id)}`;
          }},
          { label: 'Weggooien & openen', cls: 'btn-danger', onclick: () => {
            clearSession();
            closeModal();
            renderListMode();
          }},
        ],
      });
    });
}

// ===== GENERIC MODAL =====
let _modalEl = null;
function showModal({ title, body, actions }) {
  closeModal();
  _modalEl = make('div', 'modal-backdrop');
  _modalEl.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-title">${title}</div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"></div>
    </div>`;
  const actionsEl = _modalEl.querySelector('.modal-actions');
  for (const a of actions) {
    const btn = make('button', `btn ${a.cls || 'btn-secondary'}`, a.label);
    btn.onclick = a.onclick;
    actionsEl.appendChild(btn);
  }
  document.body.appendChild(_modalEl);
}
function closeModal() {
  if (_modalEl) { _modalEl.remove(); _modalEl = null; }
}

// ===== ACTIVE MODE =====
function enterActiveMode(session) {
  hide(el('list-mode'));
  show(el('active-mode'));
  renderActiveExercise(session);
}

function getCurrentFlat(session) {
  return WS.flat.find(e => e.id === session.current_exercise_id) || null;
}

function getFlatIndex(session) {
  return WS.flat.findIndex(e => e.id === session.current_exercise_id);
}


function clearTimer() {
  if (WS.timerHandle) { clearInterval(WS.timerHandle); WS.timerHandle = null; }
}

function getFirstIncompleteSet(exerciseId, totalSets, completedSet) {
  for (let i = 1; i <= totalSets; i++) {
    if (!completedSet.has(`${exerciseId}:${i}`)) return i;
  }
  return null;
}

function findNextIncomplete(session, startIdx) {
  const completedSet = new Set(session.completed);
  for (let i = 0; i < WS.flat.length; i++) {
    const idx = (startIdx + i) % WS.flat.length;
    const ex = WS.flat[idx];
    const { variant } = resolveExercise(ex, WS.exercises);
    if (!variant) continue;
    if (getFirstIncompleteSet(ex.id, variant.sets, completedSet) !== null) return idx;
  }
  return null;
}

function navigateToExercise(session, flatIdx) {
  clearTimer();
  const ex = WS.flat[flatIdx];
  const { variant } = resolveExercise(ex, WS.exercises);
  const completedSet = new Set(session.completed);

  session.current_exercise_id = ex.id;
  session.timer_phase = 'idle';
  session.timer_ends_at = null;
  session.timer_remaining = null;
  session.current_timer_slot = 1;

  if (variant) {
    const first = getFirstIncompleteSet(ex.id, variant.sets, completedSet);
    session.current_set = first || variant.sets;
  } else {
    session.current_set = 1;
  }

  saveSession(session);
  renderActiveExercise(session);
}

function onNavigatePrev() {
  const session = getSession();
  if (!session) return;
  const idx = getFlatIndex(session);
  navigateToExercise(session, (idx - 1 + WS.flat.length) % WS.flat.length);
}

function onNavigateNext() {
  const session = getSession();
  if (!session) return;
  const idx = getFlatIndex(session);
  navigateToExercise(session, (idx + 1) % WS.flat.length);
}

function renderDotNav(session) {
  const nav = el('exercise-dot-nav');
  const currentIdx = getFlatIndex(session);
  const completed = new Set(session.completed);

  nav.innerHTML = '';
  WS.flat.forEach((ex, i) => {
    const { variant } = resolveExercise(ex, WS.exercises);
    const totalSets = variant ? variant.sets : 1;
    const doneSets = variant
      ? Array.from({ length: totalSets }, (_, s) => completed.has(`${ex.id}:${s + 1}`)).filter(Boolean).length
      : 0;

    const isCurrent = i === currentIdx;
    const isComplete = doneSets >= totalSets;
    const hasProgress = doneSets > 0 && !isComplete;

    let cls = 'ex-dot';
    if (isComplete) cls += ' complete';
    else if (hasProgress) cls += ' partial';
    if (isCurrent) cls += ' current';

    const dot = make('button', cls);
    dot.type = 'button';
    dot.setAttribute('aria-label', `Oefening ${i + 1}`);
    dot.onclick = () => {
      const s = getSession();
      if (s) navigateToExercise(s, i);
    };
    nav.appendChild(dot);
  });
}

function renderActiveExercise(session) {
  clearTimer();

  const exEntry = getCurrentFlat(session);
  if (!exEntry) {
    // Should not happen
    showCompletion();
    return;
  }

  const { def, variant, error } = resolveExercise(exEntry, WS.exercises);

  // Exercise dot nav
  renderDotNav(session);

  // Block name
  el('active-block-name').textContent = exEntry.blockName;

  // Content area — add animation class
  const content = el('active-content');
  content.classList.remove('exercise-enter');
  void content.offsetWidth; // reflow
  content.classList.add('exercise-enter');

  if (error) {
    content.innerHTML = `<div class="error-box" style="margin:0">${esc(error)}</div>`;
    hide(el('next-exercise-footer'));
    return;
  }

  // Image — only show if image exists, no placeholder
  const imageWrap = el('exercise-image-wrap');
  imageWrap.innerHTML = '';
  if (def.image) {
    show(imageWrap);
    const img = document.createElement('img');
    img.alt = def.name;
    img.onload = () => { imageWrap.innerHTML = ''; imageWrap.appendChild(img); };
    img.onerror = () => { hide(imageWrap); };
    img.src = def.image;
    if (img.complete && img.naturalWidth > 0) {
      imageWrap.innerHTML = '';
      imageWrap.appendChild(img);
    }
  } else {
    hide(imageWrap);
  }

  // Name
  el('active-exercise-name').textContent = def.name;

  // Prescription card — sets left, reps right
  const metaEl = el('active-meta');
  const timeSummary = fmtTimeSummary(variant.reps, variant.seconds_per_rep);
  const sideLabel = def.side_mode === 'each_side' ? 'per been' : '';
  const paramStr = fmtParams(variant.params);

  let metaHtml = `
    <div class="prescription-sets">
      <div class="prescription-sets-value">${session.current_set}/${variant.sets}</div>
      <div class="prescription-sets-label">set</div>
    </div>
    <div class="prescription-divider"></div>
    <div class="prescription-reps">
      <div class="prescription-reps-value">${esc(timeSummary)}</div>
      ${sideLabel ? `<div class="prescription-reps-sub">${esc(sideLabel)}</div>` : ''}
      ${paramStr ? `<div class="prescription-params">${esc(paramStr)}</div>` : ''}
    </div>`;
  metaEl.innerHTML = metaHtml;

  // Note
  const noteEl = el('active-note');
  if (variant.note) {
    noteEl.textContent = variant.note;
    show(noteEl);
  } else {
    hide(noteEl);
  }

  // Set counter dots (below card)
  renderSetCounter(session, variant);

  // Check if exercise is fully complete
  const completedSet = new Set(session.completed);
  const isExComplete = getFirstIncompleteSet(exEntry.id, variant.sets, completedSet) === null;

  const btnSetDone = el('btn-set-done');
  if (isExComplete) {
    el('timer-area').innerHTML = `<div class="exercise-complete-msg">✓ Alle sets klaar</div>`;
    btnSetDone.innerHTML = 'Volgende →';
  } else {
    btnSetDone.innerHTML = '✓ Set klaar';
    renderTimerArea(session, variant, def);
  }

  // Next exercise
  renderNextExercise(session);
}

function renderSetCounter(session, variant) {
  const totalSets = variant.sets;
  const currentSet = session.current_set;
  const completed = new Set(session.completed);

  if (totalSets <= 1) {
    el('set-counter').innerHTML = '';
    return;
  }

  let dots = '';
  for (let i = 1; i <= totalSets; i++) {
    const isDone = completed.has(`${session.current_exercise_id}:${i}`);
    const isCurrent = i === currentSet;
    dots += `<div class="set-dot ${isDone ? 'done' : isCurrent ? 'current' : ''}"></div>`;
  }

  el('set-counter').innerHTML = `<div class="set-counter-dots">${dots}</div>`;
}

function getSlotLabel(currentSlot, reps, sideCount) {
  const repIndex = Math.ceil(currentSlot / sideCount);
  const sideIndex = (currentSlot - 1) % sideCount;
  const sideName = sideIndex === 0 ? 'Links' : 'Rechts';

  if (sideCount > 1 && reps > 1) return `Rep ${repIndex} · ${sideName}`;
  if (sideCount > 1) return sideName;
  if (reps > 1) return `Rep ${repIndex} / ${reps}`;
  return '';
}

function renderTimerArea(session, variant, def) {
  const timerArea = el('timer-area');
  const hasTimer = !!variant.seconds_per_rep;

  if (!hasTimer) {
    timerArea.innerHTML = '';
    return;
  }

  // Each rep (× side) is a separate timer run
  const sideCount = def.side_mode === 'each_side' ? 2 : 1;
  const slotsPerSet = variant.reps * sideCount;
  const currentSlot = session.current_timer_slot || 1;
  const timerDuration = variant.seconds_per_rep;

  const slotLabel = getSlotLabel(currentSlot, variant.reps, sideCount);

  timerArea.innerHTML = `
    <div class="timer-summary">${esc(fmtSeconds(timerDuration))}</div>
    ${slotLabel ? `<div class="timer-slot-label">${esc(slotLabel)}</div>` : ''}
    ${slotsPerSet > 1 ? `<div class="timer-slot-counter">Timer ${currentSlot} / ${slotsPerSet}</div>` : ''}
    <div class="timer-display" id="timer-digits">--:--</div>`;

  const timerDigits = () => el('timer-digits');

  // Exercise running (resume after refresh)
  if (session.timer_phase === 'exercise' && session.timer_ends_at) {
    const remaining = (new Date(session.timer_ends_at) - Date.now()) / 1000;
    if (remaining <= 0) {
      setTimeout(() => onTimerSlotDone(session), 0);
      return;
    }
    startExerciseTimer(remaining, session);
    return;
  }

  if (session.timer_phase === 'countdown' && session.timer_ends_at) {
    const remaining = (new Date(session.timer_ends_at) - Date.now()) / 1000;
    const exerciseDur = session.timer_remaining != null ? session.timer_remaining : timerDuration;
    if (remaining <= 0) {
      startExerciseTimerFull(exerciseDur, session);
      return;
    }
    startCountdown(Math.ceil(remaining), session, exerciseDur);
    return;
  }

  // Paused
  if (session.timer_phase === 'paused' && session.timer_remaining != null) {
    timerDigits().textContent = fmtTimerDisplay(session.timer_remaining);
    timerDigits().className = 'timer-display paused';

    const playBtn = make('button', 'btn-timer-play', '▶');
    timerArea.appendChild(playBtn);

    playBtn.onclick = () => {
      getAudioCtx();
      playBtn.remove();

      const resumeDuration = session.timer_remaining;
      const countdownSec = 3;
      const endsAt = new Date(Date.now() + countdownSec * 1000 + 200).toISOString();
      session.timer_phase = 'countdown';
      session.timer_ends_at = endsAt;
      saveSession(session);

      startCountdown(countdownSec, session, resumeDuration);
    };
    return;
  }

  // Idle: show play button
  timerDigits().textContent = fmtTimerDisplay(timerDuration);
  const playBtn = make('button', 'btn-timer-play', '▶');
  timerArea.appendChild(playBtn);

  playBtn.onclick = () => {
    getAudioCtx();
    playBtn.remove();

    const countdownSec = 3;
    const endsAt = new Date(Date.now() + countdownSec * 1000 + 200).toISOString();
    session.timer_phase = 'countdown';
    session.timer_ends_at = endsAt;
    saveSession(session);

    startCountdown(countdownSec, session, timerDuration);
  };
}

function startCountdown(fromSec, session, totalDuration) {
  let count = Math.ceil(fromSec);
  const digitsEl = () => el('timer-digits');

  if (digitsEl()) {
    digitsEl().textContent = count;
    digitsEl().className = 'timer-display countdown';
  }
  playCountdownBeep();

  clearTimer();
  WS.timerHandle = setInterval(() => {
    count--;
    if (count > 0) {
      playCountdownBeep();
      if (digitsEl()) digitsEl().textContent = count;
    } else {
      clearTimer();
      playStartBeep();
      if (digitsEl()) digitsEl().className = 'timer-display running';
      startExerciseTimerFull(totalDuration, session);
    }
  }, 1000);
}

function startExerciseTimerFull(totalDuration, session) {
  const endsAt = new Date(Date.now() + totalDuration * 1000).toISOString();
  session.timer_phase = 'exercise';
  session.timer_ends_at = endsAt;
  session.timer_remaining = null;
  saveSession(session);
  startExerciseTimer(totalDuration, session);
}

function pauseTimer(session) {
  clearTimer();
  const remaining = Math.max(0, (new Date(session.timer_ends_at) - Date.now()) / 1000);
  session.timer_phase = 'paused';
  session.timer_remaining = remaining;
  session.timer_ends_at = null;
  saveSession(session);
  renderActiveExercise(session);
}

function startExerciseTimer(remainingSec, session) {
  const endsAt = new Date(session.timer_ends_at);
  const digitsEl = () => el('timer-digits');
  const timerArea = el('timer-area');

  // Add pause button
  const oldPause = timerArea.querySelector('.btn-timer-pause');
  if (oldPause) oldPause.remove();
  const pauseBtn = make('button', 'btn-timer-pause', '⏸');
  timerArea.appendChild(pauseBtn);
  pauseBtn.onclick = () => pauseTimer(session);

  function tick() {
    const left = (endsAt - Date.now()) / 1000;
    if (digitsEl()) {
      digitsEl().textContent = fmtTimerDisplay(left);
      digitsEl().className = `timer-display ${left > 0 ? 'running' : 'done'}`;
    }
    if (left <= 0) {
      clearTimer();
      pauseBtn.remove();
      playDoneBeep();
      session.timer_phase = 'idle';
      session.timer_ends_at = null;
      session.timer_remaining = null;
      saveSession(session);
      onTimerSlotDone(session);
    }
  }

  tick();
  clearTimer();
  WS.timerHandle = setInterval(tick, 250);
}

function onTimerSlotDone(session) {
  session = getSession();
  if (!session) return;

  const exEntry = getCurrentFlat(session);
  if (!exEntry) return;
  const { def, variant } = resolveExercise(exEntry, WS.exercises);
  if (!variant || !variant.seconds_per_rep) { onSetDone(session); return; }

  const sideCount = def.side_mode === 'each_side' ? 2 : 1;
  const slotsPerSet = variant.reps * sideCount;
  const currentSlot = session.current_timer_slot || 1;

  if (currentSlot < slotsPerSet) {
    // More timer runs in this set — auto-start 5s countdown
    session.current_timer_slot = currentSlot + 1;
    session.timer_phase = 'countdown';
    session.timer_ends_at = new Date(Date.now() + 5 * 1000 + 200).toISOString();
    session.timer_remaining = null;
    saveSession(session);
    renderActiveExercise(session);
  } else {
    // Set complete
    session.current_timer_slot = 1;
    saveSession(session);
    onSetDone(session);
  }
}

function renderNextExercise(session) {
  const footer = el('next-exercise-footer');
  const currentIdx = getFlatIndex(session);
  const completedSet = new Set(session.completed);

  // Find next incomplete exercise (not current)
  let nextInfo = null;
  for (let i = 1; i < WS.flat.length; i++) {
    const idx = (currentIdx + i) % WS.flat.length;
    const ex = WS.flat[idx];
    const { variant } = resolveExercise(ex, WS.exercises);
    if (!variant) continue;
    if (getFirstIncompleteSet(ex.id, variant.sets, completedSet) !== null) {
      nextInfo = ex;
      break;
    }
  }

  if (!nextInfo) {
    const currentEx = WS.flat[currentIdx];
    const { variant: cv } = resolveExercise(currentEx, WS.exercises);
    const allDone = cv && getFirstIncompleteSet(currentEx.id, cv.sets, completedSet) === null;
    footer.innerHTML = `<div class="next-label">Straks</div><div class="next-name">${allDone ? 'Alle oefeningen klaar!' : 'Dit is de laatste oefening'}</div>`;
    show(footer);
    return;
  }

  const { def } = resolveExercise(nextInfo, WS.exercises);
  const currentEntry = WS.flat[currentIdx];
  const blockChange = nextInfo.blockId !== currentEntry.blockId;

  let html = `<div class="next-label">Straks</div><div class="next-name">`;
  if (blockChange) {
    html += `<span class="block-change">→ ${esc(nextInfo.blockName)}</span>`;
  }
  html += `<em>${def ? esc(def.name) : esc(nextInfo.ref)}</em></div>`;
  footer.innerHTML = html;
  show(footer);
}

// ===== SET DONE =====
function onSetDone(session) {
  // Re-fetch fresh session in case of race condition
  session = getSession();
  if (!session) return;

  const exEntry = getCurrentFlat(session);
  if (!exEntry) return;
  const { variant } = resolveExercise(exEntry, WS.exercises);
  if (!variant) return;

  // If exercise is already complete, act as "next" navigation
  const completedSet = new Set(session.completed);
  if (getFirstIncompleteSet(exEntry.id, variant.sets, completedSet) === null) {
    const currentIdx = getFlatIndex(session);
    const nextIdx = findNextIncomplete(session, (currentIdx + 1) % WS.flat.length);
    if (nextIdx === null) {
      finishWorkout(session);
    } else {
      navigateToExercise(session, nextIdx);
    }
    return;
  }

  // Mark current set as completed
  const key = `${session.current_exercise_id}:${session.current_set}`;
  if (!session.completed.includes(key)) {
    session.completed.push(key);
  }

  // Advance
  if (session.current_set < variant.sets) {
    // More sets in this exercise
    session.current_set++;
    session.current_timer_slot = 1;
    session.timer_phase = 'idle';
    session.timer_ends_at = null;
    session.timer_remaining = null;
    saveSession(session);
    renderActiveExercise(session);
  } else {
    // All sets done for this exercise — find next incomplete
    const currentIdx = getFlatIndex(session);
    const nextIdx = findNextIncomplete(session, (currentIdx + 1) % WS.flat.length);
    if (nextIdx === null) {
      // Workout complete!
      session.current_timer_slot = 1;
      session.timer_phase = 'idle';
      session.timer_ends_at = null;
      session.timer_remaining = null;
      saveSession(session);
      finishWorkout(session);
    } else {
      navigateToExercise(session, nextIdx);
    }
  }
}

// ===== FINISH WORKOUT =====
function finishWorkout(session) {
  clearTimer();

  // Write to history
  const history = getHistory();
  const today = new Date().toISOString().slice(0, 10);

  const seenKeys = new Set();
  for (const ex of WS.flat) {
    const { def, variant } = resolveExercise(ex, WS.exercises);
    if (!def || !variant) continue;
    const key = `${ex.ref}:${ex.variant}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    if (!history[key]) history[key] = [];
    history[key].push({
      date: today,
      plan: {
        sets: variant.sets,
        reps: variant.reps,
        seconds_per_rep: variant.seconds_per_rep || null,
        params: variant.params,
      },
    });
  }
  saveHistory(history);
  clearSession();

  // Show completion screen
  hide(el('active-mode'));
  show(el('list-mode'));

  const listMode = el('list-mode');
  listMode.innerHTML = `
    <div class="completion-screen">
      <div class="completion-icon">🎉</div>
      <div class="completion-title">Workout klaar!</div>
      <div class="completion-sub">${esc(WS.workout.name)} — voltooid</div>
      <div class="completion-actions">
        <a class="btn btn-primary" href="index.html">Terug naar overzicht</a>
        <button class="btn btn-secondary" onclick="location.reload()">Opnieuw doen</button>
      </div>
    </div>`;
}

// ===== STOP BUTTON =====
function onStopPressed() {
  showModal({
    title: 'Workout stoppen?',
    body: 'Je voortgang wordt gewist en de sessie wordt beëindigd.',
    actions: [
      { label: 'Stoppen', cls: 'btn-danger', onclick: () => {
        clearTimer();
        clearSession();
        closeModal();
        hide(el('active-mode'));
        show(el('list-mode'));
        renderListMode();
      }},
      { label: 'Doorgaan', cls: 'btn-secondary', onclick: closeModal },
    ],
  });
}

// ===== HISTORY OVERLAY =====
const PARAM_NAMES = {
  weight_kg: 'Gewicht',
  speed_kmh: 'Snelheid',
  incline: 'Helling',
  resistance: 'Weerstand',
  band_color: 'Band',
};

function fmtShortDate(dateStr) {
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const [, m, d] = dateStr.split('-');
  return `${parseInt(d)} ${months[parseInt(m) - 1]}`;
}

let _exercisesCache = null;
async function loadExercises() {
  if (WS.exercises) return WS.exercises;
  if (_exercisesCache) return _exercisesCache;
  _exercisesCache = await fetch('data/exercises.json').then(r => r.json());
  return _exercisesCache;
}

async function showHistory() {
  const exercises = await loadExercises();
  const overlay = el('history-overlay');
  const header = overlay.querySelector('.history-header h2');
  header.textContent = 'Oefeningen';
  const content = el('history-content');
  const history = getHistory();

  content.innerHTML = '';

  for (const ref of Object.keys(exercises)) {
    const exDef = exercises[ref];
    const variantKeys = Object.keys(exDef.variants);
    const withHistory = variantKeys.filter(v => (history[`${ref}:${v}`] || []).length > 0);
    const allEntries = withHistory.flatMap(v => history[`${ref}:${v}`]);
    const latestDate = allEntries.map(e => e.date).sort().pop();

    const card = make('div', 'history-ex-card');
    card.onclick = () => showExerciseDetail(ref);

    const meta = withHistory.length > 0
      ? `${withHistory.length} variant${withHistory.length !== 1 ? 'en' : ''} · ${fmtShortDate(latestDate)}`
      : 'Nog geen data';

    card.innerHTML = `
      <div class="history-ex-thumb-ph">🏋</div>
      <div class="history-ex-info">
        <div class="history-ex-name">${esc(exDef.name)}</div>
        <div class="history-ex-meta">${esc(meta)}</div>
      </div>
      <div class="history-ex-arrow">→</div>`;

    if (exDef.image) {
      const img = new Image();
      img.className = 'history-ex-thumb';
      img.alt = exDef.name;
      img.onload = () => {
        const ph = card.querySelector('.history-ex-thumb-ph');
        if (ph) ph.replaceWith(img);
      };
      img.src = exDef.image;
    }

    content.appendChild(card);
  }

  // Clear history button
  const clearBtn = make('button', 'btn btn-ghost history-clear-btn', 'Wis alle geschiedenis');
  clearBtn.type = 'button';
  clearBtn.onclick = () => {
    showModal({
      title: 'Geschiedenis wissen?',
      body: 'Alle opgeslagen trainingsgeschiedenis wordt permanent verwijderd. Dit kan niet ongedaan worden.',
      actions: [
        { label: 'Wissen', cls: 'btn-danger', onclick: () => {
          localStorage.removeItem(K.HISTORY);
          closeModal();
          showHistory();
        }},
        { label: 'Annuleren', cls: 'btn-secondary', onclick: closeModal },
      ],
    });
  };
  content.appendChild(clearBtn);

  show(overlay);
}

function showExerciseDetail(ref) {
  const exercises = WS.exercises || _exercisesCache;
  const overlay = el('history-overlay');
  const header = overlay.querySelector('.history-header h2');
  const content = el('history-content');
  const history = getHistory();
  const exDef = exercises[ref];
  if (!exDef) return;

  header.textContent = exDef.name;
  content.innerHTML = '';

  // Back button
  const backBtn = make('button', 'history-back-btn', '← Alle oefeningen');
  backBtn.type = 'button';
  backBtn.onclick = () => showHistory();
  content.appendChild(backBtn);

  // Hero image
  const hero = make('div', 'history-detail-hero');
  hero.innerHTML = `<div class="history-detail-img-ph">🏋</div>`;
  if (exDef.image) {
    const img = new Image();
    img.className = 'history-detail-img';
    img.alt = exDef.name;
    img.onload = () => {
      const ph = hero.querySelector('.history-detail-img-ph');
      if (ph) ph.replaceWith(img);
    };
    img.src = exDef.image;
  }
  content.appendChild(hero);

  // Per variant
  for (const [variantName, variantDef] of Object.entries(exDef.variants)) {
    const entries = history[`${ref}:${variantName}`] || [];

    const section = make('div', 'history-variant');
    let html = `<div class="history-variant-title">${esc(variantName)}</div>`;

    if (entries.length === 0) {
      html += `<div class="history-variant-empty">Nog geen data</div>`;
    } else {
      const latest = entries[entries.length - 1];
      html += `<div class="history-variant-current">${esc(fmtPlanLabel(latest.plan))}</div>`;

      // Progression arrows
      const progs = extractProgression(entries);
      if (progs.length > 0) {
        html += `<div class="history-progs">`;
        for (const p of progs) {
          html += `
            <div class="history-prog">
              <div class="history-prog-label">${esc(p.label)}</div>
              <div class="history-prog-values">${p.steps.map(s => esc(s.display)).join(' → ')}</div>
              <div class="history-prog-dates">${p.steps.map(s => esc(fmtShortDate(s.date))).join('  →  ')}</div>
            </div>`;
        }
        html += `</div>`;
      }

      // Full timeline
      if (entries.length > 1) {
        html += `<div class="history-timeline">`;
        for (const entry of [...entries].reverse()) {
          html += `
            <div class="history-tl-row">
              <span class="history-tl-date">${esc(entry.date)}</span>
              <span class="history-tl-plan">${esc(fmtPlanLabel(entry.plan))}</span>
            </div>`;
        }
        html += `</div>`;
      }
    }

    section.innerHTML = html;
    content.appendChild(section);
  }
}

function extractProgression(entries) {
  if (entries.length < 2) return [];
  const result = [];

  // Check param changes
  const allParamKeys = new Set();
  for (const e of entries) {
    for (const k of Object.keys(e.plan.params || {})) allParamKeys.add(k);
  }

  for (const key of allParamKeys) {
    const steps = [];
    let prev = null;
    for (const e of entries) {
      const val = (e.plan.params || {})[key];
      if (val != null && val !== prev) {
        const display = PARAM_LABELS[key] ? PARAM_LABELS[key](val) : `${val}`;
        steps.push({ date: e.date, display });
        prev = val;
      }
    }
    if (steps.length > 1) {
      result.push({ label: PARAM_NAMES[key] || key.replace(/_/g, ' '), steps });
    }
  }

  // Check sets/reps changes
  const srSteps = [];
  let prevSR = null;
  for (const e of entries) {
    const sr = `${e.plan.sets}× ${fmtTimeSummary(e.plan.reps, e.plan.seconds_per_rep)}`;
    if (sr !== prevSR) {
      srSteps.push({ date: e.date, display: sr });
      prevSR = sr;
    }
  }
  if (srSteps.length > 1) {
    result.push({ label: 'Sets / reps', steps: srSteps });
  }

  return result;
}

function hideHistory() {
  hide(el('history-overlay'));
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', () => {
  // History overlay (available on index page)
  el('btn-close-history')?.addEventListener('click', hideHistory);

  if (el('index-root')) {
    initIndex().then(() => {
      el('btn-history-index')?.addEventListener('click', showHistory);
    });
  }

  if (el('workout-root')) {
    initWorkout();

    // Wire up static buttons
    el('btn-stop')?.addEventListener('click', onStopPressed);
    el('btn-prev')?.addEventListener('click', onNavigatePrev);
    el('btn-next')?.addEventListener('click', onNavigateNext);
    el('btn-set-done')?.addEventListener('click', () => {
      const session = getSession();
      if (session) onSetDone(session);
    });
  }
});
