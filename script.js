// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

const apiCache = new Map();

// Helper function to find the text content in the API response,
// which can be nested.
function findTextInResponse(obj) {
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object' && obj !== null) {
    for (const key in obj) {
      const result = findTextInResponse(obj[key]);
      if (result) return result;
    }
  }
  return null;
}

// Helper function to make the API call with caching.
const callGeminiAPI = async (prompt) => {
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
  
  // Use a simple hash of the prompt as a cache key.
  const cacheKey = prompt; 

  // Check if the response is already in the cache.
  if (apiCache.has(cacheKey)) {
    return apiCache.get(cacheKey);
  }

  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${response.status} - ${errorData.error.message}`);
    }

    const data = await response.json();
    apiCache.set(cacheKey, data); // Store the response in the cache.
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};


// Scaffolding Levels Definition
const LEARNING_LEVELS = {
  1: {
    goal: "Let's make a simple sentence (like 'The dog runs').",
    structure: ['determiner', 'noun', 'verb', 'punctuation'],
    threshold: 3 // Sentences to complete before leveling up
  },
  2: {
    goal: "Great! Now let's add a describing word (like 'The big dog runs').",
    structure: ['determiner', 'adjective', 'noun', 'verb', 'punctuation'],
    threshold: 4
  },
  3: {
    goal: "Awesome! Let's say *where* it happened (like 'The dog runs in the park').",
    structure: ['determiner', 'noun', 'verb', 'preposition', 'determiner', 'noun', 'punctuation'],
    threshold: 5
  },
};

// This function will be called to get words from the AI
async function getAIWords(sentence, nextPartType, theme) {
  const prompt = `You are a helpful language model assistant. Given the partial sentence "${sentence}", please suggest a list of 5-7 words that could come next. The next word should be a "${nextPartType}". If there is a theme, like "${theme}", try to suggest words related to it. Respond with ONLY a comma-separated list of lowercase words, like "word1, word2, word3".`;

  try {
    const response = await callGeminiAPI(prompt);
    const text = findTextInResponse(response);

    // Robust check for valid words
    if (text) {
      const isValidResponse = text.trim().length > 0 && 
                              !text.includes('_') && 
                              !text.includes('Ea');

      if (isValidResponse) {
        return text.split(',').map(word => ({ word: word.trim(), type: nextPartType, theme: theme }));
      }
    }

  } catch (error) {
    console.error('Failed to get AI words:', error);
  }
  
  // Return a static, non-AI list of words if the AI fails
  // Use global app instance to access state safely
  const level = LEARNING_LEVELS[window.app.state.currentLevel];
  const fallbackType = level.structure[window.app.state.sentenceWordsArray.length];

  let fallbackWords = [];
  if (['determiner', 'preposition', 'punctuation'].includes(fallbackType)) {
      fallbackWords = window.app.state.allWordsData?.miscWords[fallbackType] || [];
  } else {
      fallbackWords = window.app.state.allWordsData?.words[fallbackType]?.[window.app.state.currentTheme] || [];
  }
  
  const randomWords = fallbackWords
    .sort(() => 0.5 - Math.random())
    .slice(0, 5)
    .map(word => ({ word: word.trim(), type: fallbackType, theme: window.app.state.currentTheme }));

  window.app._showMessage('Hmm, using fallback words for now!', 'bg-info');
  return randomWords;
}


class SentenceBuilder {
  constructor() {
    this.state = {
      allWordsData: null, // To store words.json
      sentenceWordsArray: [],
      wordBank: [],
      currentTheme: null,
      currentLevel: 1,
      sentencesCompletedAtLevel: 0,
    };
    this.elements = {};
    this.messageTimeout = null;
    this._getElements();
    this._setupEventListeners();
  }

  async init() {
    try {
      const response = await fetch('words.json');
      if (!response.ok) throw new Error('words.json not found');
      this.state.allWordsData = await response.json();
      this._renderThemeSelector();
    } catch (error) {
      console.error("Failed to load words.json:", error);
      this.elements.themeSelector.innerHTML = `<h1 class="text-2xl text-red-600">Error: Could not load word data.</h1>`;
    }
  }

  _getElements() {
    this.elements = {
      themeSelector: document.getElementById('themeSelector'),
      themeButtonsContainer: document.getElementById('themeButtonsContainer'),
      appContainer: document.getElementById('appContainer'),
      sentenceDisplay: document.getElementById('sentenceDisplay'),
      wordBankContainer: document.getElementById('wordBankContainer'),
      highFiveBtn: document.getElementById('highFiveBtn'),
      goBackBtn: document.getElementById('goBackBtn'),
      clearBtn: document.getElementById('clearBtn'),
      readAloudBtn: document.getElementById('readAloudBtn'),
      messageBox: document.getElementById('messageBox'),
      shuffleWordsBtn: document.getElementById('shuffleWordsBtn'),
      levelProgressText: document.getElementById('levelProgressText'),
      progressFill: document.getElementById('progressFill'),
    };
  }

  _setupEventListeners() {
    this.elements.wordBankContainer.addEventListener('click', (e) => {
      if (e.target.matches('.word-button')) this._handleWordClick(e.target);
    });
    this.elements.goBackBtn.addEventListener('click', () => this._goBack());
    this.elements.clearBtn.addEventListener('click', () => this._clearSentence());
    this.elements.readAloudBtn.addEventListener('click', () => this._readSentenceAloud());
    this.elements.highFiveBtn.addEventListener('click', () => this._handleHighFiveClick());
    this.elements.shuffleWordsBtn.addEventListener('click', () => this._fetchNextWords());
  }

  // --- Theme Selection ---
  _renderThemeSelector() {
    this.state.allWordsData.themes.forEach(theme => {
      const button = document.createElement('button');
      button.className = 'theme-button squircle';
      button.innerHTML = `<span class="emoji">${theme.emoji}</span>${theme.name}`;
      button.dataset.theme = theme.name;
      button.addEventListener('click', () => this._selectTheme(theme.name));
      this.elements.themeButtonsContainer.appendChild(button);
    });
  }

  _selectTheme(themeName) {
    this.state.currentTheme = themeName;
    this.elements.themeSelector.classList.add('hidden');
    this.elements.appContainer.classList.remove('hidden');
    this.elements.appContainer.classList.add('flex');
    this._startLevel();
  }

  // --- Level Management ---
  _startLevel() {
    this.state.sentencesCompletedAtLevel = 0;
    this._clearSentence();
    this._updateInstructionText();
  }

  _levelUp() {
    if (LEARNING_LEVELS[this.state.currentLevel + 1]) {
      this.state.currentLevel++;
      this._showMessage('🎉 LEVEL UP! 🎉', 'bg-success');
      setTimeout(() => this._startLevel(), 2000);
    } else {
      this._showMessage('Wow! You are a sentence master! 🏆', 'bg-success');
    }
  }

  // --- Contextual Word Logic using AI ---
  async _fetchNextWords() {
    const level = LEARNING_LEVELS[this.state.currentLevel];
    const nextPartIndex = this.state.sentenceWordsArray.length;
    const nextPart = level.structure[nextPartIndex];

    if (!nextPart) {
      this.state.wordBank = [];
      this._renderWordBank();
      return;
    }

    this._showMessage('Thinking...', 'bg-info');
    const currentSentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    
    let words;
    if (['determiner', 'preposition', 'punctuation'].includes(nextPart)) {
      words = this.state.allWordsData.miscWords[nextPart].map(word => ({ word: word, type: nextPart, theme: this.state.currentTheme }));
    } else {
      words = await getAIWords.call(this, currentSentence, nextPart, this.state.currentTheme);
    }

    this.state.wordBank = words;
    this._renderWordBank();
  }

  // --- Render with Color-Coding ---
  _renderWordBank() {
    const typeColors = {
      noun: 'noun-color',
      verb: 'verb-color',
      adjective: 'adjective-color',
      determiner: 'determiner-color',
      preposition: 'preposition-color',
      punctuation: 'punctuation-color',
      other: 'other-color'
    };

    if (!this.state.wordBank || this.state.wordBank.length === 0) {
      this.elements.wordBankContainer.innerHTML = `
        <p class="text-gray-600 italic text-center w-full">
          Oops! No words available. Try going back or refreshing.
        </p>`;
      this._hideMessage();
      return;
    }

    this.elements.wordBankContainer.innerHTML = this.state.wordBank.map(wordObj => {
      const colorClass = typeColors[wordObj.type] || 'other-color';
      return `<button class="word-button squircle ${colorClass}" data-type="${wordObj.type}" title="Theme: ${wordObj.theme}">
                ${wordObj.word}
              </button>`;
    }).join('');
  }

  _renderSentence() {
    const typeColors = {
      noun: 'noun-color',
      verb: 'verb-color',
      adjective: 'adjective-color',
      determiner: 'determiner-color',
      preposition: 'preposition-color',
      punctuation: 'punctuation-color',
      other: 'other-color'
    };

    this.elements.sentenceDisplay.innerHTML = this.state.sentenceWordsArray.map(wordObj => {
      const colorClass = typeColors[wordObj.type] || 'other-color';
      return `<span class="${colorClass}">${wordObj.word}</span>`;
    }).join(' ');
  }

  _updateInstructionText() {
    const levelInfo = LEARNING_LEVELS[this.state.currentLevel];
    this.elements.levelProgressText.textContent = `Level ${this.state.currentLevel}: ${levelInfo.goal}`;
    this._updateProgressBar();
  }

  _updateProgressBar() {
    const levelInfo = LEARNING_LEVELS[this.state.currentLevel];
    const progress = this.state.sentencesCompletedAtLevel / levelInfo.threshold;
    this.elements.progressFill.style.width = `${Math.min(progress, 1) * 100}%`;
  }

  // --- Event Handlers ---
  _handleWordClick(button) {
    const word = button.textContent.trim();
    const type = button.dataset.type;

    this.state.sentenceWordsArray.push({ word, type });
    this._renderSentence();

    // Clear message to avoid confusion
    this._hideMessage();

    if (this.state.sentenceWordsArray.length === LEARNING_LEVELS[this.state.currentLevel].structure.length) {
      this._showMessage('You have completed the sentence! Hit the High-Five! ✋', 'bg-info');
    } else {
      this._fetchNextWords();
    }
  }

  _goBack() {
    if (this.state.sentenceWordsArray.length > 0) {
      this.state.sentenceWordsArray.pop();
      this._renderSentence();
      this._fetchNextWords();
      this._hideMessage();
    }
  }

  _clearSentence() {
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this._fetchNextWords();
    this._hideMessage();
  }

  _readSentenceAloud() {
    const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    if (sentence.trim().length > 0) {
      speechSynthesis.speak(new SpeechSynthesisUtterance(sentence));
    } else {
      this._showMessage("Try building a sentence first!", "bg-warning");
    }
  }

  _handleHighFiveClick() {
    const expectedStructure = LEARNING_LEVELS[this.state.currentLevel].structure;
    const userStructure = this.state.sentenceWordsArray.map(w => w.type);

    if (userStructure.length !== expectedStructure.length) {
      this._showMessage("Your sentence is incomplete. Keep trying!", "bg-warning");
      return;
    }

    for (let i = 0; i < expectedStructure.length; i++) {
      if (userStructure[i] !== expectedStructure[i]) {
        this._showMessage(`Oops! The word "${this.state.sentenceWordsArray[i].word}" should be a "${expectedStructure[i]}".`, "bg-error");
        return;
      }
    }

    // All good!
    this.state.sentencesCompletedAtLevel++;
    const feedback = `Valid sentence! You have completed ${this.state.sentencesCompletedAtLevel} of ${LEARNING_LEVELS[this.state.currentLevel].threshold} sentences at this level.`;
    this._showMessage(feedback, 'bg-success');
    speechSynthesis.speak(new SpeechSynthesisUtterance("Awesome! Great sentence!"));

    if (this.state.sentencesCompletedAtLevel >= LEARNING_LEVELS[this.state.currentLevel].threshold) {
      this._levelUp();
    } else {
      this._clearSentence();
    }
  }

  // --- Messaging Helpers ---
  _showMessage(msg, cssClass = 'bg-info') {
    clearTimeout(this.messageTimeout);
    this.elements.messageBox.textContent = msg;
    this.elements.messageBox.className = `message-box ${cssClass}`;
    this.elements.messageBox.style.display = 'block';

    // Auto-hide after 5 seconds except for success (keep longer)
    const hideAfter = cssClass === 'bg-success' ? 7000 : 5000;
    this.messageTimeout = setTimeout(() => this._hideMessage(), hideAfter);
  }

  _hideMessage() {
    this.elements.messageBox.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new SentenceBuilder();
  window.app = app; // Make globally accessible for fallback
  app.init();
});
