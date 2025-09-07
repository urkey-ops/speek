// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';


const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';
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
    this._renderSentence();
    this._selectNewTheme();
    this.debouncedFetchNextWords();
    this._loadState();
  }

  _parseConstants() {
    const data = window.sentenceData;
    this.constants.themes = data.themes;
    this.constants.typeColors = data.typeColors;
    this.constants.grammarTips = data.grammarTips;
    // ✅ FIX: use words
    this.constants.wordCollections = data.words;
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
      span.textContent = `Let's build a sentence about ${this.state.currentTheme.name}!`;
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

  _renderWordBank(words) {
    this.elements.wordButtonsContainer.innerHTML = '';
    if (words.length === 0) {
      this._showMessage('No words found. Try clearing the sentence.', 'warning');
    }

    words.forEach(wordObj => {
      const button = document.createElement('button');
      button.className = `base-button word-button round ${this.constants.typeColors[wordObj.type] || ''}`;
      button.dataset.word = wordObj.word;
      button.dataset.type = wordObj.type;
      button.dataset.isGeminiFetched = wordObj.isGeminiFetched || false;
      button.textContent = wordObj.word;

      if (wordObj.isGeminiFetched) button.classList.add('gemini-word-button');
      this.elements.wordButtonsContainer.appendChild(button);
    });
    this._showLoadingIndicator(false);
  }

  _updatePunctuationButtons() {
    const lastWord = this.state.sentenceWordsArray.at(-1);
    const enablePunctuation = lastWord && lastWord.type !== 'punctuation' && this.state.hasSubject && this.state.hasVerb;
    this.elements.exclamationBtn.disabled = !enablePunctuation;
    this.elements.questionBtn.disabled = !enablePunctuation;
  }

  _updateButtonStates() {
    const disabled = this.state.sentenceWordsArray.length === 0;
    this.elements.goBackBtn.disabled = disabled;
    this.elements.clearBtn.disabled = disabled;
    this.elements.readAloudBtn.disabled = disabled;
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
    this.state.sentenceHistory = [];
    this.state.hasSubject = false;
    this.state.hasVerb = false;
    this.state.successCounter = 0;
    this.elements.sentencesCounter.textContent = this.state.successCounter;
    this._renderSentence();
    this._selectNewTheme();
    this.debouncedFetchNextWords();
    this._updateInstructionText();
    this._showMessage('Sentence cleared.', 'info');
  }

  _completeSentence() {
    this.state.successCounter++;
    this.elements.sentencesCounter.textContent = this.state.successCounter;
    this._saveState();
    this._showCelebration();
    this.state.sentenceWordsArray = [];
    this.state.hasSubject = false;
    this.state.hasVerb = false;
    this._renderSentence();
    this._updateInstructionText();
    this._selectNewTheme();
    this.debouncedFetchNextWords();
  }

  _fetchNextWords() {
    if (this.state.fetchAbortController) this.state.fetchAbortController.abort();
    this.state.fetchAbortController = new AbortController();
    const signal = this.state.fetchAbortController.signal;
    this.state.lastFetchId++;
    const fetchId = this.state.lastFetchId;

    const lastWord = this.state.sentenceWordsArray.at(-1);
    const sentenceLength = this.state.sentenceWordsArray.length;

    let possibleTypes = this.constants.nextWordRules['start'];
    if (lastWord && this.constants.nextWordRules[lastWord.type]) {
      possibleTypes = this.constants.nextWordRules[lastWord.type];
    }

    // recalc subject/verb presence from entire array
    this.state.hasSubject = this.state.sentenceWordsArray.some(w => ['noun','pronoun'].includes(w.type));
    this.state.hasVerb = this.state.sentenceWordsArray.some(w => w.type === 'verb');

    if (sentenceLength >= 1) {
      if (!this.state.hasSubject) possibleTypes = ['noun', 'pronoun'];
      else if (!this.state.hasVerb) possibleTypes = ['verb'];
    }

    const availableWords = possibleTypes.flatMap(type =>
      this.constants.wordCollections[type]
        ?.filter(w => !w.theme || w.theme.toLowerCase() === this.state.currentTheme.name.toLowerCase())
        .map(w => ({ ...w, type, source: 'predefined' })) || []
    );

    const neededWordsCount = 10 - availableWords.length;
    let wordsToRender = [...availableWords];
    this._renderWordBank(wordsToRender);

    if (neededWordsCount > 0) {
      this._showLoadingIndicator(true);
      const randomType = possibleTypes[Math.floor(Math.random() * possibleTypes.length)];
      const prompt = this._createGeminiPrompt(randomType, this.state.currentTheme.name);

      this._fetchWordsFromGemini(prompt, signal)
        .then(geminiWords => {
          if (fetchId !== this.state.lastFetchId) return;
          const newWords = geminiWords.map(w => ({ word: w, type: randomType, isGeminiFetched: true }));
          wordsToRender = [...availableWords, ...newWords].sort(() => 0.5 - Math.random());
          this._renderWordBank(wordsToRender);
        })
        .catch(error => {
          if (error.name === 'AbortError') return;
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

  _createGeminiPrompt(wordType, theme) {
    switch(wordType) {
      case 'noun': return `Generate a JSON array of 5 simple, common nouns related to ${theme}.`;
      case 'verb': return `Generate a JSON array of 5 simple, present tense verbs related to ${theme}.`;
      case 'adjective': return `Generate a JSON array of 5 simple, common adjectives related to ${theme}.`;
      case 'adverb': return `Generate a JSON array of 5 simple adverbs ending in '-ly' related to ${theme}.`;
      default: return `Generate a JSON array of 5 simple ${wordType}s related to ${theme}.`;
    }
  }

  async _fetchWordsFromGemini(prompt, signal) {
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const response = await fetch(GEMINI_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) throw new Error(`API call failed with status: ${response.status}`);

    const result = await response.json();
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    // ✅ strip backticks if Gemini returns fenced JSON
    text = text.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(text);
    } catch (e) {
      console.error('Gemini returned invalid JSON:', text);
      return [];
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
    const lastWord = this.state.sentenceWordsArray.at(-1);
    const type = lastWord ? lastWord.type : 'other';
    const tip = this.constants.grammarTips[type] || "This word helps connect other words!";
    this._showMessage(tip, 'info');
  }

  _showMessage(message, type = 'info') {
    const box = this.elements.wordBankMsgBox;
    box.textContent = message;
    box.className = `message-box visible text-center p-3 rounded-lg w-full text-white ${type === 'info' ? 'bg-indigo-500' : type === 'warning' ? 'bg-orange-500' : 'bg-red-500'}`;
    setTimeout(() => box.classList.remove('visible'), 2000);
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
    const message = this.constants.successMessages[Math.floor(Math.random() * this.constants.successMessages.length)];
    this._showMessage(message, 'info');
  }

  _saveState() {
    this.state.sentenceHistory.push([...this.state.sentenceWordsArray]);
  }

  debounce(func, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), delay);
    };
  }
}


