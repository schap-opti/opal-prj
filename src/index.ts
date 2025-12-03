import express from 'express';
import { ToolsService, tool, ParameterType } from '@optimizely-opal/opal-tools-sdk';

// Create Express app
const app = express();
app.use(express.json());

// Create Tools Service
const toolsService = new ToolsService(app);

// Interfaces for tool parameters
interface GreetingParameters {
  name: string;
  language?: string;
}

// Interfaces for tool parameters
interface HeuristicsParameters {
  url: string;
}

interface DateParameters {
  format?: string;
}

/**
 * Greeting Tool: Greets a person in a random language
 */
// Apply tool decorator after function definition
async function sgcgreeting(parameters: GreetingParameters) {
  const { name, language } = parameters;
  
  // If language not specified, choose randomly
  const selectedLanguage = language || 
    ['english', 'spanish', 'french'][Math.floor(Math.random() * 3)];
  
  // Generate greeting based on language
  let greeting: string;
  if (selectedLanguage.toLowerCase() === 'spanish') {
    greeting = `¡Hola, ${name}! ¿Cómo estás?`;
  } else if (selectedLanguage.toLowerCase() === 'french') {
    greeting = `Bonjour, ${name}! Comment ça va?`;
  } else { // Default to English
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
async function sgctodaysDate(parameters: DateParameters) {
  const format = parameters.format || '%Y-%m-%d';
  
  // Get today's date
  const today = new Date();
  
  // Format the date (simplified implementation)
  let formattedDate: string;
  if (format === '%Y-%m-%d') {
    formattedDate = today.toISOString().split('T')[0];
  } else if (format === '%B %d, %Y') {
    formattedDate = today.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  } else if (format === '%d/%m/%Y') {
    formattedDate = today.toLocaleDateString('en-GB');
  } else {
    // Default to ISO format
    formattedDate = today.toISOString().split('T')[0];
  }
  
  return {
    date: formattedDate,
    format: format,
    timestamp: today.getTime() / 1000
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

// Register the tools using decorators with explicit parameter definitions
tool({
  name: 'sgc-greeting',
  description: 'Greets a person in a random language (English, Spanish, or French)',
  parameters: [
    {
      name: 'name',
      type: ParameterType.String,
      description: 'Name of the person to greet',
      required: true
    },
    {
      name: 'language',
      type: ParameterType.String,
      description: 'Language for greeting (defaults to random)',
      required: false
    }
  ]
})(sgcgreeting);

tool({
  name: 'sgc-todays-date',
  description: 'Returns today\'s date in the specified format',
  parameters: [
    {
      name: 'format',
      type: ParameterType.String,
      description: 'Date format (defaults to ISO format)',
      required: false
    }
  ]
})(sgctodaysDate);

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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
