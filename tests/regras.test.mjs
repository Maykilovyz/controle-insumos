// Uso (na raiz do repositório): npm run test:regras
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import fs from 'node:fs';

const DONO = 'dono.teste@gmail.com';
const rules = fs.readFileSync(process.argv[2] || new URL('../firestore.rules', import.meta.url), 'utf8').replaceAll('DONO@gmail.com', DONO);
const env = await initializeTestEnvironment({ projectId: 'demo-almox', firestore: { rules, host: '127.0.0.1', port: 8080 } });

const as = (email, verified = true) => env.authenticatedContext('uid-' + email, { email, email_verified: verified }).firestore();
const anon = env.unauthenticatedContext().firestore();
const mat = { nome: 'Arduino', cod: 'MAT-001', cat: 'Eletrônica', un: 'un', local: 'Armário 1', min: 2 };
const mov = { mat: 'm1', tipo: 'out', qtd: 3, data: '2026-10-21T08:30', resp: 'Ana', obs: '', por: 'ed@gmail.com' };
const movX = { ...mov, por: 'x@gmail.com' };
let ok = 0, falhas = 0;
async function t(nome, p) { try { await p; ok++; console.log('  ok  ', nome); } catch (e) { falhas++; console.log('  FALHA', nome, '-', e.message.split('\n')[0]); } }
const acesso = (o) => ({ admins: [], editores: [], aberto: false, ...o });

await env.clearFirestore();
console.log('# sem config/acesso');
await t('anônimo não lê materiais', assertFails(getDoc(doc(anon, 'materiais/m1'))));
await t('logado qualquer não lê materiais', assertFails(getDoc(doc(as('x@gmail.com'), 'materiais/m1'))));
await t('logado qualquer não cria config/acesso', assertFails(setDoc(doc(as('x@gmail.com'), 'config/acesso'), acesso({ admins: ['x@gmail.com'] }))));
await t('dono com e-mail não verificado não grava', assertFails(setDoc(doc(as(DONO, false), 'materiais/m1'), mat)));
await t('dono grava material', assertSucceeds(setDoc(doc(as(DONO), 'materiais/m1'), mat)));
await t('dono (maiúsculas) grava material', assertSucceeds(setDoc(doc(as(DONO.toUpperCase()), 'materiais/m2'), mat)));
await t('dono cria config/acesso', assertSucceeds(setDoc(doc(as(DONO), 'config/acesso'), acesso({ editores: ['ed@gmail.com'], admins: ['adm@gmail.com'] }))));

console.log('# com config/acesso fechado');
await t('editor lê material', assertSucceeds(getDoc(doc(as('ed@gmail.com'), 'materiais/m1'))));
await t('editor registra saída', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'movs/v1'), mov)));
await t('editor apaga registro', assertSucceeds(deleteDoc(doc(as('ed@gmail.com'), 'movs/v1'))));
await t('editor não altera acesso', assertFails(updateDoc(doc(as('ed@gmail.com'), 'config/acesso'), { aberto: true })));
await t('editor não lê a lista de e-mails', assertFails(getDoc(doc(as('ed@gmail.com'), 'config/acesso'))));
await t('estranho não lê a lista de e-mails', assertFails(getDoc(doc(as('x@gmail.com'), 'config/acesso'))));
await t('admin da lista lê a lista', assertSucceeds(getDoc(doc(as('adm@gmail.com'), 'config/acesso'))));
await t('admin da lista altera acesso', assertSucceeds(updateDoc(doc(as('adm@gmail.com'), 'config/acesso'), { editores: ['ed@gmail.com', 'novo@gmail.com'] })));
await t('admin não apaga config/acesso', assertFails(deleteDoc(doc(as('adm@gmail.com'), 'config/acesso'))));
await t('estranho não lê', assertFails(getDoc(doc(as('x@gmail.com'), 'materiais/m1'))));
await t('estranho não grava', assertFails(setDoc(doc(as('x@gmail.com'), 'movs/v2'), movX)));
await t('anônimo não lê config/acesso', assertFails(getDoc(doc(anon, 'config/acesso'))));
await t('acesso inválido recusado', assertFails(setDoc(doc(as(DONO), 'config/acesso'), { admins: 'x', editores: [], aberto: false })));

console.log('# autoria');
await t('editor não registra em nome de outro', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/a1'), movX)));
await t('editor não registra sem autor', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/a1'), (({ por, ...r }) => r)(mov))));
await t('admin recria registro de outra pessoa (desfazer)', assertSucceeds(setDoc(doc(as('adm@gmail.com'), 'movs/v6'), mov)));
await t('outro editor não apaga registro alheio', assertFails(deleteDoc(doc(as('novo@gmail.com'), 'movs/v6'))));
await t('editor não altera registro', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/v6'), { ...mov, qtd: 99 })));
await t('editor apaga o próprio registro', assertSucceeds(deleteDoc(doc(as('ed@gmail.com'), 'movs/v6'))));
await t('editor não exclui material', assertFails(deleteDoc(doc(as('ed@gmail.com'), 'materiais/m1'))));
await t('editor edita material', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'materiais/m1'), { ...mat, local: 'Armário 3' })));
await t('editor marca material de consumo', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'materiais/m1'), { ...mat, local: 'Armário 3', consumo: true })));
await t('editor registra devolução', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'movs/d1'), { ...mov, tipo: 'in', dev: true }).then(() => deleteDoc(doc(as('ed@gmail.com'), 'movs/d1')))));
await t('admin exclui material', assertSucceeds(deleteDoc(doc(as('adm@gmail.com'), 'materiais/m2'))));
await t('admin apaga registro antigo sem autor', assertSucceeds(setDoc(doc(as('adm@gmail.com'), 'movs/old'), (({ por, ...r }) => r)(mov)).then(() => deleteDoc(doc(as('adm@gmail.com'), 'movs/old')))));
await setDoc(doc(as('adm@gmail.com'), 'movs/v6'), mov);

console.log('# fotos');
const b64 = n => 'A'.repeat(n);
const mini = 'data:image/jpeg;base64,' + b64(20000);
const foto = { mat: 'm1', mini, w: 1280, h: 960, criado: '2026-10-21T08:30', por: 'ed@gmail.com' };
const imagem = { mat: 'm1', img: 'data:image/jpeg;base64,' + b64(880000), por: 'ed@gmail.com' };
// o app grava a miniatura e a imagem no mesmo lote
const par = (id, f = foto, i = imagem, quem = 'ed@gmail.com') => { const db = as(quem), b = writeBatch(db); b.set(doc(db, 'fotos/' + id), f); b.set(doc(db, 'imagens/' + id), i); return b.commit(); };
await t('editor envia foto (miniatura + imagem de ~900 mil caracteres)', assertSucceeds(par('f1')));
await t('miniatura sem a imagem recusada', assertFails(setDoc(doc(as('ed@gmail.com'), 'fotos/f9'), foto)));
await t('imagem sem a miniatura recusada', assertFails(setDoc(doc(as('ed@gmail.com'), 'imagens/f9'), imagem)));
await t('foto de material que não existe recusada', assertFails(par('f9', { ...foto, mat: 'nada' }, { ...imagem, mat: 'nada' })));
await t('miniatura e imagem de materiais diferentes recusadas', assertFails(par('f9', foto, { ...imagem, mat: 'm3' })));
await t('editor lê foto', assertSucceeds(getDoc(doc(as('ed@gmail.com'), 'imagens/f1'))));
await t('estranho não lê fotos', assertFails(getDoc(doc(as('x@gmail.com'), 'fotos/f1'))));
await t('anônimo não lê imagens', assertFails(getDoc(doc(anon, 'imagens/f1'))));
await t('editor não envia foto em nome de outro', assertFails(par('f2', { ...foto, por: 'novo@gmail.com' }, { ...imagem, por: 'novo@gmail.com' })));
await t('foto que não é JPEG recusada', assertFails(par('f2', { ...foto, mini: 'data:image/svg+xml;base64,' + b64(100) })));
await t('foto com texto qualquer recusada', assertFails(par('f2', { ...foto, mini: 'javascript:alert(1)' })));
await t('miniatura grande demais recusada', assertFails(par('f2', { ...foto, mini: 'data:image/jpeg;base64,' + b64(90000) })));
await t('imagem grande demais recusada', assertFails(par('f2', foto, { ...imagem, img: 'data:image/jpeg;base64,' + b64(1000001) })));
await t('foto com campo extra recusada', assertFails(par('f2', { ...foto, extra: 1 })));
await t('foto com largura em texto recusada', assertFails(par('f2', { ...foto, w: '1280' })));
await t('foto não se altera', assertFails(setDoc(doc(as('ed@gmail.com'), 'fotos/f1'), { ...foto, w: 640 })));
await t('outro editor não apaga foto alheia', assertFails(deleteDoc(doc(as('novo@gmail.com'), 'fotos/f1'))));
await t('quem enviou apaga a foto', assertSucceeds(deleteDoc(doc(as('ed@gmail.com'), 'fotos/f1')).then(() => deleteDoc(doc(as('ed@gmail.com'), 'imagens/f1')))));
await par('f3');
await t('admin apaga foto de outra pessoa', assertSucceeds(deleteDoc(doc(as('adm@gmail.com'), 'fotos/f3')).then(() => deleteDoc(doc(as('adm@gmail.com'), 'imagens/f3')))));
await t('mesma foto válida passa (controle dos testes acima)', assertSucceeds(par('f2')));
await t('editor marca a capa no material', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'materiais/m1'), { ...mat, local: 'Armário 3', capa: 'f1' })));
console.log('# validação');
await t('qtd negativa recusada', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/v3'), { ...mov, qtd: -1 })));
await t('tipo inválido recusado', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/v3'), { ...mov, tipo: 'x' })));
await t('data inválida recusada', assertFails(setDoc(doc(as('ed@gmail.com'), 'movs/v3'), { ...mov, data: 'ontem' })));
await t('material sem nome recusado', assertFails(setDoc(doc(as('ed@gmail.com'), 'materiais/m3'), { ...mat, nome: '' })));
await t('mínimo negativo recusado', assertFails(setDoc(doc(as('ed@gmail.com'), 'materiais/m3'), { ...mat, min: -1 })));
await t('campo extra (exemplo) aceito', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'materiais/m3'), { ...mat, exemplo: true })));
await t('meta/estado seq inteiro', assertSucceeds(setDoc(doc(as('ed@gmail.com'), 'meta/estado'), { seq: 3 })));
await t('meta/estado seq texto recusado', assertFails(setDoc(doc(as('ed@gmail.com'), 'meta/estado'), { seq: 'a' })));
await t('coleção desconhecida fechada', assertFails(setDoc(doc(as(DONO), 'outra/x'), { a: 1 })));

console.log('# aberto');
await t('admin abre para todos', assertSucceeds(updateDoc(doc(as('adm@gmail.com'), 'config/acesso'), { aberto: true })));
await t('estranho agora registra', assertSucceeds(setDoc(doc(as('x@gmail.com'), 'movs/v4'), movX)));
await t('estranho ainda não altera acesso', assertFails(updateDoc(doc(as('x@gmail.com'), 'config/acesso'), { aberto: false })));
await t('anônimo continua sem ler', assertFails(getDoc(doc(anon, 'movs/v4'))));
await t('não verificado continua sem gravar', assertFails(setDoc(doc(as('y@gmail.com', false), 'movs/v5'), { ...mov, por: 'y@gmail.com' })));
await t('estranho não apaga registro do editor', assertFails(deleteDoc(doc(as('x@gmail.com'), 'movs/v6'))));
await t('estranho não exclui material (só admin)', assertFails(deleteDoc(doc(as('x@gmail.com'), 'materiais/m1'))));

console.log(`\n${ok} ok, ${falhas} falhas`);
await env.cleanup();
process.exit(falhas ? 1 : 0);
