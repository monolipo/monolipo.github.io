#!/usr/bin/env python3
"""Aplica a atualização OptiBench + AST-203 ao repositório do site.

Execute na raiz de monolipo.github.io:
    python tools/apply_optibench_ast203_update.py

O script altera content/site_content.json, preserva os demais conteúdos e chama
 tools/update_site.py para regenerar _data/data.yml e o tema.
"""
from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content" / "site_content.json"
FRAGMENT = ROOT / "content" / "ast203_update_fragment.json"
UPDATE_SITE = ROOT / "tools" / "update_site.py"


def update_teaching(data: dict) -> None:
    teaching = data.get("teaching")
    if isinstance(teaching, dict):
        for item in teaching.get("list", []):
            if isinstance(item, dict) and "AST-203-4" in str(item.get("name", "")):
                item.update({
                    "role": "Professor / Lecturer",
                    "semester": "2026.2 — Ongoing",
                    "location": "INPE",
                    "details": "Responsible for Lectures 7–12 in the second course block.",
                })
    teaching_ptbr = data.get("teaching_ptbr")
    if isinstance(teaching_ptbr, dict):
        for item in teaching_ptbr.get("list", []):
            if isinstance(item, dict) and "AST-203-4" in str(item.get("name", "")):
                item.update({
                    "role": "Professor",
                    "semester": "2026.2 — Em andamento",
                    "location": "INPE",
                    "details": "Responsável pelas Aulas 7–12 no segundo bloco da disciplina.",
                })


def main() -> int:
    missing = [p for p in (CONTENT, FRAGMENT) if not p.exists()]
    if missing:
        print("Arquivos não encontrados:", file=sys.stderr)
        for path in missing:
            print(f"- {path}", file=sys.stderr)
        print("Extraia o pacote na raiz do repositório antes de executar.", file=sys.stderr)
        return 1

    payload = json.loads(CONTENT.read_text(encoding="utf-8"))
    course_update = json.loads(FRAGMENT.read_text(encoding="utf-8"))
    data = payload.setdefault("data", {})
    lectures = data.setdefault("lectures", {})
    lectures.update({
        "title_ongoing": "Ongoing Courses",
        "title_ongoing_ptbr": "Cursos em andamento",
        "intro_ongoing": "Current courses and teaching materials.",
        "intro_ongoing_ptbr": "Disciplinas em andamento e seus materiais.",
        "title_upcoming": lectures.get("title_upcoming", "Upcoming Courses"),
        "title_upcoming_ptbr": lectures.get("title_upcoming_ptbr", "Cursos previstos"),
        "title_finished": lectures.get("title_finished", "Finished Courses"),
        "title_finished_ptbr": lectures.get("title_finished_ptbr", "Cursos encerrados"),
    })
    courses = lectures.setdefault("courses", [])
    if not isinstance(courses, list):
        raise SystemExit("data.lectures.courses não é uma lista.")

    index = next((i for i, c in enumerate(courses) if isinstance(c, dict) and c.get("code") == "AST-203-4"), None)
    if index is None:
        courses.append(course_update)
    else:
        preserved = dict(courses[index])
        preserved.update(course_update)
        courses[index] = preserved

    update_teaching(data)
    CONTENT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Atualizado: {CONTENT.relative_to(ROOT)}")

    if UPDATE_SITE.exists():
        try:
            subprocess.run([sys.executable, str(UPDATE_SITE)], cwd=ROOT, check=True)
        except subprocess.CalledProcessError as exc:
            print("Falha ao executar tools/update_site.py.", file=sys.stderr)
            print("Confirme que PyYAML está instalado: python -m pip install pyyaml", file=sys.stderr)
            return exc.returncode or 1
    else:
        print("Aviso: tools/update_site.py não foi encontrado; regenere _data/data.yml manualmente.")

    print("\nAtualização concluída. Revise com 'git diff' antes de publicar.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
