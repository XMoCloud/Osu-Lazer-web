# Hosting on GitHub Pages

This project runs as static HTML, CSS and JavaScript. It needs no build command,
backend, API secret or Node installation on the host. `.nojekyll` keeps GitHub
Pages from processing the site with Jekyll.

1. Create a GitHub repository and push the project there. With GitHub Free, use
   a public repository. The existing `origin` points to Reboot01; keep it and add
   GitHub as a separate remote if you want to continue using both services.
2. In the GitHub repository, open **Settings → Pages**.
3. Under **Build and deployment**, select **Deploy from a branch**, choose the
   branch containing the project and the **/(root)** folder, then save.
4. After deployment finishes, open the URL shown in Pages settings, normally
   `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`, including the trailing slash.

See [GitHub's publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
and [site creation guide](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

The runtime uses relative local paths, including the lazily loaded engine, so
it works under a project subdirectory. Beatmaps and previews still come directly
from public providers; hosting on Pages does not replace those services.
Maps, scores and settings are stored in each visitor's browser. Localhost data
does not transfer automatically to the hosted site's different origin.

After publishing, check the intro, Browse preview/download, tutorial, results,
quit back to selection, and a page reload in the deployed URL.
