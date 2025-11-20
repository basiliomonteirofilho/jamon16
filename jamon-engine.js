// jamon-engine.js
// Módulo simples para gerar playback aleatório de BAIXO + BATERIA
// baseado em grooves e progressões de estilo (versão reduzida).

(function (global) {
  'use strict';

  // 12 notas da escala cromática (apenas classes de altura, sem oitava).
  const PITCHES = ['A', 'AS', 'B', 'C', 'CS', 'D', 'DS', 'E', 'F', 'FS', 'G', 'GS'];

  // Graus da tonalidade (campo harmônico maior) -> deslocamento em semitons
  const DEGREE_TO_ROOT = {
    1: 0,  // I
    2: 2,  // II
    3: 4,  // III
    4: 5,  // IV
    5: 7,  // V
    6: 9,  // VI
    7: 11  // VII
  };

  // Intervalos da escala maior (1–8) em semitons
  const MAJOR_SCALE_OFFSETS = {
    1: 0,
    2: 2,
    3: 4,
    4: 5,
    5: 7,
    6: 9,
    7: 11,
    8: 12
  };

  // Progressões de graus por estilo (versão resumida do index.html)
  const STYLE_PROGRESSIONS = {
    Rock: [[1, 4, 5, 1], [1, 5, 6, 4], [6, 4, 1, 5]],
    Rock2: [[4, 5, 1, 5], [5, 4, 1, 4]],
    Blues: [[1, 4, 5, 4, 1, 4, 5, 4]],
    Forro: [[1, 5, 1, 5, 4, 5, 4, 5]],
    Samba: [[2, 5, 1, 1], [1, 4, 5, 1]],
    Metal: [[1, 3, 5, 6], [1, 3, 4, 5]],
    Jazz: [[1, 2, 5, 1], [2, 5, 1, 4]]
  };

  // Alguns grooves reduzidos só com baixo + batera.
  // drumPattern usa tokens do index: bu (bumbo), ca (caixa), ch (chimbal), bch (bumbo+chimbal), cch (caixa+chimbal),
  // co (condução), to1/to2 (toms), su (surdo), at (ataque), '-' (silêncio), 'bu' (ataque de bumbo extra).
  const ALL_GROOVES = [
    {
      name: "Rock",
      styleKey: "Rock",
      meter: "4/4",
      drumPattern: ["bch - ch - cch - ch - bch - ch - cch - ch -"],
      bassRhythm: ["bo - bo - bo - bo - bo - bo - bo -"],
      bassScale: [1, 3, 5, 8]
    },
    {
      name: "Rock2",
      styleKey: "Rock2",
      meter: "4/4",
      drumPattern: ["bch - ch - cch - ch - bch - ch - cch - ch -"],
      bassRhythm: ["bo - bo - bo - bo - bo - bo - bo -"],
      bassScale: [1, 1, 1, 5]
    },
    {
      name: "Blues",
      styleKey: "Blues",
      meter: "4/4",
      drumPattern: ["bch - ch ch cch - ch ch bch - ch ch cch - ch ch"],
      bassRhythm: ["bo - bo - bo - bo - bo - bo - bo - bo - bo -"],
      bassScale: [1, 3, 5, 6, 8, 6, 5, 3]
    },
    {
      name: "Forro",
      styleKey: "Forro",
      meter: "2/4",
      drumPattern: ["bch - co - ch - ca -"],
      bassRhythm: ["bo - - - x - - -"],
      bassScale: [8, 1]
    },
    {
      name: "Samba",
      styleKey: "Samba",
      meter: "2/4",
      drumPattern: ["bch - ch bu bch - ch bu"],
      bassRhythm: ["bo - x x bo - - x"],
      bassScale: [8, 5]
    },
    {
      name: "Metal",
      styleKey: "Metal",
      meter: "4/4",
      drumPattern: ["bch bu bch bu cch bu bch bu bch bu bch bu cch bu bch bu"],
      bassRhythm: ["bo bo bo bo bo bo bo bo bo bo bo bo bo bo bo bo"],
      bassScale: [1, 3, 5, 8]
    },
    {
      name: "Jazz",
      styleKey: "Jazz",
      meter: "4/4",
      drumPattern: ["bch co co - co co co ca bch co co - bch co co cch"],
      bassRhythm: ["bo - bo - bo - bo - bo - bo - bo - bo - bo - bo - bo - bo -"],
      bassScale: "chromatic"
    }
  ];

  // Mesma ordem de notas que Animacao4 usa (1E, 2F, 3FS, ...).
  // Duplicamos aqui para poder mapear nota musical -> código da amostra / png.
  const NOTAS_VALIDAS = [
    "1E","2F","3FS","4G","5GS","6A","7AS","8B",
    "9C","10CS","11D","12DS","13E","14F","15FS","16G",
    "17GS","18A","19AS","20B","21C","22CS","23D","24DS",
    "25E","26F","27FS","28G","29GS","30A","31AS","32B",
    "33C","34CS","35D","36DS","37E","38F","39FS","40G",
    "41GS","42A","43AS","44B","45C","46CS","47D","48DS","49E"
  ];

  // Monta um mapa: classe de nota ("E","FS",...) -> lista de códigos válidos ("1E","13E","25E",...)
  const pitchToCodes = {};
  for (const codigo of NOTAS_VALIDAS) {
    const match = codigo.match(/\d+(.*)/);
    if (!match) continue;
    const sufixo = match[1]; // "E", "FS", ...
    if (!pitchToCodes[sufixo]) pitchToCodes[sufixo] = [];
    pitchToCodes[sufixo].push(codigo);
  }

  // Escolhe um código "central" para determinada classe de nota
  function pickSampleForPitchClass(pitchClass) {
    const lista = pitchToCodes[pitchClass];
    if (!lista || !lista.length) {
      // fallback: se não achar, usa 13E (nota perto do centro)
      return "13E";
    }
    const idx = Math.floor(lista.length / 2);
    return lista[idx];
  }

  // Converte "4/4" -> 4, "7/4" -> 7, "3/4" -> 3 etc.
  function meterToBeats(meter) {
    if (!meter) return 4;
    const parts = meter.split("/");
    const num = parseInt(parts[0], 10);
    return isNaN(num) ? 4 : num;
  }

  // Expande um array de padrões tipo ["bo - bo -"] para um número total de passos
  function expandRhythm(patternArray, totalSteps) {
    if (!Array.isArray(patternArray) || !patternArray.length) {
      return Array(totalSteps).fill("-");
    }
    const tokens = patternArray.join(" ").trim().split(/\s+/);
    const out = [];
    let i = 0;
    while (out.length < totalSteps) {
      out.push(tokens[i % tokens.length]);
      i++;
    }
    return out;
  }

  // Decodifica um token de bateria ("bch", "co", "bu", "cch", "to1", etc.)
  // em hits para as linhas do Animacao4: bumbo, caixa, chimbal, condução, tom1, tom2, surdo, ataque.
  function decodeDrumToken(token) {
    const hits = {
      bumbo: false,
      caixa: false,
      chimbal: false,
      chimbalaberto: false,
      conducao: false,
      ataque: false,
      tom1: false,
      tom2: false,
      surdo: false
    };

    if (!token || token === "-" || token === "sm") {
      return hits;
    }

    // Normaliza
    token = String(token).toLowerCase();

    // Combinações
    if (token.includes("bch")) {
      hits.bumbo = true;
      hits.chimbal = true;
    }
    if (token.includes("cch")) {
      hits.caixa = true;
      hits.chimbal = true;
    }
    if (token.includes("bco")) {
      hits.bumbo = true;
      hits.conducao = true;
    }
    if (token.includes("cco")) {
      hits.caixa = true;
      hits.conducao = true;
    }

    // Elementos simples
    if (token === "bu" || token === "ba" || token === "b") {
      hits.bumbo = true;
    }
    if (token === "ca") {
      hits.caixa = true;
    }
    if (token === "ch") {
      hits.chimbal = true;
    }
    if (token === "co") {
      hits.conducao = true;
    }
    if (token === "to1") {
      hits.tom1 = true;
    }
    if (token === "to2") {
      hits.tom2 = true;
    }
    if (token === "su") {
      hits.surdo = true;
    }
    if (token === "at") {
      hits.ataque = true;
    }

    return hits;
  }

  // Gera uma sequência aleatória de baixo + bateria, com "tamanho" passos.
  // Retorna { bpm, grooveName, bassSeq: [...], bateriaSeq: { bumbo:[], caixa:[], ... } }
  function generateRandomPlayback(tamanho, bpmBase) {
    const totalSteps = typeof tamanho === "number" && tamanho > 0 ? tamanho : 16;

    // Escolhe groove aleatório
    const groove = ALL_GROOVES[Math.floor(Math.random() * ALL_GROOVES.length)];

    // Determina BPM: se não vier de fora, usa 100 como base.
    let bpm = typeof bpmBase === "number" && bpmBase > 0 ? bpmBase : 100;
    // Pequeno ajuste por estilo
    if (groove.styleKey === "Samba" || groove.styleKey === "Jazz") bpm = Math.max(70, bpm - 10);
    if (groove.styleKey === "Metal") bpm = Math.max(110, bpm + 20);

    const beats = meterToBeats(groove.meter);
    const stepsPerBar = beats * 4 || 16;

    // ESCOLHA DA TONALIDADE / GRAUS (versão simplificada)
    const styleKey = groove.styleKey || groove.name;
    const progList = STYLE_PROGRESSIONS[styleKey] || [[1, 4, 5, 1]];
    const chosenProg = progList[Math.floor(Math.random() * progList.length)];
    const degree = chosenProg[0] || 1; // só usamos o primeiro acorde para um loop curto

    const keyIdx = Math.floor(Math.random() * PITCHES.length);
    const rootIdx = (keyIdx + DEGREE_TO_ROOT[degree]) % 12;

    // Calcula as notas de baixo da escala escolhida
    let fullBassNotes = [];
    if (groove.bassScale === "chromatic") {
      // varre cromaticamente a partir da fundamental
      for (let i = 0; i < 8; i++) {
        const pitchClass = PITCHES[(rootIdx + i) % 12];
        fullBassNotes.push(pickSampleForPitchClass(pitchClass));
      }
    } else {
      const scaleDegrees = Array.isArray(groove.bassScale) && groove.bassScale.length
        ? groove.bassScale
        : [1, 3, 5, 8];
      for (const deg of scaleDegrees) {
        const off = MAJOR_SCALE_OFFSETS[deg] || 0;
        const pitchClass = PITCHES[(rootIdx + (off % 12)) % 12];
        fullBassNotes.push(pickSampleForPitchClass(pitchClass));
      }
    }

    const rhythm = expandRhythm(groove.bassRhythm, totalSteps);
    const bassSeq = [];
    let idxDentroDoDesenho = 0;

    for (let step = 0; step < totalSteps; step++) {
      const sym = rhythm[step];
      if (sym === "x") {
        bassSeq.push("x");           // ghost note (baixista faz o mute)
      } else if (sym === "-" || sym === "sm") {
        bassSeq.push("x");           // silêncio (sem nova nota; engine de áudio já faz o sustain)
      } else {
        const nota = fullBassNotes[idxDentroDoDesenho % fullBassNotes.length];
        bassSeq.push(nota);
        idxDentroDoDesenho++;
      }
    }

    // BATERIA
    const drumPatternExpanded = expandRhythm(groove.drumPattern, totalSteps);
    const bateriaSeq = {
      bumbo: new Array(totalSteps).fill("x"),
      caixa: new Array(totalSteps).fill("x"),
      chimbal: new Array(totalSteps).fill("x"),
      chimbalaberto: new Array(totalSteps).fill("x"),
      conducao: new Array(totalSteps).fill("x"),
      ataque: new Array(totalSteps).fill("x"),
      tom1: new Array(totalSteps).fill("x"),
      tom2: new Array(totalSteps).fill("x"),
      surdo: new Array(totalSteps).fill("x")
    };

    for (let step = 0; step < totalSteps; step++) {
      const tok = drumPatternExpanded[step];
      const hits = decodeDrumToken(tok);
      for (const id in hits) {
        if (!Object.prototype.hasOwnProperty.call(hits, id)) continue;
        if (hits[id]) {
          bateriaSeq[id][step] = id;
        }
      }
    }

    return {
      bpm,
      grooveName: groove.name,
      bassSeq,
      bateriaSeq
    };
  }

  global.JamOnEngine = {
    generateRandomPlayback
  };

})(typeof window !== "undefined" ? window : this);
