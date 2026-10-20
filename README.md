# Almoxarifado da Sala

Site simples para controlar os insumos (materiais) de uma sala: o que tem em estoque, o que entrou, o que saiu e quem foi o responsável.

## Funcionalidades
- Cadastro de materiais (código automático MAT-001, categoria, unidade, local, estoque mínimo, quantidade inicial)
- Registro de entradas e saídas com data, quantidade, responsável e observação
- Saída bloqueada quando a quantidade é maior que o estoque
- Estoque atual com status: OK, Abaixo do mínimo, Zerado
- Histórico com filtros por material, tipo e responsável
- Backup (copiar JSON) e restauração por arquivo

## Como usar
Abra o `index.html` no navegador. Não precisa instalar nada.

Para publicar grátis: Settings → Pages → Branch `main` → pasta `/ (root)`.

## Limitações
- Os dados ficam no `localStorage` do navegador: não são compartilhados entre computadores e somem se o histórico do navegador for limpo.
- Não há login.
