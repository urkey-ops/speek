Sentence Builder
Sentence Builder is an interactive web application designed to help young learners build simple, grammatically correct sentences. Using a combination of a pre-defined word bank and an AI model, the application provides a fun and engaging way to practice language skills.

Features
Interactive Word Bank: Users can tap on words to add them to a sentence.

Dynamic Word Generation: The app uses a powerful AI model to suggest the next most appropriate words based on the current sentence, ensuring a dynamic and educational experience.

Intelligent Fallback: If the internet connection is slow or the AI service is unavailable, the app seamlessly falls back to a local word bank, guaranteeing uninterrupted play.

Grammar Feedback: A helpful "Info" button provides simple grammar tips related to the last word added.

Real-time Assistance: The application checks for a subject and a verb and suggests punctuation options only when the sentence is ready to be completed.

Audio Support: Users can listen to their completed sentences with the "Read Aloud" button.

State Management: The "Go Back" button allows users to undo their last action.

Responsive Design: The interface is optimized for both desktop and mobile devices.

How It Works
The application operates on a robust, multi-layered architecture:

Local First: The app first loads a words.json file containing a comprehensive list of words categorized by type (noun, verb, etc.) and theme. This serves as the primary word source and an essential offline fallback.

User Interaction: As a user adds words, the app's state is updated and the sentence is rendered on the screen.

AI Integration (Gemini API): After each word is added, the app calls the Gemini API to get a new set of suggested words. It constructs a prompt using the current sentence and asks the AI to generate a list of suitable words for a first-grader.

Error Handling & Fallback: The application includes a client-side rate-limiting mechanism and timeout handlers to prevent API abuse and handle network issues gracefully. If the API call fails or times out, the app automatically switches to its local word bank, so the user never encounters a broken experience.

Getting Started
To run this project, you will need a Gemini API key.

Clone the repository:

git clone [your-repo-link]
cd sentence-builder

Get your Gemini API Key:

Sign up for the Google AI Studio to get your API key.

Find your API key in the API key section.

Configure the Application:

Open the script.js file.

Replace 'YOUR_GEMINI_API_KEY' with your actual key:

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY';

Run Locally:

Open index.html in your web browser. A simple way to do this is by double-clicking the file.

Project Structure
index.html: The main HTML file that provides the structure of the application.

styles.css: Defines the look and feel of the app, including custom button shapes and animations.

script.js: The core JavaScript file that contains all the application logic, including state management, API calls, and DOM manipulation.

words.json: A static data file containing the word bank and grammar rules for the application's offline functionality.
