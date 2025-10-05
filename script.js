// This is the main application file for the Sentence Lab.
// Version 4.6: Critical fixes for race conditions, error handling, cache management,
// memory leaks, input validation, accessibility, and code quality improvements.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// WARNING: This key is exposed on the client-side. This is insecure and should
// only be used for local testing. For production, move this to a backend server
// using the Vercel Function + Google Sheets API approach as planned for future
// projects.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// Configuration constants
const CONFIG = {
    MAX_CACHE_SIZE: 50,
    CACHE_EXPIRATION_MS: 30 * 60 * 1000, // 30 minutes
    API_TIMEOUT_MS: 10000, // 10 seconds
    DURATION: {
        INFO: 6000,
        SUCCESS: 3000,
        THINKING: 8000,
        WARNING: 4000
    }
};

// Enhanced cache with expiration
class CacheManager {
    constructor(maxSize = CONFIG.MAX_CACHE_SIZE, expirationMs = CONFIG.CACHE_EXPIRATION_MS) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.expirationMs = expirationMs;
    }

    set(key, value) {
        // Implement LRU-like behavior: remove oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;
        
        // Check if expired
        if (Date.now() - entry.timestamp > this.expirationMs) {
            this.cache.delete(key);
            return null;
        }
        
        return entry.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    clear() {
        this.cache.clear();
    }
}

const apiCache = new CacheManager();

// Helper function to create a delay
const delay = ms => new Promise(res => setTimeout(res, ms));

// Fisher-Yates shuffle algorithm for proper randomization
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

// Sanitize text for API prompts
const sanitizeText = (text) => {
    return text.replace(/[<>\"']/g, '').trim();
};

// Enhanced API call with timeout and better error handling
const callGeminiAPI = async (prompt, jsonMode = false) => {
    const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const cacheKey = prompt + (jsonMode ? 'JSON' : 'TEXT');

    // Check cache first
    if (apiCache.has(cacheKey)) {
        return apiCache.get(cacheKey);
    }

    // Construct request body
    const requestBody = {
        contents: [{ parts: [{ text: sanitizeText(prompt) }] }],
    };

    if (jsonMode) {
        requestBody.generationConfig = {
            responseMimeType: "application/json",
        };
    }

    try {
        // Implement timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS);

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API Error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            throw new Error("Could not find text in API response.");
        }

        // Parse JSON if needed
        let result = text;
        if (jsonMode) {
            try {
                result = JSON.parse(text.trim());
                // Validate JSON structure
                if (!result.words || !Array.isArray(result.words)) {
                    throw new Error("Invalid JSON structure: missing 'words' array");
                }
            } catch (e) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("Invalid JSON response from API.");
            }
        }

        // Cache the result
        apiCache.set(cacheKey, result);
        return result;
        
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error('API request timed out. Please try again.');
        }
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
        this.isLoading = false; // Prevent race conditions
        this._getElements();
        this._setupEventListeners();
    }

    async init() {
        try {
            const response = await fetch('./words.json');
            if (!response.ok) throw new Error('words.json not found or failed to fetch');
            this.state.allWordsData = await response.json();
            
            // Validate data structure
            if (!this.state.allWordsData?.themes || !this.state.allWordsData?.words) {
                throw new Error('Invalid words.json structure');
            }
            
            this._renderThemeSelector();
        } catch (error) {
            console.error("Failed to load words.json:", error);
            this.elements.themeSelector.innerHTML = `<h1 class="text-2xl text-red-600 p-8" role="alert">Error: Could not load word data. Please refresh the page.</h1>`;
            this.elements.themeSelector.classList.remove('hidden');
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
        
        // Keyboard support for word bank
        this.elements.wordBankContainer.addEventListener('keydown', (e) => {
            if (e.target.matches('.word-button') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this._handleWordClick(e.target);
            }
        });
        
        this.elements.goBackBtn.addEventListener('click', () => this._goBack());
        this.elements.clearBtn.addEventListener('click', () => this._clearSentence());
        this.elements.readAloudBtn.addEventListener('click', () => this._readSentenceAloud());
        this.elements.highFiveBtn.addEventListener('click', () => this._handleHighFiveClick());
        this.elements.shuffleWordsBtn.addEventListener('click', () => this._fetchNextWords());
        
        // Tap to Edit with keyboard support
        this.elements.sentenceDisplay.addEventListener('click', (e) => {
            if (e.target.matches('.sentence-word')) this._handleSentenceWordTap(e.target);
        });
        
        this.elements.sentenceDisplay.addEventListener('keydown', (e) => {
            if (e.target.matches('.sentence-word') && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                this._handleSentenceWordTap(e.target);
            }
        });
    }
    
    _handleSentenceWordTap(wordElement) {
        if (this.isLoading) return;
        
        const wordIndex = parseInt(wordElement.dataset.index);
        
        // Validate index
        if (isNaN(wordIndex) || wordIndex < 0 || wordIndex >= this.state.sentenceWordsArray.length) {
            console.error('Invalid word index:', wordIndex);
            return;
        }
        
        // Remove the tapped word and all words that follow it
        this.state.sentenceWordsArray.splice(wordIndex);
        
        this._renderSentence();
        
        // Clear current words and display loading before fetching new ones
        this.state.wordBank = [];
        this._renderWordBank();
        
        this._fetchNextWords();
    }

    _renderThemeSelector() {
        if (!this.state.allWordsData?.themes) return;

        this.state.allWordsData.themes.forEach(theme => {
            const button = document.createElement('button');
            button.className = 'theme-button squircle';
            button.innerHTML = `<span class="emoji" aria-hidden="true">${theme.emoji}</span>${theme.name}`;
            button.dataset.theme = theme.name;
            button.setAttribute('aria-label', `Select ${theme.name} theme`);
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
            this._showMessage('🎉 LEVEL UP! 🎉', 'bg-success', CONFIG.DURATION.SUCCESS);
            await delay(CONFIG.DURATION.SUCCESS);
            this._startLevel();
        } else {
            this._showMessage('Wow! You are a sentence master! 🏆', 'bg-success', CONFIG.DURATION.INFO);
        }
    }

    async _getAIWords(sentence, nextPartType, theme, existingWords) {
        const existingWordsList = existingWords.join(', ');
        const prompt = `You are a helpful language model assistant for a first grader. Given the partial sentence "${sentence}", please suggest a list of 5-7 simple words that a 6-year-old would know. The next word should be a "${nextPartType}". If there is a theme, like "${theme}", try to suggest words related to it.
        The following words are already in the word bank, so please suggest different ones: [${existingWordsList}].
        Please respond with ONLY a JSON object in the format: { "words": ["word1", "word2", "word3"] }`;
        
        try {
            const jsonResponse = await callGeminiAPI(prompt, true);
            
            if (jsonResponse.words && Array.isArray(jsonResponse.words) && jsonResponse.words.length > 0) {
                return jsonResponse.words.map(word => ({ 
                    word: word.trim().toLowerCase(), 
                    type: nextPartType, 
                    theme: theme 
                }));
            }
            throw new Error("Invalid AI response structure (missing or empty 'words' array).");
        } catch (error) {
            console.error('Failed to get AI words, using fallback:', error);
            return this._getFallbackWords(nextPartType, existingWords);
        }
    }

    _getFallbackWords(nextPartType, existingWords) {
        const level = LEARNING_LEVELS[this.state.currentLevel];
        const fallbackType = level.structure[this.state.sentenceWordsArray.length] || nextPartType;
        let fallbackWords = [];
        
        if (['determiner', 'preposition', 'punctuation'].includes(fallbackType)) {
            fallbackWords = this.state.allWordsData.miscWords[fallbackType] || [];
        } else {
            const typeWords = this.state.allWordsData.words[fallbackType];
            fallbackWords = (typeWords && typeWords[this.state.currentTheme]) || [];
        }
        
        // Filter out existing words and shuffle properly
        const availableWords = fallbackWords.filter(word => !existingWords.includes(word));
        
        if (availableWords.length === 0) {
            // If all words are used, return original list
            return shuffleArray(fallbackWords)
                .slice(0, 5)
                .map(word => ({ word: word.trim(), type: fallbackType, theme: this.state.currentTheme }));
        }
        
        return shuffleArray(availableWords)
            .slice(0, 5)
            .map(word => ({ word: word.trim(), type: fallbackType, theme: this.state.currentTheme }));
    }

    async _fetchNextWords() {
        // Prevent race conditions with loading gate
        if (this.isLoading) return;
        
        const level = LEARNING_LEVELS[this.state.currentLevel];
        const nextPartIndex = this.state.sentenceWordsArray.length;
        const nextPart = level.structure[nextPartIndex];

        if (!nextPart) {
            this.state.wordBank = [];
            this._renderWordBank();
            return;
        }

        // Set loading state
        this.isLoading = true;
        this._showMessage('Thinking...', 'bg-info', CONFIG.DURATION.THINKING);
        this.elements.shuffleWordsBtn.disabled = true;
        this.elements.highFiveBtn.disabled = true;
        this.elements.wordBankContainer.classList.add('loading');
        this.elements.wordBankContainer.setAttribute('aria-busy', 'true');

        try {
            const currentSentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
            const existingWords = this.state.wordBank.map(w => w.word);
            
            let words;
            if (['determiner', 'preposition', 'punctuation'].includes(nextPart)) {
                words = (this.state.allWordsData.miscWords[nextPart] || [])
                    .map(word => ({ word: word, type: nextPart, theme: this.state.currentTheme }));
            } else {
                words = await this._getAIWords(currentSentence, nextPart, this.state.currentTheme, existingWords);
            }

            this.state.wordBank = words.sort((a, b) => a.word.localeCompare(b.word));
        } catch (error) {
            console.error('Error fetching words:', error);
            this._showMessage('Having trouble getting words. Using backup!', 'bg-warning', CONFIG.DURATION.WARNING);
            this.state.wordBank = this._getFallbackWords(nextPart, []);
        } finally {
            // Always clean up loading state
            this.isLoading = false;
            this.elements.wordBankContainer.classList.remove('loading');
            this.elements.wordBankContainer.setAttribute('aria-busy', 'false');
            this.elements.shuffleWordsBtn.disabled = false;
            this._renderWordBank();
        }
    }

    _renderWordBank() {
        this.elements.wordBankContainer.innerHTML = '';
        const colorMap = this.state.allWordsData.typeColors;

        if (this.state.wordBank.length === 0) {
            this.elements.wordBankContainer.innerHTML = '<p class="text-gray-500 italic" role="status">Sentence complete! High Five ready! ✋</p>';
            this._hideMessage();
        } else {
            this.state.wordBank.forEach((wordObj, index) => {
                const button = document.createElement('button');
                button.textContent = wordObj.word;
                button.dataset.type = wordObj.type;
                const colorClass = colorMap[wordObj.type] || colorMap['other'];
                button.className = `word-button squircle ${colorClass} fade-in`;
                button.setAttribute('aria-label', `Add word ${wordObj.word}`);
                button.setAttribute('tabindex', '0');
                this.elements.wordBankContainer.appendChild(button);
                
                // Focus first button for keyboard navigation
                if (index === 0) {
                    setTimeout(() => button.focus(), 100);
                }
            });
            this._hideMessage();
        }
        this._renderHighFiveButton();
    }

    _handleWordClick(wordElement) {
        if (this.isLoading) return;
        
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
                span.dataset.index = index;
                const colorClass = colorMap[wordObj.type] || colorMap['other'];
                span.className = `sentence-word ${colorClass} fade-in tappable`;
                span.setAttribute('role', 'button');
                span.setAttribute('tabindex', '0');
                span.setAttribute('aria-label', `Remove ${wordObj.word} and everything after`);
                this.elements.sentenceDisplay.appendChild(span);
                
                if (index < this.state.sentenceWordsArray.length - 1 && 
                    this.state.sentenceWordsArray[index + 1].type !== 'punctuation') {
                    this.elements.sentenceDisplay.appendChild(document.createTextNode(' '));
                }
            });
        }
        this._renderHighFiveButton();
    }

    _renderHighFiveButton() {
        const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
        const isComplete = lastWord && lastWord.type === 'punctuation';
        this.elements.highFiveBtn.disabled = !isComplete || this.isLoading;
        this.elements.highFiveBtn.setAttribute('aria-disabled', (!isComplete || this.isLoading).toString());
    }

    _goBack() {
        if (this.isLoading) return;
        
        if (this.state.sentenceWordsArray.length > 0) {
            this.state.sentenceWordsArray.pop();
            this._renderSentence();
            this._fetchNextWords();
        }
    }

    _readSentenceAloud() {
        const sentence = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        
        if (!sentence || sentence.length === 0) return;
        
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech to prevent queue buildup
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(sentence);
            utterance.lang = 'en-US';
            utterance.rate = 0.9; // Slightly slower for clarity
            speechSynthesis.speak(utterance);
        } else {
            this._showMessage('Sorry, I can\'t read aloud on this browser.', 'bg-warning', CONFIG.DURATION.WARNING);
        }
    }

    _clearSentence() {
        if (this.isLoading) return;
        
        this.state.sentenceWordsArray = [];
        this._renderSentence();
        this._fetchNextWords();
    }

    async _handleHighFiveClick() {
        // Prevent race conditions and double-clicks
        if (this.isLoading) return;
        
        const sentenceText = this.state.sentenceWordsArray.map(w => w.word).join(' ');
        const checkPrompt = `You are a helpful language model. The sentence is "${sentenceText}". Is it grammatically complete? Answer with only one of these words: VALID or INVALID.`;
        
        // Set loading state
        this.isLoading = true;
        this.elements.highFiveBtn.disabled = true;

        try {
            this._showMessage("Checking...", 'bg-info', CONFIG.DURATION.THINKING);
            const feedback = await callGeminiAPI(checkPrompt);

            if (feedback.trim().toLowerCase().includes("valid")) {
                await this._handleValidSentence();
            } else {
                await this._handleInvalidSentence(sentenceText);
            }
        } catch (error) {
            console.error('Validation error:', error);
            // Preserve user's work on error - don't clear!
            this._showMessage('Hmm, I can't check that right now. Try the shuffle button for new words! 👍', 'bg-warning', CONFIG.DURATION.WARNING);
        } finally {
            this.isLoading = false;
            this._renderHighFiveButton();
        }
    }

    async _handleInvalidSentence(sentenceText) {
        const hintPrompt = `You are a friendly teacher for a 6-year-old. The child wrote: "${sentenceText}". This sentence is incorrect. Gently correct it for them and give one simple, encouraging sentence explaining the change. For example: "Great try! We can fix that by saying 'The dog runs.' See how 'runs' works better with one dog?"`;
        
        // Visual feedback (shake animation)
        this.elements.sentenceDisplay.classList.add('shake-animation');
        this.elements.sentenceDisplay.addEventListener('animationend', () => {
            this.elements.sentenceDisplay.classList.remove('shake-animation');
        }, { once: true });
        
        try {
            const hint = await callGeminiAPI(hintPrompt);
            this._showMessage(hint, 'bg-info', CONFIG.DURATION.INFO);
        } catch (error) {
            this._showMessage('That doesn\'t look quite right. Try again! 💪', 'bg-warning', CONFIG.DURATION.WARNING);
        }
    }

    async _handleValidSentence() {
        // Visual feedback (confetti animation)
        this.elements.sentenceDisplay.classList.add('confetti-animation');
        this.elements.sentenceDisplay.addEventListener('animationend', () => {
            this.elements.sentenceDisplay.classList.remove('confetti-animation');
        }, { once: true });
        
        this._showMessage('Awesome! Great sentence! 🎉', 'bg-success', CONFIG.DURATION.SUCCESS);
        this.state.sentencesCompletedAtLevel++;

        await delay(2000);
        this._showMessage('Ready for a new one? Let\'s go!', 'bg-info', CONFIG.DURATION.INFO);

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
        this.elements.levelProgressText.setAttribute('aria-live', 'polite');
        
        const progress = (this.state.sentencesCompletedAtLevel / level.threshold) * 100;
        this.elements.progressFill.style.width = `${progress}%`;
        this.elements.progressFill.setAttribute('aria-valuenow', progress.toFixed(0));
    }

    _showMessage(text, className, duration = 3000) {
        clearTimeout(this.messageTimeout);
        this.elements.messageBox.textContent = text;
        this.elements.messageBox.className = `message-box visible ${className}`;
        this.elements.messageBox.setAttribute('role', 'status');
        this.elements.messageBox.setAttribute('aria-live', 'polite');
        
        this.messageTimeout = setTimeout(() => {
            this._hideMessage();
        }, duration);
    }

    _hideMessage() {
        this.elements.messageBox.className = 'message-box';
        this.elements.messageBox.removeAttribute('role');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new SentenceBuilder();
    app.init();
});
