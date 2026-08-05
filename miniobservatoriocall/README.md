# Portal de Pedido de Tempo — Miniobservatório do INPE

Versão em português, específica para a chamada 2026B da disciplina AST-203-4. A aplicação é estática, independente e não utiliza servidor ou banco de dados.

## Funções

- página informativa da chamada;
- formulário integralmente em português;
- escolha do modo de execução: observação clássica, remota, em fila ou em serviço;
- proposta em um único modo científico: fotometria ou espectroscopia;
- Investigador Principal e número livre de coautores;
- lista dinâmica de alvos e importação por CSV;
- sequência de calibração espectroscópica preenchida pelo proponente;
- salvamento e carregamento de rascunhos em `.moinpe.json`;
- geração local do PDF final em português;
- nenhuma informação é gravada no GitHub ou transmitida a um servidor.

A versão não oferece estimador automático de tempo de exposição. O cálculo e sua justificativa devem ser elaborados pelo proponente.

## Publicação rápida

1. Copie a pasta `miniobservatoriocall` para a raiz do repositório `monolipo.github.io`.
2. Faça commit e push para o ramo publicado pelo GitHub Pages.
3. A página ficará em:
   `https://monolipo.github.io/miniobservatoriocall/`

Consulte `INTEGRACAO_SITE.md` para instruções detalhadas.

## Estrutura

- `index.html`: informações da chamada;
- `formulario.html`: formulário, salvamento, carregamento e submissão;
- `assets/css/portal.css`: aparência completa;
- `assets/js/form.js`: lógica do formulário;
- `assets/js/pdf-generator.js`: gerador local de PDF, sem bibliotecas externas;
- `assets/img/`: logotipo usado na interface e no PDF;
- `modelos/`: proposta de exemplo e modelo CSV de alvos;
- `docs/`: notas técnicas, prévias e lista de testes.

## Teste local

Na pasta que contém `miniobservatoriocall`, execute:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000/miniobservatoriocall/
```

O formulário pode ser aberto com dados de demonstração usando:

```text
http://localhost:8000/miniobservatoriocall/formulario.html?demo=1
```

## Limitação intencional

“Submeter proposta” significa gerar o PDF final. O portal não envia e-mail e não possui banco de dados. Após conferir o PDF, o proponente deve anexá-lo manualmente a uma mensagem para `leandro.almeida@inpe.br`.
