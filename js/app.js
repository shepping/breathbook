// app.js — startup, hash routing and service worker registration.

import * as storage from './storage.js';
import { DEMO_EXERCISES } from './demo-data.js';
import { toast } from './ui.js';
import { renderPlan } from './views/plan.js';
import { renderExerciseList, renderExerciseDetail } from './views/exercises.js';
import { renderExerciseForm } from './views/exercise-form.js';
import { renderHistory } from './views/history.js';
import { renderMore } from './views/more.js';

// Route table: pattern -> { tab, title, back, render }
const routes = [
  { re: /^\/plan$/, tab: 'plan', title: 'Plan', render: renderPlan },
  { re: /^\/exercises$/, tab: 'exercises', title: 'Exercises', render: renderExerciseList },
  { re: /^\/exercise\/new$/, tab: 'exercises', title: 'New exercise', back: '#/exercises', render: (el) => renderExerciseForm(el, null) },
  { re: /^\/exercise\/([^/]+)\/edit$/, tab: 'exercises', title: 'Edit exercise', back: (m) => `#/exercise/${m[1]}`, render: (el, m) => renderExerciseForm(el, m[1]) },
  { re: /^\/exercise\/([^/]+)$/, tab: 'exercises', title: 'Exercise', back: '#/exercises', render: (el, m) => renderExerciseDetail(el, m[1]) },
  { re: /^\/history$/, tab: 'history', title: 'History', render: renderHistory },
  { re: /^\/more$/, tab: 'more', title: 'More', render: renderMore },
];

const view = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const backBtn = document.getElementById('back-btn');

async function route() {
  const path = location.hash.replace(/^#/, '') || '/plan';
  let match = null;
  const r = routes.find((x) => (match = path.match(x.re)));
  if (!r) {
    location.replace('#/plan');
    return;
  }

  titleEl.textContent = r.title;
  document.title = r.tab === 'plan' ? 'Breathbook' : `${r.title} · Breathbook`;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === r.tab);
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const back = typeof r.back === 'function' ? r.back(match) : r.back;
  backBtn.hidden = !back;
  backBtn.onclick = () => { location.hash = back; };

  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    await r.render(view, match);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="card"><p>Something went wrong: ${String(err.message || err)}</p></div>`;
  }
}

async function start() {
  try {
    await storage.seedIfEmpty(DEMO_EXERCISES);
  } catch (err) {
    console.error(err);
    view.innerHTML = '<div class="card"><p>This browser cannot store data (IndexedDB unavailable). Try Chrome, outside private mode.</p></div>';
    return;
  }
  storage.requestPersistence();
  window.addEventListener('hashchange', route);
  await route();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Only reload for an update, not for the very first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && hadController) {
          toast('A new version is available.', {
            action: 'Refresh',
            duration: 0,
            onAction: () => worker.postMessage('skipWaiting'),
          });
        }
      });
    });
  }).catch((err) => console.warn('Service worker registration failed', err));

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
}

start();
