

// IMPORTANT: Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Your API key is a long string that begins with "AIzaSy..."
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI";


// API endpoints for different Gemini models
const TEXT_GENERATION_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + API_KEY;
const TEXT_TO_SPEECH_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

// DOM element selectors
const actionButton = document.getElementById("action-button");
const buttonContent = document.getElementById("button-content");
const loadingSpinner = document.getElementById("loading-spinner");
const chatHistory = document.getElementById("chat-history");
const interimResults = document.getElementById("interim-results");
const cancelButton = document.getElementById("cancel-button");

// State variables
let lessonState = "initial"; // "initial", "listening", "speaking", "paused"
let recognition = null;
let currentAudio = null;

// Event listener for the main action button
actionButton.addEventListener("click", () => {
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

    // Initial AI prompt for a short, fast response
    const prompt = "Hello there. Let's practice speaking with confidence. How are you today?";

    // Get the text first
    const aiResponseText = await getAIResponse(prompt);

    if (aiResponseText) {
        // Immediately add the text to the chat
        addMessage(aiResponseText, "ai");
        updateButtonText("Generating Voice...");
        // Then get and play the audio
        await speakResponse(aiResponseText);
    } else {
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

        const response = await fetch(TEXT_GENERATION_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("API response not OK:", response.status, response.statusText);
            return null;
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];
        if (candidate && candidate.content?.parts?.[0]?.text) {
            return candidate.content.parts[0].text;
        } else {
            console.error("No valid text found in API response.");
            return null;
        }
    } catch (error) {
        console.error("Failed to fetch AI response:", error);
        return null;
    }
}

// Function to convert PCM audio data to a WAV blob
function pcmToWav(pcmData, sampleRate) {
    const pcm16 = new Int16Array(pcmData);
    const buffer = new ArrayBuffer(44 + pcm16.byteLength);
    const view = new DataView(buffer);
    const writeString = (view, offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };
    let offset = 0;

    // Write WAV header
    writeString(view, offset, 'RIFF'); offset += 4;
    view.setUint32(offset, 36 + pcm16.byteLength, true); offset += 4;
    writeString(view, offset, 'WAVE'); offset += 4;
    writeString(view, offset, 'fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4; // Sub-chunk 1 size
    view.setUint16(offset, 1, true); offset += 2; // Audio format (1 for PCM)
    view.setUint16(offset, 1, true); offset += 2; // Number of channels
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * 2, true); offset += 4; // Byte rate
    view.setUint16(offset, 2, true); offset += 2; // Block align
    view.setUint16(offset, 16, true); offset += 2; // Bits per sample
    writeString(view, offset, 'data'); offset += 4;
    view.setUint32(offset, pcm16.byteLength, true); offset += 4;

    // Write PCM data
    for (let i = 0; i < pcm16.length; i++) {
        view.setInt16(offset, pcm16[i], true);
        offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
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
                        prebuiltVoiceConfig: { voiceName: "Puck" }
                    }
                }
            },
        };

        const response = await fetch(`${TEXT_TO_SPEECH_API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("TTS API response not OK:", response.status, response.statusText);
            throw new Error("TTS API request failed.");
        }

        const result = await response.json();
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        const audioData = part?.inlineData?.data;
        const mimeType = part?.inlineData?.mimeType;

        if (audioData && mimeType && mimeType.startsWith("audio/")) {
            const sampleRate = parseInt(mimeType.match(/rate=(\d+)/)[1], 10);
            const pcmData = base64ToArrayBuffer(audioData);
            const wavBlob = pcmToWav(pcmData, sampleRate);
            const audioUrl = URL.createObjectURL(wavBlob);
            currentAudio = new Audio(audioUrl);
            currentAudio.play();
            currentAudio.onended = () => {
                startSpeechRecognition();
            };
        } else {
            console.error("Invalid audio data from API.");
            throw new Error("Invalid audio data from API.");
        }
    } catch (error) {
        console.error("Failed to speak response:", error);
        stopLesson();
        addMessage("Sorry, I'm having trouble with my voice right now. Please try again later.", "ai");
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
        addMessage("Speech recognition is not supported in this browser. Please use Google Chrome.", "ai");
        // Fallback to text input if Speech Recognition is not available
        document.getElementById("fallback-text-input").classList.remove("hidden");
        document.getElementById("fallback-text-input").focus();
        updateButtonText("Speak (Not Supported)");
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;

    let finalTranscript = '';

    recognition.onstart = () => {
        interimResults.textContent = "Listening...";
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }
        interimResults.textContent = interimTranscript;
    };

    recognition.onend = async () => {
        interimResults.textContent = "";
        actionButton.classList.remove("pulse-animate");
        if (finalTranscript.trim().length > 0) {
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
        } else {
            // Restart recognition if nothing was said
            if (lessonState === "listening") {
                startSpeechRecognition();
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'network' || event.error === 'service-not-allowed') {
            interimResults.textContent = "Network error. Please check your connection.";
        }
        stopLesson();
    };

    recognition.start();
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

