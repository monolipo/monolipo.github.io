#!/usr/bin/env python3
"""
Atualiza os arquivos do site a partir de content/site_content.json.

Uso, na raiz do repositório:
    python tools/update_site.py

O arquivo content/site_content.json é a fonte editável principal. Este script
regenera:
    - _data/data.yml
    - _sass/skins/_custom.scss
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

try:
    import yaml
except ImportError as exc:
    raise SystemExit(
        "PyYAML não está instalado. Instale com: python -m pip install pyyaml"
    ) from exc

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "site_content.json"
DATA_YML = ROOT / "_data" / "data.yml"
THEME_SCSS = ROOT / "_sass" / "skins" / "_custom.scss"


def sass_value(value: str, fallback: str) -> str:
    value = (value or fallback).strip()
    return value if value else fallback


def main() -> int:
    if not CONTENT.exists():
        print(f"Arquivo não encontrado: {CONTENT}", file=sys.stderr)
        return 1

    payload = json.loads(CONTENT.read_text(encoding="utf-8"))
    site_data = payload.get("data", {})
    theme = payload.get("theme", {})

    DATA_YML.parent.mkdir(parents=True, exist_ok=True)
    DATA_YML.write_text(
        yaml.safe_dump(site_data, allow_unicode=True, sort_keys=False, width=120),
        encoding="utf-8",
    )

    theme_color = sass_value(theme.get("theme_color"), "#800020")
    text_color = sass_value(theme.get("text_color"), "#2f1b22")
    secondary = sass_value(theme.get("text_color_secondary"), "#5e4a52")
    grey = sass_value(theme.get("text_grey"), "#a78d97")

    THEME_SCSS.parent.mkdir(parents=True, exist_ok=True)
    THEME_SCSS.write_text(
        f"""// Tema principal do astroted.com\n// Para mudar a cor principal, altere $theme-color abaixo\n// ou edite content/site_content.json e rode: python tools/update_site.py\n\n$theme-color: {theme_color};\n$text-color: {text_color};\n$text-color-secondary: {secondary};\n$text-grey: {grey};\n$divider: #e8d7dd;\n$lighter-grey: #f8f1f3;\n$darker-grey: #7c5d69;\n$smoky-white: #fbf7f8;\n$heart: #e25555;\n""",
        encoding="utf-8",
    )

    print("Site atualizado com sucesso:")
    print(f"- {DATA_YML.relative_to(ROOT)}")
    print(f"- {THEME_SCSS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
