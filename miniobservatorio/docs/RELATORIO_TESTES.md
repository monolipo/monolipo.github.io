# Relatório de testes

Data: 05 de agosto de 2026.

## Verificações executadas

- sintaxe dos arquivos JavaScript com `node --check`;
- validação do arquivo de exemplo com parser JSON;
- verificação de IDs HTML, referências JavaScript e arquivos vinculados;
- abertura e renderização da página informativa em Chromium/Playwright;
- abertura do formulário e carregamento programático da proposta de demonstração;
- seleção automática do modo fotométrico e exibição do painel correto;
- execução do estimador de exposição fotométrica;
- geração do PDF pelo botão “Submeter proposta” em navegador real;
- captura do download gerado pelo navegador;
- validação estrutural do PDF com `pdfinfo`;
- renderização visual do PDF em A4 e inspeção das páginas.

## Resultado

O fluxo completo — preencher/carregar estado, calcular, validar, gerar e baixar PDF — foi concluído. O PDF de demonstração possui 9 páginas A4, sem dependências externas ou JavaScript incorporado ao arquivo PDF.

As imagens de pré-visualização e um PDF de exemplo estão nesta pasta de documentação.
