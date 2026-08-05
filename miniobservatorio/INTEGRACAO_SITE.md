# Integração com `monolipo.github.io`

## 1. Colocar a aplicação no repositório

Na raiz do repositório do site, crie a pasta:

```text
miniobservatorio/
```

Copie **todo o conteúdo** deste pacote para essa pasta, preservando a estrutura:

```text
monolipo.github.io/
├── index_ptbr.html
├── _data/
├── _includes/
├── assets/
└── miniobservatorio/
    ├── index.html
    ├── formulario.html
    ├── assets/
    ├── modelos/
    └── docs/
```

Não mova apenas os HTMLs: eles dependem dos arquivos em `miniobservatorio/assets/`.

Após commit e push, teste diretamente:

```text
https://monolipo.github.io/miniobservatorio/
```

A aplicação é estática e não interfere no Jekyll do restante do site.

## 2. Opção recomendada: criar um link no menu “Aulas”

O site usa o arquivo `_data/data.yml` para montar a navegação. Na seção `navbar_ptbr.pages`, você pode acrescentar uma entrada própria logo após “Aulas”:

```yaml
- title: Pedido de Tempo
  url: /miniobservatorio/
  icon: fa-solid fa-calendar-days
```

O trecho ficará semelhante a:

```yaml
navbar_ptbr:
  pages:
    - title: Página Inicial
      url: /index_ptbr.html
      icon: fa fa-fw fa-home
    - title: Publicações
      url: /publications_ptbr.html
      icon: fa fa-fw fa-book
    - title: Palestras e Eventos
      url: /events_ptbr.html
      icon: fa-solid fa-presentation-screen
    - title: Aulas
      url: /lectures_ptbr.html
      icon: fa-solid fa-person-chalkboard
    - title: Pedido de Tempo
      url: /miniobservatorio/
      icon: fa-solid fa-calendar-days
    - title: Projetos
      url: /projects_ptbr.html
      icon: fa-solid fa-telescope
```

Essa alteração cria um item permanente na barra superior em português.

## 3. Opção alternativa: link apenas na página da disciplina

Para manter o menu mais enxuto, adicione um botão ou parágrafo à página/entrada da disciplina AST-203-4:

```html
<a class="btn" href="{{ '/miniobservatorio/' | relative_url }}">
  Pedido de Tempo — Miniobservatório do INPE
</a>
```

Caso a página esteja em Markdown:

```markdown
[Pedido de Tempo — Miniobservatório do INPE]({{ '/miniobservatorio/' | relative_url }})
```

## 4. Publicar pelo GitHub

Pelo site do GitHub:

1. Abra o repositório `monolipo/monolipo.github.io`.
2. Use **Add file → Upload files**.
3. Envie a pasta `miniobservatorio` preservando subpastas, ou faça o upload por Git/GitHub Desktop.
4. Edite `_data/data.yml` se desejar o item no menu.
5. Faça o commit.
6. Aguarde o GitHub Pages reconstruir o site.
7. Abra a URL e faça um teste completo de salvar, carregar e gerar PDF.

Por Git:

```bash
git clone https://github.com/monolipo/monolipo.github.io.git
cd monolipo.github.io
cp -r /caminho/do/pacote miniobservatorio
git add miniobservatorio _data/data.yml
git commit -m "Add Miniobservatory observing time portal"
git push
```

## 5. O que pode ser personalizado

As constantes visuais estão no início de `assets/css/portal.css`. A cor principal já foi configurada como o vinho usado no site pessoal:

```css
--wine: #800020;
```

As datas e textos da chamada estão em `index.html` e `formulario.html`.

As configurações fixas dos instrumentos estão em `formulario.html` e são lidas pelo PDF. Para uma chamada futura, altere também:

- `2026B` nos HTMLs e scripts;
- datas principais e backup;
- horários;
- instrumentos;
- e-mail de submissão;
- relações empíricas dos estimadores, se o setup mudar.

## 6. Importante sobre “submissão”

O GitHub Pages não executa backend. Portanto, por projeto:

- o rascunho é baixado no computador do aluno;
- o carregamento lê esse arquivo local;
- o PDF é gerado no navegador;
- nada é enviado automaticamente;
- o aluno confere e envia o PDF a `leandro.almeida@inpe.br`.

Isso evita armazenar dados pessoais ou propostas no repositório público.
