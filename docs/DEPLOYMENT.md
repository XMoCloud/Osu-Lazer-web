# Hosting on GitHub Pages

**[Play osu! Web](https://xmocloud.github.io/Osu-Lazer-web/)**

Source repository: **[XMoCloud/Osu-Lazer-web](https://github.com/XMoCloud/Osu-Lazer-web)**.

This project runs as static HTML, CSS and JavaScript. It needs no build command,
backend, API secret or Node installation on the host. `.nojekyll` keeps GitHub
Pages from processing the site with Jekyll.

To update the hosted game, push changes to the repository's publishing branch.
Check **Settings → Pages** for the configured source and the **Actions** tab for
deployment status. For branch-based publishing, select the branch containing
`index.html` and the **/(root)** folder. Keep the screenshot assets and linked
documentation in the repository so README images and links remain available.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [site creation guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

The runtime uses relative local paths, including the lazily loaded engine, so
it works under a project subdirectory. Beatmaps and previews still come directly
from public providers; hosting on Pages does not replace those services.
Maps, scores and settings are stored in each visitor's browser and belong to
that site's origin; they are not uploaded to GitHub.

After publishing, check the intro, Browse preview/download, tutorial, results,
quit back to selection, and a page reload in the deployed URL.
