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

interface DateParameters {
  format?: string;
}

interface DensityParameters {
  url?: string;
}

interface EmotionParameters {
  url?: string;
}

/**
 * Content Density: Analyses a web page for content density
 */
async function contentDensityEvaluator(parameters: DensityParameters) {
  const { url } = parameters;
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const paragraphs = $("p")
    .map((_, el) => $(el).text().trim().replace(/\s+/g, " "))
    .get()
    .filter(Boolean);

  const words = paragraphs.join(" ").split(/\s+/).filter(Boolean).length;
  const images = $("img").length;
  const headings = $("h1, h2, h3, h4, h5, h6").length;
  const avgParagraph = paragraphs.length
    ? paragraphs.reduce((a, p) => a + p.split(/\s+/).length, 0) / paragraphs.length
    : 0;

  const scanability =
    100 -
    (avgParagraph > 100 ? 20 : 0) -
    (images === 0 ? 20 : 0) -
    (headings === 0 ? 20 : 0);

  return {
    url,
    wordCount: words,
    imageCount: images,
    headingCount: headings,
    avgParagraphLength: Math.round(avgParagraph),
    scanabilityScore: Math.max(0, scanability),
    notes: [
      avgParagraph > 80
        ? "Paragraphs are long; consider splitting them."
        : "Paragraph lengths look healthy.",
      images === 0
        ? "No images found; consider adding visuals."
        : "Has supporting images.",
      headings === 0
        ? "Missing headings; add subheads for scannability."
        : "Good heading structure.",
    ],
  };
}

/**
 * Emotion of content: Analyses a web page for content emotion
 */
async function emotionToneMapper(parameters: EmotionParameters) {
  const { url } = parameters;
  
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const text = $("h1, h2, h3, h4, h5, h6, p, button, a[role=button]")
    .map((_, el) => $(el).text())
    .get()
    .join(" ")
    .toLowerCase();

  const lex = {
    joy: ["love", "happy", "fun", "delight", "amazing"],
    urgency: ["now", "today", "limited", "hurry", "ends soon"],
    exclusivity: ["exclusive", "vip", "members", "premium", "invite"],
    reassurance: ["safe", "secure", "guaranteed", "trusted", "reliable"],
    fomo: ["don’t miss", "running out", "before it’s gone"],
  };

  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(lex))
    scores[k] = v.reduce(
      (a, term) => a + (text.split(term).length - 1),
      0
    );

  const dominant = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const tone =
    dominant[1] === 0 ? "neutral / informational" : dominant[0];

  return {
    url,
    dominantTone: tone,
    emotionScores: scores,
    notes:
      tone === "neutral / informational"
        ? ["No strong emotional language detected."]
        : [`Tone leans ${tone}.`],
  };
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
    sgcgreeting = `¡Hola, ${name}! ¿Cómo estás?`;
  } else if (selectedLanguage.toLowerCase() === 'french') {
    sgcgreeting = `Bonjour, ${name}! Comment ça va?`;
  } else { // Default to English
    sgcgreeting = `Hello, ${name}! How are you?`;
  }
  
  return {
    sgcgreeting,
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

// Register the tools using decorators with explicit parameter definitions
tool({
  name: 'contentDensityEvaluator',
  description: 'Analyses a web page for content density',
  parameters: [
    {
      name: 'url',
      type: ParameterType.String,
      description: 'URL to analyse',
      required: true
    },
  ]
})(contentDensityEvaluator);

// Register the tools using decorators with explicit parameter definitions
tool({
  name: 'emotionToneMapper',
  description: 'Analyses a web page for content density',
  parameters: [
    {
      name: 'url',
      type: ParameterType.String,
      description: 'URL to analyse',
      required: true
    },
  ]
})(emotionToneMapper);

// Register the tools using decorators with explicit parameter definitions
tool({
  name: 'sgcgreeting',
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
  name: 'sgctodays-date',
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
