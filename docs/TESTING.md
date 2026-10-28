# Running and checking the game

Serve the directory using any static HTTP server, for example:

```sh
python -m http.server 8765
```

Open http://localhost:8765. A current browser with Web Audio, IndexedDB, SVG and
`DecompressionStream('deflate-raw')` is required. No build step, package install,
JavaScript framework or backend is needed to run the game.

Starter archives download from public mirrors after entering the menu. The pack
does not block the menu. Completed downloads are kept in IndexedDB; Retry only
fetches missing sets. Internet speed, mirror availability and browser storage
space affect these downloads. The tutorial is downloaded first, with its full
storyboard and voice samples. Other starters request no-video archives before
transfer, retaining artwork and audio. Installed archives are reused as-is.
The library remains available while offline.

## Regression checks

```sh
node --test tests/regressions.mjs
```

These use Node's built-in test runner and cover input state, parser defaults,
ruleset filtering, malformed archives, duplicate downloads, cancellation and
retry, and long-running beat-phase alignment across tempo changes. No testing dependencies are added to the game.
The 24 checks also cover intro retirement, menu/selection playback positions,
transport map events, rapid track changes, gameplay handoff, audio restoration,
no-video fallback policy, and native preview fallback with master volume. They
also check the 15% music default, saved music settings, independent effects and
tutorial-sample volume. The old combined master setting does not carry over.

`tests/browser-smoke.cjs` is a development-only browser check. Install Playwright
outside this repository, then set `OSU_PLAYWRIGHT_PATH` to that installation,
`OSU_CHROME` to a Chrome executable, and `OSU_TEST_MAP` to the full 1011011 tutorial
archive. Start the static server and run:

```sh
node tests/browser-smoke.cjs
```

The script uses the real tutorial archive with deterministic API responses to
check all configured starter installations, duplicate suppression, search, preview,
downloads, local selection, tutorial launch, pause/retry/quit inside `index.html`,
continued logo beats after returning, actual panel/logo opacity after repeated
selection-launched gameplay, starter video modes, intro bypass and a
narrow viewport. Screenshots are saved in the operating system's temp directory.
It does not change the browser profile you normally use.

Separately checked during implementation: live public search, the existence and
standard ruleset of the original 11 and seven additional requested difficulties,
and an actual cross-origin
download/import of the full tutorial archive. A generated beatmap containing a
video was used to check video timing, pause, retry and failure-state Escape.

`node tests/menu-interactions.cjs` uses the same external Playwright/Chrome setup.
It seeds only an isolated test profile with varied song/difficulty fixtures, checks
wheel volume, mute/unmute, keyboard volume, persistence, music transport/shuffle/
seeking, popover dismissal, animated hue and the responsive music panel. It also
checks removal of pointer focus rectangles and key layout measurements against
the supplied screenshots. It also checks transport/selected-map synchronization,
40-difficulty arrow navigation and auto-scroll in both directions, and prevention
of accidental UI selection while keeping text fields selectable. The outro test
checks that close is attempted and a blocked close restores a usable menu.
It saves `osu-refined-*.png` in the temp directory.
The fixtures are never included by the game.

`node tests/overlays-and-results.cjs` also uses the real tutorial archive and an
isolated profile. It checks duplicate key rejection, saved input settings,
cursor capture and sensitivity, release-to-pause, top-right toasts, history,
running tasks, clearing, song-card content clearance, and the settings button's
background geometry. It cancels the animated loading screen and launches again,
then completes a gameplay session, verifies score/count
storage and descending results order, opens an older result, and exercises
settings from results, narrow layout, retry and quit. It checks accuracy-ring
progress, removal of slider-tick rows, and card fit without internal scrolling.
Screenshots are saved as
`osu-settings-panel.png`, `osu-notifications-panel.png`,
`osu-selection-rankings.png`, `osu-game-loader.png`, and `osu-results-*.png`
in the temp directory. The pulsing logo is clicked directly in these tests because
its intentional continuous motion never meets Playwright's stability heuristic.

Cursor sensitivity other than 1x needs a browser supporting Pointer Lock. The
start click requests capture; if capture is unavailable the game retains normal
pointer movement and posts a notification. No framework or runtime dependency
is added.

`node tests/providers-live.cjs` uses the same external Playwright/Chrome setup
and makes real requests, so it depends on provider availability. It checks a
CORS-enabled preview through the analyser, forces proxy failure to exercise
official native-media fallback, downloads/imports set 1627313 without video,
verifies artwork/music remain, and checks the outro closes a script-opened tab.
It uses an isolated profile and does not modify the user's map library.

On 2026-10-28, full transfers of set 1627313 without video took about 2.2 seconds
from hinai and 8.7 seconds from Sayobot on the development connection. A separate
browser download/import from hinai took 2.0 seconds. These are spot checks,
not a speed guarantee; the implementation retains provider fallbacks.

## Media scope

Gameplay video events and the supplied tutorial's sprite/animation storyboard,
hit-sound triggers and voice samples are supported. Full rendering of arbitrary
third-party storyboards is not implemented. Browser codec support determines
which video files can be decoded; unsupported media retains the still background.

The visualizer uses a single SVG path reused five times (seven SVG descendants),
not Canvas, a library or a framework. A local headless Chrome sample measured
approximately 0.21 ms average and 0.30 ms p95 for its JavaScript update; that is
not a total rendering/GPU benchmark or a guarantee for every computer.
