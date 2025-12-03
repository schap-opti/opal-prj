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
interface SentimentParameters {
  text: string;
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

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Discovery endpoint: http://localhost:${PORT}/discovery`);
});
