# Acervo de conteúdo do ZAPKIRO

Frases e roteiros de conversa que o aquecimento usa. Este repositório é lido pelo
aplicativo em tempo de execução e guardado em cache local, então pode ser atualizado
sem precisar publicar versão nova do programa.

Nada aqui é mensagem de campanha. É conversa de aquecimento entre números, para
construir histórico de uso legítimo.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `manifest.json` | Versão do acervo, validade do cache, catálogo de categorias e regras |
| `frases.json` | Frases agrupadas por categoria |
| `scripts.json` | Roteiros de diálogo para o pareamento 1:1 |
| `midia.json` | Lista de imagens e áudios do acervo. Opcional |
| `validar.mjs` | Confere as regras e regrava `frases.json` e os hashes do manifest |
| `images/` | Imagens leves, opcional |
| `audio/` | Áudios curtos de 2 a 4 segundos, opcional |

## Endereço que o aplicativo usa

O programa lê o **conteúdo cru**, não a página do GitHub:

```
https://raw.githubusercontent.com/iwagneremanoel-boop/zapkirocontent/main/
```

Confira colando no navegador com `manifest.json` no fim. Tem de aparecer JSON puro; se
aparecer a página do GitHub com botões, o endereço está errado e o aplicativo vai
recusar o acervo.

O endereço é configurado em **Configurações → Acervo de aquecimento**, dentro do
aplicativo, e vale sem reinstalar nada.

## Como o aplicativo usa

**Grupo.** Sorteia uma categoria marcada com `GRUPO` no manifest, respeitando a regra de
não repetir o mesmo tipo em sequência pelo mesmo chip, e sorteia uma frase dentro dela.

**Par 1:1.** O servidor atribui um `script_id` aos dois lados do pareamento. Cada lado
percorre os turnos do roteiro; em cada turno, olha a `categoria` e o `papel` e sorteia
uma frase da categoria correspondente. Os dois lados usam o mesmo esqueleto, então a
conversa faz sentido mesmo com frases diferentes.

Exemplo do roteiro `retomada-simples`:

```
turno 1  ABRE      ABERTURA_CASUAL   "oi, tudo certo por aí?"
turno 2  RESPONDE  RESPOSTA_CURTA    "tudo tranquilo, e você?"
turno 3  ABRE      CONTINUIDADE      "também, correria mas indo"
turno 4  RESPONDE  ENCERRAMENTO      "qualquer coisa me chama"
```

## Regras do conteúdo

O validador recusa o acervo se qualquer uma for violada:

- de 40 a 60 frases por categoria, para não repetir dentro de semanas
- nenhuma frase repetida, nem entre categorias diferentes. Comparação ignora acento,
  pontuação, emoji e caixa: `"Dormiu bem?"` e `"dormiu bem"` são a mesma frase
- no máximo 180 caracteres por frase
- sem endereço web, sem valor em dinheiro, sem termo comercial, sem convite
- sem sintaxe de variável (`{{nome}}`, `{nome}`, `[nome]`). O aquecimento não tem alvo,
  não há o que substituir
- sem sequência de 4 ou mais dígitos, que denunciaria telefone
- todo roteiro tem de 2 a 6 turnos, começa por quem abre, e cada turno aponta para uma
  categoria que existe
- tem de existir pelo menos um roteiro de cada tamanho, de 2 a 6 turnos, senão o motor
  sorteia um tamanho e não acha roteiro

Regras que o validador não verifica, mas que valem:

- variedade de comprimento. Frase toda do mesmo tamanho cria padrão reconhecível
- variedade de registro, do bem informal ao neutro
- sem assunto sensível: política, religião, saúde, futebol de time
- sem nome próprio de pessoa

## Depois de editar

```
node validar.mjs
```

Sai com código 1 e lista os problemas se algo estiver errado. Quando passa, regrava
`frases.json` e atualiza `sha256` de cada arquivo no `manifest.json`.

Ao publicar mudança de conteúdo, **suba `versao` no `manifest.json`**. É o que faz o
cache dos aplicativos instalados renovar antes do prazo de `validadeCacheHoras`.

## Como adicionar frases

Crie um arquivo `_parte-x.json` na raiz com as categorias que quer acrescentar:

```json
{
  "REACAO": ["frase nova", "outra frase"]
}
```

Rode `node validar.mjs`. Ele junta com o que já existe, remove repetição e apaga o
arquivo parcial. Se preferir, edite `frases.json` direto e rode o validador do mesmo
jeito para conferir.

## Mídia

Opcional. O aquecimento funciona com texto puro, e um acervo sem mídia é o estado
normal — o aplicativo não reclama da ausência.

### Como adicionar

1. Suba o arquivo em `images/` ou `audio/`
2. Declare em `midia.json`
3. Rode `node validar.mjs`
4. Suba `versao` no `manifest.json` para os aplicativos renovarem o cache

```json
{
  "versao": 2,
  "midia": [
    { "arquivo": "images/cafe-01.jpg", "tipo": "IMAGEM", "categorias": [] },
    { "arquivo": "images/bomdia-01.jpg", "tipo": "IMAGEM", "categorias": ["SAUDACAO"] },
    { "arquivo": "audio/uhum-01.ogg", "tipo": "AUDIO", "categorias": ["RESPOSTA_CURTA"] }
  ]
}
```

`categorias` vazio significa "serve em qualquer turno". Preencha quando a mídia só fizer
sentido num contexto: foto de bom-dia em turno de encerramento é mais estranho que não
mandar nada.

`legenda` é opcional e passa pelas mesmas proibições das frases — ela sai do chip junto
da mídia, então é texto enviado do mesmo jeito.

### Regras que o validador impõe

- **imagem**: `.jpg`, `.jpeg`, `.png` ou `.webp`, até 200 KB
- **áudio**: `.ogg`, `.mp3` ou `.m4a`, até 300 KB
- o arquivo tem de estar na pasta do próprio tipo, sem subpasta
- nome só com letra, número, ponto, hífen e sublinhado
- sem `..`, sem barra inicial, sem URL — o caminho vira endereço de download, e um
  caminho solto apontaria para fora do repositório
- arquivo declarado tem de existir; arquivo na pasta e não declarado gera aviso
- **`.svg` é recusado.** SVG é documento com script, não imagem: o aquecimento passaria
  a distribuir código

### O que colocar

- imagem neutra e sem texto: paisagem, café, pet, céu. Nada de logo, preço, print de
  conversa ou rosto de pessoa real
- áudio sem voz identificável: um "uhum", um risinho, um "tá bom". Voz de pessoa real
  repetida entre milhares de contas é padrão reconhecível, que é exatamente o que o
  aquecimento existe para evitar
