const State = {
  IDLE: 'idle',
  LISTENING: 'listening',
  PROCESSING: 'processing',
  PLAYING_AUDIO: 'playing_audio',
};
const SPEAK_VOICE = "Zephyr";
const API_KEY = "AIzaSyAoRr33eg9Fkt-DW3qX-zeZJ2UtHFBTzFI"; // IMPORTANT: Replace with your actual API key
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent";

const elements = {
  chatHistory: document.getElementById('chat-history'),
  actionButton: document.getElementById('action-button'),
  buttonContent: document.getElementById('button-content'),
  loadingSpinner: document.getElementById('loading-spinner'),
  interimResultsEl: document.getElementById('interim-results'),
  fallbackInput: document.getElementById('fallback-text-input'),
  cancelButton: document.getElementById('cancel-button'),
};

let currentState = State.IDLE;
let audioContext;
let recognition;
let audioSource; // To store the currently playing audio source
let conversationHistory = [];
let lessonStage = 0;

const lessonSteps = [
  { type: 'ai-message', content: "Hi there! Click 'Start Lesson' below to begin." },
  { type: 'user-input', content: "Hello! Let's begin our lesson. Take a moment to relax. Inhale slowly for 4 seconds, and exhale for 6 seconds. When you are ready, please tell me your name." },
  { type: 'user-input', content: "That's great! Now, what is your favorite hobby or something you like to do?" },
  { type: 'user-input', content: "That's wonderful! We're almost done. What's one thing you feel more confident about now?" },
  { type: 'end-message', content: "That’s fantastic to hear! Our lesson is complete. You did a great job today!" },
];

// Utility functions
const setState = (newState) => {
  currentState = newState;
  updateUI();
};

const updateUI = () => {
  const { actionButton, buttonContent, loadingSpinner, fallbackInput, cancelButton } = elements;
  switch (currentState) {
    case State.IDLE:
      buttonContent.textContent = lessonSteps[lessonStage]?.buttonText || "Start Lesson";
      actionButton.style.display = 'flex';
      fallbackInput.style.display = 'none';
      actionButton.disabled = false;
      loadingSpinner.classList.add('hidden');
      cancelButton.classList.add('hidden');
      break;
    case State.LISTENING:
      buttonContent.textContent = "Listening...";
      actionButton.disabled = true;
      loadingSpinner.classList.remove('hidden');
      cancelButton.classList.remove('hidden');
      break;
    case State.PROCESSING:
      buttonContent.textContent = "Processing...";
      actionButton.disabled = true;
      loadingSpinner.classList.remove('hidden');
      cancelButton.classList.add('hidden');
      break;
    case State.PLAYING_AUDIO:
      buttonContent.textContent = "Playing...";
      actionButton.disabled = true;
      loadingSpinner.classList.remove('hidden');
      cancelButton.classList.remove('hidden');
      break;
  }
};

const base64ToArrayBuffer = (base64) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

const stopAudio = () => {
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
  }
};

const playAudio = async (arrayBuffer) => {
  if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
  stopAudio(); // Stop any previous audio
  try {
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    source.start(0);
    audioSource = source;
    return new Promise((res) => { source.onended = res; });
  } catch (err) {
    console.error("Audio playback error:", err);
    addMessage('ai', "Sorry, I'm having trouble with my voice right now.");
    throw err;
  }
};

const addMessage = (role, text) => {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'} shadow`;
  messageDiv.textContent = text;
  elements.chatHistory.appendChild(messageDiv);
  elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
  conversationHistory.push({ role: role === 'user' ? 'user' : 'model', parts: [{ text }] });
};

const handleApiRequest = async (payload) => {
  try {
    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error(`API Error: ${response.status} - ${errText}`);
      if (response.status === 401) {
        addMessage('ai', "Error: Invalid API key. Please check your key.");
      } else if (response.status === 429) {
        addMessage('ai', "Error: Too many requests. Please try again later.");
      } else {
        addMessage('ai', `I'm sorry, an error occurred (${response.status}). Let's try again.`);
      }
      setState(State.IDLE);
      throw new Error(`API Error: ${response.status} - ${errText}`);
    }
    return await response.json();
  } catch (err) {
    console.error("API call error:", err);
    addMessage('ai', "I'm sorry, I couldn't connect. Please check your internet connection.");
    setState(State.IDLE);
    return null;
  }
};

// Main logic
const processLessonStage = async () => {
  const step = lessonSteps[lessonStage];
  if (!step) return;
  if (step.type === 'end-message') {
    addMessage('ai', step.content);
    await speak(step.content);
    setState(State.IDLE);
    elements.actionButton.textContent = "Lesson Complete";
    elements.actionButton.disabled = true;
    return;
  }
  if (step.type === 'ai-message' || step.type === 'user-input') {
    addMessage('ai', step.content);
    await speak(step.content);
    // Wait for user input if required
    if (step.type === 'user-input') {
      setState(State.IDLE);
      elements.buttonContent.textContent = "Click to Speak";
    } else {
      lessonStage++;
      processLessonStage();
    }
  }
};

const speak = async (text) => {
  setState(State.PROCESSING);
  const payload = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEAK_VOICE } } },
    },
  };
  const data = await handleApiRequest(payload);
  if (data && data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
    const audioData = data.candidates[0].content.parts[0].inlineData.data;
    setState(State.PLAYING_AUDIO);
    await playAudio(base64ToArrayBuffer(audioData));
    setState(State.IDLE);
    if (lessonSteps[lessonStage]?.type === 'user-input') {
      elements.buttonContent.textContent = "Click to Speak";
    } else {
      lessonStage++;
      processLessonStage();
    }
  } else {
    setState(State.IDLE);
  }
};

const handleUserResponse = async (text) => {
  addMessage('user', text);
  setState(State.PROCESSING);
  // Use the last 5 messages for context to save tokens and improve performance
  const recentHistory = conversationHistory.slice(-5);
  const systemInstruction = "You are an English language tutor. Keep responses short and encouraging, acting as a conversational partner. Do not act as a lesson guide. Just respond naturally to the user's last message.";
  const payload = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: recentHistory,
    generationConfig: {
      responseModalities: ["AUDIO", "TEXT"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEAK_VOICE } } },
    },
  };
  const data = await handleApiRequest(payload);
  if (data) {
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (aiText) addMessage('ai', aiText);
    if (audioData) {
      setState(State.PLAYING_AUDIO);
      await playAudio(base64ToArrayBuffer(audioData));
    }
  }
  lessonStage++;
  processLessonStage();
};

// Event Listeners and Initialization
document.addEventListener('DOMContentLoaded', () => {
  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setState(State.LISTENING);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      elements.interimResultsEl.textContent = transcript;
      if (event.results[0].isFinal) {
        handleUserResponse(transcript);
      }
    };
    recognition.onend = () => {
      elements.interimResultsEl.textContent = '';
      if (currentState === State.LISTENING) {
        setState(State.IDLE);
        elements.buttonContent.textContent = "Click to Speak";
      }
    };
    recognition.onerror = (e) => {
      console.error("Recognition error:", e);
      addMessage('ai', "Sorry, I didn't catch that. Please try again.");
      setState(State.IDLE);
    };

    elements.actionButton.addEventListener('click', () => {
      if (currentState === State.IDLE && lessonSteps[lessonStage]?.type === 'user-input') {
        recognition.start();
      } else if (currentState === State.IDLE) {
        lessonStage++;
        processLessonStage();
      }
    });
    elements.cancelButton.addEventListener('click', () => {
      if (currentState === State.LISTENING) {
        recognition.stop();
      } else if (currentState === State.PLAYING_AUDIO) {
        stopAudio();
      }
      setState(State.IDLE);
    });
  } else {
    // Fallback to text input
    elements.actionButton.style.display = 'none';
    elements.fallbackInput.style.display = 'block';
    elements.fallbackInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' && e.target.value.trim()) {
        handleUserResponse(e.target.value.trim());
        e.target.value = '';
      }
    });
  }
  // Start the lesson
  processLessonStage();
  updateUI();
});
