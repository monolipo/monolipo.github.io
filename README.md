# Astroted - Ted Leandro de Almeida

Academic website prepared for `astroted.com`, based on the uploaded Felipe Almeida-Fernandes Jekyll template and adapted with information from the Lattes CV.

## Quick start on GitHub Pages

1. Create or use your GitHub Pages repository under `github.com/monolipo`. For a user site, the canonical repository name is `monolipo.github.io`. A project repository also works if GitHub Pages is configured correctly.
2. Upload all files from this folder to the repository.
3. In GitHub, open **Settings → Pages** and select GitHub Actions / Jekyll deployment.
4. The file `CNAME` already contains `astroted.com`. Point your DNS records for `astroted.com` to GitHub Pages.

## Editing the site without touching many files

Use `EDITAR_SITE.html` locally in Chrome or Edge:

1. Open `EDITAR_SITE.html` from your local copy of the repository.
2. Click **Abrir pasta do site** and choose the repository folder.
3. Edit profile, color, texts, publications, events, lectures and projects.
4. Click **Salvar e atualizar arquivos do site**.
5. Commit and push the updated files.

Fallback: edit `content/site_content.json` and run:

```bash
python tools/update_site.py
```

## Theme color

The current theme color is burgundy (`#800020`). You can change it in `EDITAR_SITE.html` or directly in `_sass/skins/_custom.scss`.

## Prepared pages

- English and Portuguese versions are included.
- Blog links were removed.
- Main sections are filled from the CV where available.
- Pages without content are left as under-construction placeholders.
- `lectures/ast203_2026.html` and `lectures/ast203_2026_ptbr.html` are ready for AST-203-4 materials.
