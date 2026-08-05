# Integração com `monolipo.github.io`

## 1. Colocar a aplicação no repositório

Na raiz do repositório do site, coloque a pasta:

```text
miniobservatoriocall/
```

Preserve a estrutura completa:

```text
monolipo.github.io/
├── index_ptbr.html
├── _data/
├── _includes/
├── assets/
└── miniobservatoriocall/
    ├── index.html
    ├── formulario.html
    ├── assets/
    ├── modelos/
    └── docs/
```

Não mova apenas os arquivos HTML: eles dependem dos arquivos em `miniobservatoriocall/assets/`.

Após o commit e o envio ao GitHub, teste:

```text
https://monolipo.github.io/miniobservatoriocall/
```

A aplicação é estática e não interfere no Jekyll do restante do site.

## 2. Link recomendado na página da disciplina

Na página da AST-203-4, adicione:

```html
<a class="btn" href="{{ '/miniobservatoriocall/' | relative_url }}">
  Pedido de tempo — Miniobservatório do INPE
</a>
```

Em Markdown:

```markdown
[Pedido de tempo — Miniobservatório do INPE]({{ '/miniobservatoriocall/' | relative_url }})
```

O próprio portal possui, no topo, o botão **Site da disciplina**, ligado a:

```text
https://monolipo.github.io/lectures/ast203_2026_ptbr.html
```

## 3. Opção de link permanente no menu

No arquivo `_data/data.yml`, na seção `navbar_ptbr.pages`, acrescente:

```yaml
- title: Pedido de Tempo
  url: /miniobservatoriocall/
  icon: fa-solid fa-calendar-days
```

## 4. Publicar pelo GitHub

Pelo site do GitHub:

1. Abra o repositório `monolipo/monolipo.github.io`.
2. Use **Add file → Upload files**.
3. Envie a pasta `miniobservatoriocall`, preservando todas as subpastas.
4. Edite `_data/data.yml` somente se desejar o item permanente no menu.
5. Faça o commit e aguarde a reconstrução do GitHub Pages.
6. Abra a URL e teste salvar, carregar e gerar o PDF.

Por Git:

```bash
git clone https://github.com/monolipo/monolipo.github.io.git
cd monolipo.github.io
cp -r /caminho/do/pacote/miniobservatoriocall .
git add miniobservatoriocall _data/data.yml
git commit -m "Adicionar chamada do Miniobservatório"
git push
```

## 5. Pontos de personalização

As constantes visuais estão no início de `assets/css/portal.css`. A cor principal é:

```css
--wine: #800020;
```

Para chamadas futuras, revise:

- semestre nos arquivos HTML e JavaScript;
- datas principais e de contingência;
- horários;
- instrumentos;
- endereço de e-mail para envio;
- texto da chamada.

## 6. Importante sobre a submissão

O GitHub Pages não executa código no servidor. Portanto:

- o rascunho é baixado no computador do aluno;
- o carregamento lê o arquivo local;
- o PDF é gerado no navegador;
- nada é enviado automaticamente;
- o aluno confere e envia o PDF para `leandro.almeida@inpe.br`.
