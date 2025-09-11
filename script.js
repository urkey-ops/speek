// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
// NOTE: I have removed the key for security. Please insert your own valid API key below.
// const API_KEY = 'YOUR_API_KEY';

const callGeminiAPI = async (prompt) => {
  const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
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
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};

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

// New: This function will be called to get words from the AI
async function getAIWords(sentence, nextPartType, theme) {
    const prompt = `You are a helpful language model assistant. Given the partial sentence "${sentence}", please suggest a list of 5-7 words that could come next. The next word should be a "${nextPartType}". If there is a theme, like "${theme}", try to suggest words related to it. Respond with ONLY a comma-separated list of lowercase words, like "word1, word2, word3".`;

    try {
        const response = await callGeminiAPI(prompt);
        const text = findTextInResponse(response);
        if (text) {
            return text.split(',').map(word => ({ word: word.trim(), type: nextPartType, theme: theme }));
        }
    } catch (error) {
        console.error('Failed to get AI words:', error);
        return []; // Return empty array on failure
    }
    return [];
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
  }

  async init() {
    this._getElements();
    this._setupEventListeners();
    try {
      const response = await fetch('words.json');
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

  // --- NEW: Theme Selection ---
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
  
  // --- NEW: Level Management ---
  _startLevel() {
      this.state.sentencesCompletedAtLevel = 0;
      this._clearSentence();
      this._updateInstructionText();
  }

  _levelUp() {
      if (LEARNING_LEVELS[this.state.currentLevel + 1]) {
          this.state.currentLevel++;
          this._showMessage(`🌟 LEVEL UP! 🌟`, 'bg-success');
          setTimeout(() => this._startLevel(), 2000);
      } else {
          this._showMessage('Wow! You are a sentence master! 🎉', 'bg-success');
      }
  }

  // --- REWRITTEN: Contextual Word Logic using AI ---
  async _fetchNextWords() {
    const level = LEARNING_LEVELS[this.state.currentLevel];
    const nextPartIndex = this.state.sentenceWordsArray.length;
    const nextPart = level.structure[nextPartIndex];

    if (!nextPart) {
        this.state.wordBank = [];
        this._renderWordBank();
        return;
    }
    
    // Add loading indicator while fetching words
    this._showMessage('Thinking...', 'bg-info');
    
    const currentSentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    
    if (nextPart !== 'punctuation') {
        const aiWords = await getAIWords(currentSentence, nextPart, this.state.currentTheme);
        this.state.wordBank = aiWords;
    } else {
        this.state.wordBank = this.state.allWordsData.words.punctuation;
    }
    
    this._renderWordBank();
  }

  // --- MODIFIED: Render with Color-Coding ---
  _renderWordBank() {
    this.elements.wordBankContainer.innerHTML = '';
    const colorMap = this.state.allWordsData.typeColors;
    
    this.state.wordBank.forEach(wordObj => {
      const button = document.createElement('button');
      button.textContent = wordObj.word;
      button.dataset.type = wordObj.type;
      const colorClass = colorMap[wordObj.type] || colorMap['other'];
      button.className = `word-button squircle ${colorClass}-color`;
      this.elements.wordBankContainer.appendChild(button);
    });
  }

  // --- MODIFIED: This will now also auto-check the sentence ---
  _handleWordClick(wordElement) {
    const wordObj = {
        word: wordElement.textContent,
        type: wordElement.dataset.type
    };
    this.state.sentenceWordsArray.push(wordObj);
    this._renderSentence();
    
    if (wordObj.type === 'punctuation') {
      this._handleHighFiveClick();
    } else {
      this._fetchNextWords();
    }
  }
  
  // --- MODIFIED: Render Sentence with Colors ---
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
            span.className = `sentence-word ${colorClass}-color`;
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

  _goBack() {
    this.state.sentenceWordsArray.pop();
    this._renderSentence();
    this._fetchNextWords();
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

  // --- MODIFIED: High-Five now handles level progression with better flow ---
  async _handleHighFiveClick() {
    const sentenceText = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    const prompt = `You are a friendly teacher for a 6-year-old. The child wrote this sentence: "${sentenceText}". Is it a grammatically correct and complete sentence? Respond with ONLY "Correct" if it is. If not, give one very simple, encouraging hint for a first grader to fix it.`;
    
    try {
      this._showMessage("Checking...", 'bg-info');
      const response = await callGeminiAPI(prompt);
      const feedback = findTextInResponse(response).trim();
      
      if (feedback.toLowerCase().includes("correct")) {
        this._showMessage('Awesome! Great sentence! 🌟', 'bg-success');
        this.state.sentencesCompletedAtLevel++;

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
        this._showMessage(feedback, 'bg-info');
      }
    } catch (error) {
      this._showMessage('Could not check sentence. Try again!', 'bg-info');
    }
  }

  // --- MODIFIED: Instructions are now based on level goal ---
  _updateInstructionText() {
    const level = LEARNING_LEVELS[this.state.currentLevel];
    const remaining = level.threshold - this.state.sentencesCompletedAtLevel;
    const goalText = `${level.goal} (${remaining} more to level up!)`;
    this._showMessage(goalText, 'bg-info', 6000);
  }

  _showMessage(text, className, duration = 3000) {
    clearTimeout(this.messageTimeout);
    this.elements.messageBox.textContent = text;
    this.elements.messageBox.className = `message-box visible ${className}`;
    this.messageTimeout = setTimeout(() => {
      this.elements.messageBox.className = 'message-box';
    }, duration);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new SentenceBuilder();
  app.init();
});
