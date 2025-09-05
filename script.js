

// IMPORTANT: Replace "YOUR_API_KEY_HERE" with your actual Gemini API key.
// Your API key is a long string that begins with "AIzaSy..."
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI";



const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

// ---- State Machine ----
const lessonStates = { INITIAL: "initial", LISTENING: "listening", SPEAKING: "speaking" };
let lessonState = lessonStates.INITIAL;

// ---- Elements ----
const actionButton = document.getElementById("action-button");
const chatHistory = document.getElementById("chat-history");
const fallbackForm = document.getElementById("fallback-form");
const fallbackInput = document.getElementById("fallback-text-input");

let recognition;
let currentAudio = null;
let originalHandler = null;

// ---- Setup ----
document.addEventListener("DOMContentLoaded", () => {
  if (!API_KEY) {
    addMessage("⚠️ No API key found. Please add your Gemini API key in <code>script.js</code>.", "ai");
  }
  originalHandler = handleButtonClick;
  actionButton.addEventListener("click", originalHandler);

  // fallback input
  fallbackForm.addEventListener("submit", e => {
    e.preventDefault();
    const text = fallbackInput.value.trim();
    if (text) {
      processUserInput(text);
      fallbackInput.value = "";
    }
  });

  initSpeechRecognition();
});

// ---- Chat UI ----
function addMessage(text, sender, retryCallback = null) {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}-message`;

  if (sender === "ai") {
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = "🤖";
    bubble.appendChild(avatar);
  }

  const content = document.createElement("div");
  content.textContent = text;
  bubble.appendChild(content);

  if (retryCallback) {
    const retryBtn = document.createElement("button");
    retryBtn.textContent = "Retry";
    retryBtn.className = "retry-button";
    retryBtn.onclick = () => {
      bubble.remove(); // replace instead of stacking
      retryCallback();
    };
    bubble.appendChild(retryBtn);
  }

  chatHistory.appendChild(bubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

function updateButtonText(text) {
  actionButton.textContent = text;
}

function resetUI() {
  if (currentAudio) {
    if (currentAudio.src && currentAudio.src.startsWith("blob:")) {
      URL.revokeObjectURL(currentAudio.src);
    }
    currentAudio.pause();
    currentAudio.removeAttribute("src");
    currentAudio = null;
  }
  lessonState = lessonStates.INITIAL;
  updateButtonText("🎤 Start Lesson");
  actionButton.onclick = originalHandler;
}

// ---- Speech Recognition ----
function initSpeechRecognition() {
  if ("webkitSpeechRecognition" in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = e => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join("");
      if (e.results[0].isFinal) processUserInput(transcript);
    };

    recognition.onerror = e => {
      console.error("Speech recognition error:", e);
      addMessage("⚠️ Speech recognition error. Try again or type below.", "ai");
      resetUI();
    };

    recognition.onend = () => {
      if (lessonState === lessonStates.LISTENING) {
        resetUI();
      }
    };
  }
}

function startSpeechRecognition() {
  if (recognition) {
    lessonState = lessonStates.LISTENING;
    updateButtonText("🎙️ Listening...");
    recognition.start();
    navigator.vibrate?.(50);
  } else {
    addMessage("⚠️ Speech recognition not supported on this device.", "ai");
  }
}

// ---- AI Interaction ----
async function processUserInput(userText) {
  addMessage(userText, "user");
  updateButtonText("🤔 Thinking...");
  try {
    const { text, audioUrl } = await getTextAndAudio(userText);
    await playAIResponse(text, audioUrl);
  } catch (err) {
    console.error("processUserInput error:", err);
    addMessage("⚠️ Something went wrong.", "ai", () => processUserInput(userText));
    resetUI();
  }
}

async function getTextAndAudio(prompt) {
  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: "audio/wav", data: "" } }
      ]
    }],
    generationConfig: { responseModalities: ["TEXT", "AUDIO"] }
  };

  const res = await fetch(`${API_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No AI response.";
  const audioData = data.candidates?.[0]?.content?.parts?.[1]?.inlineData?.data;

  if (!audioData) throw new Error("No audio data in response.");

  const audioBlob = new Blob([base64ToArrayBuffer(audioData)], { type: "audio/wav" });
  const audioUrl = URL.createObjectURL(audioBlob);
  return { text, audioUrl };
}

// ---- Audio ----
async function playAIResponse(text, audioUrl) {
  addMessage(text, "ai");
  lessonState = lessonStates.SPEAKING;
  updateButtonText("🔊 Speaking...");

  if (currentAudio) resetUI();
  currentAudio = new Audio(audioUrl);

  currentAudio.onended = () => resetUI();

  currentAudio.onloadedmetadata = () => {
    currentAudio.play().catch(() => {
      updateButtonText("🔈 Tap to Play");
      const tempHandler = () => {
        currentAudio.play();
        updateButtonText("Playing Voice...");
        actionButton.onclick = originalHandler; // restore original handler
      };
      actionButton.onclick = tempHandler;
    });

    const leadIn = Math.max(0, currentAudio.duration * 1000 - 500);
    setTimeout(startSpeechRecognition, leadIn);
  };
}

// ---- Utils ----
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// ---- Button Click ----
function handleButtonClick() {
  if (lessonState === lessonStates.INITIAL) {
    startSpeechRecognition();
  } else {
    resetUI();
  }
}

