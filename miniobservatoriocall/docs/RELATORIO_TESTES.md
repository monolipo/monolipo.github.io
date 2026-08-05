# Relatório de testes

Data: 05 de agosto de 2026.

## Verificações executadas

- sintaxe dos arquivos JavaScript com `node --check`;
- validação do arquivo de exemplo com o analisador JSON;
- verificação de identificadores HTML, referências JavaScript e arquivos vinculados;
- abertura e renderização da página informativa em Chromium/Playwright;
- conferência do título principal e do link para o site da disciplina;
- abertura do formulário e verificação das quatro opções de modo de execução;
- confirmação de que não existe estimador automático de tempo de exposição;
- confirmação de que a sequência de calibração espectroscópica começa em branco e permanece editável;
- salvamento local do rascunho em arquivo `.moinpe.json`;
- carregamento do rascunho salvo e restauração dos campos;
- geração do PDF pelo botão “Submeter proposta” em navegador real;
- captura do arquivo gerado pelo navegador;
- validação estrutural do PDF com `pdfinfo`;
- renderização visual do PDF em A4 e inspeção de suas páginas;
- busca por rótulos e instruções em inglês nas áreas visíveis do portal e do PDF.

## Resultado

O fluxo completo — preencher, salvar, carregar, validar, gerar e baixar o PDF — foi concluído com sucesso. O PDF de demonstração possui 9 páginas A4, sem dependências externas ou JavaScript incorporado ao arquivo PDF.

As imagens de pré-visualização e o PDF de exemplo estão nesta pasta de documentação.
