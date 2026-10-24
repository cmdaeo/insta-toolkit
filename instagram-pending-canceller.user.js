// ==UserScript==
// @name         Instagram Pending Request Canceller (audit.html bridge)
// @namespace    cmdaeo
// @version      1.0.0
// @description  Loads pending usernames from your local instagram-follow-audit.html and sequentially cancels pending Instagram follow requests.
// @match        file://*/*
// @match        https://www.instagram.com/*
// @match        http://127.0.0.1:3000/c:/Users/Miguel/Desktop/instagram-follow-audit-fixed.html
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'ig_pending_cancel_state_v1';
  const LOCK_KEY = 'ig_pending_cancel_lock_v1';
  const SCRIPT_NAME = 'IG Pending Canceller';
  const DEBUG = true;

  const DEFAULT_STATE = {
    queue: [],
    index: 0,
    active: false,
    canceled: [],
    denied: [],
    failed: [],
    updatedAt: 0,
    startedAt: 0,
    source: 'unknown'
  };

  function log(...args) {
    if (DEBUG) console.log(`[${SCRIPT_NAME}]`, ...args);
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function jitter(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function now() {
    return Date.now();
  }

  function readState() {
    const saved = GM_getValue(STORAGE_KEY, null);
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_STATE };
    return {
      ...DEFAULT_STATE,
      ...saved,
      queue: Array.isArray(saved.queue) ? saved.queue : [],
      canceled: Array.isArray(saved.canceled) ? saved.canceled : [],
      denied: Array.isArray(saved.denied) ? saved.denied : [],
      failed: Array.isArray(saved.failed) ? saved.failed : []
    };
  }

  function writeState(next) {
    const merged = {
      ...DEFAULT_STATE,
      ...next,
      updatedAt: now()
    };
    GM_setValue(STORAGE_KEY, merged);
    return merged;
  }

  function updateState(mutator) {
    const current = readState();
    const next = mutator({ ...current });
    return writeState(next || current);
  }

  function clearState() {
    GM_deleteValue(STORAGE_KEY);
    GM_deleteValue(LOCK_KEY);
  }

  function normalizeUsername(username) {
    return String(username || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/^https?:\/\/www\.instagram\.com\//i, '')
      .replace(/^https?:\/\/instagram\.com\//i, '')
      .replace(/\/?\?.*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }

  function uniqueUsernames(input) {
    const seen = new Set();
    const out = [];
    for (const item of input || []) {
      const username = normalizeUsername(typeof item === 'string' ? item : item.username);
      if (!username || seen.has(username)) continue;
      seen.add(username);
      out.push(username);
    }
    return out;
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[s]));
  }

  function isAuditPage() {
    return !!document.getElementById('listPending') && !!document.getElementById('analyzeBtn');
  }

  function isInstagramPage() {
    return location.hostname === 'www.instagram.com' || location.hostname === 'instagram.com';
  }

  function isProfilePath(pathname) {
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return false;
    const blocked = new Set(['accounts', 'explore', 'direct', 'reels', 'stories', 'about', 'developer', 'p']);
    return !blocked.has(parts[0].toLowerCase());
  }

  function profileUrl(username) {
    return `https://www.instagram.com/${encodeURIComponent(normalizeUsername(username))}/`;
  }

  function getCurrentProfileUsername() {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) return '';
    return normalizeUsername(parts[0]);
  }

  function getQueueProgress(state) {
    const total = state.queue.length;
    const done = state.canceled.length + state.denied.length + state.failed.length;
    return { total, done, left: Math.max(total - state.index, 0) };
  }

  function addResult(username, bucket, extra = {}) {
    return updateState(state => {
      const uname = normalizeUsername(username);
      const allBuckets = ['canceled', 'denied', 'failed'];
      for (const key of allBuckets) {
        state[key] = state[key].filter(entry => normalizeUsername(entry.username || entry) !== uname);
      }
      const entry = { username: uname, at: new Date().toISOString(), ...extra };
      state[bucket].push(entry);
      if (state.queue[state.index] && normalizeUsername(state.queue[state.index]) === uname) {
        state.index += 1;
      }
      if (state.index >= state.queue.length) {
        state.active = false;
      }
      return state;
    });
  }

  function currentTarget(state = readState()) {
    return normalizeUsername(state.queue[state.index] || '');
  }

  function finishedUsernames(state = readState()) {
    const set = new Set();
    ['canceled', 'denied', 'failed'].forEach(key => {
      for (const entry of state[key]) set.add(normalizeUsername(entry.username || entry));
    });
    return set;
  }

  function lockFor(username, ttlMs = 45000) {
    const current = GM_getValue(LOCK_KEY, null);
    const ts = now();
    if (current && current.expiresAt > ts && current.username === username) return false;
    GM_setValue(LOCK_KEY, { username, expiresAt: ts + ttlMs, page: location.href });
    return true;
  }

  function releaseLock(username) {
    const current = GM_getValue(LOCK_KEY, null);
    if (current && current.username === username) GM_deleteValue(LOCK_KEY);
  }

  function queryAllButtons() {
    return Array.from(document.querySelectorAll('button'));
  }

  function buttonText(btn) {
    return (btn?.innerText || btn?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function findButtonByExactText(text) {
    return queryAllButtons().find(btn => buttonText(btn) === text && btn.offsetParent !== null);
  }

  function findButtonByTexts(texts) {
    const wanted = new Set(texts);
    return queryAllButtons().find(btn => wanted.has(buttonText(btn)) && btn.offsetParent !== null);
  }

  function clickElement(el) {
    if (!el) return false;
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.click();
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return true;
  }

  async function waitFor(fn, { timeout = 15000, interval = 250, label = 'condition' } = {}) {
    const start = now();
    while (now() - start < timeout) {
      const value = fn();
      if (value) return value;
      await sleep(interval);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }

  function onLocalAnalyzerPage() {
    GM_addStyle(`
      #igpc-panel {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        width: 360px;
        max-width: calc(100vw - 24px);
        background: #0b1020;
        color: #e5e7eb;
        border: 1px solid #334155;
        border-radius: 14px;
        box-shadow: 0 18px 40px rgba(0,0,0,.45);
        font: 12px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
      }
      #igpc-panel .head {
        padding: 12px 14px 8px;
        font-weight: 700;
        border-bottom: 1px solid #1f2937;
      }
      #igpc-panel .body {
        padding: 12px 14px;
      }
      #igpc-panel .row { margin-bottom: 10px; }
      #igpc-panel .buttons { display: flex; gap: 8px; flex-wrap: wrap; }
      #igpc-panel button {
        border: 1px solid #475569;
        background: #111827;
        color: #e5e7eb;
        border-radius: 999px;
        padding: 8px 12px;
        cursor: pointer;
      }
      #igpc-panel button.primary {
        background: #166534;
        border-color: #22c55e;
      }
      #igpc-panel textarea {
        width: 100%;
        min-height: 100px;
        resize: vertical;
        background: #020617;
        color: #e5e7eb;
        border: 1px solid #334155;
        border-radius: 10px;
        padding: 10px;
      }
      #igpc-panel .muted { color: #94a3b8; }
      #igpc-panel .ok { color: #86efac; }
      #igpc-panel .warn { color: #fda4af; }
    `);

    const panel = document.createElement('div');
    panel.id = 'igpc-panel';
    panel.innerHTML = `
      <div class="head">Instagram Pending Canceller</div>
      <div class="body">
        <div class="row" id="igpc-status"></div>
        <div class="row buttons">
          <button id="igpc-load" class="primary">Load pending from analyzer</button>
          <button id="igpc-open">Open Instagram worker</button>
          <button id="igpc-clear">Clear state</button>
        </div>
        <div class="row muted">Denied usernames</div>
        <div class="row"><textarea id="igpc-denied" readonly placeholder="Denied usernames will appear here..."></textarea></div>
      </div>
    `;
    document.body.appendChild(panel);

    const statusEl = panel.querySelector('#igpc-status');
    const deniedEl = panel.querySelector('#igpc-denied');
    const loadBtn = panel.querySelector('#igpc-load');
    const openBtn = panel.querySelector('#igpc-open');
    const clearBtn = panel.querySelector('#igpc-clear');

    function extractPendingFromAnalyzer() {
      const unsafePending = typeof unsafeWindow !== 'undefined' ? unsafeWindow.pendingList : null;
      if (Array.isArray(unsafePending) && unsafePending.length) {
        return uniqueUsernames(unsafePending.map(x => x?.username || x));
      }
      const links = Array.from(document.querySelectorAll('#listPending a[href*="instagram.com/"]'));
      return uniqueUsernames(links.map(a => a.href));
    }

    function render() {
      const state = readState();
      const progress = getQueueProgress(state);
      const current = currentTarget(state);
      deniedEl.value = state.denied.map(x => x.username || x).join('\n');
      statusEl.innerHTML = [
        `<div><strong>Queue:</strong> ${state.queue.length}</div>`,
        `<div><strong>Index:</strong> ${state.index}</div>`,
        `<div><strong>Active:</strong> ${state.active ? '<span class="ok">yes</span>' : 'no'}</div>`,
        `<div><strong>Current:</strong> ${escapeHtml(current || '-')}</div>`,
        `<div><strong>Canceled:</strong> ${state.canceled.length} &nbsp; <strong>Denied:</strong> ${state.denied.length} &nbsp; <strong>Failed:</strong> ${state.failed.length}</div>`,
        `<div class="muted">Processed: ${progress.done}/${progress.total}</div>`
      ].join('');
    }

    loadBtn.addEventListener('click', () => {
      const queue = extractPendingFromAnalyzer();
      if (!queue.length) {
        alert('No pending usernames found. Run Analyze first.');
        return;
      }
      const next = writeState({
        queue,
        index: 0,
        active: true,
        canceled: [],
        denied: [],
        failed: [],
        startedAt: now(),
        source: location.href
      });
      render();
      log('Loaded queue from analyzer', next);
      alert(`Loaded ${queue.length} pending usernames into the worker queue.`);
    });

    openBtn.addEventListener('click', () => {
      const state = readState();
      const current = currentTarget(state);
      const url = current ? profileUrl(current) : 'https://www.instagram.com/';
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    clearBtn.addEventListener('click', () => {
      clearState();
      render();
    });

    setInterval(render, 1000);
    render();
  }

  async function onInstagramPage() {
    GM_addStyle(`
      #igpc-ig-panel {
        position: fixed;
        right: 12px;
        bottom: 12px;
        z-index: 999999;
        width: 320px;
        max-width: calc(100vw - 24px);
        background: rgba(17,24,39,.96);
        color: #f9fafb;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 14px;
        box-shadow: 0 18px 40px rgba(0,0,0,.45);
        font: 12px/1.45 system-ui, -apple-system, Segoe UI, sans-serif;
        padding: 12px 14px;
      }
      #igpc-ig-panel .buttons { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
      #igpc-ig-panel button {
        border: 1px solid rgba(255,255,255,.18);
        background: #111827;
        color: #f9fafb;
        border-radius: 999px;
        padding: 7px 11px;
        cursor: pointer;
      }
      #igpc-ig-panel .ok { color: #86efac; }
      #igpc-ig-panel .warn { color: #fca5a5; }
      #igpc-ig-panel .muted { color: #9ca3af; }
      #igpc-ig-panel textarea {
        width: 100%;
        min-height: 86px;
        margin-top: 8px;
        background: #030712;
        color: #f9fafb;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 10px;
        padding: 8px;
        resize: vertical;
      }
    `);

    const panel = document.createElement('div');
    panel.id = 'igpc-ig-panel';
    panel.innerHTML = `
      <div><strong>Instagram Pending Canceller</strong></div>
      <div id="igpc-ig-status" class="muted" style="margin-top:6px"></div>
      <div class="buttons">
        <button id="igpc-pause">Pause</button>
        <button id="igpc-next">Skip current</button>
        <button id="igpc-stop">Stop & clear</button>
      </div>
      <textarea id="igpc-ig-denied" readonly placeholder="Denied usernames..."></textarea>
    `;
    document.body.appendChild(panel);

    const statusEl = panel.querySelector('#igpc-ig-status');
    const deniedEl = panel.querySelector('#igpc-ig-denied');

    function renderPanel() {
      const state = readState();
      const current = currentTarget(state);
      statusEl.innerHTML = [
        `<div>Active: ${state.active ? '<span class="ok">yes</span>' : 'no'}</div>`,
        `<div>Queue: ${state.index}/${state.queue.length}</div>`,
        `<div>Current target: ${escapeHtml(current || '-')}</div>`,
        `<div>Canceled: ${state.canceled.length} | Denied: ${state.denied.length} | Failed: ${state.failed.length}</div>`
      ].join('');
      deniedEl.value = state.denied.map(x => x.username || x).join('\n');
    }

    panel.querySelector('#igpc-pause').addEventListener('click', () => {
      updateState(state => {
        state.active = !state.active;
        return state;
      });
      renderPanel();
    });

    panel.querySelector('#igpc-next').addEventListener('click', () => {
      updateState(state => {
        state.index += 1;
        if (state.index >= state.queue.length) state.active = false;
        return state;
      });
      renderPanel();
    });

    panel.querySelector('#igpc-stop').addEventListener('click', () => {
      clearState();
      renderPanel();
    });

    async function routeToCurrentTarget(state) {
      const username = currentTarget(state);
      if (!username) return false;
      const currentPathUser = getCurrentProfileUsername();
      if (currentPathUser !== username) {
        log('Navigating to', username);
        await sleep(jitter(900, 1800));
        location.href = profileUrl(username);
        return true;
      }
      return false;
    }

    async function waitUntilPageSettles() {
      await sleep(jitter(1500, 2600));
      await waitFor(() => document.querySelector('main'), { timeout: 15000, interval: 250, label: 'Instagram main content' });
      await sleep(jitter(900, 1600));
    }

    async function processCurrentUser() {
      const state = readState();
      if (!state.active) return;

      const username = currentTarget(state);
      if (!username) {
        updateState(s => {
          s.active = false;
          return s;
        });
        return;
      }

      const doneSet = finishedUsernames(state);
      if (doneSet.has(username)) {
        updateState(s => {
          if (normalizeUsername(s.queue[s.index]) === username) s.index += 1;
          if (s.index >= s.queue.length) s.active = false;
          return s;
        });
        return;
      }

      if (await routeToCurrentTarget(state)) return;
      if (!isProfilePath(location.pathname)) return;
      if (!lockFor(username)) return;

      try {
        await waitUntilPageSettles();

        const actionBtn = await waitFor(
          () => findButtonByTexts(['Requested', 'Follow']),
          { timeout: 12000, interval: 300, label: 'Requested/Follow button' }
        );

        const initialText = buttonText(actionBtn);
        log('Found action button', username, initialText);

        if (initialText === 'Follow') {
          addResult(username, 'denied', { reason: 'already-follow' });
          renderPanel();
          await sleep(jitter(1200, 2200));
          releaseLock(username);
          return;
        }

        clickElement(actionBtn);
        await sleep(jitter(1000, 1800));

        const unfollowBtn = await waitFor(
          () => findButtonByExactText('Unfollow'),
          { timeout: 10000, interval: 250, label: 'Unfollow confirm button' }
        );

        clickElement(unfollowBtn);
        await sleep(jitter(1400, 2400));

        await waitFor(
          () => {
            const btn = findButtonByTexts(['Follow', 'Requested']);
            return btn && buttonText(btn) === 'Follow' ? btn : null;
          },
          { timeout: 12000, interval: 300, label: 'button changed to Follow' }
        );

        addResult(username, 'canceled', { reason: 'unfollowed' });
        renderPanel();
        await sleep(jitter(1800, 3200));
      } catch (err) {
        log('Failed to process user', username, err);
        addResult(username, 'failed', { reason: err.message || String(err) });
        renderPanel();
        await sleep(jitter(1800, 3200));
      } finally {
        releaseLock(username);
      }
    }

    setInterval(renderPanel, 1000);
    renderPanel();

    let runnerActive = false;
    async function runner() {
      if (runnerActive) return;
      runnerActive = true;
      try {
        while (true) {
          const state = readState();
          if (!state.active) {
            await sleep(1500);
            continue;
          }
          await processCurrentUser();
          await sleep(jitter(1000, 1800));
        }
      } finally {
        runnerActive = false;
      }
    }

    runner();
  }

  GM_registerMenuCommand('Show saved state in console', () => log(readState()));
  GM_registerMenuCommand('Clear saved state', () => clearState());

  if (isAuditPage()) {
    onLocalAnalyzerPage();
    return;
  }

  if (isInstagramPage()) {
    onInstagramPage();
  }
})();
