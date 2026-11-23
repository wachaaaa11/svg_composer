// Component selection. The matcher only ever returns ids of EXISTING library objects –
// it cannot create visuals. Works fully offline (curated RU/EN concept lexicon); an optional LLM
// can be used to interpret the text, and its answer is validated against the library ids.

// term = stem. A token matches a stem when token.startsWith(stem). Phrases (with a space) match by substring.
// w = weight: 3 core, 2 strong association, 1 weak association.
const L = {
  open_book: {
    core: 'книг|книж|чтен|читат|читать|прочит|book|read$|reading|library|библиотек|литератур|literature|textbook|учебник',
    strong: 'обуч|учеб|образован|знан|урок|курс|лекц|школ|универс|студент|мудрост|истори|рассказ|сказк|learn|educat|knowledge|study|course|lesson|school|universit|student|wisdom|histor|story|stories|tutorial|guide|manual|research|исследован|наук|scien|academ|гайд|инструкц',
    weak: 'документац|docs|documentation|teach|учит|препод|эрудиц|смысл|идеи|опыт|experience|информац|information|контент|content',
  },
  smartphone: {
    core: 'телефон|смартфон|мобильн|phone|smartphone|mobile|iphone|android|гаджет|gadget',
    strong: 'приложен|звонок|звон|сообщен|мессендж|соцсет|уведомл|онлайн|интернет|цифров|app$|application|call|messag|messenger|social|notification|online|internet|digital|sms$|чат|chat|ux$|интерфейс|interface|сеть|network|связь|связ|connect',
    weak: 'технолог|technolog|сервис|service|платформ|platform|доступ|access|удобн|convenien|быстр|fast|everywhere|везде|стартап|startup|app store|реклам|advert|маркетинг|marketing|смм|smm',
  },
  puzzle: {
    core: 'пазл|головоломк|puzzle|jigsaw',
    strong: 'решен|решат|задач|интеграц|соедин|сборк|команд|коллабор|сотрудничеств|партн|совмест|вместе|подход|стратег|логик|solution|solv|problem|integrat|connect|fit$|team|teamwork|collaborat|cooperat|partner|together|strateg|logic|piece|merge|synerg|compatib|сложн|complex|challeng|вызов|гармон|harmon|целое|whole|часть|part$|puzzl',
    weak: 'найти|find|вопрос|question|загадк|riddle|mystery|тайн|секрет|secret|менеджмент|management|процесс|process|систем|system|архитектур|architect|модул|modul|плагин|plugin|api|интеграци|совпад|match|подходит',
  },
  coin: {
    core: 'монет|coin|деньг|money|финанс|financ|cash|наличн',
    strong: 'оплат|платеж|платит|заработ|доход|бюджет|цен|стоимост|экономи|накоплен|инвестиц|кредит|банк|pay|payment|income|budget|price|cost|saving|invest|bank|credit|crypto|крипт|биткоин|bitcoin|profit|прибыл|выгод|benefit|tariff|тариф|взнос|fee$|налог|tax|capital|капитал|ставк',
    weak: 'безопасност|защит|пароль|security|secure|lock|protect|safety|privacy|конфиденц|богат|rich|wealth|успех|success|бизнес|business|стоимость|value|ценн|worth|рост|growth|курс валют|rate$',
  },
  headphones: {
    core: 'наушник|headphone|earphone|музык|music|подкаст|podcast|аудио|audio|слушат|слуша|listen',
    strong: 'звук|радио|плейлист|песн|вокал|sound|radio|playlist|song|voice|голос|hear|слух|слыш|поддержк|support|customer|клиент|call center|колл|контакт-центр|стрим|stream|аудиокниг|audiobook|шум|noise|тишин|silence|ритм|rhythm|beat|концерт|concert|dj$',
    weak: 'фокус|focus|концентрац|concentrat|релакс|relax|отдых|rest|обратн.{0,3}связ|feedback|вниман|attention|внимательн|слов|word|общен|communicat|диалог|dialog|разговор|conversation|интервью|interview',
  },
  desk_lamp: {
    core: 'ламп|lamp|свет|light|идея|идеи|идей|idea|озарен|инсайт|insight|brainstorm|мозговой',
    strong: 'творч|вдохнов|ясност|освещ|ярк|изобретен|инновац|инсайт|creativ|inspir|clarity|bright|illuminat|innovat|invention|genius|гени|smart|умн|ум$|понят|understand|осознан|aware|solution|эврик|eureka|подсказк|hint|подскаж|clue|вопрос.*ответ|answer|ответ|находк|открыти|discover',
    weak: 'работ|офис|office|desk|стол|workspace|рабоч|productiv|продуктивн|focus|фокус|ночь|night|вечер|evening|учёб|study|поздн|late|тёпл|warm|уют|cozy|внимани|настольн|энерг|energy|электр|electric',
  },
  tulips: {
    core: 'тюльпан|tulip|цвет|flower|ваз|vase|букет|bouquet|bloom|blossom|весн|spring',
    strong: 'подарок|gift|праздник|holiday|поздравл|congratulat|красот|beauty|beaut|забот|care$|нежн|tender|любов|love|романт|romantic|благодар|thank|appreciat|именин|birthday|юбилей|anniversar|celebrat|8 марта|март|march|женск|women|mother|мам|мать|свидан|date',
    weak: 'уют|cozy|дом|home|природ|nature|свеж|fresh|рост|growth|grow|развит|develop|wellness|здоров|health|эко|eco|органик|organic|радост|joy|happy|счасть|настроен|mood|подар|present|свадьб|wedding|сад|garden|растен|plant|аромат|scent|spa|спа|салон|salon|красив',
  },
  wallet: {
    core: 'кошел|wallet|purse|портмоне|кошелёк',
    strong: 'покупк|покупат|магазин|коммерц|продаж|скидк|акци|платеж|расход|трат|карт|подписк|тариф|payment|shopping|purchase|buy|store|shop|sale|discount|card|subscription|expense|spend|ecommerce|e-commerce|retail|price|cena|сэкономить|save',
    weak: 'деньг|money|финанс|financ|бюджет|budget|налич|cash|банк|bank|кредит|credit|заказ|order|доставк|deliver|корзин|cart|checkout|оплат|pay|цен|стоимост|cost|кэшбэк|cashback|бонус|bonus|лояльност|loyalt|выгод|benefit',
  },
  folder: {
    core: 'папк|folder|документ|document|файл|file|архив|archive|отчёт|отчет|report',
    strong: 'данные|data|проект|project|организ|порядок|structure|структур|бумаг|paper|договор|контракт|contract|заявк|application form|резюме|resume|cv$|портфолио|portfolio|управлен|management|хранен|storage|бэкап|backup|облак|cloud|админ|admin|бюрократ|bureaucra|комплаенс|compliance|юрид|legal|полит|policy|регламент|regulation|отчётност|reporting|аналитик|analytic|статистик|statistic|таблиц|table|база|database',
    weak: 'работ|work|офис|office|бизнес|business|задач|task|документооборот|workflow|процесс|process|план|plan$|стратег|strategy|организован|organized|order|собрать|collect|собран|collection|подборк|selection|набор|set|каталог|catalog|портал|portal',
  },
  pen: {
    core: 'ручк|pen$|писат|писать|write|writing|письм|подпис|signature',
    strong: 'заметк|note|план|plan$|plans$|planning|автор|author|редакт|edit|текст|text|статья|article|блог|blog|копирайт|copywrit|рисов|draw|дизайн|design|запис|record|анкет|form$|forms$|заполн|fill|тест|test|экзамен|exam|договор|contract|document|документ|ответ|answer|эссе|essay|письмо|letter|канцеляр|stationery|чернил|ink|почерк|handwrit|подпишите|sign up|регистрац|registration',
    weak: 'творч|creative|идея|idea|стратег|strategy|подписк|subscri|обучен|learn|учёб|study|школ|school|работ|work|офис|office|задач|task|список|list|чек-лист|checklist|todo|to-do|цели|goal|планиров|planning|эскиз|sketch|набросок|draft|черновик',
  },
};

// Names accepted in Workflow B (component-name input), incl. the manifest's working names.
const NAMES = {
  open_book: 'открытая книга|раскрытая книга|книга|книжка|book|open book|open_book|notebook?no',
  smartphone: 'смартфон с пазлом|смартфон|телефон|мобильный|phone|smartphone|mobile|smartphone_puzzle|iphone',
  puzzle: 'детали пазла|пазлы|пазл|puzzle pieces|puzzle|puzzle_pieces|pieces',
  coin: 'круглый значок|монета|монетка|значок|coin|coin_badge|badge|token|жетон',
  headphones: 'наушники|наушник|headphones|headphone|earphones',
  desk_lamp: 'настольная лампа|лампа|светильник|lamp|desk lamp|desk_lamp|light',
  tulips: 'ваза с тюльпанами|тюльпаны|тюльпан|цветы|букет|ваза|tulips|tulip|flowers|vase|tulips_vase|flower',
  wallet: 'кошелёк|кошелек|портмоне|wallet|purse|блокнот|notebook',
  folder: 'папка|папки|folder|documents folder|файл|file',
  pen: 'ручка|ручки|pen$|ballpoint|pencil',
};

const toks = s => s.toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(Boolean);
const norm = s => s.toLowerCase().replace(/ё/g, 'е');
const LEX = {};
const stemOf = t => t.endsWith('$') ? t.slice(0, -1) : t;
for (const [obj, d] of Object.entries(L)) {
  LEX[obj] = [];
  for (const [k, w] of [['core', 3], ['strong', 2], ['weak', 1]])
    for (const term of d[k].split('|')) if (term.trim()) LEX[obj].push({ term: norm(term.trim()), exact: term.trim().endsWith('$'), w, re: /[.*+?{}\[\]\\()]/.test(term) ? new RegExp(norm(term.trim())) : null });
}

const COMPLEMENT = { // sensible companions when the text only hits one concept
  open_book: ['desk_lamp', 'pen', 'headphones'], smartphone: ['headphones', 'puzzle', 'desk_lamp'], puzzle: ['smartphone', 'desk_lamp', 'folder'],
  coin: ['wallet', 'smartphone', 'folder'], headphones: ['smartphone', 'open_book', 'desk_lamp'], desk_lamp: ['open_book', 'pen', 'tulips'],
  tulips: ['open_book', 'desk_lamp', 'wallet'], wallet: ['coin', 'smartphone', 'folder'], folder: ['pen', 'open_book', 'desk_lamp'], pen: ['folder', 'open_book', 'desk_lamp'],
};
const DEFAULT_SET = ['open_book', 'desk_lamp', 'pen'];

/** Offline interpreter: text -> ranked library objects with explanations. */
export function interpretOffline(text, opts = {}) {
  const max = opts.max || 4;
  const t = norm(text), tk = toks(t);
  const scores = {}, why = {};
  for (const [obj, terms] of Object.entries(LEX)) {
    let s = 0; const hit = new Set();
    for (let { term, exact, w, re } of terms) {
      if (exact) term = stemOf(term);
      let m = null;
      if (re) { const r = t.match(re); if (r) m = r[0]; }
      else if (term.includes(' ')) { if (t.includes(term)) m = term; }
      else {
        const k = tk.find(x => exact || term.length < 3 ? x === term : x.startsWith(term));
        if (k) m = k;
      }
      if (m && !hit.has(m + '|' + obj)) { hit.add(m + '|' + obj); s += w; (why[obj] ||= []).push(m); }
    }
    if (s) scores[obj] = s;
  }
  let ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  let note = '';
  let chosen = [];
  if (ranked.length) {
    const top = ranked[0][1];
    chosen = ranked.filter(([, s]) => s >= Math.max(Math.min(1.5, top), top * 0.3)).slice(0, max).map(([o]) => o);
    // single strong concept: add a thematically fitting companion so the composition has some depth
    if (chosen.length < 2) {
      const c = COMPLEMENT[chosen[0]].find(o => !chosen.includes(o));
      chosen.push(c); (why[c] ||= []).push('(companion)');
      note = 'Only one concept matched – added a complementary object.';
    }
  } else {
    chosen = DEFAULT_SET.slice(0, Math.max(2, Math.min(max, 3)));
    chosen.forEach(o => (why[o] ||= []).push('(default set)'));
    note = 'No direct concept matched in the local lexicon – showing a neutral default set. Try other words, or enable AI interpretation.';
  }
  return { objects: chosen, scores, why, note, ranked: ranked.map(([o, s]) => ({ object: o, score: s })) };
}

/** Workflow B: resolve typed component names (RU/EN, manifest names, typos) to library objects. */
export function parseNames(text, objectIds) {
  const parts = text.split(/[,;\n+]|\s+(?:and|и|&)\s+/i).map(s => s.trim()).filter(Boolean);
  const dict = []; // [alias, obj]
  for (const o of objectIds) for (const a of (NAMES[o] || '').split('|')) if (a.trim() && !a.includes('?no')) dict.push([norm(a.trim()), o]);
  dict.sort((a, b) => b[0].length - a[0].length);
  const found = [], bg = [], missing = [];
  for (let p of parts) {
    let isBg = false;
    const m = p.match(/^(?:bg|background|фон(?:овый)?|фоном)\s*[:=-]?\s*(.+)$/i);
    if (m) { isBg = true; p = m[1]; }
    let n = norm(p).replace(/^\d+\s*[x×*]\s*/, '').replace(/\s*[x×*]\s*\d+$/, '').trim();
    let count = 1; const cm = norm(p).match(/(?:^(\d+)\s*[x×*]\s*)|(?:\s*[x×*]\s*(\d+)$)/); if (cm) count = Math.min(6, +(cm[1] || cm[2]));
    let hit = dict.find(([a]) => a === n)?.[1]
      || dict.find(([a]) => n.startsWith(a) && a.length >= 4)?.[1]
      || dict.find(([a]) => a.startsWith(n) && n.length >= 3)?.[1];
    if (!hit) { // typo tolerance
      let best = null;
      for (const [a, o] of dict) { const d = lev(a, n); if (d <= Math.max(1, Math.floor(Math.min(a.length, n.length) / 3.5)) && (!best || d < best.d)) best = { d, o }; }
      hit = best?.o;
    }
    if (!hit) { // try the interpreter on the single phrase (e.g. "something to listen to")
      missing.push(p); continue;
    }
    for (let i = 0; i < count; i++) (isBg ? bg : found).push(hit);
  }
  return { objects: found, background: bg, missing };
}

function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Optional LLM interpretation. The model only gets the list of existing object ids and must answer with ids;
 *  anything not in the library is discarded. It never produces any visual content. */
export async function interpretWithLLM(text, objects, cfg) {
  const list = objects.map(o => `${o.id} (${o.name_en} / ${o.name_ru})`).join('; ');
  const prompt = `You pick illustration objects for a metaphor/headline. You may ONLY use these existing library objects: ${list}.\n` +
    `Headline or metaphor: "${text}"\nReturn strict JSON: {"objects":[ids, 2-4 items, most relevant first],"background":id|null,"reason":"one sentence"}. ` +
    `"background" is an optional large monochrome object to put behind (null if not appropriate). Use only the ids given.`;
  const r = await fetch(cfg.endpoint || 'https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: cfg.model || 'claude-sonnet-4-5', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error('LLM request failed: HTTP ' + r.status);
  const j = await r.json();
  const txt = (j.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('LLM returned no JSON');
  const out = JSON.parse(m[0]);
  const ids = new Set(objects.map(o => o.id));
  const objs = (out.objects || []).filter(o => ids.has(o)).slice(0, 5);
  if (!objs.length) throw new Error('LLM returned no valid library ids');
  return { objects: objs, background: ids.has(out.background) ? out.background : null, reason: out.reason || '' };
}
