// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

//const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

// ✅ FIX: correct path for GitHub Pages
fetch('words.json')
  .then(res => {
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
  })
  .then(data => {
    window.sentenceData = data;
    const app = new SentenceBuilder();
    app.init();
  })
  .catch(err => {
    console.error('Failed to load words.json', err);
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

    this.elements = {
      sentenceArea: document.getElementById('sentence-area'),
      sentencesCounter: document.getElementById('sentences-built-counter'),
      highFiveBtn: document.getElementById('high-five-btn'),
      wordBankMsgBox: document.getElementById('word-bank-message-box'),
      instructionText: document.getElementById('instruction-text'),
      wordButtonsContainer: document.getElementById('word-buttons-container'),
      punctuatonButtonsContainer: document.getElementById('punctuation-buttons'),
      readAloudBtn: document.getElementById('read-aloud-btn'),
      clearBtn: document.getElementById('clear-btn'),
      goBackBtn: document.getElementById('go-back-btn'),
      exclamationBtn: document.getElementById('exclamation-btn'),
      questionBtn: document.getElementById('question-btn'),
      feedbackToggle: document.getElementById('reduced-feedback-toggle'),
      themeIcon: document.getElementById('theme-icon'),
      h1: document.querySelector('h1'),
    };

    this.debouncedFetchNextWords = this.debounce(this._fetchNextWords, 500);
  }

  init() {
    this._parseConstants();
    this._attachEventListeners();
    this._selectNewTheme();   // ✅ pick theme first
    this._renderSentence();   // ✅ safe to render after theme exists
    this.debouncedFetchNextWords();
    this._loadState();
  }

  _parseConstants() {
    const data = window.sentenceData;
    this.constants.themes = data.themes;
    this.constants.typeColors = data.typeColors;
    this.constants.grammarTips = data.grammarTips;
    this.constants.wordCollections = data.words;  // ✅ use words
    this.constants.nextWordRules = data.nextWordRules;
    this.constants.successMessages = data.successMessages;
  }

  _attachEventListeners() {
    this.elements.wordButtonsContainer.addEventListener('click', this._handleWordButtonClick.bind(this));
    this.elements.punctuatonButtonsContainer.addEventListener('click', this._handlePunctuationButtonClick.bind(this));
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

  _selectNewTheme() {
    const randomIndex = Math.floor(Math.random() * this.constants.themes.length);
    this.state.currentTheme = this.constants.themes[randomIndex];

    this.elements.themeIcon.textContent = this.state.currentTheme.emoji;
    this.elements.h1.innerHTML = `<span id="theme-icon" class="mr-3 text-3xl">${this.state.currentTheme.emoji}</span>Let's build a sentence about ${this.state.currentTheme.name}!`;
    this.elements.instructionText.textContent = 'Pick a word to start your sentence!';
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
    if (!this.state.isReducedFeedbackMode) this._showGrammarTip();
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
      const themeName = this.state.currentTheme ? this.state.currentTheme.name : 'something fun';
      span.textContent = `Let's build a sentence about ${themeName}!`;
      this.elements.sentenceArea.appendChild(span);
    } else {
      this.state.sentenceWordsArray.forEach(w => {
        const span = document.createElement('span');
        span.className = `sentence-word ${this.constants.typeColors[w.type] || ''}`;
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

  // ... (rest of the file stays the same as previous working version)
}

