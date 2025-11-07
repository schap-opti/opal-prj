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
