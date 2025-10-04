// This is the main application file for the Sentence Lab.
// This version (v4.4) applies a more robust fix to the API JSON payload error,
// using a conditional 'if' block instead of the spread operator to ensure 
// 'generationConfig' is only present when jsonMode is true.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// WARNING: This key is exposed on the client-side. This is insecure and should
// only be used for local testing. For production, move this to a backend server
// using the Vercel Function + Google Sheets API approach as planned for future
// projects.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';
const MAX_CACHE_SIZE = 50;
const apiCache = new Map();

// Helper function to create a delay, used for sequencing UI messages.
const delay = ms => new Promise(res => setTimeout(res, ms));

// FIXED: callGeminiAPI now uses robust conditional logic to construct the request body.
const callGeminiAPI = async (prompt, jsonMode = false) => {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const cacheKey = prompt + (jsonMode ? 'JSON' : 'TEXT');

    if (apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey);
    }

    // Implement cache eviction policy (FIFO)
    if (apiCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = apiCache.keys().next().value;
        apiCache.delete(oldestKey);
    }
    
    // CRITICAL FIX: Construct the base request body
    const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
    };

    // CRITICAL FIX: Conditionally add generationConfig only when jsonMode is true.
    // This prevents the persistent 400 error.
    if (jsonMode) {
        requestBody.generationConfig = {
            responseMimeType: "application/json",
        };
    }

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody) 
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} - ${errorData.error.message}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("Could not find text in API response.");
        }

        apiCache.set(cacheKey, text);
        
        // If JSON mode, try to parse the text into a JS object.
        if (jsonMode) {
            try {
                return JSON.parse(text.trim());
            } catch (e) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("Invalid JSON response from API.");
            }
        }
        return text;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
};

// Scaffolding Levels Definition
const LEARNING_LEVELS = {
    1: {
        goal: "Let's make a simple sentence (like 'The dog runs').",
        structure: ['determiner', 'noun', 'verb', 'punctuation'],
        threshold: 3
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

class SentenceBuilder {
    static DURATION = {
        INFO: 6000,
        SUCCESS: 3000,
        THINKING: 8000, // Longer for API calls
        WARNING: 4000
    };

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
        this._getElements();
        this._setupEventListeners();
    }

    async init() {
        try {
            const response = await fetch('./words.json');
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
            goBackBtn: document.getElementById('goBackBtn'),
            clearBtn: document.getElementById('clearBtn'),
            readAloudBtn: document.getElementById('readAloudBtn'),
            messageBox: document.getElementById('messageBox'),
            shuffleWordsBtn: document.getElementById('shuffleWordsBtn'),
            levelProgressText: document.getElementById('levelProgressText'),
            progressFill: document.getElementById('progressFill'),
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
        
        // FEATURE: Tap to Edit
        this.elements.sentenceDisplay.addEventListener('click', (e) => {
            if (e.target.matches('.sentence-word')) this._handleSentenceWordTap(e.target);
        });
    }
    
    // NEW METHOD: Tap to Edit Logic
    _handleSentenceWordTap(wordElement) {
        const wordIndex = parseInt(wordElement.dataset.index);
        
        // Remove the tapped word and all words that follow it
        this.state.sentenceWordsArray.splice(wordIndex);
        
        this._renderSentence();
        this._fetchNextWords();
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

    async _levelUp() {
        if (LEARNING_LEVELS[this.state.currentLevel + 1]) {
            this.state.currentLevel++;
            this._showMessage('🎉 LEVEL UP! 🎉', 'bg-success', SentenceBuilder.DURATION.SUCCESS);
            await delay(SentenceBuilder.DURATION.SUCCESS);
            this._startLevel();
        } else {
            this._showMessage('Wow! You are a sentence master! 🏆', 'bg-success', SentenceBuilder.DURATION.INFO);
        }
    }

    async _getAIWords(sentence, nextPartType, theme, existingWords) {
        // FEATURE: JSON Mode for API Calls and Prevent Word Repetition
        const existingWordsList = existingWords.join(', ');
        const prompt = `You are a helpful language model assistant for a first grader. Given the partial sentence "${sentence}", please suggest a list of 5-7 simple words that a 6-year-old would know. The next word should be a "${nextPartType}". If there is a theme, like "${theme}", try to suggest words related to it.
        The following words are already in the word bank, so please suggest different ones: [${existingWordsList}].
        Please respond with ONLY a JSON object in the format: { "words": ["word1", "word2", "word3"] }`;
        
        try {
            const jsonResponse = await callGeminiAPI(prompt, true); // True for JSON mode
            
            if (jsonResponse.words && Array.isArray(jsonResponse.words)) {
                return jsonResponse.words.map(word => ({ word: word.trim().toLowerCase(), type: nextPartType, theme: theme }));
            }
            throw new Error("Invalid AI response structure (missing 'words' array).");
        } catch (error) {
            console.error('Failed to get AI words, using fallback:', error);
            // Fallback logic for when the API fails or returns bad data. (Kept for robustness)
            const level = LEARNING_LEVELS[this.state.currentLevel];
            const fallbackType = level.structure[this.state.sentenceWordsArray.length];
            let fallbackWords = [];
            if (['determiner', 'preposition', 'punctuation'].includes(fallbackType)) {
                fallbackWords = this.state.allWordsData.miscWords[fallbackType];
            } else {
                fallbackWords = this.state.allWordsData.words[fallbackType][this.state.currentTheme];
            }
            const randomWords = fallbackWords
                .filter(word => !existingWords.includes(word)) // Filter out existing words
                .sort(() => 0.5 - Math.random())
                .slice(0, 5)
                .map(word => ({ word: word.trim(), type: fallbackType, theme: this.state.currentTheme }));
            this._showMessage('Hmm, having trouble. Here are some words!', 'bg-info', SentenceBuilder.DURATION.INFO);
            return randomWords;
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

        this._showMessage('Thinking...', 'bg-info', SentenceBuilder.DURATION.THINKING);
        this.elements.wordBankContainer.classList.add('loading');
        this.elements.shuffleWordsBtn.disabled = true;

        const currentSentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        const existingWords = this.state.wordBank.map(w => w.word);
        
        let words;
        if (['determiner', 'preposition', 'punctuation'].includes(nextPart)) {
            // Use local word list for common words
            words = this.state.allWordsData.miscWords[nextPart].map(word => ({ word: word, type: nextPart, theme: this.state.currentTheme }));
        } else {
            // Fetch AI words, passing the list of words currently in the bank
            words = await this._getAIWords(currentSentence, nextPart, this.state.currentTheme, existingWords);
        }

        this.state.wordBank = words.sort((a, b) => a.word.localeCompare(b.word));

        this.elements.wordBankContainer.classList.remove('loading');
        this.elements.shuffleWordsBtn.disabled = false;
        this._renderWordBank();
    }

    _renderWordBank() {
        this.elements.wordBankContainer.innerHTML = '';
        const colorMap = this.state.allWordsData.typeColors;

        if (this.state.wordBank.length === 0) {
            this.elements.wordBankContainer.innerHTML = '<p class="text-gray-500 italic">Sentence complete! High Five ready! ✋</p>';
            this._hideMessage();
            return;
        }

        this.state.wordBank.forEach(wordObj => {
            const button = document.createElement('button');
            button.textContent = wordObj.word;
            button.dataset.type = wordObj.type;
            const colorClass = colorMap[wordObj.type] || colorMap['other'];
            button.className = `word-button squircle ${colorClass} fade-in`;
            this.elements.wordBankContainer.appendChild(button);
        });
        this._hideMessage();
    }

    _handleWordClick(wordElement) {
        const wordObj = {
            word: wordElement.textContent,
            type: wordElement.dataset.type
        };
        this.state.sentenceWordsArray.push(wordObj);
        this._renderSentence();
        this._fetchNextWords();
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
                span.dataset.index = index; // FEATURE: Tap to Edit (Index)
                const colorClass = colorMap[wordObj.type] || colorMap['other'];
                // Added 'tappable' class for tap-to-edit styling/cursor
                span.className = `sentence-word ${colorClass} fade-in tappable`; 
                this.elements.sentenceDisplay.appendChild(span);
                if (index < this.state.sentenceWordsArray.length - 1 && this.state.sentenceWordsArray[index + 1].type !== 'punctuation') {
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
        if (this.state.sentenceWordsArray.length > 0) {
            this.state.sentenceWordsArray.pop();
            this._renderSentence();
            this._fetchNextWords();
        }
    }

    _readSentenceAloud() {
        const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        if ('speechSynthesis' in window && sentence.length > 0) {
            speechSynthesis.speak(new SpeechSynthesisUtterance(sentence));
        } else if (sentence.length > 0) {
            this._showMessage('Sorry, I can\'t read aloud on this browser.', 'bg-warning', SentenceBuilder.DURATION.WARNING);
        }
    }

    _clearSentence() {
        this.state.sentenceWordsArray = [];
        this._renderSentence();
        this._fetchNextWords();
    }

    async _handleHighFiveClick() {
        const sentenceText = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        const checkPrompt = `You are a helpful language model. The sentence is "${sentenceText}". Is it grammatically complete? Answer with only one of these words: VALID or INVALID.`;
        this.elements.highFiveBtn.disabled = true;

        try {
            this._showMessage("Checking...", 'bg-info', SentenceBuilder.DURATION.THINKING);
            const feedback = await callGeminiAPI(checkPrompt);

            if (feedback.trim().toLowerCase().includes("valid")) {
                await this._handleValidSentence();
            } else {
                // FEATURE: Offer More Specific Hints (Gently Correct)
                const hintPrompt = `You are a friendly teacher for a 6-year-old. The child wrote: "${sentenceText}". This sentence is incorrect. Gently correct it for them and give one simple, encouraging sentence explaining the change. For example: "Great try! We can fix that by saying 'The dog runs.' See how 'runs' works better with one dog?"`;
                // FEATURE: Visual Feedback (Shake)
                this.elements.sentenceDisplay.classList.add('shake-animation');
                this.elements.sentenceDisplay.addEventListener('animationend', () => {
                    this.elements.sentenceDisplay.classList.remove('shake-animation');
                }, { once: true });
                const hint = await callGeminiAPI(hintPrompt);
                this._showMessage(hint, 'bg-info', SentenceBuilder.DURATION.INFO);
            }
        } catch (error) {
            // UPGRADE: Graceful API Failure Handling
            this._showMessage('Hmm, I can’t check that sentence right now. Let’s try a new one! 👍', 'bg-warning', SentenceBuilder.DURATION.WARNING);
            await delay(SentenceBuilder.DURATION.WARNING); // Wait for the user to read the warning
            this._clearSentence(); // Clears the current sentence and fetches new words
        } finally {
            // Re-enable the button if the sentence is still present and complete
            this._renderHighFiveButton();
        }
    }

    async _handleValidSentence() {
        // FEATURE: Visual Feedback (Confetti/Sparkle)
        this.elements.sentenceDisplay.classList.add('confetti-animation');
        this.elements.sentenceDisplay.addEventListener('animationend', () => {
            this.elements.sentenceDisplay.classList.remove('confetti-animation');
        }, { once: true });
        
        this._showMessage('Awesome! Great sentence! 🎉', 'bg-success', SentenceBuilder.DURATION.SUCCESS);
        this.state.sentencesCompletedAtLevel++;

        await delay(2000);
        this._showMessage('Ready for a new one? Let\'s go!', 'bg-info', SentenceBuilder.DURATION.INFO);

        await delay(2000);
        const level = LEARNING_LEVELS[this.state.currentLevel];
        if (this.state.sentencesCompletedAtLevel >= level.threshold) {
            await this._levelUp();
        } else {
            this._clearSentence();
            this._updateInstructionText();
        }
    }

    _updateInstructionText() {
        const level = LEARNING_LEVELS[this.state.currentLevel];
        const remaining = level.threshold - this.state.sentencesCompletedAtLevel;
        this.elements.levelProgressText.textContent = `${level.goal} (${remaining} more to level up!)`;
        const progress = (this.state.sentencesCompletedAtLevel / level.threshold) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
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
