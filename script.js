// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';


// ⚠️ IMPORTANT: In a real-world application, never hardcode your API key like this.
// Use a server-side proxy or environment variables to protect it from public access.
// const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';

// Constant for the API endpoint URL.
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

class SentenceBuilder {
  constructor(wordsData) {
    this.wordsData = wordsData;
    this.state = {
      sentenceWordsArray: [],
      wordBank: [],
      sentenceHistory: [],
      hasSubject: false,
      hasVerb: false,
      currentTheme: this.wordsData.themes[Math.floor(Math.random() * this.wordsData.themes.length)],
      isReducedFeedbackMode: localStorage.getItem('reducedFeedbackMode') === 'true',
    };
    this.constants = {
      // These are success messages used when a sentence is completed
      successMessages: [
        'Awesome job!',
        'You’re a word wizard!',
        'Sentence complete!',
        'Nailed it!',
        'That’s a masterpiece!',
        'Keep up the great work!',
      ],
      // This maps the Gemini API response categories to the app's word types
      geminiToAppTypes: {
        'noun_phrases': 'noun',
        'adjective_phrases': 'adjective',
        'adverb_phrases': 'adverb',
        'verb_phrases': 'verb',
        'preposition_phrases': 'preposition',
        'conjunction_phrases': 'conjunction',
        'punctuation_phrases': 'punctuation',
        'pronoun_phrases': 'pronoun',
        'determiner_phrases': 'determiner',
      },
    };
    this.elements = {};
    this.debouncedFetchNextWords = this._debounce(this._fetchNextWords, 500);
  }

  init() {
    this._cacheDomElements();
    this._addEventListeners();
    this._initializeState();
  }

  // --- Core Application Logic ---

  _initializeState() {
    // Set initial UI states
    this.elements.themeIcon.textContent = this.state.currentTheme.emoji;
    this.elements.reducedFeedbackToggle.checked = this.state.isReducedFeedbackMode;
    this._updateInstructionText();
    this._renderWordBank();
  }

  _addWordToSentence(word, type) {
    this.state.sentenceWordsArray.push({ word, type });
    this._saveState();
    this._checkGrammar(type);
    this._renderSentence();
    this._clearWordBank();
    this.debouncedFetchNextWords();
    this._updateInstructionText();
  }

  _removeLastWord() {
    this.state.sentenceWordsArray.pop();
    this.state.sentenceHistory.pop();
    this._updateSentenceState();
    this._renderSentence();
    this._renderWordBank();
    this._updateInstructionText();
  }

  _clearSentence() {
    this.state.sentenceWordsArray = [];
    this.state.sentenceHistory = [];
    this._updateSentenceState();
    this._renderSentence();
    this._renderWordBank();
    this._updateInstructionText();
  }

  _checkGrammar(wordType) {
    if (!this.state.hasSubject && ['noun', 'pronoun'].includes(wordType)) {
      this.state.hasSubject = true;
    }
    if (!this.state.hasVerb && wordType === 'verb') {
      this.state.hasVerb = true;
    }
  }

  _updateSentenceState() {
    const sentence = this.state.sentenceWordsArray;
    this.state.hasSubject = sentence.some(word => ['noun', 'pronoun'].includes(word.type));
    this.state.hasVerb = sentence.some(word => word.type === 'verb');
  }

  _completeSentence() {
    if (!this.state.isReducedFeedbackMode) {
      this._showCelebration();
    }
    this._clearSentence();
  }

  // --- API & Data Handling ---

  _fetchNextWords() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const lastWordType = lastWord ? lastWord.type : 'start';
    const possibleTypes = this.wordsData.nextWordRules[lastWordType] || [];

    if (this._isSentenceComplete()) {
      this.state.wordBank = this.wordsData.punctuation.filter(p => ['.', '!', '?'].includes(p.word));
      this._renderWordBank();
      return;
    }

    let localWords = [];
    for (const type of possibleTypes) {
      if (this.wordsData.words[type]) {
        localWords.push(...this.wordsData.words[type]);
      }
    }

    localWords = this._shuffleArray(localWords).slice(0, 10);
    this.state.wordBank = localWords;
    this._renderWordBank();

    this._fetchWordsFromGemini(lastWord ? lastWord.word : null);
  }

  async _fetchWordsFromGemini(lastWord) {
    this._showLoadingIndicator(true);

    const prompt = `
      You are a creative writing assistant. Given the last word of a sentence, suggest 10 to 15 different words or short phrases that could grammatically and contextually follow it.
      Return the response as a JSON array of objects. Each object should have 'word' and 'type' keys.
      The possible 'type' values are: noun, verb, adjective, adverb, preposition, conjunction, determiner, pronoun, punctuation.
      
      Example of expected output:
      [
        { "word": "the", "type": "determiner" },
        { "word": "a", "type": "determiner" },
        { "word": "big", "type": "adjective" }
      ]

      The last word in the sentence is "${lastWord || 'START_OF_SENTENCE'}" in a sentence about ${this.state.currentTheme.name}.
    `;

    try {
      const response = await fetch(GEMINI_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Gemini API error! Status: ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      const jsonMatch = textResponse.match(/```json\n([\s\S]*?)\n```/);
      const jsonContent = jsonMatch ? jsonMatch[1] : textResponse;
      
      const newWords = JSON.parse(jsonContent).map(wordObj => ({
        ...wordObj,
        isGemini: true
      }));

      // Merge new words and remove duplicates
      const uniqueWords = this.state.wordBank.reduce((acc, current) => {
        if (!acc.some(item => item.word === current.word)) {
          acc.push(current);
        }
        return acc;
      }, newWords);

      this.state.wordBank = this._shuffleArray(uniqueWords);
      this._renderWordBank();
    } catch (error) {
      console.error('Error fetching words from Gemini:', error);
      this._showLoadingIndicator(false);
      if (!this.state.isReducedFeedbackMode) {
        this._showMessage('Failed to get new words from Gemini. Please try again.', 'error');
      }
      this._renderWordBank();
    }
  }

  _isSentenceComplete() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    return this.state.hasSubject && this.state.hasVerb && lastWord && lastWord.type === 'punctuation';
  }

  // --- UI Rendering & Event Handling ---

  _cacheDomElements() {
    this.elements.wordButtonsContainer = document.getElementById('word-buttons-container');
    this.elements.sentenceWordsContainer = document.getElementById('sentence-words-container');
    this.elements.clearBtn = document.getElementById('clear-btn');
    this.elements.goBackBtn = document.getElementById('go-back-btn');
    this.elements.readAloudBtn = document.getElementById('read-aloud-btn');
    this.elements.highFiveBtn = document.getElementById('high-five-btn');
    this.elements.themeIcon = document.getElementById('theme-icon');
    this.elements.instructionText = document.getElementById('instruction-text');
    this.elements.reducedFeedbackToggle = document.getElementById('reduced-feedback-toggle');
    this.elements.messageBox = document.getElementById('message-box');
  }

  _addEventListeners() {
    this.elements.wordButtonsContainer.addEventListener('click', this._handleWordButtonClick.bind(this));
    this.elements.clearBtn.addEventListener('click', this._clearSentence.bind(this));
    this.elements.goBackBtn.addEventListener('click', this._removeLastWord.bind(this));
    this.elements.readAloudBtn.addEventListener('click', this._readSentenceAloud.bind(this));
    this.elements.highFiveBtn.addEventListener('click', this._completeSentence.bind(this));
    this.elements.reducedFeedbackToggle.addEventListener('change', this._toggleReducedFeedback.bind(this));
    window.addEventListener('keydown', this._handleKeyboardShortcut.bind(this));
  }

  _handleWordButtonClick(event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;

    const { word, type } = button.dataset;
    this._addWordToSentence(word, type);
  }

  _handleKeyboardShortcut(event) {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'z':
          event.preventDefault();
          this._removeLastWord();
          break;
        case 'Backspace':
          event.preventDefault();
          this._removeLastWord();
          break;
      }
    } else if (event.key === 'Enter') {
      this._completeSentence();
    }
  }

  _readSentenceAloud() {
    const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      window.speechSynthesis.speak(utterance);
    } else {
      this._showMessage('Speech synthesis is not supported in this browser.', 'error');
    }
  }

  _renderSentence() {
    this.elements.sentenceWordsContainer.innerHTML = '';
    if (this.state.sentenceWordsArray.length === 0) {
      this.elements.sentenceWordsContainer.innerHTML = '<div id="placeholder" class="text-gray-400 italic">Start building your sentence here!</div>';
    } else {
      this.state.sentenceWordsArray.forEach(wordObj => {
        const wordEl = document.createElement('div');
        const colorClass = this.wordsData.typeColors[wordObj.type] || this.wordsData.typeColors.other;
        wordEl.className = `sentence-word ${colorClass} ${wordObj.isGemini ? 'gemini-word' : ''}`;
        wordEl.textContent = wordObj.word;
        this.elements.sentenceWordsContainer.appendChild(wordEl);
      });
    }
  }

  _renderWordBank() {
    this.elements.wordButtonsContainer.innerHTML = '';
    this.state.wordBank.forEach(wordObj => {
      const button = document.createElement('button');
      const colorClass = this.wordsData.typeColors[wordObj.type] || this.wordsData.typeColors.other;
      const punctuationClass = wordObj.type === 'punctuation' ? 'punctuation-button' : '';
      const geminiClass = wordObj.isGemini ? 'gemini-word' : '';
      button.className = `base-button word-button round ${colorClass} ${punctuationClass} ${geminiClass}`;
      button.dataset.word = wordObj.word;
      button.dataset.type = wordObj.type;
      button.textContent = wordObj.word;
      this.elements.wordButtonsContainer.appendChild(button);
    });

    if (this.state.wordBank.length === 0) {
      this.elements.wordButtonsContainer.innerHTML = '<div class="text-center text-xl text-gray-400">No words available.</div>';
    }
  }

  _clearWordBank() {
    this.elements.wordButtonsContainer.innerHTML = '';
  }

  _toggleReducedFeedback() {
    this.state.isReducedFeedbackMode = this.elements.reducedFeedbackToggle.checked;
    localStorage.setItem('reducedFeedbackMode', this.state.isReducedFeedbackMode);
    if (!this.state.isReducedFeedbackMode) {
      this._showMessage('Reduced feedback mode is now off.', 'info');
    } else {
      this._showMessage('Reduced feedback mode is now on.', 'info');
    }
  }

  _showMessage(message, type) {
    const box = this.elements.messageBox;
    box.textContent = message;
    box.className = `message-box visible ${type}-message`;
    setTimeout(() => {
      box.classList.remove('visible');
    }, 2000);
  }

  _showLoadingIndicator(show) {
    if (show) {
      this.elements.wordButtonsContainer.innerHTML = '<div class="text-center text-xl text-gray-400">Loading new words...</div>';
    }
  }

  _updateInstructionText() {
    const instruction = this.state.hasSubject && this.state.hasVerb
      ? 'Great! Now finish your sentence.'
      : this.state.sentenceWordsArray.length === 0
        ? `Pick a word to start your sentence about ${this.state.currentTheme.name}!`
        : 'Keep going!';
    this.elements.instructionText.textContent = instruction;
  }

  _showCelebration() {
    const randomIndex = Math.floor(Math.random() * this.constants.successMessages.length);
    const message = this.constants.successMessages[randomIndex];
    this._showMessage(message, 'success');
  }

  // --- Utility functions ---
  _saveState() {
    this.state.sentenceHistory.push([...this.state.sentenceWordsArray]);
  }

  _debounce(func, delay) {
    let timeout;
    return function (...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// Load external words data. This is the first line of defense.
fetch('words.json')
  .then(response => response.json())
  .then(data => {
    window.sentenceData = data;
    const app = new SentenceBuilder(window.sentenceData);
    app.init();
  })
  .catch(err => {
    // Crucial fail-safe: if the local word bank can't load, the app doesn't start.
    console.error('Failed to load words.json. Application cannot start.', err);
    document.body.innerHTML = '<div class="flex items-center justify-center h-screen"><p class="text-xl text-red-500 font-bold">Error: Could not load essential data. Please check the `words.json` file.</p></div>';
  });

