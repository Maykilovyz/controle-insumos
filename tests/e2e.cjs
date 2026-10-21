// Teste ponta a ponta do banco compartilhado, com os emuladores do Firebase.
// Uso (na raiz do repositório): npm test
// Sobe os emuladores de Auth e Firestore, carrega as regras com um dono de teste e abre a página em 3 navegadores.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const PAGE = path.resolve(process.argv[2] || path.join(__dirname, '..', 'index.html'));
const FBDIR = path.join(__dirname, '..', 'node_modules/firebase');
const PROJ = 'demo-almox';
const DONO = 'dono.teste@gmail.com', ED = 'ed@gmail.com', X = 'x@gmail.com';
let ok = 0, falhas = 0;
const t = (cond, nome, extra) => { if (cond) { ok++; console.log('  ok  ', nome); } else { falhas++; console.log('  FALHA', nome, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ate(fn, ms = 8000) { const fim = Date.now() + ms; let v; while (Date.now() < fim) { try { v = await fn(); if (v) return v; } catch (e) { /* tenta de novo */ } await sleep(150); } return v; }

// servidor local para a página (IndexedDB e módulos precisam de origem http)
const srv = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(PAGE)); });

async function rest(col) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJ}/databases/(default)/documents/${col}?pageSize=500`, { headers: { Authorization: 'Bearer owner' } });
  const j = await r.json();
  return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), f: d.fields }));
}
async function limparBanco() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJ}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJ}/accounts`, { method: 'DELETE' });
}

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const URL = `http://127.0.0.1:${srv.address().port}/?emulador=1`;
  await limparBanco();
  const regras = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8').replaceAll('DONO@gmail.com', DONO);
  const rr = await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJ}:securityRules`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: regras }] } }) });
  if (!rr.ok) throw new Error('não carregou as regras no emulador: ' + await rr.text());
  const b = await chromium.launch();
  const erros = [];
  async function abrir(nome, { largura = 1280, local = null } = {}) {
    const ctx = await b.newContext({ viewport: { width: largura, height: 900 } });
    await ctx.route(/https:\/\/www\.gstatic\.com\/firebasejs\/[\d.]+\/(.+)$/, route => {
      const f = route.request().url().match(/firebasejs\/[\d.]+\/(.+)$/)[1];
      route.fulfill({ status: 200, headers: { 'content-type': 'text/javascript', 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(FBDIR, f)) });
    });
    if (local) await ctx.addInitScript(d => { try { if (!localStorage.getItem('insumos-sala-v1')) localStorage.setItem('insumos-sala-v1', d); } catch (e) { } }, JSON.stringify(local));
    const pg = await ctx.newPage();
    pg.on('pageerror', e => erros.push(`${nome} pageerror: ${e.message}`));
    pg.on('console', m => { if (m.type() === 'error') erros.push(`${nome} console: ${m.text().slice(0, 200)}`); });
    await pg.goto(URL);
    return { ctx, pg };
  }
  const gate = pg => pg.evaluate(() => ({ visivel: !document.getElementById('gate').hidden, msg: document.getElementById('gateMsg').textContent }));
  const DB = pg => pg.evaluate(() => JSON.parse(JSON.stringify(db)));
  const entrar = (pg, email) => pg.evaluate(e => window.__entrarTeste(e), email);
  const idle = (pg, ms = 350) => pg.waitForTimeout(ms);
  const saldo = (pg, nome) => pg.evaluate(n => { const m = db.materiais.find(x => x.nome === n); return m ? db.movs.reduce((s, v) => v.mat === m.id ? s + (v.tipo === 'in' ? v.qtd : -v.qtd) : s, 0) : null; }, nome);

  const v2 = {
    materiais: [
      { id: 'a1', cod: 'MAT-001', nome: 'Motor DC 6V', cat: 'Robótica', un: 'un', local: 'Caixa azul', min: 4 },
      { id: 'a2', cod: 'MAT-002', nome: 'Servo SG90', cat: 'Robótica', un: 'un', local: '', min: 2 }
    ],
    movs: [
      { id: 'm1', mat: 'a1', tipo: 'in', qtd: 10, data: '2026-10-20T08:15', resp: 'Mayke', obs: '' },
      { id: 'm2', mat: 'a1', tipo: 'out', qtd: 3, data: '2026-10-20T09:00', resp: 'Turma 7A', obs: 'aula' },
      { id: 'm3', mat: 'a2', tipo: 'in', qtd: 5, data: '2026-10-19T10:00', resp: 'Mayke', obs: '' }
    ], seq: 2, demo: false
  };

  console.log('# 1. Dono entra e traz os dados do navegador');
  const A = await abrir('dono', { local: v2 });
  t(await ate(async () => (await gate(A.pg)).msg.includes('Entre com sua conta Google')), 'mostra tela de entrada', await gate(A.pg));
  t(await A.pg.evaluate(() => document.getElementById('main').inert), 'app fica inerte atrás da tela de entrada');
  await entrar(A.pg, DONO);
  t(await ate(async () => !(await gate(A.pg)).visivel), 'tela de entrada some depois do login', await gate(A.pg));
  t(await ate(() => A.pg.isVisible('#importBanner')), 'oferece enviar os dados deste navegador');
  t((await A.pg.textContent('#importText')).replace(/\u00a0/g, ' ').includes('2 materiais'), 'texto do aviso de importação', await A.pg.textContent('#importText'));
  t(await ate(async () => (await rest('config')).length === 1), 'lista de acesso criada para o dono');
  await A.pg.click('#btnImportar'); await idle(A.pg); await A.pg.click('#alertOk');
  t(await ate(async () => (await rest('materiais')).length === 2 && (await rest('movs')).length === 3), 'dados importados chegam ao banco', { m: (await rest('materiais')).length, v: (await rest('movs')).length });
  t(await ate(async () => (await saldo(A.pg, 'Motor DC 6V')) === 7), 'saldo do Motor DC 6V = 7');
  t(await A.pg.isHidden('#importBanner'), 'aviso de importação some');
  const movsSrv = await rest('movs');
  t(movsSrv.every(d => d.f.por && d.f.por.stringValue === DONO), 'registros importados ficam com o dono como autor');

  console.log('# 2. Pessoa sem acesso');
  const B = await abrir('editor', { largura: 390 });
  await ate(async () => (await gate(B.pg)).msg.includes('Entre'));
  await entrar(B.pg, ED);
  t(await ate(async () => (await gate(B.pg)).msg.includes('ainda não foi liberado')), 'editor ainda não liberado vê aviso', await gate(B.pg));
  t((await B.pg.textContent('#gateEmail')) === ED, 'mostra o e-mail a liberar');
  t((await DB(B.pg)).materiais.length === 0, 'sem acesso não recebe dados');

  console.log('# 3. Dono libera o editor pela tela Pessoas com acesso');
  await A.pg.click('#btnMais'); await idle(A.pg, 250);
  t(await A.pg.isVisible('#miAcesso'), 'menu mostra Pessoas com acesso para o dono');
  await A.pg.click('#miAcesso'); await idle(A.pg);
  await A.pg.fill('#aEmail', 'ED@gmail.com'); await A.pg.click('#aLiberar');
  t(await ate(async () => (await A.pg.textContent('#aEditores')).includes(ED)), 'e-mail aparece na lista (minúsculo)');
  t(await ate(async () => { const c = await rest('config'); return c[0].f.editores.arrayValue.values?.some(v => v.stringValue === ED); }), 'lista salva no banco');
  await A.pg.fill('#aEmail', 'nao-e-email'); await A.pg.click('#aLiberar');
  t(await A.pg.isVisible('#aErr'), 'e-mail inválido mostra erro');
  await A.pg.click('#saFechar'); await idle(A.pg);
  await B.pg.click('#gateTentar');
  t(await ate(async () => !(await gate(B.pg)).visivel && (await DB(B.pg)).materiais.length === 2), 'editor entra e vê os mesmos materiais', await gate(B.pg));
  await B.pg.click('#btnMais'); await idle(B.pg, 250);
  t(!(await B.pg.isVisible('#miAcesso')) && !(await B.pg.isVisible('#miRestaurar')), 'editor não vê Pessoas com acesso nem Restaurar');
  await B.pg.keyboard.press('Escape'); await idle(B.pg);

  console.log('# 4. Editor registra uma saída; o dono vê na hora');
  await B.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(B.pg);
  t(await B.pg.isHidden('#smExcluir'), 'editor não vê Excluir material');
  await B.pg.fill('#smQtd', '2'); await B.pg.fill('#smResp', 'Ana (9º A)');
  await B.pg.click('#smSubmit'); await idle(B.pg);
  t(await ate(async () => (await saldo(A.pg, 'Motor DC 6V')) === 5), 'dono vê saldo 5 em tempo real', await saldo(A.pg, 'Motor DC 6V'));
  const novo = (await rest('movs')).find(d => d.f.resp.stringValue === 'Ana (9º A)');
  t(novo && novo.f.por.stringValue === ED, 'registro novo guarda o autor', novo && novo.f);

  console.log('# 5. Desfazer no editor também desfaz no banco');
  t(await B.pg.isVisible('#toastAcao'), 'toast oferece Desfazer depois do eco do servidor');
  await B.pg.click('#toastAcao');
  t(await ate(async () => (await saldo(A.pg, 'Motor DC 6V')) === 7), 'desfazer volta o saldo para 7 no dono');

  console.log('# 6. Permissões de exclusão');
  await B.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(B.pg);
  await B.pg.fill('#smQtd', '1'); await B.pg.fill('#smResp', 'Bruno');
  await B.pg.click('#smSubmit'); await idle(B.pg, 800);
  await B.pg.click('[role=tab]#tab-historico'); await idle(B.pg);
  await B.pg.click('#histList .row:has-text("Bruno")'); await idle(B.pg);
  t(await B.pg.isVisible('#srExcluir'), 'editor pode excluir o próprio registro');
  t((await B.pg.textContent('#srValores')).includes(ED), 'folha mostra quem registrou');
  await B.pg.click('#srFechar'); await idle(B.pg);
  await B.pg.click('#histList .row:has-text("Turma 7A")'); await idle(B.pg);
  t(await B.pg.isHidden('#srExcluir'), 'editor não pode excluir registro de outra pessoa');
  await B.pg.click('#srFechar'); await idle(B.pg);
  // tentativa direta (sem a interface) é barrada pelas regras
  await B.pg.evaluate(() => { mutate(() => { db.materiais = db.materiais.filter(m => m.nome !== 'Servo SG90'); }); renderAll(); });
  t(await ate(async () => (await B.pg.textContent('#toastMsg')).includes('permissão')), 'gravação proibida mostra aviso', await B.pg.textContent('#toastMsg'));
  t(await ate(async () => (await DB(B.pg)).materiais.some(m => m.nome === 'Servo SG90')), 'material volta na tela depois da recusa');
  t((await rest('materiais')).length === 2, 'material continua no banco');

  console.log('# 7. Dono exclui material; editor vê sumir');
  await A.pg.click('#estGroup [data-i]:has-text("Servo SG90")'); await idle(A.pg);
  t(await A.pg.isVisible('#smExcluir'), 'dono vê Excluir material');
  await A.pg.click('#smExcluir'); await idle(A.pg); await A.pg.click('#alertOk'); await idle(A.pg);
  t(await ate(async () => !(await DB(B.pg)).materiais.some(m => m.nome === 'Servo SG90')), 'editor vê o material sumir');
  t(await ate(async () => !(await rest('movs')).some(d => d.f.mat.stringValue === 'a2')), 'registros do material saem do banco');

  console.log('# 8. Sem internet no editor');
  await B.ctx.setOffline(true); await B.pg.evaluate(() => dispatchEvent(new Event('offline')));
  await B.pg.click('[role=tab]#tab-estoque'); await idle(B.pg);
  await B.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(B.pg);
  await B.pg.fill('#smQtd', '1'); await B.pg.fill('#smResp', 'Offline');
  await B.pg.click('#smSubmit'); await idle(B.pg, 600);
  t((await B.pg.textContent('#footText')).includes('Sem internet'), 'rodapé avisa que está sem internet', await B.pg.textContent('#footText'));
  t((await DB(B.pg)).movs.some(v => v.resp === 'Offline'), 'registro aparece na tela mesmo sem internet');
  t(!(await rest('movs')).some(d => d.f.resp.stringValue === 'Offline'), 'ainda não chegou ao banco');
  await B.ctx.setOffline(false); await B.pg.evaluate(() => dispatchEvent(new Event('online')));
  t(await ate(async () => (await rest('movs')).some(d => d.f.resp.stringValue === 'Offline'), 20000), 'ao voltar a internet, o registro é enviado');
  t(await ate(async () => (await DB(A.pg)).movs.some(v => v.resp === 'Offline'), 15000), 'dono recebe o registro feito sem internet');
  t(await ate(async () => (await B.pg.textContent('#footText')).includes('Sincronizado'), 15000), 'rodapé volta para Sincronizado', await B.pg.textContent('#footText'));

  console.log('# 9. Dois registros ao mesmo tempo não se perdem');
  const antes = (await rest('movs')).length;
  await Promise.all([
    A.pg.evaluate(() => { const m = db.materiais.find(x => x.nome === 'Motor DC 6V'); mutate(() => db.movs.push({ id: uid(), mat: m.id, tipo: 'in', qtd: 1, data: nowLocal(), resp: 'Simultâneo A', obs: '' })); renderAll(); }),
    B.pg.evaluate(() => { const m = db.materiais.find(x => x.nome === 'Motor DC 6V'); mutate(() => db.movs.push({ id: uid(), mat: m.id, tipo: 'in', qtd: 1, data: nowLocal(), resp: 'Simultâneo B', obs: '' })); renderAll(); })
  ]);
  t(await ate(async () => (await rest('movs')).length === antes + 2), 'os dois registros estão no banco');
  t(await ate(async () => { const a = await DB(A.pg), bb = await DB(B.pg); return ['Simultâneo A', 'Simultâneo B'].every(r => a.movs.some(v => v.resp === r) && bb.movs.some(v => v.resp === r)); }), 'as duas telas mostram os dois');

  console.log('# 9b. Faltando e devolução em tempo real');
  const linhaMotor = async pg => (await pg.textContent('#estGroup [data-i]:has-text("Motor DC 6V")')).replace(/ /g, ' ');
  await A.pg.click('[role=tab]#tab-estoque'); await idle(A.pg);
  await A.pg.click('#fEstFalta'); await idle(A.pg);
  t(await ate(async () => (await linhaMotor(A.pg)).includes('5 un com 3 pessoas')), 'dono vê em Faltando: 5 un com 3 pessoas', await linhaMotor(A.pg).catch(() => ''));
  t((await A.pg.textContent('#rTipoDevN')) === '3', 'contador de Devolução = 3', await A.pg.textContent('#rTipoDevN'));
  await B.pg.click('[role=tab]#tab-registrar'); await idle(B.pg);
  await B.pg.click('#rTipoDev'); await idle(B.pg);
  t((await B.pg.$$('#rDevList .dev-btn')).length === 3, 'editor vê as 3 pessoas com o motor');
  await B.pg.click('#rDevList .dev-row:has-text("Turma 7A") .dev-btn'); await idle(B.pg);
  t((await B.pg.inputValue('#alertInput')) === '3', 'pergunta quanto voltou, começando em 3');
  await B.pg.keyboard.press('Enter'); await idle(B.pg);
  t(await ate(async () => (await rest('movs')).some(d => d.f.resp.stringValue === 'Turma 7A' && d.f.dev?.booleanValue === true && d.f.qtd.integerValue === '3' && d.f.por.stringValue === ED)), 'devolução gravada com dev e autor');
  t(await ate(async () => (await linhaMotor(A.pg)).includes('2 un com 2 pessoas')), 'dono vê a devolução na hora', await linhaMotor(A.pg).catch(() => ''));
  t(await ate(async () => (await A.pg.textContent('#rTipoDevN')) === '2'), 'contador de Devolução cai para 2');
  t((await B.pg.$$('#rDevList .dev-btn')).length === 2, 'lista do editor fica com 2');
  // editor marca o material como de consumo (pode editar material); dono vê sair de Faltando; desfazer volta
  await B.pg.click('[role=tab]#tab-estoque'); await idle(B.pg);
  await B.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(B.pg);
  await B.pg.click('#smConsumo'); await idle(B.pg);
  t(await ate(async () => (await rest('materiais')).some(d => d.f.nome.stringValue === 'Motor DC 6V' && d.f.consumo?.booleanValue === true)), 'material de consumo salvo no banco');
  t(await ate(async () => (await A.pg.textContent('#estGroup')).includes('Nada faltando')), 'dono: Faltando fica vazio', await A.pg.textContent('#estGroup'));
  await B.pg.click('#toastAcao'); await idle(B.pg);
  t(await ate(async () => (await rest('materiais')).some(d => d.f.nome.stringValue === 'Motor DC 6V' && !d.f.consumo?.booleanValue)), 'desfazer tira a marca no banco');
  t(await ate(async () => (await linhaMotor(A.pg)).includes('2 un com 2 pessoas')), 'dono vê o motor de volta em Faltando');
  if (await B.pg.$eval('#sheetMat', x => x.open)) { await B.pg.click('#smFechar'); await idle(B.pg); }
  await A.pg.click('#fEstTodos'); await idle(A.pg);

  console.log('# 9c. Fotos');
  const jpg = Buffer.from((await A.pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#123'; x.fillRect(0, 0, 1600, 1200); x.fillStyle = '#e33'; x.fillRect(400, 300, 800, 600); return c.toDataURL('image/jpeg', 0.9); })).split(',')[1], 'base64');
  // editor (celular) adiciona pela ficha: o botão abre Câmera e Galeria
  await B.pg.click('[role=tab]#tab-estoque'); await idle(B.pg);
  await B.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(B.pg);
  t(await ate(() => B.pg.isVisible('#smGalVazio')), 'ficha sem foto oferece Adicionar foto');
  await B.pg.click('#smGalVazio'); await idle(B.pg);
  t(await B.pg.isVisible('#acaoCamera') && await B.pg.isVisible('#acaoGaleria'), 'celular: painel com Câmera e Galeria');
  const [fc] = await Promise.all([B.pg.waitForEvent('filechooser'), B.pg.click('#acaoGaleria')]);
  await fc.setFiles({ name: 'motor.jpg', mimeType: 'image/jpeg', buffer: jpg });
  t(await ate(async () => (await rest('fotos')).length === 1 && (await rest('imagens')).length === 1), 'foto e imagem chegam ao banco');
  const fsrv = (await rest('fotos'))[0];
  t(fsrv && fsrv.f.por.stringValue === ED && fsrv.f.mini.stringValue.startsWith('data:image/jpeg;base64,') && fsrv.f.w.integerValue === '1280', 'foto guarda autor, miniatura JPEG e 1280 px', fsrv && { por: fsrv.f.por, w: fsrv.f.w });
  t(await ate(() => A.pg.evaluate(() => !!document.querySelector('#estGroup [data-i] .thumb img'))), 'dono vê a miniatura no card na hora');
  // dono abre a galeria: a imagem grande vem do banco só agora
  await A.pg.click('#estGroup [data-i]:has-text("Motor DC 6V")'); await idle(A.pg);
  t(await ate(() => A.pg.evaluate(() => fotos.grandes.size === 1 && document.querySelector('#smGalStage img').src.startsWith('blob:'))), 'dono carrega a imagem grande ao abrir a galeria');
  t(await A.pg.isVisible('#smGalExcluir'), 'dono (admin) pode excluir a foto de outra pessoa');
  t(await B.pg.isVisible('#smGalExcluir'), 'quem enviou pode excluir a própria foto');
  await A.pg.click('#smGalExcluir'); await idle(A.pg); await A.pg.click('#alertOk'); await idle(A.pg);
  t(await ate(async () => (await rest('fotos')).length === 0 && (await rest('imagens')).length === 0), 'excluir apaga foto e imagem do banco');
  t(await ate(() => B.pg.evaluate(() => !document.querySelector('#smGalStage img') && !document.getElementById('smGalVazio').hidden)), 'editor vê a foto sumir da ficha aberta');
  await A.pg.click('#smFechar'); await idle(A.pg);
  await B.pg.click('#smFechar'); await idle(B.pg);
  // computador: o seletor abre direto; material novo já com foto; excluído, a foto vai junto (depois do Desfazer)
  await A.pg.click('#btnNovo'); await idle(A.pg);
  const [fc2] = await Promise.all([A.pg.waitForEvent('filechooser'), A.pg.click('#cFotoAdd')]);
  await fc2.setFiles({ name: 'kit.jpg', mimeType: 'image/jpeg', buffer: jpg });
  t(await ate(() => A.pg.evaluate(() => !!document.querySelector('#cFotoThumb img'))), 'cadastro mostra a foto escolhida');
  await A.pg.fill('#cNome', 'Kit LEGO'); await A.pg.click('#cCadastrar'); await idle(A.pg);
  t(await ate(async () => (await rest('fotos')).length === 1 && (await rest('materiais')).some(d => d.f.nome.stringValue === 'Kit LEGO')), 'material novo e foto chegam ao banco');
  t(await ate(() => B.pg.evaluate(() => { const m = db.materiais.find(x => x.nome === 'Kit LEGO'); return !!m && !!capaDe(m); })), 'editor recebe o material com a foto');
  await A.pg.click('#estGroup [data-i]:has-text("Kit LEGO")'); await idle(A.pg);
  await A.pg.click('#smExcluir'); await idle(A.pg);
  t((await A.pg.textContent('#alertMsg')).includes('a foto'), 'confirmação avisa que a foto vai junto', await A.pg.textContent('#alertMsg'));
  await A.pg.click('#alertOk'); await idle(A.pg);
  t((await rest('fotos')).length === 1, 'a foto espera o Desfazer expirar');
  t(await ate(async () => (await rest('fotos')).length === 0 && (await rest('imagens')).length === 0, 12000), 'depois do Desfazer, a foto do material excluído sai do banco');

  console.log('# 10. Liberar para qualquer conta Google');
  const C = await abrir('estranho');
  await ate(async () => (await gate(C.pg)).msg.includes('Entre'));
  await entrar(C.pg, X);
  t(await ate(async () => (await gate(C.pg)).msg.includes('ainda não foi liberado')), 'estranho bloqueado com a chave desligada');
  await A.pg.click('#btnMais'); await idle(A.pg, 250); await A.pg.click('#miAcesso'); await idle(A.pg);
  await A.pg.click('#aAberto'); await idle(A.pg); await A.pg.click('#alertOk'); await idle(A.pg);
  t(await ate(async () => (await rest('config'))[0].f.aberto.booleanValue === true), 'chave salva no banco');
  await A.pg.click('#saFechar'); await idle(A.pg);
  await C.pg.click('#gateTentar');
  t(await ate(async () => !(await gate(C.pg)).visivel && (await DB(C.pg)).materiais.length === 1), 'estranho entra com a chave ligada');

  console.log('# 11. Sair');
  await C.pg.click('#btnMais'); await idle(C.pg, 250);
  await C.pg.click('#miSair'); await idle(C.pg); await C.pg.click('#alertOk');
  t(await ate(async () => (await gate(C.pg)).msg.includes('Entre')), 'depois de sair volta para a tela de entrada');
  t((await DB(C.pg)).materiais.length === 0, 'dados somem da tela ao sair');

  console.log('# 12. Recarregar mantém tudo');
  await B.pg.reload();
  t(await ate(async () => !(await gate(B.pg)).visivel && (await DB(B.pg)).materiais.length === 1, 15000), 'editor recarrega e continua logado com os dados');

  const relevantes = erros.filter(e => !/PERMISSION_DENIED|permission-denied|Missing or insufficient permissions|ERR_INTERNET_DISCONNECTED|net::ERR|Could not reach Cloud Firestore|WebChannelConnection|GrpcConnection|backend didn't respond/i.test(e));
  t(relevantes.length === 0, 'sem erros inesperados no console', relevantes);
  console.log('   (avisos esperados filtrados: ' + (erros.length - relevantes.length) + ')');
  console.log(`\n${ok} ok, ${falhas} falhas`);
  await b.close(); srv.close();
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
