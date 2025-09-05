

// IMPORTANT: Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Your API key is a long string that begins with "AIzaSy..."
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI";



// API endpoints for different Gemini models
const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const TEXT_GENERATION_MODEL = "gemini-1.5-flash:generateContent";
const TEXT_TO_SPEECH_MODEL = "gemini-2.5-flash-preview-tts:generateContent";

// DOM element selectors
const actionButton = document.getElementById("action-button");
const buttonContent = document.getElementById("button-content");
const loadingSpinner = document.getElementById("loading-spinner");
const chatHistory = document.getElementById("chat-history");
const interimResults = document.getElementById("interim-results");
const cancelButton = document.getElementById("cancel-button");

// Constants
const AI_VOICE_NAME = "Puck";
const INITIAL_PROMPT = "Hello there. Let's practice speaking with confidence. How are you today?";
const MAX_RETRIES = 3;

// State variables
let lessonState = "initial"; // "initial", "listening", "speaking", "paused"
let recognition = null;
let currentAudio = null; // Reusable Audio object for iOS compatibility

// Function to build API URLs consistently
function buildApiUrl(modelName) {
    return `${API_URL_BASE}${modelName}?key=${API_KEY}`;
}

// Reusable function to fetch with exponential backoff
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        const response = await fetch(url, options);

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("API response not OK:", response.status, response.statusText, errorBody);

            if (retries > 0 && (response.status === 429 || response.status >= 500)) {
                const delay = (MAX_RETRIES - retries) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(url, options, retries - 1);
            }
            throw new Error(`API request failed with status: ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error("Fetch failed:", error);
        if (retries > 0) {
            const delay = (MAX_RETRIES - retries) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

// Event listener for the main action button
actionButton.addEventListener("click", () => {
    // On the very first click, initialize the Audio object to satisfy iOS autoplay policy
    if (!currentAudio) {
        currentAudio = new Audio();
    }

    switch (lessonState) {
        case "initial":
            startLesson();
            break;
        case "listening":
            stopLesson();
            break;
        case "speaking":
            // The button will be disabled, so this case shouldn't be reached
            break;
        case "paused":
            // Handle restart or resume logic if needed
            break;
    }
});

// Event listener for the cancel button
cancelButton.addEventListener("click", () => {
    stopLesson();
    resetUI();
});

// Functions to manage the UI state
function toggleButtonState(state) {
    if (state === "loading") {
        buttonContent.classList.add("hidden");
        loadingSpinner.classList.remove("hidden");
        actionButton.disabled = true;
        actionButton.classList.remove("pulse-animate");
    } else {
        buttonContent.classList.remove("hidden");
        loadingSpinner.classList.add("hidden");
        actionButton.disabled = false;
    }
}

function updateButtonText(text) {
    buttonContent.textContent = text;
}

function showCancelButton(show) {
    cancelButton.classList.toggle("hidden", !show);
}

function resetUI() {
    lessonState = "initial";
    updateButtonText("Start Lesson");
    showCancelButton(false);
    actionButton.classList.remove("pulse-animate");
}

// Function to add a new message to the chat history
function addMessage(text, sender) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message", sender === "ai" ? "ai-message" : "user-message");
    messageElement.textContent = text;
    chatHistory.appendChild(messageElement);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Function to handle the start of the lesson
async function startLesson() {
    lessonState = "speaking";
    toggleButtonState("loading");
    updateButtonText("Loading...");
    showCancelButton(true);

    // Get the text first
    const aiResponseText = await getAIResponse(INITIAL_PROMPT);

    if (aiResponseText) {
        // Immediately add the text to the chat
        addMessage(aiResponseText, "ai");
        updateButtonText("Generating Voice...");
        // Then get and play the audio
        await speakResponse(aiResponseText);
    } else {
        // This path is taken if the first text generation API call fails
        resetUI();
        addMessage("Sorry, I'm having trouble with my voice right now. Please try again later.", "ai");
    }
}

// Function to handle the end of the lesson
function stopLesson() {
    if (recognition) {
        recognition.stop();
    }
    if (currentAudio) {
        currentAudio.pause();
    }
    lessonState = "paused";
    toggleButtonState("idle");
    actionButton.classList.remove("pulse-animate");
}

// Function to send a request to the Gemini Generative model for text only
async function getAIResponse(prompt) {
    try {
        const payload = {
            contents: [{
                parts: [{ text: prompt }]
            }],
        };

        const response = await fetchWithRetry(buildApiUrl(TEXT_GENERATION_MODEL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text;
        } else {
            console.error("No valid text found in text generation API response.");
            return null;
        }
    } catch (error) {
        console.error("Failed to fetch AI text response:", error);
        return null;
    }
}

// Function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// Function to generate and play TTS audio
async function speakResponse(text) {
    try {
        const payload = {
            contents: [{
                parts: [{ text: text }]
            }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: AI_VOICE_NAME }
                    }
                }
            },
        };

        const response = await fetchWithRetry(buildApiUrl(TEXT_TO_SPEECH_MODEL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            // Correctly handle the pre-encoded audio from the API
            const audioBlob = new Blob([base64ToArrayBuffer(audioData)], { type: mimeType });
            const audioUrl = URL.createObjectURL(audioBlob);

            // Re-use the existing Audio object and set its source
            currentAudio.src = audioUrl;
            currentAudio.play();
            
            // Revoke the object URL on both ended and pause to prevent memory leaks
            const cleanup = () => {
                URL.revokeObjectURL(audioUrl);
            };
            currentAudio.onended = () => {
                cleanup();
                startSpeechRecognition();
            };
            currentAudio.onpause = cleanup;

        } else {
            console.error("Invalid audio data from TTS API.");
            throw new Error("Invalid audio data from API.");
        }
    } catch (error) {
        console.error("Failed to speak response:", error);
        stopLesson();
        addMessage("There was an error generating my voice. Please check your network and try again.", "ai");
        resetUI();
    }
}

// Function to start Speech Recognition
function startSpeechRecognition() {
    lessonState = "listening";
    updateButtonText("Listening...");
    showCancelButton(true);
    actionButton.classList.add("pulse-animate");

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addMessage("Your browser does not support voice input. Please use the keyboard to type.", "ai");
        // Fallback to text input if Speech Recognition is not available
        document.getElementById("fallback-text-input").classList.remove("hidden");
        document.getElementById("fallback-text-input").focus();
        updateButtonText("Speak (Not Supported)");
        return;
    }

    // Reuse the recognition instance if it already exists
    if (!recognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onstart = () => {
            interimResults.textContent = "Listening...";
        };

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            interimResults.textContent = interimTranscript;

            if (finalTranscript.trim().length > 0) {
                recognition.stop(); // Stop listening once a final result is received
                processUserSpeech(finalTranscript);
            }
        };

        recognition.onend = () => {
            interimResults.textContent = "";
            actionButton.classList.remove("pulse-animate");
            // Automatically restart if not in a paused state, but with a slight delay
            if (lessonState === "listening") {
                setTimeout(() => {
                    recognition.start();
                }, 500);
            }
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error:", event.error);
            if (event.error === 'network' || event.error === 'service-not-allowed') {
                interimResults.textContent = "Network error. Please check your connection.";
            }
            stopLesson();
        };
    }
    
    // Start listening
    recognition.start();
}

// Process the final transcript from the user
async function processUserSpeech(finalTranscript) {
    addMessage(finalTranscript, "user");
    toggleButtonState("loading");
    updateButtonText("Processing...");
    const aiResponseText = await getAIResponse(finalTranscript);
    if (aiResponseText) {
        addMessage(aiResponseText, "ai");
        updateButtonText("Generating Voice...");
        await speakResponse(aiResponseText);
    } else {
        addMessage("I'm sorry, I couldn't understand that. Can you please try again?", "ai");
        await speakResponse("I'm sorry, I couldn't understand that. Can you please try again?");
    }
}

// Fallback for text input submission if Speech Recognition isn't available
document.getElementById('fallback-text-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const text = e.target.value;
        if (text.trim() === '') return;
        addMessage(text, 'user');
        e.target.value = '';
        toggleButtonState("loading");
        updateButtonText("Processing...");
        const aiResponseText = await getAIResponse(text);
        if (aiResponseText) {
            addMessage(aiResponseText, "ai");
            updateButtonText("Generating Voice...");
            await speakResponse(aiResponseText);
        } else {
            addMessage("I'm sorry, I couldn't understand that. Can you please try again?", "ai");
            await speakResponse("I'm sorry, I couldn't understand that. Can you please try again?");
        }
    }
});


// Ensure the script runs after the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    // Initial UI setup on page load
    resetUI();
});
