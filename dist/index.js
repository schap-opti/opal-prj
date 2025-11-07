"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const opal_tools_sdk_1 = require("@optimizely-opal/opal-tools-sdk");
// Create Express app
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Create Tools Service
const toolsService = new opal_tools_sdk_1.ToolsService(app);
/**
 * Greeting Tool: Greets a person in a random language
 */
// Apply tool decorator after function definition
async function sgc_greeting(parameters) {
    const { name, language } = parameters;
    // If language not specified, choose randomly
    const selectedLanguage = language ||
        ['english', 'spanish', 'french'][Math.floor(Math.random() * 3)];
    // Generate greeting based on language
    let greeting;
    if (selectedLanguage.toLowerCase() === 'spanish') {
        greeting = `¡Hola, ${name}! ¿Cómo estás?`;
    }
    else if (selectedLanguage.toLowerCase() === 'french') {
        greeting = `Bonjour, ${name}! Comment ça va?`;
    }
    else { // Default to English
        greeting = `Hello, ${name}! How are you?`;
    }
    return {
        greeting,
        language: selectedLanguage
    };
}
/**
 * Today's Date Tool: Returns today's date in the specified format
 */
// Apply tool decorator after function definition
async function sgc_todays_Date(parameters) {
    const format = parameters.format || '%Y-%m-%d';
    // Get today's date
    const today = new Date();
    // Format the date (simplified implementation)
    let formattedDate;
    if (format === '%Y-%m-%d') {
        formattedDate = today.toISOString().split('T')[0];
    }
    else if (format === '%B %d, %Y') {
        formattedDate = today.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
    else if (format === '%d/%m/%Y') {
        formattedDate = today.toLocaleDateString('en-GB');
    }
    else {
        // Default to ISO format
        formattedDate = today.toISOString().split('T')[0];
    }
    return {
        date: formattedDate,
        format: format,
        timestamp: today.getTime() / 1000
    };
}

// A single self-contained sentiment analysis function for Opal tools.
async function analyse_sentiment(parameters) {
  const { text } = parameters;

  // Inline lexicon and helper sets
  const LEXICON = {
    love: 3, loved: 3, lovely: 3, likes: 2, like: 2, awesome: 4, great: 3, good: 2,
    amazing: 4, excellent: 4, fantastic: 4, happy: 3, joy: 3, win: 2, wins: 2, wow: 2,
    glad: 2, brilliant: 4, solid: 1, helpful: 2, friendly: 2,

    bad: -2, terrible: -4, awful: -4, horrible: -4, hate: -3, hated: -3, worst: -4,
    poor: -2, buggy: -2, angry: -2, sad: -2, broken: -3, issue: -1, issues: -1,
    disappoint: -2, disappointed: -3, disappointing: -3, slow: -1, laggy: -2, crash: -3,

    very: 0, really: 0, super: 0, extremely: 0, slightly: 0, somewhat: 0
  };

  const BOOSTERS = {
    very: 1.5,
    really: 1.3,
    super: 1.6,
    extremely: 1.8,
    slightly: 0.7,
    somewhat: 0.8
  };

  const NEGATIONS = new Set([
    'not', 'no', 'never', 'none', 'hardly', 'scarcely', 'barely',
    "isn't", "wasn't", "weren't",
    "don't", "doesn't", "didn't",
    "won't", "can't", "couldn't", "shouldn't"
  ]);

  const EMOJI_HINTS = {
    '🙂': 2, '😊': 3, '😁': 3, '😍': 4, '🥰': 3, '👍': 2, '🎉': 3, '🔥': 2,
    '🙁': -2, '😞': -2, '😡': -3, '🤮': -4, '👎': -2, '💀': -3
  };

  // Helpers inside the function
  const tokenize = (input) =>
    (input || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s🙂😊😁😍🥰👍🎉🔥🙁😞😡🤮👎💀']/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const stem = (word) =>
    word.replace(/(ing|ed|ly|ies|s)$/u, (m) => (m === "ies" ? "y" : ""));

  // Begin sentiment scoring
  const tokens = tokenize(text);
  let runningScore = 0;
  let polarized = 0;
  let negationWindow = 0;
  let negationCount = 0;

  const tokenDetails = [];

  // Emoji sentiment
  const emojiScore = Array.from(text || "")
    .map((ch) => EMOJI_HINTS[ch] || 0)
    .reduce((a, b) => a + b, 0);

  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i];
    const s = stem(raw);

    if (NEGATIONS.has(s)) {
      negationWindow = 3;
      negationCount++;
      tokenDetails.push({ token: raw, stem: s, weight: 0, negated: false, boost: 1, contribution: 0 });
      continue;
    }

    let weight = LEXICON[s] || 0;
    const isBooster = BOOSTERS[s] !== undefined;

    if (isBooster) {
      tokenDetails.push({ token: raw, stem: s, weight: 0, negated: false, boost: BOOSTERS[s], contribution: 0 });
      continue;
    }

    // Booster multipliers (look back up to 2 tokens)
    let boost = 1;
    for (let back = 1; back <= 2 && i - back >= 0; back++) {
      const prev = stem(tokens[i - back]);
      if (BOOSTERS[prev]) boost *= BOOSTERS[prev];
    }

    let negated = false;
    if (weight !== 0) {
      polarized++;
      if (negationWindow > 0) {
        weight = -weight;
        negated = true;
        negationWindow--;
      }
    }

    const contribution = weight * boost;
    runningScore += contribution;

    tokenDetails.push({ token: raw, stem: s, weight, negated, boost, contribution });
  }

  const totalScore = runningScore + emojiScore;
  const comparative = polarized > 0 ? totalScore / polarized : 0;

  let label = "neutral";
  if (totalScore > 0.75) label = "positive";
  else if (totalScore < -0.75) label = "negative";

  return {
    score: Number(totalScore.toFixed(3)),
    comparative: Number(comparative.toFixed(3)),
    label,
    tokens: tokenDetails,
    emojiScore,
    details: {
      totalTokens: tokens.length,
      polarizedTokens: polarized,
      negationCount
    }
  };
}

/**
 * Content Redundancy Detector
 * - Finds repeated words/n-grams, duplicate paragraphs, and repetition ratios.
 */
async function detect_content_redundancy(parameters) {
  const { text } = parameters;

  // ---- helpers kept inside for single-function constraint ----
  const norm = (s) =>
    (s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const toTokens = (s) =>
    (s || "")
      .toLowerCase()
      .replace(/[^a-z0-9'\s-]/gi, " ")
      .split(/\s+/)
      .filter(Boolean);

  const paragraphs = (norm(text).split(/\n{2,}/g).map(p => p.trim()).filter(Boolean));

  // Duplicate paragraphs via hashing
  const paraHash = (p) => p.toLowerCase().replace(/\s+/g, " ").slice(0, 500);
  const paraMap = new Map();
  for (const p of paragraphs) {
    const h = paraHash(p);
    paraMap.set(h, (paraMap.get(h) || 0) + 1);
  }
  const duplicateParagraphs = [...paraMap.entries()]
    .filter(([, n]) => n > 1)
    .map(([hash, count]) => ({
      preview: paragraphs.find(p => paraHash(p) === hash)?.slice(0, 140) + (paragraphs.find(p => paraHash(p) === hash)?.length > 140 ? "…" : ""),
      count
    }));

  const tokens = toTokens(text);
  const totalTokens = tokens.length;

  // Overused words (unigrams)
  const stop = new Set(["the","a","an","of","to","and","in","for","on","at","with","by","or","as","is","are","was","were","it","that","this","be","from"]);
  const freq = new Map();
  for (const t of tokens) {
    if (stop.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const overusedWords = [...freq.entries()]
    .sort((a,b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count, pct: +(100 * count / Math.max(1,totalTokens)).toFixed(2) }));

  // N-grams (bigrams & trigrams)
  const topNgrams = (n, limit = 15) => {
    const map = new Map();
    for (let i = 0; i <= tokens.length - n; i++) {
      const gram = tokens.slice(i, i+n).join(" ");
      if (gram.split(" ").some(w => stop.has(w))) continue;
      map.set(gram, (map.get(gram) || 0) + 1);
    }
    return [...map.entries()]
      .filter(([, c]) => c > 1)
      .sort((a,b) => b[1] - a[1])
      .slice(0, limit)
      .map(([ng, count]) => ({ ngram: ng, count }));
  };
  const bigrams = topNgrams(2);
  const trigrams = topNgrams(3);

  // Repetition ratio: tokens that are part of any repeated n-gram or repeated word
  const repeatedWordCount = [...freq.values()].filter(v => v > 3).reduce((a,b)=>a+b,0);
  const repetitionRatio = +((repeatedWordCount / Math.max(1,totalTokens))).toFixed(3);

  return {
    summary: {
      totalTokens,
      paragraphCount: paragraphs.length,
      duplicateParagraphGroups: duplicateParagraphs.length,
      repetitionRatio
    },
    duplicateParagraphs,
    overusedWords,
    bigrams,
    trigrams
  };
}

/**
 * Information Scent Strength Scorer
 * - Scores alignment between title/H1/subheads/links and a provided query (or inferred keywords).
 * - Input: { html?: string, query?: string }
 */
async function scoreInformationScent(parameters) {
  const { html, query } = parameters;
  const src = (html || "");

  // --- helpers (regex-only HTML parsing on purpose; no external libs) ---
  const extract = (re, s=src) => {
    const m = re.exec(s);
    return m ? m[1] : "";
  };
  const extractAll = (re, s=src) => {
    const out = [];
    let m;
    while ((m = re.exec(s)) !== null) out.push(m[1]);
    return out;
  };
  const textify = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  const tokens = (s) => textify(s).split(/\s+/).filter(Boolean);
  const uniq = (arr) => [...new Set(arr)];

  const title = extract(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1 = extract(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h2s = extractAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  const links = extractAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
  const body = extract(/<body[^>]*>([\s\S]*?)<\/body>/i) || src;

  // Build candidate keywords
  const stop = new Set(["the","a","an","of","to","and","in","for","on","at","with","by","or","as","is","are","was","were","it","that","this","be","from","you","your","we","our"]);
  const tf = new Map();
  const pushFreq = (str, weight=1) => {
    for (const t of tokens(str)) {
      if (stop.has(t) || t.length < 3) continue;
      tf.set(t, (tf.get(t) || 0) + weight);
    }
  };
  pushFreq(title, 3);
  pushFreq(h1, 3);
  h2s.forEach(h => pushFreq(h, 2));
  pushFreq(body, 1);

  // User query or inferred top terms
  let queryTerms = [];
  if (query && query.trim()) {
    queryTerms = uniq(tokens(query).filter(t => !stop.has(t) && t.length >= 3));
  } else {
    queryTerms = [...tf.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 8).map(([t])=>t);
  }

  // Overlap measures
  const setFrom = (str) => new Set(tokens(str).filter(t => !stop.has(t) && t.length>=3));
  const overlapCount = (setA, terms) => terms.filter(t => setA.has(t)).length;

  const titleSet = setFrom(title);
  const h1Set = setFrom(h1);
  const h2Set = new Set(h2s.flatMap(h => tokens(h)).filter(t => !stop.has(t) && t.length>=3));
  const linkPhrases = links.map(a => textify(a));
  const linkClarityPenalty = linkPhrases.reduce((pen, a) => {
    // penalise vague labels
    if (/\b(click here|learn more|read more|more|details)\b/i.test(a)) return pen + 1;
    return pen;
  }, 0);

  const qLen = Math.max(1, queryTerms.length);
  const titleMatch = overlapCount(titleSet, queryTerms) / qLen;
  const h1Match = overlapCount(h1Set, queryTerms) / qLen;
  const h2Match = overlapCount(h2Set, queryTerms) / qLen;

  // Link anchor match: count anchors that contain any query term
  const linkMatchRaw = linkPhrases.filter(a => queryTerms.some(t => a.includes(t))).length;
  const linkMatch = linkPhrases.length ? linkMatchRaw / linkPhrases.length : 0;

  // Score out of 100 (weights tuned heuristically)
  let score =
    (titleMatch * 30) +
    (h1Match * 30) +
    (h2Match * 20) +
    (linkMatch * 20);

  // Penalties
  score -= Math.min(15, linkClarityPenalty * 3);

  // Clamp
  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    inputs: {
      queryUsed: queryTerms,
      counts: {
        links: linkPhrases.length,
        h2Count: h2s.length
      }
    },
    breakdown: {
      titleMatch: +(titleMatch*100).toFixed(1),
      h1Match: +(h1Match*100).toFixed(1),
      h2Match: +(h2Match*100).toFixed(1),
      linkMatch: +(linkMatch*100).toFixed(1),
      linkClarityPenalty
    },
    suggestions: [
      ...(titleMatch < 0.5 ? ["Align <title> with the top task keywords."] : []),
      ...(h1Match < 0.5 ? ["Rework H1 to include primary intent terms."] : []),
      ...(h2Match < 0.4 ? ["Add subheads that echo the user’s task/keywords."] : []),
      ...(linkClarityPenalty > 0 ? ["Replace vague anchor text (e.g., “click here”) with descriptive labels."] : [])
    ]
  };
}

/**
 * Page Cognitive Load Estimator
 * - Estimates reading difficulty, concept load, instruction density, and (if HTML provided) interactivity burden.
 * - Input: { text?: string, html?: string }
 */
async function estimateCognitiveLoad(parameters) {
  const { text, html } = parameters;
  const src = (html || text || "");

  const plain = (s) => (s || "").replace(/<style[\s\S]*?<\/style>/gi, " ")
                                .replace(/<script[\s\S]*?<\/script>/gi, " ")
                                .replace(/<[^>]+>/g, " ")
                                .replace(/\s+/g, " ")
                                .trim();

  const content = plain(src);
  const words = content.split(/\s+/).filter(Boolean);
  const sentences = (content.match(/[.!?]+/g) || []).length || Math.ceil(words.length / 20);

  // Syllable estimate (very rough): count vowels groups per word
  const syllables = words.reduce((sum, w) => {
    const m = (w.toLowerCase().match(/[aeiouy]+/g) || []).length;
    return sum + Math.max(1, m);
  }, 0);

  const wordsPerSentence = words.length / Math.max(1, sentences);
  const syllablesPerWord = syllables / Math.max(1, words.length);

  // Flesch Reading Ease (approx)
  const flesch = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;

  // Concept load proxy: unique content words
  const stop = new Set(["the","a","an","of","to","and","in","for","on","at","with","by","or","as","is","are","was","were","it","that","this","be","from","you","your","we","our"]);
  const contentWords = words.map(w => w.toLowerCase()).filter(w => !stop.has(w) && w.length > 2);
  const uniqueConcepts = new Set(contentWords).size;
  const conceptDensity = uniqueConcepts / Math.max(1, words.length); // 0–1

  // Instruction density proxy: imperatives / directives
  const imperativeHits = (content.match(/\b(please|do not|avoid|must|should|click|select|enter|submit|choose|provide|attach|confirm)\b/gi) || []).length;
  const exclamations = (src.match(/!/g) || []).length;
  const instructionDensity = (imperativeHits + exclamations * 0.2) / Math.max(1, sentences);

  // Interactivity burden (if HTML): forms, inputs, buttons, complex widgets
  const interactiveCount = (html ? ([
    ...(html.match(/<form\b/gi) || []),
    ...(html.match(/<input\b/gi) || []),
    ...(html.match(/<select\b/gi) || []),
    ...(html.match(/<textarea\b/gi) || []),
    ...(html.match(/<button\b/gi) || [])
  ].length) : 0);

  // Heuristic composite score 0–100 (higher = easier / lower cognitive load)
  let score = 0;
  // Flesch: 90+ easy, 60–70 standard, <50 difficult
  const readabilityComponent = Math.max(0, Math.min(100, (flesch + 10))); // shift to avoid negative
  const conceptComponent = Math.max(0, 100 - Math.min(60, conceptDensity * 6000)); // heavier penalty for dense concepts
  const instructionComponent = Math.max(0, 100 - Math.min(70, instructionDensity * 140));
  const interactivityComponent = Math.max(0, 100 - Math.min(40, interactiveCount * 8));

  score = Math.round(
    0.35 * readabilityComponent +
    0.30 * conceptComponent +
    0.20 * instructionComponent +
    0.15 * interactivityComponent
  );

  const label = score >= 70 ? "Low" : score >= 45 ? "Medium" : "High";

  return {
    score, // higher = lower cognitive load
    label, // Low / Medium / High cognitive load
    metrics: {
      flesch: +flesch.toFixed(1),
      words: words.length,
      sentences,
      wordsPerSentence: +wordsPerSentence.toFixed(2),
      syllablesPerWord: +syllablesPerWord.toFixed(2),
      uniqueConcepts,
      conceptDensity: +conceptDensity.toFixed(3),
      instructionDensity: +instructionDensity.toFixed(3),
      interactiveCount
    },
    suggestions: [
      ...(flesch < 60 ? ["Shorten sentences and use simpler words to raise readability."] : []),
      ...(conceptDensity > 0.25 ? ["Introduce subheads and examples to break dense concept clusters."] : []),
      ...(instructionDensity > 0.4 ? ["Group steps into lists and reduce command verbs per sentence."] : []),
      ...(interactiveCount > 6 ? ["Reduce simultaneous inputs; split forms into steps or progressive disclosure."] : [])
    ]
  };
}

/**
 * Content Freshness Auditor
 * - Flags stale dates/phrases and suggests updates.
 * - Input: { text?: string, html?: string, currentYear?: number }
 */
async function auditContentFreshness(parameters) {
  const { text, html, currentYear } = parameters;
  const src = (html || text || "");
  const now = new Date();
  const thisYear = currentYear || now.getFullYear();

  const bodyText = (src || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const findings = [];

  // Year mentions
  const yearMatches = bodyText.match(/\b(19|20)\d{2}\b/g) || [];
  const uniqueYears = [...new Set(yearMatches.map(y => +y))].sort();
  for (const y of uniqueYears) {
    const age = thisYear - y;
    if (age >= 3) {
      findings.push({
        type: "stale-year",
        year: y,
        age,
        message: `Mentions year ${y} (≈${age} years old). Consider updating stats or adding a current benchmark (${thisYear}).`
      });
    }
  }

  // Relative stale phrases
  const stalePhrases = [
    { re: /\b(as of|updated as of)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)?\.?\s*(19|20)\d{2}\b/gi, msg: "Dated 'as of' statement may be stale." },
    { re: /\b(last year|earlier this year|next year)\b/gi, msg: "Relative time phrase can age quickly; replace with an absolute date." },
    { re: /\b(coming in|launching in)\s+(19|20)\d{2}\b/gi, msg: "Future-tense launch year may be in the past now." },
    { re: /\b(in \d{4},|since \d{4})\b/gi, msg: "Historic anchor may need a recent context or trend update." }
  ];
  for (const { re, msg } of stalePhrases) {
    let m;
    while ((m = re.exec(bodyText)) !== null) {
      const snippet = bodyText.slice(Math.max(0, m.index - 40), Math.min(bodyText.length, m.index + 60)).trim();
      findings.push({ type: "stale-phrase", phrase: m[0], message: msg, snippet });
    }
  }

  // Stale numeric stats like "X% in 2019"
  const statRe = /\b(\d{1,3}(?:\.\d+)?%)\s+(?:in|as of)\s+((19|20)\d{2})\b/gi;
  let sm;
  while ((sm = statRe.exec(bodyText)) !== null) {
    const pct = sm[1], year = +sm[2], age = thisYear - year;
    if (age >= 3) {
      findings.push({
        type: "stale-stat",
        percent: pct,
        year,
        age,
        message: `Statistic ${pct} from ${year} may be outdated (≈${age} years old).`
      });
    }
  }

  // Summarise severity
  const severity = findings.length === 0 ? "fresh" :
                   findings.length < 4 ? "minor" :
                   findings.length < 8 ? "moderate" : "major";

  // Suggestions
  const suggestions = [];
  if (uniqueYears.some(y => thisYear - y >= 3)) suggestions.push("Update any statistics older than ~3 years or add a recent comparator.");
  if (findings.some(f => f.type === "stale-phrase")) suggestions.push("Replace relative time phrases ('last year') with absolute dates (e.g., 'in 2024').");
  if (findings.some(f => f.type === "stale-stat")) suggestions.push("Re-validate percentages and cite a current source/date in the copy.");
  if (findings.length === 0) suggestions.push("No obvious freshness issues detected.");

  return {
    summary: {
      yearMentions: uniqueYears,
      totalFindings: findings.length,
      severity
    },
    findings,
    suggestions
  };
}


/**
 * Content Density: Analyses a web page for content density
 */
async function content_density_evaluator(parameters) {
  const { url } = parameters;
  // --- Helpers -------------------------------------------------
  function getTagContents(html, tag) {
    const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
    const out = [];
    let match;
    while ((match = regex.exec(html)) !== null) {
      out.push(match[1]);
    }
    return out;
  }

  function stripTags(s) {
    return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }

  // --- Fetch page ----------------------------------------------
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // --- Extract key metrics -------------------------------------
  const paragraphHTML = getTagContents(html, "p");
  const paragraphTexts = paragraphHTML.map(stripTags).filter(t => t.length > 0);

  const allWords = paragraphTexts.join(" ").split(/\s+/).filter(Boolean);
  const wordCount = allWords.length;
  const imageCount = (html.match(/<img\b[^>]*>/gi) || []).length;
  const headingCount = (html.match(/<h[1-6]\b[^>]*>/gi) || []).length;

  const paragraphWordCounts = paragraphTexts.map(p =>
    p.split(/\s+/).filter(Boolean).length
  );
  const avgParagraphLength =
    paragraphWordCounts.length === 0
      ? 0
      : paragraphWordCounts.reduce((a, b) => a + b, 0) / paragraphWordCounts.length;

  // --- Simple scanability heuristic -----------------------------
  let scanabilityScore = 100;
  if (avgParagraphLength > 100) scanabilityScore -= 20;
  if (imageCount === 0) scanabilityScore -= 20;
  if (headingCount === 0) scanabilityScore -= 20;
  if (scanabilityScore < 0) scanabilityScore = 0;

  // --- Notes / recommendations ---------------------------------
  const notes = [];
  if (avgParagraphLength > 80) {
    notes.push("Paragraphs are long; consider splitting large blocks of text.");
  } else {
    notes.push("Paragraph length seems reasonable.");
  }

  if (imageCount === 0) {
    notes.push("No images found; consider adding supporting visuals.");
  } else {
    notes.push("Contains imagery to break up text.");
  }

  if (headingCount === 0) {
    notes.push("No headings found; add subheadings to improve scanning.");
  } else {
    notes.push("Has headings to guide the reader.");
  }

  // --- Return structured result --------------------------------
  return {
    url,
    wordCount,
    imageCount,
    headingCount,
    avgParagraphLength: Math.round(avgParagraphLength),
    scanabilityScore,
    notes
  };
}

async function accessibility_surface_check(parameters) {
  const { url } = parameters;
  // Fetch the page HTML
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // Count <h1> elements
  const h1Matches = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi) || [];
  const h1Count = h1Matches.length;

  // Count <img> tags missing usable alt text
  // Rule: <img> with no alt= OR alt="" is considered missing
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  let imagesMissingAlt = 0;
  for (const imgTag of imgTags) {
    const altMatchDouble = imgTag.match(/\balt\s*=\s*"([^"]*)"/i);
    const altMatchSingle = imgTag.match(/\balt\s*=\s*'([^']*)'/i);
    const altValue = altMatchDouble
      ? altMatchDouble[1]
      : altMatchSingle
      ? altMatchSingle[1]
      : null;
    if (altValue === null || altValue.trim() === "") {
      imagesMissingAlt++;
    }
  }

  // Count unlabeled <button> elements
  // We treat a button as "unlabeled" if:
  // - There's no visible text between <button>...</button>
  // - AND no aria-label attribute
  const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  const buttonBlocks = [];
  let btnMatch;
  while ((btnMatch = buttonRegex.exec(html)) !== null) {
    buttonBlocks.push(btnMatch[0]); // entire <button>...</button> block
  }

  let unlabeledButtons = 0;
  for (const block of buttonBlocks) {
    // extract inner text of button by stripping tags
    const innerMatch = /<button\b[^>]*>([\s\S]*?)<\/button>/i.exec(block);
    const innerHtml = innerMatch ? innerMatch[1] : "";
    const visibleText = innerHtml
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const ariaLabelMatchDouble = block.match(/\baria-label\s*=\s*"([^"]*)"/i);
    const ariaLabelMatchSingle = block.match(/\baria-label\s*=\s*'([^']*)'/i);
    const ariaVal = ariaLabelMatchDouble
      ? ariaLabelMatchDouble[1]
      : ariaLabelMatchSingle
      ? ariaLabelMatchSingle[1]
      : null;

    if ((!visibleText || visibleText.length === 0) && (!ariaVal || ariaVal.length === 0)) {
      unlabeledButtons++;
    }
  }

  // Heading order check:
  // We walk all <h1>..<h6> in appearance order and flag big jumps
  const headingRegex = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const headingLevels = [];
  let hMatch;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    const tagName = hMatch[1].toLowerCase(); // "h2", etc.
    const level = parseInt(tagName.replace("h", ""), 10);
    headingLevels.push(level);
  }

  let headingOrderIssues = 0;
  for (let i = 1; i < headingLevels.length; i++) {
    const prev = headingLevels[i - 1];
    const curr = headingLevels[i];
    // We consider a "jump" if it skips more than 2 levels
    // e.g. h2 -> h5
    if (curr - prev > 2) {
      headingOrderIssues++;
    }
  }

  // Score heuristic (0–100)
  let accessibilityScore = 100;
  if (h1Count === 0) accessibilityScore -= 10;
  if (h1Count > 1) accessibilityScore -= 10;
  accessibilityScore -= imagesMissingAlt * 2;
  accessibilityScore -= unlabeledButtons * 3;
  accessibilityScore -= headingOrderIssues * 5;
  if (accessibilityScore < 0) accessibilityScore = 0;

  // Human-readable notes for the marketer / content owner
  const notes = [];

  if (h1Count === 0) {
    notes.push("No <h1> found — every page should have a single main heading.");
  } else if (h1Count > 1) {
    notes.push("Multiple <h1> elements found — usually you only want one.");
  } else {
    notes.push("Single <h1> present ✅");
  }

  if (imagesMissingAlt > 0) {
    notes.push(`${imagesMissingAlt} image(s) missing alt text.`);
  } else {
    notes.push("All images appear to include alt text ✅");
  }

  if (unlabeledButtons > 0) {
    notes.push(
      `${unlabeledButtons} <button> element(s) have no visible text or aria-label.`
    );
  } else {
    notes.push("All buttons appear to have labels or aria-labels ✅");
  }

  if (headingOrderIssues > 0) {
    notes.push(
      `${headingOrderIssues} heading level jump(s) detected (e.g. h2 → h5).`
    );
  } else {
    notes.push("Heading level progression mostly looks consistent ✅");
  }

  // Final structured result
  return {
    url,
    h1Count,
    imagesMissingAlt,
    unlabeledButtons,
    headingOrderIssues,
    accessibilityScore,
    notes
  };
}

async function link_health_inspector(parameters) {
  const { url } = parameters;
  // Fetch main page HTML
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // Extract all hrefs
  // This is naive: it grabs href="...". Won't follow JS-built links etc.
  const hrefMatches = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)];
  const hrefs = hrefMatches.map(m => m[1]);

  // Normalise URLs to absolute so we can classify internal/external
  let originHost;
  try {
    originHost = new URL(url).hostname;
  } catch {
    originHost = "";
  }

  function toAbsolute(href) {
    try {
      // Relative links get resolved against base URL
      return new URL(href, url).toString();
    } catch {
      return null;
    }
  }

  // Filter obvious non-web links (mailto:, tel:, javascript:, anchors)
  const webLinks = hrefs.filter(href => {
    if (!href) return false;
    const low = href.toLowerCase();
    if (low.startsWith("mailto:")) return false;
    if (low.startsWith("tel:")) return false;
    if (low.startsWith("javascript:")) return false;
    if (low.startsWith("#")) return false;
    return true;
  });

  const absoluteLinks = webLinks
    .map(toAbsolute)
    .filter(l => !!l);

  // Deduplicate
  const uniqueLinks = [...new Set(absoluteLinks)];

  // Work out internal vs external
  const internalLinks = [];
  const externalLinks = [];
  for (const link of uniqueLinks) {
    try {
      const u = new URL(link);
      if (u.hostname === originHost) {
        internalLinks.push(link);
      } else {
        externalLinks.push(link);
      }
    } catch {
      // ignore malformed URLs
    }
  }

  // Estimate depth of internal links: /a/b/c -> depth 3
  function pathDepth(u) {
    try {
      const parsed = new URL(u);
      // ignore leading '/' split artifact
      return parsed.pathname
        .split("/")
        .filter(seg => seg && seg.trim().length > 0).length;
    } catch {
      return null;
    }
  }
  const depths = internalLinks
    .map(pathDepth)
    .filter(d => typeof d === "number");
  const avgDepth =
    depths.length === 0
      ? 0
      : depths.reduce((a, b) => a + b, 0) / depths.length;

  // Light health check for first N links
  // We'll attempt HEAD first; if it fails or returns method not allowed, fall back to GET.
  const MAX_CHECK = 20;
  let brokenCount = 0;
  let redirectCount = 0;

  for (let i = 0; i < Math.min(uniqueLinks.length, MAX_CHECK); i++) {
    const link = uniqueLinks[i];
    try {
      let headResp = await fetch(link, { method: "HEAD", redirect: "manual" });
      // Some servers block HEAD; fallback to GET if status is 405/403/etc.
      if (headResp.status === 405 || headResp.status === 403) {
        headResp = await fetch(link, { method: "GET", redirect: "manual" });
      }

      // Broken = 4xx or 5xx
      if (headResp.status >= 400) {
        brokenCount++;
      }

      // Redirect detected if 3xx without following
      if (headResp.status >= 300 && headResp.status < 400) {
        redirectCount++;
      }
    } catch {
      // Network/host errors count as broken
      brokenCount++;
    }
  }

  const notes = [];
  if (brokenCount > 0) notes.push(`${brokenCount} broken link(s) detected.`);
  if (redirectCount > 0) notes.push(`${redirectCount} redirecting link(s) detected.`);
  if (internalLinks.length === 0) notes.push("No internal links found. Is this a standalone landing page?");
  if (externalLinks.length > 0 && internalLinks.length === 0)
    notes.push("Page links mostly out to other domains.");
  if (notes.length === 0) notes.push("Link health looks generally OK.");

  return {
    url,
    linksFound: uniqueLinks.length,
    internalLinks: internalLinks.length,
    externalLinks: externalLinks.length,
    brokenLinks: brokenCount,
    redirectedLinks: redirectCount,
    averageDepth: Number(avgDepth.toFixed(2)),
    notes
  };
}

/**
 * Distraction Gravity Index
 * Scores each section for how much it pulls users away from a stated goal.
 * Input: { html?: string, text?: string, goal?: string }
 */
async function distraction_gravity_index(parameters) {
  const { html, text, goal } = parameters;
  const src = (html || text || "");
  const stripHTML = (s) => (s || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const clean = (s) => (s || "").replace(/\u00a0/g," ").replace(/\s+/g," ").trim();

  const body = clean(stripHTML(src));
  const sections = body.split(/\n{2,}|(?<=\.)\s{2,}/g).map(s => s.trim()).filter(Boolean);

  const tokens = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s'-]/g," ").split(/\s+/).filter(Boolean);
  const stop = new Set("the a an and or but of to in on at by for with as is are was were it this that from be have has had you your we our".split(" "));
  const contentTokens = (s) => tokens(s).filter(t=>!stop.has(t)&&t.length>2);
  const stem = (w) => w.replace(/(ing|ed|ly|es|s)$/,'').replace(/ies$/,'y');

  const goalTerms = (goal ? contentTokens(goal).map(stem) : []);
  const goalSet = new Set(goalTerms);

  // Heuristics
  const vagueCTA = /\b(click here|learn more|read more|more|details)\b/i;
  const social = /\b(instagram|facebook|tiktok|twitter|x\.com|linkedin|youtube)\b/i;
  const anecdote = /\b(i |we |our founder|when i was|story time|back in)\b/i;
  const exclaim = /!/g;
  const emoji = /[🤩😊😂🤣🥳👍🔥✨💯❤️😅😎]/g;
  const iframe = /\b(iframe|embed|video|player)\b/i;

  const scoreSection = (s) => {
    const toks = contentTokens(s).map(stem);
    const length = Math.max(1, toks.length);
    const goalOverlap = goalTerms.length ? toks.filter(t => goalSet.has(t)).length / length : 0.0;

    let distraction = 0;
    distraction += (vagueCTA.test(s) ? 2.5 : 0);
    distraction += (social.test(s) ? 3 : 0);
    distraction += (anecdote.test(s) ? 1.5 : 0);
    distraction += (iframe.test(s) ? 2 : 0);

    const exCount = (s.match(exclaim) || []).length;
    const emoCount = (s.match(emoji) || []).length;
    distraction += Math.min(2, exCount * 0.2);
    distraction += Math.min(2, emoCount * 0.5);

    // Off-topic penalty increases when goal overlap is low
    distraction += (1 - goalOverlap) * 2;

    // Normalize to 0–10
    return Math.max(0, Math.min(10, +distraction.toFixed(2)));
  };

  const items = sections.map((s, idx) => {
    const score = scoreSection(s);
    let gravity = "Low Earth Orbit";
    if (score >= 7.5) gravity = "Black Hole";
    else if (score >= 5) gravity = "Solar Flare";
    else if (score >= 2.5) gravity = "Meteor";
    return {
      index: idx,
      preview: s.slice(0, 140) + (s.length > 140 ? "…" : ""),
      score, gravity
    };
  });

  // Overall summary
  const avg = +(items.reduce((a,i)=>a+i.score,0) / Math.max(1, items.length)).toFixed(2);
  const worst = items.slice().sort((a,b)=>b.score-a.score)[0];

  const suggestions = [];
  if (goal && items.length) suggestions.push("Add goal keywords to headings and CTAs to raise alignment.");
  if (items.some(i=>/click here|learn more/i.test(sections[i.index]))) suggestions.push("Replace vague anchors with descriptive, goal-aligned labels.");
  if (items.some(i=>i.gravity==="Black Hole")) suggestions.push("Move or remove highly distracting sections; place them after the primary CTA.");
  if (avg >= 5) suggestions.push("Reduce off-topic anecdotes and social calls mid-flow.");

  return {
    summary: { sections: items.length, averageScore: avg, worstSectionIndex: worst?.index ?? null },
    items,
    suggestions
  };
}

/**
 * Time Traveller’s Content Inspector
 * Evaluates how content reads to 1994, 1973, 2089, and 1500 audiences.
 * Input: { html?: string, text?: string }
 */
async function time_travellers_inspector(parameters) {
  const { html, text } = parameters;
  const src = (html || text || "");

  const stripHTML = (s) => (s || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const base = (stripHTML(src) || "").replace(/\s+/g," ").trim().toLowerCase();

  const tokens = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s'-]/g," ").split(/\s+/).filter(Boolean);
  const content = tokens(base);

  // Era-specific heuristics
  const modernTech = /\b(ai|ml|blockchain|cloud|saas|kubernetes|api|cookie banner|gdpr|quantum|personalization|A\/B|experimentation|microservice|llm)\b/gi;
  const slangEmojis = /\b(omg|lol|btw|tbh|fomo|vibes|bougie|yeet|cringe|sus|irl|afaik|ngl)\b/gi;
  const emoji = /[🤩😊😂🤣🥳👍🔥✨💯❤️😅😎]/g;
  const archaic = /\b(thou|thee|thy|shalt|hath|wherefore|whence|heretofore|henceforth)\b/gi;
  const corporateese = /\b(leverage|synergy|ecosystem|paradigm|enablement|stakeholder|scalable|robust|optimize)\b/gi;

  const count = (re, s) => ((s || "").match(re) || []).length;

  const length = content.length;
  const avgWordLen = content.reduce((a,w)=>a+w.length,0)/Math.max(1,length);
  const sentenceCount = Math.max(1, (base.match(/[.!?]+/g) || []).length);
  const wordsPerSentence = +(length / sentenceCount).toFixed(1);

  // Scoring per era (0–100; higher = more comprehensible/normal for that era)
  const eraScore = (opts) => {
    let score = 100;
    for (const {penalty} of opts.penalties) score -= penalty;
    return Math.max(0, Math.min(100, Math.round(score)));
  };

  // 1994: early web. Penalise heavy slang/emojis; penalise too much corporateese; modern tech okay in small doses.
  const era1994 = eraScore({
    penalties: [
      { penalty: Math.min(25, count(slangEmojis, base) * 2) },
      { penalty: Math.min(20, count(emoji, base) * 3) },
      { penalty: Math.min(20, count(corporateese, base) * 1.5) },
      { penalty: Math.max(0, wordsPerSentence - 25) } // super long sentences were less common on the web
    ]
  });

  // 1973: pre-web general audience. Penalise modern tech jargon; long sentences ok; slang unfamiliar.
  const era1973 = eraScore({
    penalties: [
      { penalty: Math.min(35, count(modernTech, base) * 3) },
      { penalty: Math.min(20, count(slangEmojis, base) * 2) },
      { penalty: Math.min(10, count(emoji, base) * 2) },
      { penalty: avgWordLen > 6 ? 5 : 0 }
    ]
  });

  // 2089: future audience expects precision, agency, and adaptive language. Penalise passive fluff/corporateese and lack of specifics.
  const passive = /\b(is|are|was|were|be|been|being)\s+\w+ed\b/gi;
  const vague = /\b(innovative|next\-gen|cutting\-edge|seamless|world\-class|best\-in\-class)\b/gi;
  const era2089 = eraScore({
    penalties: [
      { penalty: Math.min(25, count(corporateese, base) * 2) },
      { penalty: Math.min(20, count(vague, base) * 2) },
      { penalty: Math.min(15, count(passive, base) * 1) },
      { penalty: wordsPerSentence > 28 ? 5 : 0 }
    ]
  });

  // 1500: Renaissance scholar. Penalise modern tech & slang; archaic terms are a bonus (reduce penalty).
  let pen1500 =
    Math.min(45, count(modernTech, base) * 4) +
    Math.min(25, count(slangEmojis, base) * 2) +
    Math.min(10, count(emoji, base) * 2);
  const archaicHits = count(archaic, base);
  pen1500 = Math.max(0, pen1500 - Math.min(15, archaicHits * 2));
  const era1500 = Math.max(0, Math.min(100, 100 - Math.round(pen1500)));

  const insights = [];
  if (count(slangEmojis, base) > 3) insights.push("Excess internet slang may confuse pre-web eras.");
  if (count(corporateese, base) > 4) insights.push("Corporate buzzwords reduce clarity across eras, including 2089.");
  if (count(modernTech, base) > 6) insights.push("High density of modern tech terms is opaque before 1994 and 1973.");
  if (wordsPerSentence > 28) insights.push("Extremely long sentences reduce legibility for 1994 and 2089.");
  if (archaicHits > 0) insights.push("Archaic phrases slightly improve legibility for 1500 but can confuse modern readers.");

  return {
    metrics: {
      length,
      avgWordLen: +avgWordLen.toFixed(2),
      sentenceCount,
      wordsPerSentence
    },
    eras: [
      { era: 1994, score: era1994, verdict: era1994 >= 70 ? "Readable for early-web audience" : "May feel odd for 90s web" },
      { era: 1973, score: era1973, verdict: era1973 >= 70 ? "Generally comprehensible pre-web" : "Jargon-heavy for 70s" },
      { era: 2089, score: era2089, verdict: era2089 >= 70 ? "Future-ready clarity" : "Too much fluff for post-AGI readers" },
      { era: 1500, score: era1500, verdict: era1500 >= 70 ? "Somewhat legible to Renaissance reader" : "Feels like sorcery to 1500s" }
    ],
    insights,
    suggestions: [
      ...(count(slangEmojis, base) ? ["Reduce modern slang and emojis to boost 1973/1500 comprehension."] : []),
      ...(count(corporateese, base) ? ["Swap corporateese for concrete nouns and verbs to satisfy 2089 and 1994."] : []),
      ...(count(modernTech, base) > 4 ? ["Briefly define crucial tech terms once, then reuse consistently."] : [])
    ]
  };
}


/**
 * The Semantic Acid Test
 * Simulates distorted readings and scores meaning survival across scenarios.
 * Input: { text?: string, html?: string, topK?: number }
 */
async function semantic_acid_test(parameters) {
  const { text, html, topK } = parameters;
  const src = (html || text || "");

  // --- helpers (kept inside for single-function constraint) ---
  const stripHTML = (s) => (s || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const clean = (s) => (s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  const base = clean(stripHTML(src)).toLowerCase();

  const sentences = base.split(/(?<=[.!?])\s+/g).filter(Boolean);
  const tokens = (s) => (s || "").toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const stop = new Set("the a an and or but of to in on at by for with as is are was were it this that from be have has had you your we our they them i me my their its not".split(" "));
  const contentTokens = (s) => tokens(s).filter(t => !stop.has(t) && t.length > 2);
  const stem = (w) => w.replace(/(ing|ed|ly|es|s)$/,'').replace(/ies$/,'y');

  // Key term extraction (very simple TF weighting with position bias)
  const tf = new Map();
  const words = contentTokens(base);
  words.forEach((w, idx) => {
    const st = stem(w);
    const posBoost = 1 + (idx < 50 ? 0.2 : 0) + (idx > words.length - 50 ? 0.1 : 0);
    tf.set(st, (tf.get(st) || 0) + posBoost);
  });
  const keyTerms = [...tf.entries()]
    .sort((a,b)=>b[1]-a[1])
    .slice(0, Math.max(8, Math.min(20, topK || 12)))
    .map(([t])=>t);

  const overlapScore = (variant) => {
    const vt = new Set(contentTokens(variant).map(stem));
    const hit = keyTerms.filter(k => vt.has(k)).length;
    return +(100 * hit / Math.max(1, keyTerms.length)).toFixed(1);
  };

  // Distortions
  const skimTired = (() => {
    if (sentences.length <= 2) return base;
    return [sentences[0], sentences[sentences.length-1]].join(" ");
  })();
  const skim2x = sentences.map(s => tokens(s).slice(0, 7).join(" ")).join(". ");
  const literalMode = base
    .replace(/\blike\b\s+[^.,;:()]+/g, "")          // drop similes "like ..."
    .replace(/\bas\s+\w+\s+as\s+[^.,;:()]+/g, "");  // "as X as Y"
  const sarcasticReader = base
    .replace(/\b(obviously|clearly|of course|literally)\b/g, "")
    .replace(/\b(very|really|super|extremely)\b/g, "");
  const kidMode = tokens(base).filter(w => w.length <= 6).join(" ");
  const victorian = base
    .replace(/[🤩😊😂🤣🥳👍🔥✨💯❤️]/g,"")
    .replace(/\b(ok|awesome|cool|gonna|wanna|btw|tbh|lol|omg)\b/g,"");

  const scenarios = [
    { id: "tired_skim", label: "Tired skim", text: skimTired },
    { id: "skim_2x", label: "Skim at 2× speed", text: skim2x },
    { id: "literal", label: "Literal interpretation", text: literalMode },
    { id: "sarcastic", label: "Sarcastic reading", text: sarcasticReader },
    { id: "age6", label: "6-year-old", text: kidMode },
    { id: "victorian", label: "Victorian editor", text: victorian }
  ];

  const results = scenarios.map(s => ({
    id: s.id,
    label: s.label,
    survival: overlapScore(s.text) // % of key concepts retained
  }));

  const avg = +(results.reduce((a,r)=>a+r.survival,0) / results.length).toFixed(1);
  const min = Math.min(...results.map(r=>r.survival));

  const suggestions = [];
  if (min < 50) suggestions.push("Front-load core concepts in the first sentence and repeat them near the end.");
  if (results.find(r=>r.id==="age6" && r.survival < 60)) suggestions.push("Simplify jargon; prefer short, concrete words.");
  if (results.find(r=>r.id==="skim_2x" && r.survival < 60)) suggestions.push("Use informative subheads and bullets with key terms.");
  if (results.find(r=>r.id==="literal" && r.survival < 60)) suggestions.push("Reduce metaphors or pair them with literal restatements.");

  return {
    keyTerms,
    survival: { average: avg, minimum: min, perScenario: results },
    suggestions
  };
}


async function speed_heuristics_checker(parameters) {
  const { url } = parameters;
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const html = await res.text();

  // Extract <script ...>...</script>
  const scriptMatches = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];

  let totalScripts = 0;
  let blockingScripts = 0; // scripts without defer/async
  let inlineBytes = 0;

  for (const match of scriptMatches) {
    totalScripts++;

    const attrs = match[1] || "";
    const body = match[2] || "";

    const hasDefer = /\bdefer\b/i.test(attrs);
    const hasAsync = /\basync\b/i.test(attrs);
    const hasSrc = /\bsrc\s*=\s*["'][^"']+["']/i.test(attrs);

    // blocking if it's external <script src="..."> with no defer/async,
    // or inline script in <head> (we can't perfectly detect "in head" without DOM,
    // so we simplify: any script without defer/async counts as potentially blocking).
    if (!hasDefer && !hasAsync) {
      blockingScripts++;
    }

    // inline weight: only count inline JS (no src)
    if (!hasSrc) {
      inlineBytes += Buffer.byteLength(body, "utf8");
    }
  }

  // Extract <img ...> tags
  const imgMatches = [...html.matchAll(/<img\b([^>]*?)>/gi)];
  let totalImages = 0;
  let noLazy = 0;
  let suspectedLarge = 0;
  for (const m of imgMatches) {
    totalImages++;
    const attrs = m[1] || "";

    // lazy?
    const hasLazy = /\bloading\s*=\s*["']lazy["']/i.test(attrs);
    if (!hasLazy) {
      noLazy++;
    }

    // "suspected large" heuristic:
    // if src ends with .png or .jpg and width/height hints look big
    // We'll just detect .png/.jpg/.jpeg and presence of big-ish width number.
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const widthMatch = attrs.match(/\bwidth\s*=\s*["'](\d+)["']/i);
    const heightMatch = attrs.match(/\bheight\s*=\s*["'](\d+)["']/i);
    const srcVal = srcMatch ? srcMatch[1].toLowerCase() : "";
    const widthVal = widthMatch ? parseInt(widthMatch[1], 10) : null;
    const heightVal = heightMatch ? parseInt(heightMatch[1], 10) : null;

    // naive: if it's a big raster and width or height > 1000, treat as "large"
    if (
      (srcVal.endsWith(".png") ||
        srcVal.endsWith(".jpg") ||
        srcVal.endsWith(".jpeg")) &&
      ((widthVal && widthVal > 1000) || (heightVal && heightVal > 1000))
    ) {
      suspectedLarge++;
    }
  }

  // Performance smell score: start from 100, subtract penalties
  let perfScore = 100;
  // too many scripts
  if (totalScripts > 10) perfScore -= (totalScripts - 10) * 2;
  // too many blocking
  if (blockingScripts > 5) perfScore -= (blockingScripts - 5) * 4;
  // heavy inline JS
  if (inlineBytes > 50_000) perfScore -= 15; // >50KB inline
  if (inlineBytes > 150_000) perfScore -= 20; // >150KB inline (extra hit)
  // missing lazy loading
  if (noLazy > 0 && totalImages > 0) {
    const ratioNoLazy = noLazy / totalImages;
    if (ratioNoLazy > 0.5) perfScore -= 10;
  }
  // suspected big images
  if (suspectedLarge > 0) perfScore -= suspectedLarge * 5;
  if (perfScore < 0) perfScore = 0;

  const notes = [];
  notes.push(`${totalScripts} <script> tags detected.`);
  if (blockingScripts > 0) {
    notes.push(`${blockingScripts} script(s) without async/defer (possible render-blockers).`);
  } else {
    notes.push("Most scripts appear async/defer ✅");
  }

  if (inlineBytes > 0) {
    notes.push(`Inline JS total ~${Math.round(inlineBytes / 1024)}KB.`);
  }

  if (totalImages > 0) {
    notes.push(`${noLazy}/${totalImages} images missing loading="lazy".`);
  } else {
    notes.push("No <img> tags detected.");
  }

  if (suspectedLarge > 0) {
    notes.push(`${suspectedLarge} image(s) look very large ( >1000px dimension hints ).`);
  }

  return {
    url,
    totalScripts,
    blockingScripts,
    inlineScriptKB: Math.round(inlineBytes / 1024),
    totalImages,
    imagesMissingLazyLoad: noLazy,
    suspectedLargeImages: suspectedLarge,
    performanceSmellScore: perfScore,
    notes
  };
}

// Example:
// (async () => console.log(await speedHeuristicsChecker("https://example.com")))();


// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'content_density_evaluator',
    description: 'Analyses a web page for content density',
    parameters: [
        {
            name: 'url',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'URL to analyse',
            required: true
        },
    ]
})(content_density_evaluator);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'time_travellers_inspector',
    description: 'Analyses a content for sentiment',
    parameters: [
        {
            name: 'text',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'text to analyse',
            required: true
        },
    ]
})(time_travellers_inspector);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'analyse_sentiment',
    description: 'Analyses a content for sentiment',
    parameters: [
        {
            name: 'text',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'text to analyse',
            required: true
        },
    ]
})(analyse_sentiment);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'detect_content_redundancy',
    description: 'Analyses a content for content redundancy',
    parameters: [
        {
            name: 'text',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'text to analyse',
            required: true
        },
    ]
})(detect_content_redundancy);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'accessibility_surface_check',
    description: 'Analyses a web page for basics of accessibility',
    parameters: [
        {
            name: 'url',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'URL to analyse',
            required: true
        },
    ]
})(accessibility_surface_check);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'link_health_inspector',
    description: 'Analyses a web page for broken links',
    parameters: [
        {
            name: 'url',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'URL to analyse',
            required: true
        },
    ]
})(link_health_inspector);

// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'speed_heuristics_checker',
    description: 'Analyses a web page for speed heuristics',
    parameters: [
        {
            name: 'url',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'URL to analyse',
            required: true
        },
    ]
})(speed_heuristics_checker);


// Register the tools using decorators with explicit parameter definitions
(0, opal_tools_sdk_1.tool)({
    name: 'sgc_greeting',
    description: 'Greets a person in a random language (English, Spanish, or French)',
    parameters: [
        {
            name: 'name',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'Name of the person to greet',
            required: true
        },
        {
            name: 'language',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'Language for greeting (defaults to random)',
            required: false
        }
    ]
})(sgc_greeting);
(0, opal_tools_sdk_1.tool)({
    name: 'sgc_todays_date',
    description: 'Returns today\'s date in the specified format',
    parameters: [
        {
            name: 'format',
            type: opal_tools_sdk_1.ParameterType.String,
            description: 'Date format (defaults to ISO format)',
            required: false
        }
    ]
})(sgc_todays_Date);
// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
