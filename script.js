

// IMPORTANT: Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Your API key is a long string that begins with "AIzaSy..."
// const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI";



// ===================
// Configuration
// ===================
// NOTE: For a production app, never expose your API key in client-side code.
// Fetch it from a secure backend or environment variable.
const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";
const TEXT_AUDIO_MODEL = "gemini-2.5-flash-preview-tts:generateContent";
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI"; // Replace with your actual key or fetch from a secure source.

const actionButton = document.getElementById("action-button");
const chatHistory = document.getElementById("chat-history");
const fallbackForm = document.getElementById("fallback-form");
const fallbackInput = document.getElementById("fallback-text-input");

const AI_VOICE_NAME = "Puck";
const INITIAL_PROMPT = "Hello there. Let's practice speaking with confidence. How are you today?";
const MAX_RETRIES = 3;

// ===================
// State
// ===================
let lessonState = "initial"; // initial, speaking, listening, thinking, paused
let recognition = null;
let currentAudio = null;
let chatContext = []; // Stores the full conversation history

// ===================
// Helpers
// ===================
function buildApiUrl(modelName) {
    return `${API_URL_BASE}${modelName}?key=${API_KEY}`;
}

async function fetchWithRetry(url, options, retries = MAX_RETRIES) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            if (retries > 0 && (res.status === 429 || res.status >= 500)) {
                await new Promise(r => setTimeout(r, 1000));
                return fetchWithRetry(url, options, retries - 1);
            }
            throw new Error(`API request failed: ${res.status}`);
        }
        return res;
    } catch (err) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, 1000));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw err;
    }
}

function addMessage(text, sender) {
    const msg = document.createElement("div");
    msg.classList.add("message", sender === "ai" ? "ai-message" : "user-message");
    const bubble = document.createElement("div");
    bubble.textContent = text;
    msg.appendChild(bubble);
    chatHistory.appendChild(msg);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateUI() {
    switch (lessonState) {
        case "initial":
            actionButton.textContent = "🎤 Start Lesson";
            actionButton.disabled = false;
            actionButton.classList.remove("listening");
            break;
        case "thinking":
            actionButton.textContent = "Thinking...";
            actionButton.disabled = true;
            actionButton.classList.remove("listening");
            break;
        case "speaking":
            actionButton.textContent = "🔊 AI is Speaking";
            actionButton.disabled = true;
            actionButton.classList.remove("listening");
            break;
        case "listening":
            actionButton.textContent = "🛑 Tap to Stop";
            actionButton.disabled = false;
            actionButton.classList.add("listening");
            break;
        case "paused":
            actionButton.textContent = "Tap to Resume 🎤";
            actionButton.disabled = false;
            actionButton.classList.remove("listening");
            break;
    }
}

function base64ToArrayBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0)).buffer;
}

function pcmToWav(pcmData) {
    const sampleRate = 16000, numChannels = 1, bitDepth = 16;
    const buffer = new ArrayBuffer(44 + pcmData.byteLength);
    const view = new DataView(buffer);
    function writeString(view, offset, str) {
        for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.byteLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
    view.setUint16(32, numChannels * (bitDepth / 8), true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.byteLength, true);
    new Uint8Array(buffer, 44).set(new Uint8Array(pcmData));
    return new Blob([buffer], { type: 'audio/wav' });
}

// ===================
// AI Chat Loop
// ===================
async function getTextAndAudio(prompt) {
    lessonState = "thinking";
    updateUI();
    
    // Add the user's message to the context for a continuous conversation
    chatContext.push({ role: "user", parts: [{ text: prompt }] });
    
    const payload = {
        contents: chatContext,
        generationConfig: {
            responseModalities: ["TEXT", "AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: AI_VOICE_NAME } } }
        }
    };
    
    const res = await fetchWithRetry(buildApiUrl(TEXT_AUDIO_MODEL), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const result = await res.json();
    const parts = result?.candidates?.[0]?.content?.parts || [];
    
    let text = null, audioUrl = null;
    for (const p of parts) {
        if (p.text) text = p.text;
        if (p.inlineData?.data && p.inlineData?.mimeType?.startsWith("audio/")) {
            const blob = pcmToWav(base64ToArrayBuffer(p.inlineData.data));
            audioUrl = URL.createObjectURL(blob);
        }
    }
    
    // Add the AI's response to the context
    if (text) {
        chatContext.push({ role: "model", parts: [{ text: text }] });
    }
    
    return { text, audioUrl };
}

async function playAiAudio(prompt) {
    lessonState = "thinking";
    updateUI();

    try {
        const { text, audioUrl } = await getTextAndAudio(prompt);
        if (!text || !audioUrl) {
            addMessage("⚠️ Failed to generate AI voice. Tap mic to retry.", "ai");
            lessonState = "paused";
            updateUI();
            return;
        }

        addMessage(text, "ai");
        
        if (currentAudio) currentAudio.pause(); // Stop any previous audio
        currentAudio = new Audio(audioUrl);
        
        lessonState = "speaking";
        updateUI();
        
        await currentAudio.play();

        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            startSpeechRecognition();
        };
    } catch (err) {
        console.error(err);
        addMessage("⚠️ Error playing AI audio. Please check your network and API key.", "ai");
        lessonState = "paused";
        updateUI();
    }
}

function startSpeechRecognition() {
    // Check for both standard and prefixed API
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        addMessage("⚠️ Voice input not supported. Please use the text box below.", "ai");
        fallbackForm.style.display = 'flex'; // Show the text input
        lessonState = "paused";
        updateUI();
        return;
    }

    if (currentAudio && !currentAudio.paused) {
        currentAudio.pause();
    }
    
    lessonState = "listening";
    updateUI();

    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false; // Important for iOS, forces short bursts

    recognition.onresult = e => {
        const transcript = e.results[0][0].transcript;
        addMessage(transcript, "user");
        playAiAudio(transcript);
    };

    recognition.onerror = e => {
        console.error("Recognition error:", e.error);
        if (e.error === 'not-allowed') {
            addMessage("⚠️ Please allow microphone access to use voice chat.", "ai");
        } else {
            addMessage("⚠️ Speech recognition failed. Tap mic to try again.", "ai");
        }
        lessonState = "paused";
        updateUI();
    };

    recognition.onend = () => {
        // Automatically restart listening if the state is still 'listening'
        if (lessonState === "listening") {
            recognition.start();
        }
    };
    
    recognition.start();
}

// ===================
// Start / Button & Fallback
// ===================
actionButton.addEventListener("click", () => {
    if (lessonState === "initial" || lessonState === "paused") {
        startSpeechRecognition();
        if (recognition) {
            fallbackForm.style.display = 'none'; // Hide text input if voice works
        }
    } else if (lessonState === "listening") {
        recognition.stop();
        lessonState = "paused";
        updateUI();
    }
});

fallbackForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = fallbackInput.value.trim();
    if (text) {
        addMessage(text, "user");
        playAiAudio(text);
        fallbackInput.value = "";
    }
});

// ===================
// Init
// ===================
document.addEventListener("DOMContentLoaded", () => {
    updateUI();
});
