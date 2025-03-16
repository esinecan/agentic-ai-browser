# Agentic AI Browser

An intelligent web automation agent that uses state-of-the-art AI techniques to understand and interact with web pages autonomously.

## Overview
This project is a **sophisticated AI-driven web automation agent** that uses **Playwright** for browser interactions and **LLM integration** for intelligent decision-making. It's designed for **reliable, adaptable web automation** with robust element detection and contextual understanding.

## Features
- **Agentic Web Automation** – Uses AI to decide and execute actions based on page understanding
- **Intelligent Page Interpretation** – Summarizes pages for better context and decision-making
- **Adaptive Element Detection** – Handles different UI patterns across websites automatically
- **Action Verification & Recovery** – Ensures actions succeed with smart fallbacks and alternative selectors
- **Context-Aware Interaction** – Maintains task history and adapts based on successes and failures
- **Multi-LLM Support** – Works with both **Gemini** and **Ollama** models for flexibility
- **Improved Resilience** – Enhanced retry logic with increased attempt limits
- **Agent State Management** – Track and control agent execution state
- **Manual Intervention** – Request human help when the agent is stuck

---

## Setup & Installation

### 1️⃣ Prerequisites
Ensure you have the following installed:
- [Node.js 18+](https://nodejs.org/)

### 2️⃣ Clone the Repository
```sh
git clone https://github.com/esinecan/agentic-ai-browser.git
cd agentic-ai-browser
```

### 3️⃣ Configure Environment Variables
Create a .env file in the root directory:
```ini
HEADLESS=false
START_URL=https://www.example.com
LOG_DIR=./logs
SCREENSHOT_DIR=./screenshots
LLM_PROVIDER=gemini  # or ollama
GEMINI_API_KEY=your-key-here  # if using Gemini
OLLAMA_BASE_URL=http://localhost:11434  # if using Ollama
LLM_MODEL=gemini-2.0-flash  # or any other model
```

### 4️⃣ Install Dependencies
```sh
npm install
```

### 5️⃣ Run in Development Mode
```sh
npm run dev
```

### 6️⃣ Build & Run in Production
```sh
npm run build
npm start
```

---

## Technical Architecture

### 1. DOM Extraction & Analysis System
The project features a sophisticated DOM extraction system that provides structured page understanding:

#### Core Components:
- **DOMExtractor Interface**: Defines the contract for all extractors
- **PageAnalyzer**: Orchestrates extraction and combines results
- **Initialization System**: Ensures all extractors are registered properly 

#### Extractor Types:
- **Basic Extractors**: Title, URL, meta description
- **Element Extractors**: Buttons, inputs, links, landmarks
- **Content Extractors**: Main content, headings
- **Advanced Extractors**: Navigation elements, forms

#### Extraction Process:
1. `PageAnalyzer.extractSnapshot()` triggers the process
2. Applicable extractors are selected based on configuration
3. Each extractor runs independently with timeout protection
4. Results are combined into a unified DOMSnapshot object
5. `pageInterpreter.generatePageSummary()` converts the snapshot to LLM-friendly text

### 2. Element Selection System
The system uses a strategy pattern to locate elements through multiple approaches:

#### Strategy Architecture:
- **ElementFinder**: Core class that coordinates strategies
- **BaseElementStrategy**: Abstract base class for all strategies
- **Strategy Registry**: Manages and prioritizes strategies

#### Selection Strategies (in priority order):
1. **DirectSelectorStrategy**: Tries the exact selector provided
2. **IdSelectorStrategy**: Specializes in ID-based selectors
3. **RoleBasedStrategy**: Uses ARIA roles and accessibility properties
4. **LinkStrategy**: Special handling for link elements
5. **SingleElementStrategy**: Fallback for simple pages

#### Selection Process:
1. `elementFinder.findElement()` is called with an action
2. Each applicable strategy is tried in priority order
3. First strategy to find a matching element returns it
4. If all strategies fail, alternative suggestions are provided

### 3. Action Execution Pipeline
Actions flow through a sophisticated pipeline:

#### Core Components:
- **ActionExtractor**: Parses raw LLM output into structured actions
- **BrowserExecutor**: Handles browser interactions with Playwright
- **SuccessPatterns**: Tracks successful interaction patterns
- **RecoveryEngine**: Handles failures and retries

#### Action Types:
- **Click**: Interacts with buttons and clickable elements
- **Input**: Enters text into form fields
- **Navigate**: Loads URLs and handles navigation
- **Wait**: Pauses execution
- **SendHumanMessage**: Requests human assistance

#### Verification Process:
1. Action is executed via Playwright
2. `verifyAction()` confirms success based on action type
3. Results feed into success pattern tracking
4. Failed actions trigger the recovery system

### 4. State Management & Automation Flow
The system uses a state machine for reliable execution flow:

#### Key States:
- **start**: Initializes the browser and page
- **chooseAction**: Requests next action from the LLM
- **[action types]**: Handles specific actions (click, input, etc.)
- **handleFailure**: Manages retries and recovery
- **terminate**: Closes the browser

#### Goal Tracking:
- **Milestones**: Tracks progress toward the user's goal
- **Progress Detection**: Identifies meaningful state changes
- **Feedback Generation**: Provides context for the LLM

### 5. LLM Integration
Support for multiple LLM backends with a unified interface:

#### Providers:
- **Gemini**: Using Google's Gemini API
- **Ollama**: Local LLM deployment

#### Prompt Architecture:
- **System Prompt**: Defines agent role and capabilities
- **Page Content**: Structured representation of the web page
- **Task History**: Compressed action history
- **Feedback**: Success/failure information and suggestions

---

## Troubleshooting & Logs
- Logs are stored in logs directory with timestamps
- Screenshots are saved to screenshots on failures
- Page state snapshots are recorded before each action
- To debug with visual browser:
```sh
# Set in .env or use environment variable:
HEADLESS=false npm run dev
```

---

## LLM Configuration
The agent supports multiple LLM backends:

### Gemini
Using the advanced gemini-2.0-flash model:
```ini
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
LLM_MODEL=gemini-2.0-flash
```

### Ollama (Local)
```ini
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=phi4-mini
```

---

## Future Plans
✅ **Modular execution layer**
✅ **Action verification**
✅ **Intelligent page interpretation**
✅ **Multi-LLM support**
✅ **Agent state management**
✅ **DOM extraction system**
✅ **Element selection strategies**
✅ **Manual intervention capabilities**
🔜 **Workflow recording & replay**
🔜 **Support for API-based automation**
🔜 **Multi-tab and window handling**
🔜 **Extended form interaction capabilities**

---

## Contributing
1. Fork the repo
2. Create a new branch: `feature/new-thing`
3. Commit changes: `git commit -m 'Added new feature'`
4. Push to branch: `git push origin feature/new-thing`
5. Open a PR!

---

## License
MIT License. Free to use and modify.