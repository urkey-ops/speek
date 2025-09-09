// Load words.json and initialize the application
fetch('words.json')
.then(res => {
if (!res.ok) throw new Error(HTTP error! status: ${res.status});
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

const SOUND_EFFECTS = {
click: new Audio('https://www.google.com/search?q=https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'),
clear: new Audio('https://www.google.com/search?q=https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'),
complete: new Audio('https://www.google.com/search?q=https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3')
};

/**

Utility function to debounce a function.

@param {Function} func The function to debounce.

@param {number} wait The number of milliseconds to wait.

@returns {Function} The debounced function.
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

Utility function to throttle a function.

@param {Function} func The function to throttle.

@param {number} limit The number of milliseconds to limit calls to.

@returns {Function} The throttled function.
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
        highFiveBtn: document.getElementById('highFiveBtn'),
        goBackBtn: document.getElementById('goBackBtn'),
        clearBtn: document.getElementById('clearBtn'),
        readAloudBtn: document.getElementById('readAloudBtn'),
        messageBox: document.getElementById('messageBox'),
        shuffleWordsBtn: document.getElementById('shuffleWordsBtn'),
    };
}

_setupEventListeners() {
    this.elements.wordBankContainer.addEventListener('click', this._handleWordClick.bind(this));
    this.elements.highFiveBtn.addEventListener('click', this._completeSentence.bind(this));
    this.elements.goBackBtn.addEventListener('click', this._goBack.bind(this));
    this.elements.clearBtn.addEventListener('click', this._clearSentence.bind(this));
    this.elements.readAloudBtn.addEventListener('click', this._readSentenceAloud.bind(this));
    this.elements.shuffleWordsBtn.addEventListener('click', this.throttledFetchNextWords.bind(this));
}

_saveState() {
    localStorage.setItem('sentenceBuilderState', JSON.stringify(this.state));
}

_loadState() {
    const savedState = JSON.parse(localStorage.getItem('sentenceBuilderState'));
    if (savedState) {
        this.state = savedState;
    }
}

_fetchNextWords() {
    const WORD_LIMIT = 7;
    const lastWordType = this.state.sentenceWordsArray.length > 0 ? this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type : 'start';
    const validNextTypes = this.nextWordRules[lastWordType] || [];

    this.state.wordBank = {};
    validNextTypes.forEach(type => {
        // Shuffle the words for the current type
        const shuffledWordsOfType = this._shuffleArray([...this.allWords[type]]);
        // Take a limited number of words
        const limitedWords = shuffledWordsOfType.slice(0, WORD_LIMIT);

        if (limitedWords.length > 0) {
            this.state.wordBank[type] = limitedWords;
        }
    });

    this._renderWordBank();
}

_renderWordBank() {
    this.elements.wordBankContainer.innerHTML = '';

    const typeOrder = ["noun", "verb", "adjective", "adverb", "preposition", "determiner", "conjunction", "punctuation"];

    typeOrder.forEach(type => {
        const words = this.state.wordBank[type];
        if (words && words.length > 0) {
            const heading = document.createElement('div');
            heading.className = 'word-group-heading';
            heading.textContent = type.charAt(0).toUpperCase() + type.slice(1) + 's';
            this.elements.wordBankContainer.appendChild(heading);

            const groupContainer = document.createElement('div');
            groupContainer.className = 'flex flex-wrap justify-center gap-4 w-full';
            words.forEach(wordObj => {
                const wordButton = document.createElement('button');
                wordButton.textContent = wordObj.word;
                wordButton.dataset.type = wordObj.type;
                wordButton.dataset.word = wordObj.word;
                wordButton.className = `word-button squircle ${this.typeColors[wordObj.type] || this.typeColors.other}`;
                wordButton.title = this.grammarTips[wordObj.type];
                groupContainer.appendChild(wordButton);
            });
            this.elements.wordBankContainer.appendChild(groupContainer);
        }
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

        this.debouncedFetchNextWords();

        this._updateInstructionText();
        this._playAudio('click');
    }
}

_renderSentence() {
    this.elements.sentenceDisplay.innerHTML = '';
    if (this.state.sentenceWordsArray.length === 0) {
        this.elements.sentenceDisplay.innerHTML = '<span class="placeholder-text">Click on a word below to begin...</span>';
    }
    this.state.sentenceWordsArray.forEach((wordObj, index) => {
        const span = document.createElement('span');
        span.textContent = wordObj.word;
        span.className = `sentence-word ${this.typeColors[wordObj.type] || this.typeColors.other}`;
        span.dataset.index = index;
        this.elements.sentenceDisplay.appendChild(span);

        if (index < this.state.sentenceWordsArray.length - 1 && wordObj.type !== 'punctuation' && this.state.sentenceWordsArray[index + 1].type !== 'punctuation') {
            const space = document.createTextNode(' ');
            this.elements.sentenceDisplay.appendChild(space);
        }
    });
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
    this._playAudio('clear');
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
    this._playAudio('clear');
}

_completeSentence() {
    this.state.successCounter++;
    this._saveState();
    this._showMessage('Awesome! Great sentence!', 'bg-success');
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this.debouncedFetchNextWords();
    this._playAudio('complete');
}

_updateInstructionText() {
    const isComplete = this.state.sentenceWordsArray.length > 0 && this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1].type === 'punctuation';

    if (isComplete) {
        this._showMessage("Great job! You finished a sentence! 🎉", 'bg-success');
    } else if (this.state.sentenceWordsArray.length === 0) {
        this._showMessage("Let's start building a sentence! Tap a word below. 👇", 'bg-info');
    } else {
        this._showMessage("Choose a word to add to your sentence!", 'bg-info');
    }
}

_showMessage(text, className) {
    this.elements.messageBox.textContent = text;
    this.elements.messageBox.className = `message-box visible ${className}`;
    setTimeout(() => {
        this.elements.messageBox.className = 'message-box';
    }, 3000);
}

_playAudio(soundName) {
    const sound = SOUND_EFFECTS[soundName];
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(e => console.error("Audio playback failed:", e));
    }
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
