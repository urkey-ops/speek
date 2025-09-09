// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
const API_KEY = 'AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI';

// This is the main application file for the Sentence Lab.
// This version is designed to connect to the Gemini API.

// -------------------------------------------------------------
// SECURE API KEY HANDLING
// In a real application, a backend server should handle API keys.
// For this demonstration, you can put your key here.
// -------------------------------------------------------------
// const API_KEY = 'YOUR_API_KEY';

const callGeminiAPI = async (prompt) => {
  const API_ENDPOINT = `https://gemini-api.google.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;
  
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API returned an error: ${response.status} - ${errorData.error.message}`);
    }

    const data = await response.json();
    return data;

  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};

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

class SentenceBuilder {
  constructor() {
    this.typeColors = {
      "default": "bg-gray-300 text-gray-900",
    };
    this.fallbackWords = ["is", "the", "a", "and", "in", "it"];
    this.state = {
      sentenceWordsArray: [],
      wordBank: [],
      successCounter: 0,
      topic: 'cat', // Default topic
    };
    this.elements = {};
    this.debouncedFetchNextWords = debounce(this._fetchNextWords.bind(this), 500);
  }

  init() {
    this._getElements();
    this._setupEventListeners();
    this._renderSentence();
    this._fetchNextWords();
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
    this.elements.wordBankContainer.addEventListener('click', (event) => {
      if (event.target.matches('.word-button')) {
        this._handleWordClick(event.target.textContent);
      }
    });
    this.elements.goBackBtn.addEventListener('click', () => this._goBack());
    this.elements.clearBtn.addEventListener('click', () => this._clearSentence());
    this.elements.readAloudBtn.addEventListener('click', () => this._readSentenceAloud());
    this.elements.highFiveBtn.addEventListener('click', () => this._handleHighFiveClick());
    this.elements.shuffleWordsBtn.addEventListener('click', () => this._shuffleWords());
  }

  async _fetchNextWords() {
    this.state.wordBank = this.fallbackWords;
    this._renderWordBank();
    this._showMessage("Thinking...", 'bg-info');

    try {
        const currentSentence = this.state.sentenceWordsArray.join(' ');
        const prompt = `You are a friendly teacher for a 1st grader. Provide 5-7 age-appropriate words to continue this sentence about a ${this.state.topic}. Current sentence: "${currentSentence}". Return the response as a simple comma-separated list of words, with no extra text.`;
        
        const response = await callGeminiAPI(prompt);
        
        const words = response.candidates[0].content.parts[0].text.trim().split(',').map(word => word.trim());
        
        if (words && words.length > 0) {
            this.state.wordBank = words;
            this._renderWordBank();
        } else {
            throw new Error('API response was empty or malformed.');
        }

    } catch (error) {
      console.error('API call failed:', error);
      this._showMessage('Oops! Something went wrong. Please try again.', 'bg-danger');
    } finally {
        this._updateInstructionText();
    }
  }

  _renderWordBank() {
    this.elements.wordBankContainer.innerHTML = '';
    this.state.wordBank.forEach(word => {
      const wordButton = document.createElement('button');
      wordButton.textContent = word;
      wordButton.className = `word-button squircle ${this.typeColors.default}`;
      this.elements.wordBankContainer.appendChild(wordButton);
    });
  }

  _handleWordClick(word) {
    const isPunctuation = ['.', '!', '?'].includes(word);
    this.state.sentenceWordsArray.push(word);
    this._renderSentence();
    if (!isPunctuation) {
        this.debouncedFetchNextWords();
    }
  }

  _renderSentence() {
    this.elements.sentenceDisplay.innerHTML = '';
    if (this.state.sentenceWordsArray.length === 0) {
      this.elements.sentenceDisplay.innerHTML = '<span class="placeholder-text">Click on a word below to begin...</span>';
    }
    this.state.sentenceWordsArray.forEach((word, index) => {
      const span = document.createElement('span');
      span.textContent = word;
      span.className = `sentence-word ${this.typeColors.default}`;
      this.elements.sentenceDisplay.appendChild(span);

      const isPunctuation = ['.', '!', '?'].includes(word);
      if (!isPunctuation && index < this.state.sentenceWordsArray.length - 1) {
          this.elements.sentenceDisplay.appendChild(document.createTextNode(' '));
      }
    });
    this._renderHighFiveButton();
  }

  _renderHighFiveButton() {
    const lastWord = this.state.sentenceWordsArray[this.state.sentenceWordsArray.length - 1];
    const isComplete = lastWord === '.' || lastWord === '!' || lastWord === '?';
    this.elements.highFiveBtn.disabled = !isComplete;
  }

  _goBack() {
    this.state.sentenceWordsArray.pop();
    this._renderSentence();
    this.debouncedFetchNextWords();
  }

  _readSentenceAloud() {
    const sentence = this.state.sentenceWordsArray.join(' ');
    if (sentence.length > 0) {
      const utterance = new SpeechSynthesisUtterance(sentence);
      utterance.lang = 'en-US';
      speechSynthesis.speak(utterance);
    }
  }

  _clearSentence() {
    this.state.sentenceWordsArray = [];
    this._renderSentence();
    this.debouncedFetchNextWords();
  }

  async _handleHighFiveClick() {
    const currentSentence = this.state.sentenceWordsArray.join(' ');
    const prompt = `You are a friendly teacher for a 1st grader. The current sentence is "${currentSentence}". Is it complete and correct? If so, respond with "Correct". If not, provide one simple, encouraging hint.`;
    
    try {
      const response = await callGeminiAPI(prompt);
      const feedback = response.candidates[0].content.parts[0].text;
      
      if (feedback.includes("Correct")) {
        this._showMessage('Awesome! Great sentence! 🎉', 'bg-success');
        this.state.sentenceWordsArray = [];
        this._renderSentence();
        this.debouncedFetchNextWords();
      } else {
        this._showMessage(feedback, 'bg-warning');
      }
    } catch (error) {
      console.error('Validation API call failed:', error);
      this._showMessage('Could not check your sentence. Please try again.', 'bg-danger');
    }
  }

  _shuffleWords() {
    this._fetchNextWords();
  }

  _updateInstructionText() {
    if (this.state.sentenceWordsArray.length === 0) {
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
}
