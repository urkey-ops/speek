// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
//const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// ⚠️ IMPORTANT: For production, do NOT store your API key in client-side code.
// Consider using a secure backend to manage API calls.
const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

// Load words.json and initialize the application
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
            successMessages: [],
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
        this._selectNewTheme();
        this._renderSentence();
        this.debouncedFetchNextWords();
        this._loadState();
    }

    _parseConstants() {
        const data = window.sentenceData;
        this.constants.themes = data.themes;
        this.constants.typeColors = data.typeColors;
        this.constants.grammarTips = data.grammarTips;
        this.constants.wordCollections = data.themesData;
        this.constants.nextWordRules = data.nextWordRules;
        this.constants.successMessages = data.successMessages;
        this.constants.allWords = data.allWords;
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

    async _fetchNextWords() {
        this.state.lastFetchId++;
        const currentFetchId = this.state.lastFetchId;

        if (this.state.fetchAbortController) {
            this.state.fetchAbortController.abort();
        }
        this.state.fetchAbortController = new AbortController();

        const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
        const lastType = lastWord ? lastWord.type : 'start';
        const possibleNextTypes = this.constants.nextWordRules[lastType] || [];

        const wordsFromJSON = this._getWordsFromJSON(possibleTypes);
        this._renderWordButtons(wordsFromJSON);

        if (GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY') {
            this.elements.wordBankMsgBox.innerHTML = '<p class="text-center text-gray-500">Magic hat generating more words...</p>';

            try {
                const prompt = `
                    Based on the sentence fragment "${this.state.sentenceWordsArray.map(w => w.word).join(' ')}", and the available parts of speech: ${possibleTypes.join(', ')}, provide a list of 5 words that could come next, along with their parts of speech.

                    **IMPORTANT RULES:**
                    1. All words must be simple, common, and appropriate for a 1st-grade student (ages 6-7).
                    2. Avoid complex or uncommon vocabulary.
                    3. The words should be clear and easy to read.
                    
                    Format the response as a JSON object: {"words": [{"word": "word", "type": "partOfSpeech"}, ...]}`;

                const requestBody = {
                    contents: [{
                        parts: [{ text: prompt }]
                    }]
                };

                const res = await fetch(GEMINI_API_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: this.state.fetchAbortController.signal,
                });

                if (!res.ok) throw new Error(`API error! status: ${res.status}`);
                const data = await res.json();

                let geminiWords = [];
                try {
                    const textResponse = data.candidates[0]?.content?.parts[0]?.text;
                    const cleanText = textResponse.replace(/```json\n|\n```/g, '').trim();
                    geminiWords = JSON.parse(cleanText);
                } catch (parseErr) {
                    console.error('Failed to parse Gemini response:', parseErr);
                    geminiWords = { words: [] };
                }

                if (currentFetchId === this.state.lastFetchId) {
                    const allWords = this._filterAndCombineWords(wordsFromJSON, geminiWords.words);
                    this._renderWordButtons(allWords);
                    this.elements.wordBankMsgBox.innerHTML = '';
                }
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Gemini API fetch failed:', err);
                    if (currentFetchId === this.state.lastFetchId) {
                        this.elements.wordBankMsgBox.innerHTML = '<p class="text-center text-red-500">Could not fetch new words from the magic hat.</p>';
                    }
                }
            }
        }
    }

    _getWordsFromJSON(possibleTypes) {
        const words = [];
        const themeWords = this.constants.wordCollections[this.state.currentTheme.name];

        possibleTypes.forEach(type => {
            if (this.constants.allWords[type]) {
                words.push(...this.constants.allWords[type].filter(w => !w.theme));
            }
            if (themeWords[type]) {
                words.push(...themeWords[type]);
            }
        });

        const uniqueWords = [...new Set(words.map(w => w.word))].map(w => words.find(obj => obj.word === w));
        return this.getRandomElements(uniqueWords, 10);
    }

    _renderWordButtons(words) {
        this.elements.wordButtonsContainer.innerHTML = '';
        if (words.length === 0) {
            this.elements.wordButtonsContainer.innerHTML = '<p class="text-center text-gray-500">No words available!</p>';
            return;
        }

        words.forEach(wordObj => {
            const button = document.createElement('button');
            button.className = `word-button base-button round ${this.constants.typeColors[wordObj.type] || 'bg-gray-300'}`;
            button.textContent = wordObj.word;
            button.dataset.word = wordObj.word;
            button.dataset.type = wordObj.type;
            if (wordObj.isGeminiFetched) {
                button.dataset.isGeminiFetched = true;
            }
            this.elements.wordButtonsContainer.appendChild(button);
        });
    }

    _filterAndCombineWords(jsonWords, geminiWords) {
        const allWords = [...jsonWords];
        const existingWords = new Set(jsonWords.map(w => w.word.toLowerCase()));

        if (Array.isArray(geminiWords)) {
            geminiWords.forEach(w => {
                if (w.word && w.type && !existingWords.has(w.word.toLowerCase())) {
                    allWords.push({ ...w, isGeminiFetched: true });
                    existingWords.add(w.word.toLowerCase());
                }
            });
        }
        return this.getRandomElements(allWords, 15);
    }

    debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            const context = this;
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(context, args);
            }, delay);
        };
    }

    getRandomElements(arr, num) {
        const shuffled = [...arr].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, num);
    }

    _saveState() {}
    _updateInstructionText() {}
    _showGrammarTip() {}
    _updatePunctuationButtons() {}
    _updateButtonStates() {}
    _goBack() {}
    _readSentenceAloud() {}
    _clearSentence() {}
    _completeSentence() {}
    _handleReducedFeedbackToggle() {}
    _showMessage(message, color) {}
}
