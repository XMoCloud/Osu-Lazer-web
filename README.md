# osu! Web

A browser-based recreation of the popular rhythm game **osu!**, built entirely using web technologies. 

Unlike traditional web game ports that rely on the HTML5 `<canvas>`, this project utilizes a custom **DOM and SVG-based rendering engine**. This means all game objects (hit circles, sliders, spinners) are actual DOM elements and SVG paths manipulated in real-time, providing a unique approach to rendering complex rhythm game mechanics on the web.

## 🔥 UI/UX Features

The user interface was completely built from scratch and heavily inspired by **osu!lazer**, featuring a clean, modern aesthetic with smooth animations and transitions.

*   **Modern Intro & Main Menu:** Featuring background videos, parallax scrolling effects, and dynamic audio visualization.
*   **Integrated Beatmap Browser:** An elegant song selection screen to browse your imported tracks.
*   **Search & Filtering:** Quickly find your favorite maps by title, artist, or difficulty name.
*   **Smooth Gameplay HUD:** Slick overlay elements for Score, Accuracy, Combo, and HP drain.
*   **Results Screen:** Detailed post-game statistics highlighting your misses, hits, accuracy, and overall rating.

## ⚙️ Core Functionalities

*   **Native `.osz` Support:** Import original osu! beatmap files directly into the browser. The game unzips and parses them on the fly.
*   **Persistent Storage:** Imported beatmaps, audio files, background images, and metadata are saved locally using **IndexedDB**, so you don't have to re-import them on every visit.
*   **Full Object Support:** Precisely parses and renders standard osu! objects:
    *   **Hit Circles**
    *   **Sliders:** Complex slider paths are calculated and drawn in real-time using SVG paths, including support for Linear, Bezier, and Perfect Circle curve types.
    *   **Spinners**
*   **Local Leaderboards:** Automatically tracks and saves your high scores and ranks locally for every difficulty you play.
*   **Web Audio API:** Ensures low-latency audio playback and tightly synchronized timing between the beatmap commands and the audio track.
*   **Complete Game Loop:** Pause, resume, retry, break periods, and fail states are fully implemented.

## 🎮 Controls

The game replicates standard osu! controls:
*   **Aim:** Mouse or Pen
*   **Click:** 
    *   Keyboard: `Z` and `X` (Default)
    *   Mouse: Left Click and Right Click
*   **Pause:** `Esc`

## 🛠️ Technical Implementation Highlights

*   **DOM/SVG Engine:** A significant departure from Canvas-based games. Slider bodies are constructed using `<path>` elements within an `<svg>` layer, ensuring crisp edges without pixelation. Hit circles map directly to DOM image manipulation.
*   **Frame Optimization:** For maps with thousands of objects, the engine utilizes a time-window optimization algorithm, only bringing DOM elements into existence a few seconds before they appear on screen to prevent browser memory overload.
*   **Client-side Unzipping:** A custom virtual file system parses ZIP central directories in the browser to extract `.osu`, `.mp3/.ogg`, and image files instantly.

## 🏆 Credits & Acknowledgements

A massive thanks to GitHub user **[111116](https://github.com/111116)** and their project **[webosu](https://github.com/111116/webosu)**. 

A large portion of the core logic, beatmap parsing (`osu.js`), curve mathematics (`LinearBezier.js`, `CircumscribedCircle.js`), and audio managing (`AudioEngine.js`) was taken or adapted directly from their fantastic repository. 

**Modifications made in this project from the original `webosu`:**
*   **Complete Engine Overhaul:** The original Canvas rendering logic was entirely stripped out and rewritten to function strictly using **DOM and SVG elements**.
*   **Custom UI:** The entire user interface, from the main menu and song select to the gameplay HUD and results screen, is a custom build inspired by osu!lazer, replacing the original simplistic menus.
*   **Database Shift:** Integration with IndexedDB allows for robust storage of imported beatmaps and local leaderboards.