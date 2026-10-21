# Almoxarifado da Sala

Site para controlar os insumos (materiais) de uma sala: o que tem em estoque, o que entrou, o que saiu e quem foi o responsável. Todos que entram pelo link veem e registram nos mesmos dados.

Link: https://maykilovyz.github.io/controle-insumos/

## Funcionalidades
- Estoque com situação de cada material (em dia, abaixo do mínimo, zerado) e busca
- Registro de entradas e saídas com quantidade, responsável, observação e data
- Histórico por dia, com filtros
- Cadastro de materiais com código automático (MAT-001…)
- Desfazer logo depois de qualquer mudança
- Backup (copiar ou baixar JSON) e restauração
- Login com Google e lista de quem pode registrar
- Sincronização em tempo real entre todos; funciona sem internet e envia quando a conexão volta

## Banco compartilhado (Firebase)
Os dados ficam no Firestore do projeto `almoxarifado-sala`. A configuração está em `FIREBASE_CONFIG`, no `index.html`. Ela não é secreta: quem protege os dados são as regras em `firestore.rules`.

Quem pode o quê:
- **Dono** (e-mail escrito nas regras) e **administradores**: tudo, inclusive liberar pessoas, excluir materiais e restaurar backup.
- **Podem registrar**: veem o estoque, cadastram e editam materiais, registram entradas e saídas e apagam só os próprios registros.
- Sem login, ninguém vê nada.

Para liberar alguém: menu `…` → **Pessoas com acesso** → digite o e-mail Google da pessoa.

### Mudar as regras
1. Edite `firestore.rules`.
2. No console do Firebase: Firestore Database → Regras. Cole o arquivo trocando `DONO@gmail.com` pelo e-mail do dono (minúsculo) e clique em Publicar.

Sem `FIREBASE_CONFIG`, ou dentro do Artifact do Claude, o site volta a guardar os dados só no navegador.

## Testes
Precisam de Node 20+ e Java 11+ (para os emuladores do Firebase).

```
npm install
npm test             # 3 navegadores ao mesmo tempo contra os emuladores: login, acesso, tempo real, sem internet, permissões
npm run test:regras  # quem pode ler e gravar cada coisa
```
