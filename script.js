// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// Constant for the API endpoint URL.
// ⚠️ NOTE: This URL might need to be adjusted based on the specific Gemini API version and features you use.
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`;


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
      successMessages: [],
    };

    this.state = {
      sentenceWordsArray: [],
      sentenceHistory: [],
      isReducedFeedbackMode: false,
      successCounter: 0,
      // State-of-the-art fail-proofing: tracks the most recent request.
      // Used to prevent race conditions where a slower, older request overwrites a newer, faster one.
      lastRequestId: 0,
      // Client-side rate limiting. Tracks the last successful API call timestamp.
      lastApiCallTimestamp: 0,
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
      punctuationSection: document.getElementById('punctuation-section'),
      wordBankSection: document.getElementById('word-bank-section'),
      goBackBtn: document.getElementById('go-back-btn'),
      readAloudBtn: document.getElementById('read-aloud-btn'),
      clearBtn: document.getElementById('clear-btn'),
      feedbackToggle: document.getElementById('reduced-feedback-toggle'),
      infoBtn: document.getElementById('info-btn'),
      themeIcon: document.getElementById('theme-icon'),
      wordBankHeading: document.getElementById('word-bank-heading'),
      shuffleBtn: document.getElementById('shuffle-btn'),
      actionSection: document.querySelector('#action-buttons-section'),
    };

    this.buttonShapes = ['round', 'squircle', 'blob'];

    // Debounced function for fetching words. This is the key safety mechanism.
    this.debouncedFetchNextWords = this.debounce(this._fetchNextWords, 300);
    this.API_RATE_LIMIT_MS = 2000; // 2-second minimum between API calls
  }

  async init() {
    // Initialize the constants with the loaded data
    Object.assign(this.constants, window.sentenceData);

    this._loadState();
    this._bindEvents();
    // The initial call should be debounced to prevent multiple calls if user clicks too fast
    await this.debouncedFetchNextWords();
    this._renderSentence();
    this._updateInstruction();
    this._checkPunctuationButtons();
  }

  _loadState() {
    this.state.isReducedFeedbackMode = localStorage.getItem('reducedFeedbackMode') === 'true';
    this.elements.feedbackToggle.checked = this.state.isReducedFeedbackMode;
    this.state.successCounter = parseInt(localStorage.getItem('successCounter') || '0', 10);
    this.state.currentTheme = this.constants.themes.length ? this.constants.themes[Math.floor(Math.random() * this.constants.themes.length)] : null;
    this.elements.themeIcon.textContent = this.state.currentTheme ? this.state.currentTheme.emoji : '🎉';
  }

  _bindEvents() {
    this.elements.highFiveBtn.addEventListener('click', () => {
      this._readSentenceAloud();
      if (navigator.vibrate) navigator.vibrate(50);
      this._hideCelebration();
    });
    this.elements.goBackBtn.addEventListener('click', () => this._handleGoBack());
    this.elements.readAloudBtn.addEventListener('click', () => this._readSentenceAloud());
    this.elements.clearBtn.addEventListener('click', () => this._clearSentence(false));
    this.elements.infoBtn.addEventListener('click', () => this._showGrammarTip());
    this.elements.shuffleBtn.addEventListener('click', () => this.debouncedFetchNextWords());
    this.elements.feedbackToggle.addEventListener('change', () => this._handleReducedFeedbackToggle());
    document.querySelectorAll('.punctuation-button').forEach(btn => {
      btn.addEventListener('click', () => this._addPunctuation(btn.textContent));
    });
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('.word-button');
      if (btn && !btn.disabled) {
        const word = btn.textContent.toLowerCase();
        const type = btn.dataset.wordType;
        this._addWord(word, type);
      }
    });
  }

  _setButtonsDisabled(disabled) {
    document.querySelectorAll('.base-button, .word-button, .action-button, .punctuation-button, #shuffle-btn')
      .forEach(btn => {
        btn.disabled = disabled;
        btn.classList.toggle('disabled-btn', disabled);
      });
  }

  _addPunctuation(punc) {
    this._saveState();
    this.state.sentenceWordsArray.push({ word: punc, type: 'punctuation', isPunctuation: true });
    this._renderSentence();
    this._updateInstruction();
    this._checkCompleteSentence();
  }

  _showWordBankLoading(isLoading, msg) {
    if (isLoading) {
      this.elements.wordBankMsgBox.textContent = msg;
      this.elements.wordBankMsgBox.classList.remove('hidden');
      this.elements.dynamicWordBank.classList.add('hidden');
      this.elements.wordBankHeading.classList.add('hidden');
      this._setButtonsDisabled(true);
    } else {
      this.elements.wordBankMsgBox.classList.add('hidden');
      this.elements.dynamicWordBank.classList.remove('hidden');
      this.elements.wordBankHeading.classList.remove('hidden');
      this._setButtonsDisabled(false);
    }
  }

  _renderWordBank(words) {
    this.elements.dynamicWordBank.innerHTML = '';
    if (!words || words.length === 0) {
      const p = document.createElement('p');
      p.className = 'text-gray-500';
      p.textContent = 'No more words in this category. Try a different one!';
      this.elements.dynamicWordBank.appendChild(p);
      return;
    }
    const rows = [
      words.slice(0, 3),
      words.slice(3, 5),
      words.slice(5, 8)
    ];
    rows.forEach((rowWords, index) => {
      const rowDiv = document.createElement('div');
      rowDiv.className = 'word-button-container my-2 flex flex-wrap';
      rowWords.forEach((w, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const shapeClass = this.buttonShapes[(index + i) % this.buttonShapes.length];
        btn.className = `base-button word-button font-bold text-xl whitespace-nowrap ${this.constants.typeColors[w.type] || this.constants.typeColors.other} active:scale-105 active:shadow-lg ${shapeClass}`;
        btn.textContent = w.word;
        btn.dataset.wordType = w.type;
        rowDiv.appendChild(btn);
      });
      this.elements.dynamicWordBank.appendChild(rowDiv);
    });
  }

  _addWord(word, type) {
    this._saveState();
    const isFirst = this.state.sentenceWordsArray.length === 0;
    const displayWord = isFirst ? word.charAt(0).toUpperCase() + word.slice(1) : word;
    this.state.sentenceWordsArray.push({ word: displayWord, type, isPunctuation: false });
    if (type === 'noun' || type === 'pronoun') this.state.hasSubject = true;
    if (type === 'verb') this.state.hasVerb = true;
    this._renderSentence();
    this._updateInstruction();
    this._checkPunctuationButtons();
    // This is the debounced call. It waits for 300ms of user inactivity.
    this.debouncedFetchNextWords();

    const lastWordEl = this.elements.sentenceArea.lastElementChild;
    if (lastWordEl && !this.state.isReducedFeedbackMode) {
      lastWordEl.classList.add('word-pop-in');
    }
  }

  _removeWord(span) {
    this._saveState();
    const text = span.textContent;
    const index = this.state.sentenceWordsArray.findIndex(w => w.word === text);
    if (index > -1) {
      this.state.sentenceWordsArray.splice(index, 1);
      this.state.hasSubject = this.state.sentenceWordsArray.some(w => (w.type === 'noun' || w.type === 'pronoun'));
      this.state.hasVerb = this.state.sentenceWordsArray.some(w => w.type === 'verb');
      this._renderSentence();
      this._updateInstruction();
      this._checkPunctuationButtons();
      // This is the debounced call.
      this.debouncedFetchNextWords();
    }
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
        span.className = `sentence-word ${this.constants.typeColors[w.type] || this.constants.typeColors.other}`;
        span.textContent = w.word;
        span.addEventListener('click', () => this._removeWord(span));
        this.elements.sentenceArea.appendChild(span);
      });
    }
  }

  _updateInstruction() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    if (!lastWord) {
      this.elements.instructionText.textContent = `Let's build a sentence about ${this.state.currentTheme ? this.state.currentTheme.name.toLowerCase() : ''}!`;
    } else if (lastWord.isPunctuation) {
      this.elements.instructionText.textContent = `Great job! Click 'High Five!' to finish.`;
    } else {
      this.elements.instructionText.textContent = `What word comes after "${lastWord.word.toLowerCase()}"?`;
    }
  }

  async _fetchNextWords() {
    // ⚠️ CRITICAL SAFETY CHECK: Client-side rate limiting.
    if (Date.now() - this.state.lastApiCallTimestamp < this.API_RATE_LIMIT_MS) {
      console.warn('Client-side rate limit hit. Falling back to local words.');
      this._fallbackToLocalWords();
      return;
    }

    // Increment the request ID for the new call. This is the race condition prevention.
    const currentRequestId = ++this.state.lastRequestId;

    this._showWordBankLoading(true, 'Thinking of the next words...');

    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const lastWordText = lastWord ? lastWord.word : null;
    const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');

    const promptText = `
      You are an expert in early childhood education. Your task is to provide the next 8 possible words for a sentence a first-grader is building. The words must be simple, common, and strictly appropriate for a 1st-grade reading level.
      The current sentence is: "${sentence}".
      The last word added was: "${lastWordText || 'the start of the sentence'}".
      Provide only a comma-separated list of 8 single words. Do not include any other text or punctuation.
    `;

    let wordsToRender = [];
    const API_TIMEOUT = 5000; // 5-second timeout

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

      const apiResponse = await fetch(GEMINI_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: promptText,
            }],
          }],
        }),
        signal: controller.signal
      });

      // Cleanup the timeout immediately to prevent it from firing after a successful request.
      clearTimeout(timeoutId);

      // Check if this response is still relevant (i.e., a new request hasn't been made)
      if (currentRequestId !== this.state.lastRequestId) {
        console.warn('Ignoring stale API response.');
        return;
      }
      
      // ⚠️ CRITICAL SAFETY CHECK: Handle a 429 "Too Many Requests" server response gracefully.
      if (apiResponse.status === 429) {
        this._showMessage("Too many requests. Please wait a moment.", 'warn');
        this._fallbackToLocalWords();
        return;
      }
      
      if (!apiResponse.ok) {
        throw new Error(`API call failed with status: ${apiResponse.status}`);
      }
      
      this.state.lastApiCallTimestamp = Date.now(); // Update timestamp on successful call

      const data = await apiResponse.json();
      const generatedText = data.candidates[0].content.parts[0].text; // Corrected path for response text

      wordsToRender = generatedText.split(',').map(word => ({ word: word.trim().toLowerCase(), type: 'llm_generated' }));

      // Additional fail-safe: check if the API response is usable
      if (!wordsToRender || wordsToRender.length === 0) {
        throw new Error("API returned no usable words.");
      }

      this._renderWordBank(wordsToRender.slice(0, 8));
      this._showWordBankLoading(false);
      return;

    } catch (error) {
      console.error("Gemini API call failed or timed out. Falling back to local words.", error);
      this._fallbackToLocalWords();
    }
  }
  
  _fallbackToLocalWords() {
      // Offline-first fail-safe: This code block executes for ANY API failure.
      // It immediately and seamlessly switches to the local word bank.
      const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
      const lastWordType = lastWord ? lastWord.type : 'start';
      const allowedTypes = this.constants.nextWordRules[lastWordType] || [];
      let wordsToRender = [];
      allowedTypes.forEach(type => {
        const collection = this.constants.wordCollections[type] || [];
        const filtered = collection.filter(w => w.theme === this.state.currentTheme?.name.toLowerCase() || w.theme === null);
        filtered.forEach(w => wordsToRender.push({ word: w.word, type }));
      });

      wordsToRender.sort(() => Math.random() - 0.5);
      this._renderWordBank(wordsToRender.slice(0, 8));
      this._showWordBankLoading(false);
  }

  _checkPunctuationButtons() {
    const showPunct = this.state.hasSubject && this.state.hasVerb;
    this.elements.punctuationSection.classList.toggle('hidden', !showPunct);
    document.querySelectorAll('#punctuation-section button').forEach(btn => {
      btn.disabled = !showPunct;
      btn.classList.toggle('disabled-btn', !showPunct);
    });
  }

  _checkCompleteSentence() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    if (lastWord && lastWord.isPunctuation) {
      this.state.successCounter++;
      localStorage.setItem('successCounter', this.state.successCounter);
      this._animateSuccess();
    }
  }

  _animateSuccess() {
    this._hideUIAfterSuccess();
  }

  _hideUIAfterSuccess() {
    this.elements.wordBankSection.classList.add('fade-out');
    this.elements.punctuationSection.classList.add('fade-out');
    this.elements.actionSection.classList.add('fade-out');
    this.elements.messageBox.classList.remove('visible');
    setTimeout(() => {
      this.elements.wordBankSection.classList.add('hidden');
      this.elements.punctuationSection.classList.add('hidden');
      this.elements.actionSection.classList.add('hidden');
      this.elements.sentencesCounter.textContent = `You've built ${this.state.successCounter} sentences!`;
      this.elements.celebrationContainer.classList.remove('hidden');
      this.elements.celebrationContainer.classList.remove('fade-out');
      this.elements.celebrationContainer.classList.add('fade-in');
    }, 500);
  }

  _showMessage(text, type) {
    clearTimeout(this.messageTimeout);
    this.elements.messageBox.textContent = text;
    this.elements.messageBox.className = 'message-box w-full min-h-[50px] p-4 mb-8 text-center text-xl rounded-2xl visible';
    this.elements.messageBox.classList.remove('bg-lime-200', 'text-lime-800', 'bg-red-200', 'text-red-800', 'bg-yellow-200', 'text-yellow-800', 'bg-blue-200', 'text-blue-800');
    if (type === 'success') {
      this.elements.messageBox.classList.add('bg-lime-200', 'text-lime-800');
    } else if (type === 'error') {
      this.elements.messageBox.classList.add('bg-red-200', 'text-red-800');
    } else if (type === 'warn') {
      this.elements.messageBox.classList.add('bg-yellow-200', 'text-yellow-800');
    } else if (type === 'info') {
      this.elements.messageBox.classList.add('bg-blue-200', 'text-blue-800');
    }
    this.messageTimeout = setTimeout(() => {
      this.elements.messageBox.classList.remove('visible');
    }, 4500);
  }

  _clearSentence(next = false) {
    this._saveState();
    this.state.sentenceWordsArray = [];
    this.state.sentenceHistory = [];
    this.state.hasSubject = false;
    this.state.hasVerb = false;
    this._renderSentence();
    this._updateInstruction();
    this._checkPunctuationButtons();

    if (next && this.constants.themes.length > 0) {
      this.state.currentTheme = this.constants.themes[Math.floor(Math.random() * this.constants.themes.length)];
      this.elements.themeIcon.textContent = this.state.currentTheme ? this.state.currentTheme.emoji : '🎉';
    }
  }

  _handleGoBack() {
    if (this.state.sentenceHistory.length > 0) {
      this.state.sentenceWordsArray = this.state.sentenceHistory.pop();
      this.state.hasSubject = this.state.sentenceWordsArray.some(w => (w.type === 'noun' || w.type === 'pronoun'));
      this.state.hasVerb = this.state.sentenceWordsArray.some(w => w.type === 'verb');
      this._renderSentence();
      this._updateInstruction();
      this._checkPunctuationButtons();
      // This is the debounced call.
      this.debouncedFetchNextWords();
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
      timeout = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

}
