# ASOTG / ASMINI AllSky Web: simulador de contingência V1.4.0

## Finalidade

Esta versão acrescenta uma simulação astronômica executada exclusivamente no navegador do visitante. O GitHub Pages entrega os arquivos estáticos. Nenhum processo Python, servidor ASOTG ou Worker Cloudflare é necessário para gerar as imagens quando o serviço está indisponível.

A interface e os endpoints Cloudflare que já funcionam não foram substituídos. A simulação é um recurso de contingência.

## Instalação

Faça backup dos arquivos do site. Extraia este ZIP na raiz do repositório `monolipo/monolipo.github.io`, mantendo a estrutura de diretórios. Substitua apenas os arquivos que constam no pacote.

Arquivos alterados:

- `_includes/allsky_live.html`
- `allsky_mini.html`
- `allsky_otg.html`
- `assets/css/allsky-live.css`
- `assets/js/allsky-live.js`

Novo motor de simulação:

- `assets/js/allsky-local-sim.js`

Novos arquivos estáticos, todos com conteúdo público:

- `assets/allsky-sim/simulation-config.json`
- `assets/allsky-sim/stars.json`
- `assets/allsky-sim/sky_texture_equatorial.jpg`
- `assets/allsky-sim/landscape_mini.png`
- `assets/allsky-sim/landscape_otg.png`
- `assets/allsky-sim/BRIGHT_STARS_LICENSE.txt`

Os dois arquivos `allsky_mini.html` e `allsky_otg.html` continuam sendo páginas HTML independentes, sem layout Jekyll. A página `figures.html` não precisa ser alterada.

Faça um único commit e confira o GitHub Actions. Não modifique o ASOTG V2.1.2, o Cloudflare Worker, o bucket R2, as URLs, as permissões, nem o workflow de publicação.

## Critérios de comutação

1. O navegador consulta o Worker a cada 30 segundos, como na versão anterior.
2. Se o Worker responder com JSON válido, sua resposta é sempre prioritária. Isso inclui `online: false` com a última imagem armazenada no R2. Nenhum fallback local é acionado.
3. Depois de pelo menos 90 segundos desde a primeira falha contínua de comunicação com o Worker, o site carrega o simulador, a geometria congelada, o catálogo e as imagens de fundo. Cada observatório é simulado independentemente.
4. O simulador atualiza o céu com a hora real do visitante, convertida para UTC para os cálculos astronômicos. A posição geográfica corresponde ao observatório escolhido, não à localização do visitante.
5. O navegador continua tentando consultar o Worker. Assim que recebe um status válido, encerra imediatamente a apresentação local e retoma o conteúdo remoto.
6. O código nunca envia imagens simuladas ao Worker ou ao R2. As imagens locais são calculadas no navegador e não são consideradas observações reais.

Em conexões muito lentas, o limite de 8,5 segundos por consulta pode fazer a contingência começar pouco depois dos 90 segundos.

## Conteúdo da simulação

A implementação utiliza os parâmetros efetivamente presentes no arquivo `ASOTG_V2.1.2(1).zip` fornecido pelo proprietário.

| Configuração | MINI | OTG |
| --- | --- | --- |
| Centro X | 0.505 | 0.534 |
| Centro Y | 0.504 | 0.576 |
| Raio normalizado | 0.916 | 0.843 |
| Projeção | Equidistant | Equidistant |
| Landscape | Ativado | Ativado |
| Plano galáctico | Ativado, opacidade 0.55 | Ativado, opacidade 0.55 |
| Alaranjamento | Força 0.58, janela 30 min | Força 0.20, janela 45 min |
| Escurecimento antecipado | 0 min | 30 min |
| Night factor | 1.0 | 0.5 |

Os demais parâmetros de simulação, incluindo iluminação lunar, radius e fade, estão em `assets/allsky-sim/simulation-config.json`.

O motor reproduz o modelo equidistante e os efeitos visuais da simulação Python: cores de twilight, textura equatorial do céu, 498 estrelas, 178 segmentos de constelações, Sol, Lua, sete planetas, transições solares e lunares, paisagens e alaranjamento antisolar. A consulta de eventos solares é interpolada em amostras de cinco minutos, como no ASOTG.

As posições astronômicas são calculadas por algoritmos JavaScript independentes. Os resultados ficam muito próximos da implementação original, mas **não são uma cópia binariamente idêntica do Astropy**, especialmente em efemérides e nos detalhes de rasterização de imagens.

O painel Clean mostra a imagem sintética sem anotações astronômicas, exceto a identificação obrigatória de simulação. O painel Annotated acrescenta as camadas configuradas no ASOTG. Alvos personalizados continuam sendo projetados sobre o quadro.

## Segurança e limites

A configuração pública foi extraída por uma lista explícita dos campos de geometria e aparência. O arquivo `asotg_config.json` original e `accounts.json` não são publicados. Nenhuma senha, token de upload, segredo do R2 ou conta de observador é incluída no pacote.

O simulador não controla câmeras, não possui Fake Time e não altera as configurações da simulação remota. O horário local exibido é America/Sao_Paulo. Alterações futuras nas configurações do ASOTG exigem atualizar o JSON público para que a contingência continue utilizando os valores desejados.

A simulação exige um navegador moderno com suporte a Canvas 2D e JavaScript. A página pública permanece independente do Worker para os cálculos locais, mas precisa que o GitHub Pages esteja acessível para carregar os arquivos estáticos.

## Procedimento de verificação

1. Com o Worker ativo e o ASOTG publicando, confira que a imagem original aparece.
2. Desligue a câmera ou o ASOTG, mantendo o Worker ativo. Confirme que a última imagem continua visível e aparece OFFLINE.
3. Desabilite a URL pública do Worker e atualize o site. Primeiro aparece UNAVAILABLE. Após 90 segundos de falhas contínuas aparece SIMULATION com um quadro gerado no navegador.
4. Confirme os landscapes MINI e OTG, o movimento das estrelas e a opção Annotated.
5. Reative a URL pública do Worker. O quadro remoto deve retomar prioridade na consulta seguinte, em até aproximadamente 30 segundos quando a página estiver visível.

Os testes locais incluem a alternância de fontes, a leitura das duas calibrações, a busca de Altair no catálogo offline e a comparação de um quadro sintético com uma imagem histórica do ASOTG.
