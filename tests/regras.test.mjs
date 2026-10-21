// Uso (na raiz do repositório): npm run test:regras
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
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
