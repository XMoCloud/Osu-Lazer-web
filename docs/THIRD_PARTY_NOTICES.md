# osu!lazer references

The visualizer's radial layout/decay approach and menu animation behaviour are
adapted from the osu!lazer sources linked in DESIGN_REFERENCES.md.

Copyright (c) ppy Pty Ltd <contact@ppy.sh>.

MIT Licence

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Existing webosu adaptation credits are retained in README.md. Existing artwork,
audio, fonts and imported beatmaps retain their respective creators' ownership.

## wosu! motion adaptations

Menu/logo easing, hover/beat motion, scene transition timings and accuracy-ring
marker placement are adapted from [Mostlime12195/wosu](https://github.com/Mostlime12195/wosu)
at deployed commit `472396360820c7dabcfd0a11debd0c7cc86de1e1`.
The adaptations use native DOM, SVG and CSS; no PixiJS code is bundled.

Upstream licence: MIT, Copyright (c) 2015 Drew DeVault.
The full notice is included in [licenses/wosu-MIT.txt](licenses/wosu-MIT.txt).
Source links are recorded in [DESIGN_REFERENCES.md](DESIGN_REFERENCES.md).

## Grade SVG artwork (osu-web)

`assets/grades/GradeSmall-*.svg` are source images from
[ppy/osu-web](https://github.com/ppy/osu-web/tree/master/public/images/badges/score-ranks-v2019).
Copyright ppy Pty Ltd and osu-web contributors. Licensed under GNU AGPL version 3;
the full licence is included in [licenses/osu-web-AGPL-3.0.txt](licenses/osu-web-AGPL-3.0.txt).

`GradeWhite-*.svg` are modified versions made on 2026-10-28: only the foreground
letter outline is retained, cropped and filled white. Both original and modified
SVG source files are included. See [the artwork notes](../assets/grades/README.md).
