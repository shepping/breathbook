# Breathbook

A small offline-first web app (PWA) for planning breathwork classes.

- **Exercises**: a library of breathing exercises (title, instructions, duration, position, notes) with search.
- **Plan**: enter a target duration (and optionally a number of exercises) and get a suggestion that fills the time. Exercises already used this calendar month are skipped where possible. Reroll, swap one exercise, or pick one yourself.
- **Class view**: after "Use this session", the Plan tab shows the class in large text, ready to glance at while teaching. It also has an optional "Keep screen on" switch.
- **History**: every logged session by date. Delete a session that was logged by mistake.
- **Backup**: export everything to a JSON file and import it again.

No framework, no build step: plain HTML, CSS and JavaScript modules.

---

## Project structure

```
breathbook/
├── index.html               App shell (header, tab bar, dialog, toast)
├── manifest.webmanifest     PWA metadata: name, colours, icons
├── sw.js                    Service worker: offline cache + updates
├── css/styles.css           All styles (light + automatic dark mode)
├── icons/                   App icons (PNG + SVG)
├── js/
│   ├── app.js               Startup and hash routing (#/plan, #/exercises, …)
│   ├── config.js            APP_VERSION
│   ├── storage.js           ★ The ONLY module that reads/writes data
│   ├── suggest.js           ★ The suggestion algorithm (pure functions)
│   ├── backup.js            File download/upload around storage export/import
│   ├── demo-data.js         Demo exercises
│   ├── ui.js                Shared helpers: dialogs, toast, formatting
│   └── views/               One file per screen
└── tests/
    ├── suggest.test.html    Open in the browser to test the algorithm
    └── suggest.test.js      Same tests; also runs with `node tests/suggest.test.js`
```

### Data storage (`js/storage.js`)

Data is stored in **IndexedDB**, the browser's built-in database, on the phone itself. I chose it over localStorage because:

1. Its API is **asynchronous**, just like a cloud backend. All functions in `storage.js` return Promises, so swapping in e.g. Supabase later means rewriting only this one file. The screens already `await` every call.
2. It has more room, and the app asks the browser to keep the data permanently (`navigator.storage.persist()`).

The interface:

| Function | What it does |
|---|---|
| `getExercises()` / `getExercise(id)` | Read exercises |
| `saveExercise(ex)` | Add (no `id`) or update (with `id`) |
| `deleteExercise(id)` | Delete an exercise; history keeps its name |
| `getSessions()` | All sessions, newest first |
| `logSession({ date, targetMin, exercises })` | Save a session |
| `deleteSession(id)` | Delete a session |
| `getSettings()` / `saveSettings(partial)` | Tolerance, max exercises |
| `exportAll()` / `importAll(data)` / `validateBackup(data)` | Backup |
| `seedIfEmpty(list)` / `clearDemoData()` / `countDemo()` | Demo data |

### Data model

```js
Exercise { id, title, description, durationMin, position: 'seated'|'standing'|'either',
           notes, isDemo, createdAt, updatedAt }

Session  { id, date: 'YYYY-MM-DD', targetMin, totalMin, createdAt,
           exercises: [{ id, title, durationMin }] }   // a snapshot, so history
                                                      // survives edits/deletes
```

The backup file is `{ app: 'breathbook', schemaVersion: 1, exportedAt, exercises, sessions, settings }`. Bump `SCHEMA_VERSION` in `storage.js` when the data format changes (e.g. when music or saved combinations are added).

### Suggestion algorithm (`js/suggest.js`)

1. Exercises are split into **fresh** (not used this calendar month) and **used**.
2. A search over a *shuffled* list finds every set whose total is within `target ± tolerance` (and has the requested count, if given). Shuffling makes every reroll different.
3. If fresh exercises alone can fill the time, one of those sets is picked at random. A set size is picked first, so "Any" doesn't always produce many short exercises.
4. Otherwise repeats are allowed: the set with the fewest and least recently used repeats wins. The UI marks them with "Used 3 Nov".
5. If nothing fits at all, the closest possible set is shown with an explanation.

Swap keeps the other exercises and picks a replacement that keeps the total within tolerance, preferring fresh exercises.

The module has no DOM or storage code. It receives data and returns a result, so it's easy to test, tweak or replace.

---

## Run it locally

Service workers and JavaScript modules don't work when you double-click `index.html`; the app must be served over `http://localhost`. With [Node.js](https://nodejs.org) installed, open a terminal in this folder and run:

```bash
npx --yes http-server -p 8080 -c-1
```

Then open <http://localhost:8080> in Chrome. (`-c-1` turns off caching so you always see your latest changes. Stop the server with Ctrl+C.)

Algorithm tests: open <http://localhost:8080/tests/suggest.test.html>, or run:

```bash
node tests/suggest.test.js
```

**Tip while developing:** the service worker caches files. If a change doesn't show up, open Chrome DevTools → *Application* → *Service workers* → tick **Update on reload**.

---

## Deploy to GitHub Pages

GitHub Pages hosts the app for free at `https://<your-username>.github.io/breathbook/`.

### Some words first

- **git** keeps track of versions of your files on your computer.
- A **repository** ("repo") is a project folder tracked by git.
- A **commit** is a saved snapshot with a short description ("Add README").
- **push** uploads your commits to GitHub. GitHub Pages then publishes them automatically.

### One-time setup

1. **Create the repo on GitHub.** Go to <https://github.com/new>, name it `breathbook`, choose **Public** (needed for free GitHub Pages), and **don't** tick "Add a README". Click *Create repository*.

2. **Connect this folder to it.** Open a terminal in this folder and run these one by one. Replace `YOUR-USERNAME`:

   ```bash
   git init
   ```
   *Turns this folder into a git repository.*

   ```bash
   git add .
   ```
   *Selects all files for the next snapshot.*

   ```bash
   git commit -m "First version of Breathbook"
   ```
   *Saves the snapshot.*

   ```bash
   git branch -M main
   ```
   *Names the main line of work "main".*

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/breathbook.git
   ```
   *Tells git where the GitHub copy lives.*

   ```bash
   git push -u origin main
   ```
   *Uploads everything. The first time, a browser window asks you to sign in to GitHub.*

3. **Turn on GitHub Pages.** On GitHub, open the repo → **Settings** → **Pages**. Under *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, folder **/ (root)** → **Save**. After a minute or two the page shows the address of the live app.

### Publishing a change later

1. Make your change.
2. **Bump the version** so phones pick up the update: change `CACHE_VERSION` in `sw.js` (e.g. `breathbook-v1.0.1`) and `APP_VERSION` in `js/config.js`.
3. Run:

   ```bash
   git add .
   ```

   ```bash
   git commit -m "Describe what changed"
   ```

   ```bash
   git push
   ```

Within a few minutes the new version is live. The next time Kristien opens the app, it shows **"A new version is available — Refresh"**. Her data is not affected by updates.

> Prefer clicking over typing? [GitHub Desktop](https://desktop.github.com) does the same (commit + push) with buttons.

---

## Install it on the phone (Samsung Galaxy, Chrome)

1. Open the GitHub Pages address in **Chrome** on the phone.
2. Tap the **⋮** menu (top right) → **Add to Home screen** → **Install**. (On some versions it says *Install app*.)
3. Breathbook now has its own icon and opens full-screen, like a normal app. It works offline.

**Important:** the data lives only on that phone, inside Chrome. So:

- Use **More → Export backup** now and then and keep the file safe (e.g. Google Drive).
- Uninstalling the app or clearing Chrome's site data deletes the exercises. Restore them with **More → Import backup**.

---

## Demo data

On first start, the app adds 9 demo exercises marked **DEMO**, so you can test right away. Remove them with **More → Remove demo data**. That also removes sessions that consist only of demo exercises; her own exercises are never touched. Demo data is added only once, on an empty library, so it never comes back after removal.

---

## Prepared for later

- **Cloud sync** (e.g. Supabase): reimplement `js/storage.js` with the same functions. No screen talks to IndexedDB directly.
- **Music suggestions**: add fields to `Exercise` (or a new store), bump `SCHEMA_VERSION`, and handle older backups in `validateBackup`/`importAll`.
- **Fixed combinations**: a new `combinations` store in `storage.js`, plus a "Use a saved combination" option on the Plan tab. `suggest.js` doesn't need to change.
