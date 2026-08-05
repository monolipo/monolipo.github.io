# Portal de Pedido de Tempo — Miniobservatório do INPE

Aplicação estática, independente e sem backend para a chamada 2026B do Telescópio C11.

## Funções

- página informativa da chamada;
- formulário completo para fotometria ou espectroscopia;
- PI e número livre de coautores;
- lista dinâmica de alvos e importação CSV;
- estimadores de tempo de exposição;
- salvamento e carregamento de rascunhos em `.moinpe.json`;
- geração local do PDF final;
- nenhuma informação é gravada no GitHub ou transmitida a um servidor.

## Publicação rápida

1. Copie esta pasta para a raiz do repositório `monolipo.github.io`.
2. Renomeie a pasta para `miniobservatorio`.
3. Faça commit e push para o branch publicado pelo GitHub Pages.
4. A página ficará em:
   `https://monolipo.github.io/miniobservatorio/`

Consulte `INTEGRACAO_SITE.md` para instruções detalhadas e opções de vínculo no menu/site.

## Estrutura

- `index.html`: informações da chamada;
- `formulario.html`: formulário, salvamento, carregamento e submissão;
- `assets/css/portal.css`: aparência completa;
- `assets/js/form.js`: lógica do formulário;
- `assets/js/pdf-generator.js`: gerador PDF local, sem bibliotecas externas;
- `assets/img/`: logotipo usado na interface e no PDF;
- `modelos/`: proposta de exemplo e modelo CSV de alvos;
- `docs/`: notas técnicas e checklist.

## Teste local

Na pasta que contém `miniobservatorio`, execute:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/miniobservatorio/
```

O formulário pode ser aberto com dados de demonstração usando:

```text
http://localhost:8000/miniobservatorio/formulario.html?demo=1
```

## Limitação intencional

“Submeter proposta” significa gerar o PDF final. O portal não envia e-mail e não possui banco de dados. Após conferir o PDF, o proponente deve anexá-lo manualmente a uma mensagem para `leandro.almeida@inpe.br`.
