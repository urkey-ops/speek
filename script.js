// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';



// Constant for the API endpoint URL.
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

// Load external words data. This is the first line of defense.
fetch('words.json')
  .then(response => response.json())
  .then(data => {
    window.sentenceData = data;
    const app = new SentenceBuilder();
    app.init();
  })
  .catch(err => {
    // Crucial fail-safe: if the local word bank can't load, the app doesn't start.
    // This prevents a broken experience from the get-go.
    console.error('Failed to load words.json. Application cannot start.', err);
    document.body.innerHTML = '<div class="flex items-center justify-center h-screen"><p class="text-xl text-red-500">Error: Could not load the word bank. Please try again later.</p></div>';
  });

class SentenceBuilder {
  constructor() {
    this.constants = {
      themes: [],
      typeColors: {},
      grammarTips: {},
      wordCollections: {},
      nextWordRules: {},
      successMessages: []
    };

    this.state = {
      sentenceWordsArray: [],
      sentenceHistory: [],
      isReducedFeedbackMode: false,
      successCounter: 0,
      lastFetchId: 0,
      fetchAbortController: null,
      hasSubject: false,
      hasVerb: false,
      currentTheme: null,
    };

    // Cache DOM elements
    this.elements = {
      sentenceArea: document.getElementById('sentence-area'),
      messageBox: document.getElementById('message-box'),
      celebrationContainer: document.getElementById('celebration-section'),
      sentencesCounter: document.getElementById('sentences-built-counter'),
      highFiveBtn: document.getElementById('high-five-btn'),
      wordBankMsgBox: document.getElementById('word-bank-message-box'),
      instructionText: document.getElementById('instruction-text'),
      dynamicWordBank: document.getElementById('dynamic-word-bank'),
      wordButtonsContainer: document.getElementById('word-buttons-container'),
      punctuatonButtonsContainer: document.getElementById('punctuation-buttons'),
      shuffleBtn: document.getElementById('shuffle-btn'),
      readAloudBtn: document.getElementById('read-aloud-btn'),
      clearBtn: document.getElementById('clear-btn'),
      goBackBtn: document.getElementById('go-back-btn'),
      exclamationBtn: document.getElementById('exclamation-btn'),
      questionBtn: document.getElementById('question-btn'),
      feedbackToggle: document.getElementById('reduced-feedback-toggle'),
      themeIcon: document.getElementById('theme-icon'),
    };

    this.debouncedFetchNextWords = this.debounce(this._fetchNextWords, 500);
  }

  init() {
    this._parseConstants();
    this._attachEventListeners();
    this._renderSentence();
    this.debouncedFetchNextWords();
    this._loadState();
  }

  _parseConstants() {
    const data = window.sentenceData;
    this.constants.themes = data.themes;
    this.constants.typeColors = data.typeColors;
    this.constants.grammarTips = data.grammarTips;
    this.constants.wordCollections = data.wordCollections;
    this.constants.nextWordRules = data.nextWordRules;
    this.constants.successMessages = data.successMessages;
  }

  _attachEventListeners() {
    this.elements.wordButtonsContainer.addEventListener('click', this._handleWordButtonClick.bind(this));
    this.elements.punctuatonButtonsContainer.addEventListener('click', this._handlePunctuationButtonClick.bind(this));
    this.elements.shuffleBtn.addEventListener('click', () => {
      this._showMessage('Shuffling words...', 'info');
      this.debouncedFetchNextWords();
    });
    this.elements.goBackBtn.addEventListener('click', this._goBack.bind(this));
    this.elements.readAloudBtn.addEventListener('click', this._readSentenceAloud.bind(this));
    this.elements.clearBtn.addEventListener('click', this._clearSentence.bind(this));
    this.elements.highFiveBtn.addEventListener('click', this._completeSentence.bind(this));
    this.elements.feedbackToggle.addEventListener('change', this._handleReducedFeedbackToggle.bind(this));
  }

  _loadState() {
    const reducedFeedbackMode = localStorage.getItem('reducedFeedbackMode');
    this.state.isReducedFeedbackMode = reducedFeedbackMode === 'true';
    this.elements.feedbackToggle.checked = this.state.isReducedFeedbackMode;
  }

  _handleWordButtonClick(event) {
    const button = event.target.closest('.word-button');
    if (!button) return;
    const word = button.dataset.word;
    const type = button.dataset.type;
    const isGeminiFetched = button.dataset.isGeminiFetched === 'true';

    this.state.sentenceWordsArray.push({ word, type, isGeminiFetched });
    this._saveState();
    this._renderSentence();
    this.debouncedFetchNextWords();
    this._updateInstructionText();
    if (!this.state.isReducedFeedbackMode) {
      this._showGrammarTip();
    }
  }

  _handlePunctuationButtonClick(event) {
    const button = event.target.closest('.punctuation-button');
    if (!button || button.disabled) return;
    const punctuation = button.dataset.punctuation;
    this.state.sentenceWordsArray.push({ word: punctuation, type: 'punctuation' });
    this._saveState();
    this._renderSentence();
    this._completeSentence();
  }

  _renderSentence() {
    this.elements.sentenceArea.innerHTML = '';
    if (this.state.sentenceWordsArray.length === 0) {
      const span = document.createElement('span');
      span.className = 'text-xl sm:text-2xl text-gray-400';
      span.textContent = "Let's build a sentence!";
      this.elements.sentenceArea.appendChild(span);
    } else {
      this.state.sentenceWordsArray.forEach(w => {
        const span = document.createElement('span');
        const color = this.constants.typeColors[w.type] || '#6B7280';
        span.className = `sentence-word`;
        span.style.backgroundColor = color;
        span.style.color = 'white';
        span.textContent = w.word;
        if (w.isGeminiFetched) {
          span.classList.add('gemini-word');
          span.innerHTML = `${w.word} <span class="gemini-icon">✨</span>`;
        }
        this.elements.sentenceArea.appendChild(span);
      });
    }

    this._updatePunctuationButtons();
    this._updateButtonStates();
  }

  _renderWordBank(words) {
    this.elements.wordButtonsContainer.innerHTML = '';
    if (words.length === 0) {
      this._showMessage('No words found. Try shuffling or clearing the sentence.', 'warning');
    }

    words.forEach(wordObj => {
      const button = document.createElement('button');
      const color = this.constants.typeColors[wordObj.type] || '#9CA3AF';
      button.className = `base-button word-button round active:scale-105 active:shadow-lg`;
      button.style.backgroundColor = color;
      button.style.color = 'white';
      button.dataset.word = wordObj.word;
      button.dataset.type = wordObj.type;
      button.dataset.isGeminiFetched = wordObj.isGeminiFetched || false;
      button.textContent = wordObj.word;

      if (wordObj.isGeminiFetched) {
        button.classList.add('gemini-word-button');
      }

      this.elements.wordButtonsContainer.appendChild(button);
    });
    this._showLoadingIndicator(false);
  }

  _updatePunctuationButtons() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const enablePunctuation = lastWord && lastWord.type !== 'punctuation' && this.state.hasSubject && this.state.hasVerb;
    this.elements.exclamationBtn.disabled = !enablePunctuation;
    this.elements.questionBtn.disabled = !enablePunctuation;
  }

  _updateButtonStates() {
    this.elements.goBackBtn.disabled = this.state.sentenceWordsArray.length === 0;
    this.elements.clearBtn.disabled = this.state.sentenceWordsArray.length === 0;
    this.elements.readAloudBtn.disabled = this.state.sentenceWordsArray.length === 0;
  }

  _goBack() {
    this.state.sentenceWordsArray.pop();
    this._renderSentence();
    this.debouncedFetchNextWords();
    this._updateInstructionText();
    this._showMessage('Went back one step.', 'info');
  }

  _clearSentence() {
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this.state.sentenceHistory = [];
    this.state.hasSubject = false;
    this.state.hasVerb = false;
    this.state.successCounter = 0;
    this.elements.sentencesCounter.textContent = this.state.successCounter;
    this.debouncedFetchNextWords();
    this._updateInstructionText();
    this._showMessage('Sentence cleared.', 'info');
  }

  _completeSentence() {
    this.state.successCounter++;
    this.elements.sentencesCounter.textContent = this.state.successCounter;
    this._saveState();
    this._showCelebration();
    this.state.hasSubject = false;
    this.state.hasVerb = false;
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this._updateInstructionText();
    this.debouncedFetchNextWords();
  }

  _fetchNextWords() {
    if (this.state.fetchAbortController) {
      this.state.fetchAbortController.abort();
    }
    this.state.fetchAbortController = new AbortController();
    const signal = this.state.fetchAbortController.signal;
    this.state.lastFetchId++;
    const fetchId = this.state.lastFetchId;

    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const sentenceLength = this.state.sentenceWordsArray.length;
    const currentTheme = this.state.currentTheme;

    let possibleTypes = this.constants.nextWordRules['start'];
    if (lastWord) {
      if (this.constants.nextWordRules[lastWord.type]) {
        possibleTypes = this.constants.nextWordRules[lastWord.type];
      } else {
        possibleTypes = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction'];
      }
    }

    // Determine if subject and verb are present to guide the next word type
    this.state.hasSubject = this.state.hasSubject || (lastWord && ['noun', 'pronoun'].includes(lastWord.type));
    this.state.hasVerb = this.state.hasVerb || (lastWord && lastWord.type === 'verb');

    if (sentenceLength >= 1) {
      if (!this.state.hasSubject) {
        possibleTypes = possibleTypes.filter(type => ['noun', 'pronoun'].includes(type));
        if (possibleTypes.length === 0) {
          possibleTypes = ['noun', 'pronoun'];
        }
      } else if (!this.state.hasVerb) {
        possibleTypes = possibleTypes.filter(type => ['verb'].includes(type));
        if (possibleTypes.length === 0) {
          possibleTypes = ['verb'];
        }
      }
    }

    const availableWords = possibleTypes.flatMap(type =>
      this.constants.wordCollections[type]
        .filter(w => !w.theme || w.theme === currentTheme)
        .map(w => ({ ...w, type, source: 'predefined' }))
    );

    const neededWordsCount = 10 - availableWords.length;
    let wordsToRender = [...availableWords];
    this._renderWordBank(wordsToRender);

    if (neededWordsCount > 0) {
      this._showLoadingIndicator(true);
      const randomType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
      const prompt = this._createGeminiPrompt(randomType);
      
      this._fetchWordsFromGemini(prompt, signal)
        .then(geminiWords => {
          if (fetchId !== this.state.lastFetchId) return; // Ignore stale fetches
          const newWords = geminiWords.map(w => ({ word: w, type: randomType, isGeminiFetched: true }));
          wordsToRender = [...availableWords, ...newWords].sort(() => 0.5 - Math.random());
          this._renderWordBank(wordsToRender);
        })
        .catch(error => {
          if (error.name === 'AbortError') {
            console.log('Fetch aborted.');
            return;
          }
          console.error('Gemini API call failed:', error);
          this._showLoadingIndicator(false);
          this._showMessage('Could not fetch new words from Gemini. Using pre-defined words.', 'error');
          this._renderWordBank(availableWords);
        });
    } else {
      wordsToRender = wordsToRender.sort(() => 0.5 - Math.random());
      this._renderWordBank(wordsToRender);
    }
  }
  
  _createGeminiPrompt(wordType) {
    let prompt;
    switch(wordType) {
        case 'noun':
            prompt = "Generate a JSON array of 5 common, simple nouns, with each word being a single string. Example: [\"dog\", \"cat\", \"house\"].";
            break;
        case 'verb':
            prompt = "Generate a JSON array of 5 common, simple verbs (in present tense), with each word being a single string. Example: [\"run\", \"jump\", \"eat\"].";
            break;
        case 'adjective':
            prompt = "Generate a JSON array of 5 common, simple adjectives, with each word being a single string. Example: [\"happy\", \"sad\", \"big\"].";
            break;
        case 'adverb':
            prompt = "Generate a JSON array of 5 common, simple adverbs ending in '-ly', with each word being a single string. Example: [\"quickly\", \"slowly\", \"happily\"].";
            break;
        default:
            prompt = `Generate a JSON array of 5 simple ${wordType}s, with each word being a single string. Example: [\"word1\", \"word2\", \"word3\"].`;
            break;
    }
    return prompt;
  }

  async _fetchWordsFromGemini(prompt, signal) {
    const payload = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "STRING"
          }
        }
      }
    };
  
    try {
      const response = await fetch(GEMINI_API_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: signal,
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const result = await response.json();
      const json = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (json) {
        return JSON.parse(json);
      } else {
        throw new Error('No content returned from API.');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('Error fetching from Gemini API:', error);
      throw error;
    }
  }


  _readSentenceAloud() {
    const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    if (!sentence) return;
    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = 'en-US';
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }

  _handleReducedFeedbackToggle() {
    this.state.isReducedFeedbackMode = this.elements.feedbackToggle.checked;
    localStorage.setItem('reducedFeedbackMode', this.state.isReducedFeedbackMode);
  }

  _showGrammarTip() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const type = lastWord ? lastWord.type : 'other';
    const tip = this.constants.grammarTips[type] || "This word helps connect other words!";
    this._showMessage(tip, 'info');
  }

  _showMessage(message, type = 'info') {
    const box = this.elements.wordBankMsgBox;
    box.textContent = message;
    box.className = `message-box visible text-center p-3 rounded-lg w-full text-white ${type === 'info' ? 'bg-indigo-500' : type === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`;
    setTimeout(() => {
      box.classList.remove('visible');
    }, 2000);
  }

  _showLoadingIndicator(show) {
    if (show) {
      this.elements.wordButtonsContainer.innerHTML = '<div class="text-center text-xl text-gray-400">Loading new words...</div>';
      this.elements.shuffleBtn.disabled = true;
    } else {
      this.elements.shuffleBtn.disabled = false;
    }
  }

  _updateInstructionText() {
    const instruction = this.state.hasSubject && this.state.hasVerb
      ? 'Great! Now finish your sentence.'
      : this.state.sentenceWordsArray.length === 0
        ? 'Pick a word to start your sentence!'
        : 'Keep going!';
    this.elements.instructionText.textContent = instruction;
  }

  _showCelebration() {
    const randomIndex = Math.floor(Math.random() * this.constants.successMessages.length);
    const message = this.constants.successMessages[randomIndex];
    this._showMessage(message, 'info');
  }

  // Utility functions
  _saveState() {
    this.state.sentenceHistory.push([...this.state.sentenceWordsArray]);
  }

  /**
   * Debounce utility function. Ensures a function is only called after a
   * certain period of inactivity. This prevents API bombardment.
   * @param {Function} func The function to debounce.
   * @param {number} delay The delay in milliseconds.
   * @returns {Function} The debounced function.
   */
  debounce(func, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  }
}

