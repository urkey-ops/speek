// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: Replace 'YOUR_GEMINI_API_KEY' with your actual key.
//const GEMINI_API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// A helpful constant to make your API key easily accessible and visible.
// ⚠️ IMPORTANT: For production, do NOT store your API key in client-side code.
// Consider using a secure backend to manage API calls.
//const GEMINI_API_KEY = '';
//const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

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

/**
 * Utility function to debounce a function.
 * @param {Function} func The function to debounce.
 * @param {number} wait The number of milliseconds to wait.
 * @returns {Function} The debounced function.
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

/**
 * Utility function to throttle a function.
 * @param {Function} func The function to throttle.
 * @param {number} limit The number of milliseconds to limit calls to.
 * @returns {Function} The throttled function.
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

class SentenceBuilder {
    constructor() {
        this.allWords = window.sentenceData.words;
        this.nextWordRules = window.sentenceData.nextWordRules;
        this.typeColors = window.sentenceData.typeColors;
        this.grammarTips = window.sentenceData.grammarTips;
        this.state = {
            sentenceWordsArray: [],
            wordBank: [],
            highFiveMode: false,
            successCounter: 0,
            isReducedFeedbackMode: false
        };
        this.elements = {};
        this.debouncedFetchNextWords = debounce(this._fetchNextWords.bind(this), 250);
        this.throttledFetchNextWords = throttle(this._fetchNextWords.bind(this), 500);
    }

    init() {
        this._getElements();
        this._loadState();
        this._setupEventListeners();
        this._renderSentence();
        this.throttledFetchNextWords();
        this._updateInstructionText();
        this._renderHighFiveButton();
    }

    _getElements() {
        this.elements = {
            sentenceDisplay: document.getElementById('sentenceDisplay'),
            wordBankContainer: document.getElementById('wordBankContainer'),
            nextSentenceBtn: document.getElementById('nextSentenceBtn'),
            highFiveBtn: document.getElementById('highFiveBtn'),
            goBackBtn: document.getElementById('goBackBtn'),
            clearBtn: document.getElementById('clearBtn'),
            readAloudBtn: document.getElementById('readAloudBtn'),
            messageBox: document.getElementById('messageBox'),
            sentencesCounter: document.getElementById('sentencesCounter'),
            shuffleWordsBtn: document.getElementById('shuffleWordsBtn'),
            reducedFeedbackToggle: document.getElementById('reducedFeedbackToggle'),
            currentWordCount: document.getElementById('currentWordCount')
        };
    }

    _setupEventListeners() {
        this.elements.wordBankContainer.addEventListener('click', this._handleWordClick.bind(this));
        this.elements.nextSentenceBtn.addEventListener('click', this._completeSentence.bind(this));
        this.elements.highFiveBtn.addEventListener('click', this._completeSentence.bind(this));
        this.elements.goBackBtn.addEventListener('click', this._goBack.bind(this));
        this.elements.clearBtn.addEventListener('click', this._clearSentence.bind(this));
        this.elements.readAloudBtn.addEventListener('click', this._readSentenceAloud.bind(this));
        this.elements.shuffleWordsBtn.addEventListener('click', this.throttledFetchNextWords.bind(this));
        this.elements.reducedFeedbackToggle.addEventListener('change', this._handleReducedFeedbackToggle.bind(this));
    }

    _saveState() {
        localStorage.setItem('sentenceBuilderState', JSON.stringify(this.state));
    }

    _loadState() {
        const savedState = JSON.parse(localStorage.getItem('sentenceBuilderState'));
        if (savedState) {
            this.state = savedState;
            this.elements.sentencesCounter.textContent = this.state.successCounter;
            this.elements.reducedFeedbackToggle.checked = this.state.isReducedFeedbackMode;
        }
    }

    _fetchNextWords() {
        const lastWordType = this.state.sentenceWordsArray.length > 0 ? this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type : 'start';
        const validNextTypes = this.nextWordRules[lastWordType] || [];
        
        let validWords = [];
        validNextTypes.forEach(type => {
            validWords.push(...this.allWords[type]);
        });
        
        // Shuffle and take a random sample of 25 words to display
        this.state.wordBank = this._shuffleArray(validWords).slice(0, 25);
        this._renderWordBank();
    }

    _renderWordBank() {
        this.elements.wordBankContainer.innerHTML = '';
        this.state.wordBank.forEach(wordObj => {
            const wordButton = document.createElement('button');
            wordButton.textContent = wordObj.word;
            wordButton.dataset.type = wordObj.type;
            wordButton.dataset.word = wordObj.word;
            wordButton.className = `word-button base-button squircle ${this.typeColors[wordObj.type] || this.typeColors.other}`;
            wordButton.title = this.grammarTips[wordObj.type];
            this.elements.wordBankContainer.appendChild(wordButton);
        });
    }

    _handleWordClick(event) {
        const { target } = event;
        if (target.matches('.word-button')) {
            const word = target.dataset.word;
            const type = target.dataset.type;

            this.state.sentenceWordsArray.push({ word, type });
            this._renderSentence();
            this._saveState();

            if (!this.state.isReducedFeedbackMode) {
                this.throttledFetchNextWords();
            } else {
                this.debouncedFetchNextWords();
            }

            this._updateInstructionText();
        }
    }

    _renderSentence() {
        this.elements.sentenceDisplay.innerHTML = '';
        if (this.state.sentenceWordsArray.length === 0) {
            this.elements.sentenceDisplay.innerHTML = '<span class="placeholder-text">Build your sentence here...</span>';
        }
        this.state.sentenceWordsArray.forEach((wordObj, index) => {
            const span = document.createElement('span');
            span.textContent = wordObj.word;
            span.className = `sentence-word ${this.typeColors[wordObj.type] || this.typeColors.other}`;
            span.dataset.index = index;
            this.elements.sentenceDisplay.appendChild(span);

            // Add space unless it's the last word and a punctuation mark
            if (index < this.state.sentenceWordsArray.length - 1 && wordObj.type !== 'punctuation' && this.state.sentenceWordsArray[index + 1].type !== 'punctuation') {
                const space = document.createTextNode(' ');
                this.elements.sentenceDisplay.appendChild(space);
            }
        });
        this.elements.currentWordCount.textContent = this.state.sentenceWordsArray.length;
        this._renderHighFiveButton();
    }
    
    _renderHighFiveButton() {
        const isComplete = this.state.sentenceWordsArray.length > 0 && this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type === 'punctuation';
        this.elements.highFiveBtn.disabled = !isComplete;
        this.state.highFiveMode = isComplete;
    }

    _goBack() {
        this.state.sentenceWordsArray.pop();
        this._saveState();
        this._renderSentence();
        this.debouncedFetchNextWords();
        this._updateInstructionText();
    }

    _readSentenceAloud() {
        const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        if (sentence.length > 0) {
            const utterance = new SpeechSynthesisUtterance(sentence);
            utterance.lang = 'en-US';
            speechSynthesis.speak(utterance);
        }
    }

    _clearSentence() {
        this.state.sentenceWordsArray = [];
        this.state.highFiveMode = false;
        this._renderSentence();
        this.debouncedFetchNextWords();
        this._updateInstructionText();
        this._saveState();
    }

    _completeSentence() {
        this.state.successCounter++;
        this.elements.sentencesCounter.textContent = this.state.successCounter;
        this._saveState();
        this._showMessage('Sentence complete! Nicely done.', 'success');
        this.state.sentenceHistory.push(this.state.sentenceWordsArray);
        this.state.sentenceWordsArray = [];
        this._renderSentence();
        this.debouncedFetchNextWords();
    }

    _handleReducedFeedbackToggle(event) {
        this.state.isReducedFeedbackMode = event.target.checked;
        localStorage.setItem('reducedFeedbackMode', this.state.isReducedFeedbackMode);
    }
    
    _updateInstructionText() {
        const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        const isComplete = this.state.sentenceWordsArray.length > 0 && this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type === 'punctuation';
        const messageBox = this.elements.messageBox;

        if (isComplete) {
            messageBox.innerHTML = "Great job! The sentence is complete.";
            messageBox.style.display = 'block';
        } else if (this.state.sentenceWordsArray.length === 0) {
            messageBox.innerHTML = "Let's start building a new sentence. Pick a word!";
            messageBox.style.display = 'block';
        } else {
            const lastType = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type;
            const nextPossibleTypes = this.nextWordRules[lastType] || [];
            
            // Generate a descriptive tip
            let tipText;
            if (nextPossibleTypes.length > 0) {
                const typeDescriptions = nextPossibleTypes.map(type => this.grammarTips[type]).filter(Boolean).join(' or ');
                tipText = `Your next word can be a ${typeDescriptions}.`;
            } else {
                tipText = "The word bank is empty. Let's start a new sentence!";
            }
            
            messageBox.innerHTML = tipText;
            messageBox.style.display = 'block';
        }
    }

    _showMessage(text, type) {
        this.elements.messageBox.textContent = text;
        this.elements.messageBox.className = `message-box visible ${type}`;
        setTimeout(() => {
            this.elements.messageBox.className = 'message-box';
        }, 3000);
    }

    _shuffleArray(array) {
        let currentIndex = array.length, randomIndex;
        while (currentIndex !== 0) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
            [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
        }
        return array;
    }
}
