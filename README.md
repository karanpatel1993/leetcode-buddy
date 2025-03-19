# LeetCode Buddy

A Chrome extension that helps you solve LeetCode problems by providing contextual assistance using Google's Gemini 1.5 Flash AI model.

## Features

- Works exclusively on LeetCode problem pages
- Extracts problem statements and your code automatically
- Chat interface to ask questions about the current problem
- Provides hints, explanations, and assistance with your code
- Powered by Google's Gemini 1.5 Flash AI model

## Installation

### Development Mode Installation

1. Clone or download this repository to your local machine
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" by toggling the switch in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The LeetCode Buddy extension should now be installed and visible in your extensions list

## Setting Up Gemini API Key

To use LeetCode Buddy, you'll need a Google Gemini API key. Here's a detailed guide on how to obtain one:

1. Visit the [Google AI Studio](https://aistudio.google.com/) and sign in with your Google account
2. If this is your first time, you'll need to accept the terms of service
3. Navigate to the "Get API key" section (usually in the top-right corner or menu)
4. If you don't have a Google Cloud project set up:
   - Click "Create a new project"
   - Enter a project name (e.g., "LeetCode Buddy")
   - Accept the terms of service
   - Click "Next"
5. Once your project is created:
   - The API key will be displayed on the screen
   - Copy this key and keep it secure
6. Open the LeetCode Buddy extension by clicking its icon in your browser toolbar
7. Paste your API key into the field provided and click "Save API Key"

**Important Notes About Your API Key:**

- Keep your API key private and never share it
- There may be usage quotas associated with your key
- The key is stored locally in your browser and is only used to communicate with the Gemini API
- To reset or delete your key from the extension, you can clear the extension's storage from Chrome's settings

## Usage

1. Navigate to any problem page on LeetCode
2. Click on the LeetCode Buddy extension icon in your browser toolbar
3. If prompted, enter your Gemini API key
4. Type your question in the chat box, e.g., "Can you help me with a hint regarding this problem?"
5. The assistant will respond with relevant help based on the problem and your code

## Example Queries

- "Can you help me understand this problem?"
- "What approach should I take for this problem?"
- "Is there a more efficient way to solve this?"
- "What's wrong with my current solution?"
- "Can you explain the example test cases?"
- "Can you give me a hint without solving it completely?"

## Privacy Notice

This extension:

- Only activates on LeetCode problem pages
- Sends your problem information and code to Google's Gemini API
- Your API key is stored locally in your browser storage
- No data is collected by the extension developers

## Troubleshooting

If you encounter issues:

1. Make sure you're on a valid LeetCode problem page
2. Verify your Gemini API key is correct
3. Check your browser console for any error messages (press F12 to open developer tools)
4. Try refreshing the page or reinstalling the extension
5. If you get API-related errors, make sure your API key is valid and has not exceeded usage limits
6. For model-specific errors, check that the "gemini-1.5-flash" model is available in your API tier

## License

This project is licensed under the MIT License - see the LICENSE file for details.
