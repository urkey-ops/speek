

// IMPORTANT: Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Your API key is a long string that begins with "AIzaSy..."
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI";



// API endpoints
const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const TEXT_AUDIO_MODEL = "gemini-2.5-flash-preview-tts:generateContent";

// DOM selectors
const actionButton = document.getElementById("action-button");
const buttonContent = document.getElementById("button-content");
const loadingSpinner = document.getElementById("loading-spinner");
const chatHistory = document.getElementById("chat-history");
const interimResults = document.getElementById("interim-results");
const cancelButton = document.getElementById("cancel-button");
const fallbackInput = document.getElementById("fallback-text-input");

// Constants
const AI_VOICE_NAME = "Puck";
const INITIAL_PROMPT = "Hello there. Let's practice speaking with confidence. How are you today?";
const MAX_RETRIES = 3;

// State
let lessonState = "initial"; // "initial", "listening", "speaking", "paused"
let recognition = null;
let currentAudio = null;
let recognitionStopFlag = false;

// Build URL
function buildApiUrl(modelName) {
    return `${API_URL_BASE}${modelName}?key=${API_KEY}`;
}

// Fetch with retry
async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            console.error("API response not OK:", response.status, response.statusText, errorBody);
            if (retries > 0 && (response.status === 429 || response.status >= 500)) {
                const delay = (MAX_RETRIES - retries) * 1000;
                await new Promise(r => setTimeout(r, delay));
                return fetchWithRetry(url, options, retries - 1);
            }
            throw new Error(`API request failed with status ${response.status}`);
        }
        return response;
    } catch (error) {
        console.error("Fetch failed:", error);
        if (retries > 0) {
            const delay = (MAX_RETRIES - retries) * 1000;
            await new Promise(r => setTimeout(r, delay));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

// UI helpers
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
function updateButtonText(text) { buttonContent.textContent = text; }
function showCancelButton(show) { cancelButton.classList.toggle("hidden", !show); }
function resetUI() {
    lessonState = "initial";
    recognitionStopFlag = true;
    updateButtonText("Start Lesson");
    showCancelButton(false);
    actionButton.classList.remove("pulse-animate");
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
    }
}

// Chat history
function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.classList.add("message", sender === "ai" ? "ai-message" : "user-message");
    msg.textContent = text;
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

// Base64 decoder (optimized)
function base64ToArrayBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

// Unified AI call (text + audio)
async function getTextAndAudio(prompt) {
    try {
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseModalities: ["TEXT", "AUDIO"],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: AI_VOICE_NAME } }
                }
            }
        };

        const response = await fetchWithRetry(buildApiUrl(TEXT_AUDIO_MODEL), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const parts = result?.candidates?.[0]?.content?.parts || [];

        let text = null, audioUrl = null;
        for (const p of parts) {
            if (p.text) text = p.text;
            if (p.inlineData?.data && p.inlineData?.mimeType?.startsWith("audio/")) {
                const audioBlob = new Blob([base64ToArrayBuffer(p.inlineData.data)], {
                    type: p.inlineData.mimeType
                });
                audioUrl = URL.createObjectURL(audioBlob);
            }
        }
        return { text, audioUrl };
    } catch (err) {
        console.error("Unified AI call failed:", err);
        throw err;
    }
}

// Start lesson
async function startLesson() {
    lessonState = "speaking";
    toggleButtonState("loading");
    updateButtonText("Loading...");
    showCancelButton(true);

    try {
        const { text, audioUrl } = await getTextAndAudio(INITIAL_PROMPT);
        if (!text || !audioUrl) throw new Error("Incomplete AI response");

        addMessage(text, "ai");
        updateButtonText("Playing Voice...");

        currentAudio.src = audioUrl;
        currentAudio.play();

        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            startSpeechRecognition();
        };
        currentAudio.onpause = () => URL.revokeObjectURL(audioUrl);

    } catch (err) {
        console.error("Lesson start failed:", err);
        addMessage("⚠️ Could not start lesson. Check your connection or API settings.", "ai");
        resetUI();
    }
}

// Stop lesson
function stopLesson() {
    recognitionStopFlag = true;
    if (recognition) recognition.stop();
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute("src");
    }
    lessonState = "paused";
    toggleButtonState("idle");
    actionButton.classList.remove("pulse-animate");
}

// Speech recognition
function startSpeechRecognition() {
    lessonState = "listening";
    recognitionStopFlag = false;
    updateButtonText("Listening...");
    showCancelButton(true);
    actionButton.classList.add("pulse-animate");

    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
        addMessage("🎤 Voice input not supported. Please type instead.", "ai");
        fallbackInput.classList.remove("hidden");
        fallbackInput.focus();
        updateButtonText("Voice (Unavailable)");
        return;
    }

    if (!recognition) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = "en-US";
        recognition.interimResults = true;
        recognition.continuous = true;

        recognition.onstart = () => { interimResults.textContent = "Listening..."; };

        recognition.onresult = e => {
            let interim = "", final = "";
            for (let i = e.resultIndex; i < e.results.length; ++i) {
                const t = e.results[i][0].transcript;
                if (e.results[i].isFinal) final += t + " ";
                else interim += t;
            }
            interimResults.textContent = interim;
            if (final.trim()) {
                recognition.stop();
                processUserSpeech(final.trim());
            }
        };

        recognition.onend = () => {
            interimResults.textContent = "";
            actionButton.classList.remove("pulse-animate");
            if (lessonState === "listening" && !recognitionStopFlag) {
                setTimeout(() => recognition.start(), 600);
            }
        };

        recognition.onerror = e => {
            console.error("Speech recognition error:", e.error);
            let msg = "⚠️ Speech recognition error.";
            if (e.error === "network") msg = "⚠️ Network issue. Please check your connection.";
            if (e.error === "not-allowed") msg = "⚠️ Mic access blocked. Please allow microphone use.";
            addMessage(msg, "ai");
            stopLesson();
        };
    }
    recognition.start();
}

// Handle user speech
async function processUserSpeech(finalTranscript) {
    addMessage(finalTranscript, "user");
    toggleButtonState("loading");
    updateButtonText("Processing...");

    try {
        const { text, audioUrl } = await getTextAndAudio(finalTranscript);
        if (!text || !audioUrl) throw new Error("Incomplete AI response");

        addMessage(text, "ai");
        updateButtonText("Playing Voice...");

        currentAudio.src = audioUrl;
        currentAudio.play();

        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            startSpeechRecognition();
        };
        currentAudio.onpause = () => URL.revokeObjectURL(audioUrl);

    } catch (err) {
        console.error("Processing user speech failed:", err);
        addMessage("⚠️ I couldn't process that. Please try again.", "ai");
        resetUI();
    }
}

// Fallback text input
fallbackInput.addEventListener("keydown", async e => {
    if (e.key === "Enter") {
        const text = e.target.value.trim();
        if (!text) return;
        addMessage(text, "user");
        e.target.value = "";
        toggleButtonState("loading");
        updateButtonText("Processing...");
        await processUserSpeech(text);
    }
});

// Action button
actionButton.addEventListener("click", () => {
    if (!currentAudio) currentAudio = new Audio();
    switch (lessonState) {
        case "initial": startLesson(); break;
        case "listening": stopLesson(); break;
        case "speaking": break; // ignore
        case "paused": startLesson(); break;
    }
});

// Cancel button
cancelButton.addEventListener("click", () => {
    stopLesson();
    resetUI();
});

// Init
document.addEventListener("DOMContentLoaded", resetUI);

