# osu!lazer reference implementation

The supplied main-menu, beatmap-listing, and song-selection screenshots are the
visual targets. References were collected before implementation and refreshed on 2026-10-28.
The browser UI is implemented in vanilla JavaScript, CSS, DOM and SVG.

* [BeatmapListingOverlay](https://github.com/ppy/osu/blob/master/osu.Game/Overlays/BeatmapListingOverlay.cs): dark blue overlay, padded three-column card layout, cancellable searches.
* [BeatmapListingSearchControl](https://github.com/ppy/osu/blob/master/osu.Game/Overlays/BeatmapListing/BeatmapListingSearchControl.cs): wide search field, labelled filter rows, faint artwork under filters.
* [BeatmapCardNormal](https://github.com/ppy/osu/blob/master/osu.Game/Beatmaps/Drawables/Cards/BeatmapCardNormal.cs): artwork thumbnail, darker artwork-backed text panel, status and difficulty indicators; OutQuint transitions.
* [BeatmapCard](https://github.com/ppy/osu/blob/master/osu.Game/Beatmaps/Drawables/Cards/BeatmapCard.cs): 360 ms card transitions.
* [OsuLogo](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Menu/OsuLogo.cs): separate hover, beat and amplitude scales; expanding ripple.
* [LogoVisualisation](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Menu/LogoVisualisation.cs): 200 bars, five overlapping rounds, amplitude updates every 50 ms, index offset of five, decay of 0.0024 per ms, stronger kiai response. The SVG renderer adapts these ideas without the native renderer.
* [BeatSyncedContainer](https://github.com/ppy/osu/blob/master/osu.Game/Graphics/Containers/BeatSyncedContainer.cs): timing-point based music synchronization.

The screenshot's listing uses a charcoal-blue header and filter panel, roughly
50 px horizontal content padding at desktop size, compact cover-backed cards,
lime ranked badges and small coloured difficulty bars. Song selection uses a
left information/ranking column and a right carousel with a white selected-set
edge, indented coloured difficulties, and a magenta Back button. The menu tip
panel is adapted into the requested tutorial action.

Only supported filters and actual local rankings are shown. Account, global
ranking, multiplayer and unsupported ruleset controls are not decorative fakes.
Existing logo/background assets are retained. Typography uses the bundled clean
Quicksand font. The old Torus **demo** replaces punctuation with a DEMO glyph and
is no longer loaded. These adaptations do not claim pixel identity with
the native client at every viewport size.

## Menu refinement references

The supplied screenshots were compared against the [published lazer menu image](https://dl.flathub.org/media/sh/ppy/osu/104ad1ea73a73ec2950fdf780b17cb81/screenshots/image-1_orig.png)
and a [native volume overlay capture](https://user-images.githubusercontent.com/111712756/191397842-6158559e-a476-4baa-b30d-4b913b220220.jpg).
The matching implementation details came from upstream source:

* [ButtonSystem](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Menu/ButtonSystem.cs), [ButtonArea](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Menu/ButtonArea.cs) and [MainMenuButton](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Menu/MainMenuButton.cs): purple `#6644cc`, amber `#eeaa00`, lime `#a5cc00`, pink `#ee3399`, compact buttons and overlapping edge shadows. At 1920 x 1080 the row is 134 px high and buttons are 187 px wide.
* [OsuColour](https://github.com/ppy/osu/blob/master/osu.Game/Graphics/OsuColour.cs): continuous difficulty colour anchors, shared between listing pips, selection edges and star badges.
* [PanelBeatmap](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Select/PanelBeatmap.cs): dark difficulty-tinted rows with bright edges. Rows are 59 px high at full HD; selecting extends a row 95 px left. Song cards overlap by 2 px.
* [BassAmplitudeProcessor](https://github.com/ppy/osu-framework/blob/master/osu.Framework/Audio/BassAmplitudeProcessor.cs): FFT512 linear magnitudes. Browser FFT output needs display gain, while preserving sharp peaks; compressed dB values produced the old uniform ring. One path is reused across five radial passes.
* Logo compression follows the actual audio clock and uninherited timing points, starting on the beat and recovering over two beats. The bundled Triangles track uses offset 15 ms, beat length 375 ms (160 BPM).

The toolbar music icon opens an artwork-backed transport panel with shuffle,
previous/play/next, song position and a library shortcut. Wheel input on the main
menu opens the master volume dial, which now controls music and previews only,
including the gameplay track. The default is 15%, with later choices saved under
`osu:musicVolume`. Hit sounds, UI effects, failure/combo-break sounds and tutorial
samples use separate effect levels. Song-list and online-browser scrolling remain independent.

## Settings, notifications and score cards

The user's supplied settings, notification sidebar, current song-selection and
results screenshots remain the layout targets. An older 2022 leaderboard image
found during research is not used as the layout target.

* [NotificationOverlay](https://github.com/ppy/osu/blob/master/osu.Game/Overlays/NotificationOverlay.cs), [Notification](https://github.com/ppy/osu/blob/master/osu.Game/Overlays/Notifications/Notification.cs) and [toast tray](https://github.com/ppy/osu/blob/master/osu.Game/Overlays/NotificationOverlayToastTray.cs): right sidebar, purple panels, icon-led notification cards, unread lights, separate running tasks, and toasts entering under the toolbar at the top right. A [2026 client capture](https://osu.ppy.sh/community/forums/topics/2192615) was also inspected.
* [ScorePanel](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Ranking/ScorePanel.cs), [AccuracyCircle](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Ranking/Expanded/Accuracy/AccuracyCircle.cs), [RankText](https://github.com/ppy/osu/blob/master/osu.Game/Screens/Ranking/Expanded/Accuracy/RankText.cs): expanded current score, compact neighbouring scores, white numeric grade letters and a cyan-to-lime accuracy ring.
* [DrawableRank](https://github.com/ppy/osu/blob/master/osu.Game/Online/Leaderboards/DrawableRank.cs): wide numeric letter shapes and compact textured rank badges. The actual [official SVG badges](https://github.com/ppy/osu-web/tree/master/public/images/badges/score-ranks-v2019) are bundled; the large white grades preserve their letter outlines. Attribution, source SVGs and the upstream licence are included. No commercial numeric font is distributed.

Saved settings cover physical hit keys, mouse buttons, cursor size and cursor
sensitivity. Custom sensitivity uses browser pointer capture after an explicit
start click; Esc releases capture and pauses. Notification history survives
same-tab navigation. Result cards show local plays of the same difficulty in
descending score order. Earlier scores that did not save hit counts display
an em dash for those counts. PP and online/global rankings are not fabricated.

## wosu! motion reference

At the user's request, the deployed [wosu! website](https://wosu.dino.icu/)
and its public source were inspected. These references are pinned to deployed
commit `472396360820c7dabcfd0a11debd0c7cc86de1e1`:

* [MenuButton](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/menu/MenuButton.ts): 500 ms elastic expansion to 1.5 times width, icon scale 1.2, alternating 8-degree tilt, 10 px beat bounce, and click flash. Settings uses the same motion as the other buttons.
* [OsuLogo](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/menu/OsuLogo.ts): independent hover/press, amplitude and beat scales; elastic hover and release; two-beat OutQuint recovery.
* [SongSelectScreen](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/select/SongSelectScreen.ts): information and song panels enter from opposite sides over 800 ms, footer rises over 500 ms, cookie expands over 700 ms; exit takes 300 ms.
* [PlayerLoaderScreen](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/play/PlayerLoaderScreen.ts): scale/fade transitions and a minimum 1800 ms loading presentation. At the user's request, the adaptation shows only centered beatmap artwork and name, without the information panel; Escape cancels loading. Gameplay fades in over 400 ms and out over 250 ms.
* [AccuracyCircle](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/results/AccuracyCircle.ts) and [resultsMath](https://github.com/Mostlime12195/wosu/blob/472396360820c7dabcfd0a11debd0c7cc86de1e1/src/screens/results/resultsMath.ts): clockwise accuracy gauge and elliptical grade-marker positions. The SVG gauge fills only the recorded accuracy; fixed-size cards scale to the viewport without internal scrollbars.

The reference uses PixiJS. This project adapts its motion to native DOM, SVG,
CSS and the Web Animations API; PixiJS is not included. The adapted easing and
motion references are covered by the [wosu MIT licence](licenses/wosu-MIT.txt).
Menu icons are inline SVGs, sharing the settings gear's size and stroke style.
All scene changes stay inside `index.html`, preserving a single menu audio graph.

## Map providers

Metadata and search: `https://osu.direct/api/v2/search` and
`https://osu.direct/api/v2/s/{id}`, with Mino metadata/search fallback.
Primary downloads: [hinai's binary archive endpoint](https://mirror.hinamizawa.ai/docs/beatmap-download),
`https://mirror.hinamizawa.ai/api/v1/hinai/d/{id}`; append `n` for no video.
Ordinary starter maps use no-video downloads, with Sayobot's
`/beatmaps/download/novideo/{id}` fallback. The tutorial and Browse downloads
request full archives, with osu.direct then Sayobot full-archive fallbacks.
Fallbacks preserve the requested video mode, with a 12-second response-header
deadline before trying the next archive provider.

Previews use [hinai's dedicated preview endpoint](https://mirror.hinamizawa.ai/docs/music),
`/v3/osu/music/preview/{id}`, which returns browser-compatible CORS headers.
Official `b.ppy.sh` clips were verified to lack those headers; they remain a
fallback through a separate native audio element outside the Web Audio graph.
This fallback respects master volume but cannot drive the analyser.
No private osu! API credentials are shipped. Downloads use CORS, normal HTTPS,
bounded timeouts and a deduplicated queue. Provider failures remain retryable.

The supplied tutorial (1011011 / 2116202) contains an `.osb` storyboard and voice
samples, not a video. Both storyboard playback and video events need support.
