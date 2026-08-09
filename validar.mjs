/**
 * Validador e montador do acervo de conteúdo.
 *
 * Junta os arquivos parciais em `frases.json`, remove repetição entre
 * categorias, confere as regras do acervo e atualiza o `manifest.json` com o
 * hash de cada arquivo.
 *
 * Rodar depois de qualquer edição de conteúdo:
 *
 *   node validar.mjs
 *
 * Sai com código 1 e lista o que está errado se alguma regra falhar, para
 * poder ser usado em verificação automática do repositório.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = dirname(fileURLToPath(import.meta.url));

/** Ordem das categorias. Em caso de frase repetida, a primeira categoria mantém. */
const ORDEM_CATEGORIAS = [
  'SAUDACAO',
  'ABERTURA_CASUAL',
  'RESPOSTA_CURTA',
  'CONTINUIDADE',
  'PERGUNTA_CASUAL',
  'REACAO',
  'AFIRMACAO',
  'ENCERRAMENTO',
];

const MINIMO_POR_CATEGORIA = 40;
const MAXIMO_POR_CATEGORIA = 60;
const MAXIMO_CARACTERES = 180;

const PARCIAIS = ['_parte-a.json', '_parte-b.json', '_parte-c.json'];

/**
 * Padrões que não podem aparecer em frase de aquecimento.
 *
 * A fronteira de palavra evita o falso positivo clássico: "vaga" dentro de
 * "devagar", "oferta" dentro de "ofertado".
 */
const PROIBIDOS = [
  { nome: 'endereço web', re: /https?:\/\/|www\.|\.com\b|\.br\b/i },
  { nome: 'sintaxe de variável', re: /\{\{|\}\}|\{[a-z_]+\}|\[[a-z_]+\]|%[a-z_]+%/i },
  { nome: 'valor em dinheiro', re: /r\$|\breais\b|\bpix\b/i },
  { nome: 'termo comercial', re: /\bpromoç(ão|ões)\b|\bdesconto\b|\bofertas?\b|\bcupom\b/i },
  { nome: 'convite ou captação', re: /\bvagas?\b|\binscriç(ão|ões)\b|\bcadastr(e|o)\b|\bclique\b/i },
  { nome: 'sequência de telefone', re: /\d{4,}/ },
];

const erros = [];
const avisos = [];

// ─── leitura das partes ─────────────────────────────────────────────────────

/** @type {Record<string, string[]>} */
const bruto = {};

for (const nome of PARCIAIS) {
  const caminho = join(RAIZ, nome);
  if (!existsSync(caminho)) continue;
  const conteudo = JSON.parse(readFileSync(caminho, 'utf8'));
  for (const [categoria, frases] of Object.entries(conteudo)) {
    if (bruto[categoria]) {
      erros.push(`categoria ${categoria} aparece em mais de um arquivo parcial`);
      continue;
    }
    bruto[categoria] = frases;
  }
}

// Se já existe frases.json e não há parcial, valida o que está publicado.
if (Object.keys(bruto).length === 0) {
  const publicado = join(RAIZ, 'frases.json');
  if (!existsSync(publicado)) {
    console.error('nada para validar: sem arquivos parciais e sem frases.json');
    process.exit(1);
  }
  Object.assign(bruto, JSON.parse(readFileSync(publicado, 'utf8')).frases);
}

// ─── normalização para comparar ─────────────────────────────────────────────

/**
 * Reduz a frase ao seu miolo comparável: sem acento, sem pontuação, sem
 * emoji, minúscula, espaço colapsado. Duas frases que só diferem por emoji
 * são a mesma frase para efeito de repetição.
 */
function normalizar(frase) {
  return frase
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '')
    .replace(/[^\p{Letter}\p{Number}\s]/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── montagem com remoção de repetição ──────────────────────────────────────

/** @type {Map<string, string>} normalizada -> categoria que ficou com ela */
const vistas = new Map();
/** @type {Record<string, string[]>} */
const frases = {};
const removidas = [];

for (const categoria of ORDEM_CATEGORIAS) {
  const lista = bruto[categoria];
  if (!lista) {
    erros.push(`categoria ${categoria} do manifest não tem frases`);
    continue;
  }

  const mantidas = [];
  for (const frase of lista) {
    const chave = normalizar(frase);

    if (chave.length === 0) {
      erros.push(`${categoria}: frase vazia depois de normalizar: ${JSON.stringify(frase)}`);
      continue;
    }
    if (frase.length > MAXIMO_CARACTERES) {
      erros.push(`${categoria}: frase com ${frase.length} caracteres, acima de ${MAXIMO_CARACTERES}`);
      continue;
    }
    for (const { nome, re } of PROIBIDOS) {
      if (re.test(frase)) {
        erros.push(`${categoria}: ${nome} em ${JSON.stringify(frase)}`);
      }
    }

    const donaAnterior = vistas.get(chave);
    if (donaAnterior !== undefined) {
      removidas.push(`${categoria} ⟵ já estava em ${donaAnterior}: ${JSON.stringify(frase)}`);
      continue;
    }

    vistas.set(chave, categoria);
    mantidas.push(frase);
  }

  frases[categoria] = mantidas;
}

// ─── conferência de volume ──────────────────────────────────────────────────

for (const [categoria, lista] of Object.entries(frases)) {
  if (lista.length < MINIMO_POR_CATEGORIA) {
    erros.push(
      `${categoria}: ${lista.length} frases, abaixo do mínimo de ${MINIMO_POR_CATEGORIA}`,
    );
  } else if (lista.length > MAXIMO_POR_CATEGORIA) {
    avisos.push(
      `${categoria}: ${lista.length} frases, acima do alvo de ${MAXIMO_POR_CATEGORIA}`,
    );
  }
}

// ─── conferência cruzada com os roteiros ────────────────────────────────────

const scripts = JSON.parse(readFileSync(join(RAIZ, 'scripts.json'), 'utf8'));
const idsVistos = new Set();

for (const script of scripts.scripts) {
  if (idsVistos.has(script.id)) {
    erros.push(`roteiro com id repetido: ${script.id}`);
  }
  idsVistos.add(script.id);

  if (script.turnos.length < 2 || script.turnos.length > 6) {
    erros.push(`roteiro ${script.id}: ${script.turnos.length} turnos, fora da faixa de 2 a 6`);
  }

  script.turnos.forEach((turno, indice) => {
    if (turno.ordem !== indice + 1) {
      erros.push(`roteiro ${script.id}: turno na posição ${indice + 1} tem ordem ${turno.ordem}`);
    }
    if (turno.papel !== 'ABRE' && turno.papel !== 'RESPONDE') {
      erros.push(`roteiro ${script.id}: papel inválido ${turno.papel}`);
    }
    if (!frases[turno.categoria] || frases[turno.categoria].length === 0) {
      erros.push(
        `roteiro ${script.id}: turno ${turno.ordem} usa categoria ${turno.categoria}, que não tem frases`,
      );
    }
  });

  if (script.turnos[0]?.papel !== 'ABRE') {
    erros.push(`roteiro ${script.id}: o primeiro turno tem de ser de quem abre`);
  }
}

// O motor sorteia de 2 a 6 turnos; precisa existir roteiro de cada tamanho.
for (let tamanho = 2; tamanho <= 6; tamanho += 1) {
  const temTamanho = scripts.scripts.some((s) => s.turnos.length === tamanho);
  if (!temTamanho) {
    erros.push(`nenhum roteiro com ${tamanho} turnos; o motor não teria o que sortear`);
  }
}

// ─── conferência do manifest ────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(RAIZ, 'manifest.json'), 'utf8'));
const categoriasManifest = manifest.categorias.map((c) => c.id);

for (const categoria of ORDEM_CATEGORIAS) {
  if (!categoriasManifest.includes(categoria)) {
    erros.push(`categoria ${categoria} não está declarada no manifest`);
  }
}
for (const categoria of categoriasManifest) {
  if (!ORDEM_CATEGORIAS.includes(categoria)) {
    erros.push(`manifest declara categoria ${categoria}, que não existe no acervo`);
  }
}

// ─── conferência da mídia ───────────────────────────────────────────────────
//
// A mídia é opcional, mas o que existe tem de estar íntegro. As regras repetem as do
// cliente de propósito: aqui elas ajudam quem publica, lá elas protegem quem executa.
// Se o repositório for trocado depois de publicado, só a do cliente roda.

const EXTENSOES = {
  IMAGEM: ['.jpg', '.jpeg', '.png', '.webp'],
  AUDIO: ['.ogg', '.mp3', '.m4a'],
};

const TETO_BYTES = { IMAGEM: 200 * 1024, AUDIO: 300 * 1024 };
const PASTA = { IMAGEM: 'images', AUDIO: 'audio' };

// Uma pasta conhecida na frente, sem "..", sem barra inicial, sem caractere estranho.
// O caminho vira URL, e é por aí que um acervo adulterado apontaria para outro lugar.
const CAMINHO_MIDIA = /^(images|audio)\/[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;

const caminhoMidia = join(RAIZ, 'midia.json');
let midia = { versao: manifest.versao, midia: [] };

if (existsSync(caminhoMidia)) {
  midia = JSON.parse(readFileSync(caminhoMidia, 'utf8'));

  if (!Array.isArray(midia.midia)) {
    erros.push('midia.json: o campo "midia" tem de ser uma lista');
    midia.midia = [];
  }

  const arquivosVistos = new Set();

  for (const item of midia.midia) {
    const nome = String(item?.arquivo ?? '(sem arquivo)');

    if (item?.tipo !== 'IMAGEM' && item?.tipo !== 'AUDIO') {
      erros.push(`${nome}: tipo tem de ser IMAGEM ou AUDIO`);
      continue;
    }

    if (!CAMINHO_MIDIA.test(nome) || nome.includes('..')) {
      erros.push(`${nome}: caminho inválido — use ${PASTA[item.tipo]}/arquivo, sem ".." e sem URL`);
      continue;
    }

    if (!nome.startsWith(`${PASTA[item.tipo]}/`)) {
      erros.push(`${nome}: arquivo de ${item.tipo} tem de estar na pasta ${PASTA[item.tipo]}/`);
      continue;
    }

    const extensao = nome.slice(nome.lastIndexOf('.')).toLowerCase();
    if (!EXTENSOES[item.tipo].includes(extensao)) {
      erros.push(
        `${nome}: extensão ${extensao} não serve para ${item.tipo} (aceitas: ${EXTENSOES[item.tipo].join(', ')})`,
      );
      continue;
    }

    if (arquivosVistos.has(nome)) {
      erros.push(`${nome}: declarado mais de uma vez`);
      continue;
    }
    arquivosVistos.add(nome);

    // O arquivo declarado tem de existir. Sem esta conferência, o cliente baixaria
    // 404 e o turno sairia sem a mídia — falha silenciosa, a pior.
    const caminhoArquivo = join(RAIZ, nome);
    if (!existsSync(caminhoArquivo)) {
      erros.push(`${nome}: declarado em midia.json mas o arquivo não está no repositório`);
      continue;
    }

    const bytes = readFileSync(caminhoArquivo).length;
    if (bytes > TETO_BYTES[item.tipo]) {
      erros.push(
        `${nome}: ${Math.round(bytes / 1024)} KB, acima do teto de ${TETO_BYTES[item.tipo] / 1024} KB`,
      );
    }

    for (const categoria of item.categorias ?? []) {
      if (!frases[categoria] || frases[categoria].length === 0) {
        erros.push(`${nome}: aponta para a categoria ${categoria}, que não tem frases`);
      }
    }

    // A legenda sai do chip junto da mídia, então passa pelas mesmas proibições.
    if (typeof item.legenda === 'string') {
      if (item.legenda.length > MAXIMO_CARACTERES) {
        erros.push(`${nome}: legenda com ${item.legenda.length} caracteres`);
      }
      for (const { nome: motivo, re } of PROIBIDOS) {
        if (re.test(item.legenda)) erros.push(`${nome}: ${motivo} na legenda`);
      }
    }
  }
}

// Arquivo na pasta e não declarado é peso morto: o cliente nunca o usa, mas ele viaja
// em toda cópia do repositório.
for (const pasta of ['images', 'audio']) {
  const dir = join(RAIZ, pasta);
  if (!existsSync(dir)) continue;

  for (const nome of readdirSync(dir)) {
    if (nome.startsWith('.')) continue;
    const relativo = `${pasta}/${nome}`;
    if (!midia.midia.some((item) => item.arquivo === relativo)) {
      avisos.push(`${relativo}: está na pasta mas não está declarado em midia.json`);
    }
  }
}

// ─── saída ──────────────────────────────────────────────────────────────────

if (erros.length > 0) {
  console.error(`\n${erros.length} problema(s):\n`);
  for (const erro of erros) console.error(`  ✗ ${erro}`);
  console.error('');
  process.exit(1);
}

const saida = {
  versao: manifest.versao,
  frases,
};

writeFileSync(join(RAIZ, 'frases.json'), `${JSON.stringify(saida, null, 2)}\n`, 'utf8');

function hashDe(nome) {
  return createHash('sha256').update(readFileSync(join(RAIZ, nome))).digest('hex');
}

manifest.arquivos.frases.sha256 = hashDe('frases.json');
manifest.arquivos.scripts.sha256 = hashDe('scripts.json');

// A versão da mídia acompanha a do acervo: acervo publicado é um conjunto, e versões
// separadas fariam o cliente ter de decidir qual delas manda no cache.
if (existsSync(caminhoMidia)) {
  midia.versao = manifest.versao;
  writeFileSync(caminhoMidia, `${JSON.stringify(midia, null, 2)}\n`, 'utf8');
  manifest.arquivos.midia = { caminho: 'midia.json', sha256: hashDe('midia.json') };
}

writeFileSync(join(RAIZ, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

// Parciais existem só para montar; publicado é o frases.json.
for (const nome of PARCIAIS) {
  const caminho = join(RAIZ, nome);
  if (existsSync(caminho)) unlinkSync(caminho);
}

const total = Object.values(frases).reduce((soma, lista) => soma + lista.length, 0);

console.log('\nacervo válido\n');
for (const categoria of ORDEM_CATEGORIAS) {
  console.log(`  ${categoria.padEnd(18)} ${String(frases[categoria].length).padStart(3)} frases`);
}
console.log(`  ${'TOTAL'.padEnd(18)} ${String(total).padStart(3)} frases`);
console.log(`  ${'roteiros'.padEnd(18)} ${String(scripts.scripts.length).padStart(3)}`);
console.log(`  ${'mídia'.padEnd(18)} ${String(midia.midia.length).padStart(3)}`);

if (removidas.length > 0) {
  console.log(`\n${removidas.length} frase(s) repetida(s) removida(s):`);
  for (const item of removidas) console.log(`  - ${item}`);
}
if (avisos.length > 0) {
  console.log('');
  for (const aviso of avisos) console.log(`  ! ${aviso}`);
}
console.log('');
