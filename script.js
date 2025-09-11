// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// A simple cache to store API responses
const apiCache = new Map();

// Helper function to find the text content in the API response,
// which can be nested.
function findTextInResponse(obj) {
  const stack = [obj];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      return current;
    }
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i]);
      }
    } else if (typeof current === 'object' && current !== null) {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          stack.push(current[key]);
        }
      }
    }
  }
  return null;
}

// Helper function to make the API call with caching.
const callGeminiAPI = async (prompt) => {
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
  
  const cacheKey = prompt; 
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
    apiCache.set(cacheKey, data); 
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};


// Scaffolding Levels Definition
const LEARNING_LEVELS = {
  1: {
    goal: "Let's make a simple sentence!",
    structure: ['determiner', 'noun', 'verb', 'punctuation'],
    threshold: 3 // Sentences to complete before leveling up
  },
  2: {
    goal: "Now let's add a describing word!",
    structure: ['determiner', 'adjective', 'noun', 'verb', 'punctuation'],
    threshold: 4
  },
  3: {
    goal: "Time to say *where* it happened!",
    structure: ['determiner', 'noun', 'verb', 'preposition', 'determiner', 'noun', 'punctuation'],
    threshold: 5
  },
};

// --- NEW: Gets words from either AI or a local fallback ---
async function _getWords(sentence, nextPartType, theme, allWordsData) {
    // Try to get words from the AI
    try {
        let prompt;
        if (nextPartType === 'verb') {
            // New prompt explicitly asking for present tense verbs
            prompt = `You are a helpful language model assistant. Given the partial sentence "${sentence}", please suggest a list of 4 words that could come next. The next word should be a "${nextPartType}". Please suggest simple verbs in the present tense only (like "runs", "eats", "jumps", etc.). If there is a theme, like "${theme}", try to suggest words related to it. Respond with ONLY a comma-separated list of lowercase words, like "word1, word2, word3, word4".`;
        } else {
            prompt = `You are a helpful language model assistant. Given the partial sentence "${sentence}", please suggest a list of 4 words that could come next. The next word should be a "${nextPartType}". If there is a theme, like "${theme}", try to suggest words related to it. Respond with ONLY a comma-separated list of lowercase words, like "word1, word2, word3, word4".`;
        }
        
        const response = await callGeminiAPI(prompt);
        const text = findTextInResponse(response);
        if (text) {
            const aiWords = text.split(',').map(word => ({ word: word.trim(), type: nextPartType }));
            if (aiWords.length > 0) {
                return aiWords.filter(word => word.word.length > 0);
            }
        }
    } catch (error) {
        // Fallback to local words if API call fails
        console.error("Falling back to local words due to API error:", error);
    }
    
    // Fallback to local words
    const localWords = allWordsData.words[nextPartType] || [];
    const fallbackWords = localWords.map(word => ({ word: word, type: nextPartType }));
    
    // Shuffle and pick 4 words from the fallback list
    const shuffled = fallbackWords.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 4);
}


class SentenceBuilder {
  constructor() {
    this.state = {
      allWordsData: null, 
      sentenceWordsArray: [],
      wordBank: [],
      currentTheme: null,
      currentLevel: 1,
      sentencesCompletedAtLevel: 0,
    };
    this.elements = {};
    this.messageTimeout = null;
  }

  async init() {
    this._getElements();
    this._setupEventListeners();
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
      readAloudBtn: document.getElementById('readAloudBtn'),
      messageBox: document.getElementById('messageBox'),
      levelProgressText: document.getElementById('levelProgressText'),
      progressFill: document.getElementById('progressFill'),
    };
  }

  _setupEventListeners() {
    this.elements.wordBankContainer.addEventListener('click', (e) => {
      if (e.target.matches('.word-button')) this._handleWordClick(e.target);
    });
    this.elements.readAloudBtn.addEventListener('click', () => this._readSentenceAloud());
    this.elements.highFiveBtn.addEventListener('click', () => this._handleHighFiveClick());
  }

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

    const wordsToDisplay = await _getWords(currentSentence, nextPart, this.state.currentTheme, this.state.allWordsData);
    
    // Check if a fallback was used
    const usingFallback = wordsToDisplay.some(word => word.word && this.state.allWordsData.words[word.type] && this.state.allWordsData.words[word.type].includes(word.word));
    if (usingFallback) {
        this._showMessage("Using backup words to keep playing! 👍", 'bg-info', 3000);
    }

    this.state.wordBank = wordsToDisplay;
    this._renderWordBank();
  }

  _renderWordBank() {
    this.elements.wordBankContainer.innerHTML = '';
    const colorMap = this.state.allWordsData.typeColors;
    
    const sortedWords = [...this.state.wordBank].sort((a, b) => a.word.localeCompare(b.word));

    sortedWords.forEach(wordObj => {
      const button = document.createElement('button');
      button.textContent = wordObj.word;
      button.dataset.type = wordObj.type;
      const colorClass = colorMap[wordObj.type] || colorMap['other'];
      button.className = `word-button squircle ${colorClass}-color fade-in`; 
      this.elements.wordBankContainer.appendChild(button);
    });
    this._hideMessage();
  }
  
  _handleWordClick(wordElement) {
    const level = LEARNING_LEVELS[this.state.currentLevel];
    const nextPartIndex = this.state.sentenceWordsArray.length;
    const expectedType = level.structure[nextPartIndex];
    const selectedType = wordElement.dataset.type;

    if (selectedType !== expectedType) {
        this._showMessage("Oops, that doesn't fit! Try a different one.", 'bg-warning');
        return;
    }

    const wordObj = {
      word: wordElement.textContent,
      type: selectedType
    };
    this.state.sentenceWordsArray.push(wordObj);
    this._renderSentence();

    if (wordObj.type === 'punctuation') {
      this._handleHighFiveClick();
    } else {
      this._fetchNextWords();
    }
  }

  _renderSentence() {
    this.elements.sentenceDisplay.innerHTML = '';
    const colorMap = this.state.allWordsData.typeColors;

    if (this.state.sentenceWordsArray.length === 0) {
      this.elements.sentenceDisplay.innerHTML = '<span class="placeholder-text">Click a word below to begin...</span>';
    } else {
      this.state.sentenceWordsArray.forEach((wordObj, index) => {
        const span = document.createElement('span');
        span.textContent = wordObj.word;
        const colorClass = colorMap[wordObj.type] || colorMap['other'];
        span.className = `sentence-word ${colorClass}-color fade-in`;
        this.elements.sentenceDisplay.appendChild(span);

        if (index < this.state.sentenceWordsArray.length - 1 && this.state.sentenceWordsArray[index+1].type !== 'punctuation') {
          this.elements.sentenceDisplay.appendChild(document.createTextNode(' '));
        }
      });
    }
    this._renderHighFiveButton();
  }

  _renderHighFiveButton() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const isComplete = lastWord && lastWord.type === 'punctuation';
    this.elements.highFiveBtn.disabled = !isComplete;
  }

  _readSentenceAloud() {
    const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    if (sentence.length > 0) {
      speechSynthesis.speak(new SpeechSynthesisUtterance(sentence));
    }
  }

  _clearSentence() {
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this._fetchNextWords();
  }

  async _handleHighFiveClick() {
    const sentenceText = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    const prompt = `Is "${sentenceText}" a grammatically complete sentence? Respond with only "VALID" or "INVALID".`;
    
    try {
        this._showMessage("Checking...", 'bg-info');
        const response = await callGeminiAPI(prompt);
        const feedback = findTextInResponse(response).trim();
        
        if (feedback.toLowerCase().includes("valid")) {
            this._showMessage('Awesome! You made a great sentence! 🎉', 'bg-success');
            this.state.sentencesCompletedAtLevel++;
            this._updateInstructionText();

            setTimeout(() => {
                const level = LEARNING_LEVELS[this.state.currentLevel];
                if (this.state.sentencesCompletedAtLevel >= level.threshold) {
                    this._levelUp();
                } else {
                    this._clearSentence();
                    this._updateInstructionText();
                }
            }, 2000); 

        } else {
            const hintPrompt = `The sentence is "${sentenceText}". Give a very simple, encouraging hint for a first grader to fix it.`;
            const hintResponse = await callGeminiAPI(hintPrompt);
            const hint = findTextInResponse(hintResponse).trim();
            this._showMessage(hint, 'bg-warning');
        }
    } catch (error) {
        this._showMessage('Could not check sentence. Try again!', 'bg-warning');
    }
  }

  _updateInstructionText() {
    const level = LEARNING_LEVELS[this.state.currentLevel];
    this.elements.levelProgressText.textContent = level.goal;
    
    const percentage = (this.state.sentencesCompletedAtLevel / level.threshold) * 100;
    this.elements.progressFill.style.width = `${percentage}%`;
  }

  _showMessage(text, className, duration = 3000) {
    clearTimeout(this.messageTimeout);
    this.elements.messageBox.textContent = text;
    this.elements.messageBox.className = `message-box visible ${className}`;
    this.messageTimeout = setTimeout(() => {
      this._hideMessage();
    }, duration);
  }

  _hideMessage() {
    this.elements.messageBox.className = 'message-box';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new SentenceBuilder();
  app.init();
});
