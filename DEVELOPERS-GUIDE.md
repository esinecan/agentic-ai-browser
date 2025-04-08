# Agentic AI Browser

Wouldn't you want your browser to be handle complex tasks on its own? Imagine the plagiarism possibilities. Well, imagine no more! Tomorrow is already here. Click the video below to see the "browser automator agent" in action:

[![Demo Video](https://i.ytimg.com/vi/q85f3yhZG80/hqdefault.jpg)](https://www.youtube.com/watch?v=q85f3yhZG80)

## Overview
This project is a **AI-driven web automation agent** that uses **Playwright** for browser interactions and **LLM integration** for intelligent decision-making. It's designed for **reliable, adaptable web automation** with robust element detection and contextual understanding. It's single agent by design, and it doesn't require highly specialized models. Quite the opposite. It is built with getting solid benefit out of smaller models in mind. It can visit every single item in the first 5 search result pages, record its findings in a text file and notify you. You just talk to it in a natural speaking language.

## Features
- **Agentic Web Automation** – Uses AI to decide and execute actions based on page understanding
- **Intelligent Page Interpretation** – Summarizes pages for better context and decision-making
- **Adaptive Element Detection** – Handles different UI patterns across websites automatically
- **Action Verification & Recovery** – Ensures actions succeed with smart fallbacks and alternative selectors
- **Real-Time Visual Feedback** – Element highlighting and status overlay for transparency
- **Context-Aware Interaction** – Maintains task history and adapts based on successes and failures
- **Multi-LLM Support** – Works with both **Gemini**, **Ollama**, and **OpenAI** models for flexibility
- **Page Content Management** – Progressive scrolling and content extraction for text-heavy pages
- **Improved Resilience** – Enhanced retry logic with increased attempt limits
- **Agent State Management** – Track and control agent execution state
- **Manual Intervention** – Request human help when the agent is stuck
- **Session Notes** – Save and retrieve information across multiple pages during a session
- **Custom Automation Functions** – User-defined functions for common research and investigation tasks
- **Robust Browser Management** – Improved Chrome process handling with DevTools polling and cleanup
- **Red Border Highlighting** - Elements being interacted with are temporarily highlighted with a red border (headful mode only)
- **Bottom-Left Status Display** - Non-intrusive overlay showing current agent action (headful mode only)
---

## Setup & Installation

### 1️⃣ Prerequisites
Ensure you have the following installed:
- [Node.js 18+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) (optional, for local models)

### 2️⃣ Clone the Repository
```sh
git clone https://github.com/esinecan/agentic-ai-browser.git
cd agentic-ai-browser
```

### 3️⃣ Configure Environment Variables
Create a .env file in the root directory:
```properties
# Choose LLM Provider (ollama, gemini, or openai)
LLM_PROVIDER=ollama

# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
# LLM_MODEL=browser  # For Ollama

# Gemini Configuration
# LLM_PROVIDER=gemini
# GEMINI_API_KEY=your-gemini-api-key-here
# LLM_MODEL=gemini-2.0-flash-lite

# OpenAI API Configuration
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your-openai-api-key-here
# LLM_MODEL=gpt-3.5-turbo
# OPENAI_BASE_URL=https://api.openai.com/v1

# For OpenAI API-compatible providers (e.g., DeepSeek)
# LLM_PROVIDER=openai
# OPENAI_API_KEY=your-deepseek-api-key-here
# LLM_MODEL=deepseek-chat
# OPENAI_BASE_URL=https://api.deepseek.com

# General Configuration
HEADLESS=false
START_URL=https://en.wikipedia.org/wiki/Main_Page
LOG_DIR=./logs
SCREENSHOT_DIR=./screenshots
DEBUG_LEVEL=0
UNIVERSAL_SUBMIT_SELECTOR=enterKeyPress

# Browser Configuration (Windows example)
DATA_DIR=C:\Users\username\AppData\Local\Google\Chrome\User Data
PLAYWRIGHT_BROWSERS_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### 4️⃣ Install Dependencies
```sh
npm install
```

### 5️⃣ Run in Development Mode
```sh
npm run dev
```

### 6️⃣ Build & Run
```sh
npm run build
npm start
```

---

## Technical Architecture

<a href="Browser%20Automator%20Mind%20Map.png">
  <img src="Browser%20Automator%20Mind%20Map.png" alt="Browser Automator Mind Map" style="width: 600px;"/>
</a>

### 1. DOM Extraction & Analysis System
The project features a sophisticated DOM extraction system that provides structured page understanding for the AI agent:

#### Core Components:
- **DOMExtractor Interface**: Defines the contract for all extractors
- **BaseExtractor**: Abstract class implementing common extraction utilities
- **PageAnalyzer**: Orchestrates extraction process and combines results
- **DOMExtractorRegistry**: Manages registration and lookup of extractors
- **ContentExtractor**: Handles progressive content loading for long pages
- **Configuration System**: Controls extraction depth and behavior

#### Extractor Types:
- **Basic Extractors**: Title, URL, meta description
- **Element Extractors**: Buttons, inputs, links, landmarks
- **Content Extractors**: Main content, headings, tables, lists
- **Navigation Extractors**: Navigation menus, important links
- **Form Extractors**: Form elements, input fields, submission buttons
- **Media Extractors**: Images with alt text and dimensions
- **Structure Extractors**: Frames, iframes and embedded content
- **Advanced Extractors**: Role-based accessibility elements

#### Key Features:
- **Modular Architecture**: Easy to add new extraction capabilities
- **Error Isolation**: Individual extractor failures don't affect others
- **Performance Optimization**: Timeout handling and parallel extraction
- **Diagnostic Information**: Detailed extraction metrics and diagnostics
- **Visibility Detection**: Distinguishes visible vs hidden elements
- **Flexible Configuration**: Controls extraction depth and behavior
- **Progressive Content Loading**: Smart scrolling for text-heavy pages

#### Extraction Process:
1. **Initialization**: PageAnalyzer configures extraction parameters
2. **Extractor Selection**: Applicable extractors are selected based on configuration
3. **Parallel Processing**: Each extractor runs independently with timeout protection
4. **Result Aggregation**: Results are combined into a unified DOMSnapshot object
5. **Post-processing**: Elements are categorized and structured for easy access
6. **LLM Conversion**: Snapshot is transformed into LLM-friendly text representations

#### Integration Points:
- Powers the page interpretation system for LLM context
- Supports element selection and interaction strategies
- Provides structured data for verification and recovery systems
- Enables semantic understanding of page structure and content

### 2. Element Selection System
The system uses a strategy pattern to locate elements through multiple approaches, providing robust element detection across diverse web interfaces:

#### Strategy Architecture:
- **ElementFinder**: Core class that coordinates strategy selection and execution
- **BaseElementStrategy**: Abstract class with common utilities for all strategies
- **ElementContext**: Shared context object for tracking attempts and timeouts
- **Strategy Registry**: Manages strategies with automatic priority sorting

#### Selection Strategies (in priority order):
1. **DirectSelectorStrategy (100)**: Tries the exact selector provided
2. **IdSelectorStrategy (90)**: Specializes in ID-based selectors with high-confidence matching
3. **InputPatternStrategy (70)**: Uses common input field patterns across websites
4. **LinkStrategy (65)**: Special handling for link elements with href attributes
5. **RoleBasedStrategy (60)**: Uses ARIA roles and accessibility properties
6. **SingleElementStrategy (40)**: Last-resort fallback for simple pages

#### Key Features:
- **Prioritized Execution**: Tries strategies in order of likelihood of success
- **Independent Error Handling**: Failures in one strategy don't affect others
- **Contextual Intelligence**: Adapts to different page structures automatically
- **Alternative Suggestions**: When no match is found, suggests alternatives
- **Performance Optimization**: Early termination once element is found
- **Smart Timeouts**: Distributes available time across applicable strategies
- **Diagnostics**: Provides detailed logs about element finding attempts
- **Cross-browser Compatibility**: Works reliably across different browser engines

#### Selection Process:
1. **Initialization**: `elementFinder.findElement()` is called with an action
2. **Strategy Filtering**: Only strategies that can handle the action type are considered
3. **Prioritized Execution**: Each applicable strategy is tried in priority order
4. **Element Detection**: First strategy to find a matching element returns it
5. **Fallback Mechanism**: If direct selectors fail, tries alternative approaches
6. **Alternative Generation**: If all strategies fail, provides suggestions

#### Integration Points:
- Used by BrowserExecutor for all element interactions
- Powers the verification system for checking action success
- Enables dynamic recovery from selector changes or failures
- Supports automated element suggestion when original selectors fail

### 3. Action Execution Pipeline
Actions flow through a sophisticated pipeline with robust execution, verification, and recovery mechanisms:

#### Core Components:
- **ActionExtractor**: Parses raw LLM output into structured actions using multiple extraction methods
- **BrowserExecutor**: Handles browser interactions with Playwright with advanced error handling
- **SuccessPatterns**: Records and learns from successful interactions for future suggestions
- **RecoveryEngine**: Intelligent failure handling with contextual retries and human assistance

#### Action Types:
- **Click**: Interacts with buttons and clickable elements with verification
- **Input**: Smart text entry with focus management and special field type handling
- **Navigate**: URL normalization and navigation with relative URL support
- **Wait**: Managed execution pauses with dynamic timing
- **SendHumanMessage**: Contextual human assistance requests with screenshot capture
- **Notes**: Save and retrieve information across multiple pages during a session
- **Scroll**: Control page scrolling for viewing more content or returning to top

#### Smart Execution Features:
- **Universal Form Submission**: Special handling for Enter key presses
- **Search Input Detection**: Optimized handling for search boxes with suggestion support
- **Element Focus Management**: Click-before-fill approach for reliable input
- **URL Normalization**: Automatic conversion of relative URLs to absolute
- **Action Context Enrichment**: Previous URL tracking and domain identification
- **Session Notes**: Persist important information across page navigations
- **Content Visibility Management**: Ensures elements are visible before interaction

#### Verification & Success Tracking:
- **Type-Specific Verification**: Custom verification logic based on action type
- **Domain Pattern Learning**: Recording successful selectors by website domain
- **Success Pattern Filtering**: Intelligent filtering of significant vs. trivial actions
- **Successful Action Sequences**: Tracking and leveraging sequences of successful actions
- **Contextual Success Feedback**: Action-specific feedback for the LLM

#### Failure Management & Recovery:
- **Redundancy Detection**: Identification and prevention of repetitive failed actions
- **Smart Retry Strategies**: Progressive retry with alternative approaches
- **Failure Pattern Tracking**: Recording common failure modes for prevention
- **Alternative Suggestions**: Finding similar elements when exact matches fail
- **Human Intervention**: Intelligent triggering of human assistance with context

#### Execution Process Flow:
1. **Action Selection**: LLM generates action based on current state and history
2. **Action Validation**: Pre-execution validation and normalization
3. **Redundancy Check**: Prevent repetitive unsuccessful actions
4. **Element Location**: Find target element using strategy pattern
5. **Action Execution**: Execute with type-specific handling
6. **Verification**: Confirm success using type-specific criteria
7. **Pattern Recording**: Record successful actions into the pattern database
8. **State Update**: Update page state and provide feedback
9. **Recovery (If Needed)**: Handle failures with retries or human assistance

#### Integration Points:
- **Element Finding System**: Uses the strategy pattern for reliable element selection
- **DOM Analysis System**: Leverages page understanding for context-aware actions
- **LLM Integration**: Provides rich feedback to guide future actions
- **State Management**: Coordinates with the state machine for execution flow

### 4. State Management & Automation Flow
The system uses a sophisticated state machine architecture for reliable execution flow with persistent context and learning capabilities:

#### Core Components:
- **GraphContext**: Shared context object passed between states containing browser state, history, milestones, and success metrics
- **State Handlers**: Modular functions for each state that process context and determine transitions
- **State Machine Runner**: Orchestrates execution flow with error handling and state transitions
- **Agent State Manager**: Controls execution state with stop/resume capabilities

#### Key States:
- **start**: Initializes browser, page, and context objects
- **chooseAction**: Requests next action from LLM with dynamic context enrichment
- **[action types]**: Specialized handlers for each action type (click, input, navigate, notes, scroll, etc.)
- **handleFailure**: Progressive retry logic with pattern recognition
- **sendHumanMessage**: Human intervention interface with screenshot capture
- **terminate**: Graceful shutdown and resource cleanup

#### Learning Mechanisms:
- **Success Pattern Recording**: Stores successful selectors and actions by domain
- **Pattern Filtering**: Intelligently filters trivial vs. significant actions
- **Suggestion Generation**: Provides context-aware suggestions based on past successes
- **Failure Mode Learning**: Adapts suggestions based on failure patterns
- **Persistent Pattern Storage**: Saves patterns to disk for cross-session learning

#### Goal & Progress Tracking:
- **Automated Milestone Generation**: Creates milestones based on user goal type
- **Dynamic Progress Detection**: Identifies meaningful state changes between page states
- **Element-Based Milestone Detection**: Recognizes achievements based on page elements
- **Multi-Milestone Tracking**: Records completion across search, login, form, and other workflows
- **Session Persistency**: Stores important information in notes for context across pages

#### Context Enrichment:
- **Action History Compression**: Condenses action history for efficient context
- **Success Streak Tracking**: Monitors consecutive successful actions
- **Redundancy Detection**: Identifies repeated or cyclical actions. Shuffles placement of page elements to use primacy and recency effects in LLM attention.
- **Action Feedback Generation**: Creates contextual feedback for the LLM
- **Domain-Specific Suggestions**: Provides targeted advice based on current website

#### State Transition Flow:
1. **Initialization**: Sets up context with user goal and milestones
2. **Action Selection**: LLM chooses action based on enriched context
3. **Pre-execution Validation**: Checks for redundancy and feasibility
4. **Action Execution**: State-specific handling with error protection
5. **Verification & Recording**: Verifies success and records patterns
6. **Context Update**: Updates history, feedback, and success metrics
7. **State Determination**: Selects next appropriate state
8. **Learning Integration**: Updates success patterns for future use

### 5. LLM Integration
Support for multiple LLM backends with a unified interface:

#### Providers:
- **Gemini**: Using Google's Gemini API
- **Ollama**: Local LLM deployment
- **OpenAI**: OpenAI GPT models and compatible APIs (including DeepSeek)

#### Prompt Architecture:
- **System Prompt**: Defines agent role and capabilities
- **Page Content**: Structured representation of the web page
- **Task History**: Compressed action history
- **Feedback**: Success/failure information and suggestions

### 6. Notes System
The agent can maintain persistent notes across pages during a browsing session:

#### Core Functionality:
- **Add Operation**: Save important information with current URL context
- **Read Operation**: Retrieve previously saved notes during the session
- **Automatic Timestamp Files**: Creates session-specific notes files with timestamps
- **URL Association**: Automatically saves the current URL with each note

#### Usage Examples:
- **Research Tasks**: Collecting information across multiple pages
- **Multi-step Processes**: Maintaining context across complex workflows
- **Data Collection**: Gathering specific details from various sources
- **Comparison Shopping**: Recording prices and details from different sites

### 7. User-Defined Functions
The system includes predefined function templates for common research and learning tasks:

#### Available Functions:
- **learnJargon**: Research terminology and create glossaries for any topic
- **howToWithThisTech**: Create step-by-step guides for using specific technologies
- **evaluateTechLandscape**: Conduct deep analysis of technology stacks for adoption
- **lookIntoTopic**: Research topics from multiple angles (both positive and critical)
- **investigateFromTrustedSources**: Analyze specific sources for a comprehensive view
- **compareOpinions**: Find balanced perspectives on controversial topics

---

## Troubleshooting & Logs
- Logs are stored in logs directory with timestamps
- Screenshots are saved to screenshots on failures
- Page state snapshots are recorded before each action
- Notes are saved in the ./notes directory with timestamped filenames
- It's a lot more fun with visual browser:
```sh
# Set in .env or use environment variable:
HEADLESS=false npm run dev
```

---

## LLM Configuration
The agent supports multiple LLM backends:

### Ollama (Local Models)
For running models locally using Ollama:
- Set `LLM_PROVIDER=ollama`
- Configure `OLLAMA_HOST` (default: http://localhost:11434)
- Choose your model with `LLM_MODEL` (e.g., phi4-mini, llama3, etc.)

### Gemini
For using Google's Gemini API:
- Set `LLM_PROVIDER=gemini`
- Set `GEMINI_API_KEY` with your API key
- Set `LLM_MODEL` to your preferred Gemini model (e.g., gemini-2.0-flash-lite)

### OpenAI and Compatible APIs
For using OpenAI and compatible APIs like DeepSeek:
- Set `LLM_PROVIDER=openai`
- Set `OPENAI_API_KEY` with your API key
- Set `LLM_MODEL` to your preferred model (e.g., gpt-3.5-turbo)
- Optionally set `OPENAI_BASE_URL` for compatible APIs:
  - OpenAI: https://api.openai.com/v1 (default)
  - DeepSeek: https://api.deepseek.com
  - Other compatible providers: Use their respective API base URLs

---

## User-Defined Functions

The agent supports user-defined function templates that can be invoked with a simple syntax:

```
!functionName(arg1, arg2)
```

For example:
```
!evaluateTechLandscape(Next.js)
!lookIntoTopic(quantum computing)
!compareOpinions(ChatGPT)
```

These functions allow you to quickly run common research and information-gathering patterns without having to explain the exact steps each time.

---

## Future Plans
✅ **Modular execution layer**
✅ **Action verification**
✅ **Intelligent page interpretation**
✅ **Multi-LLM support**
✅ **Agent state management**
✅ **DOM extraction system** 
✅ **Element selection strategies**
✅ **Fixed position element detection fix**
✅ **Session notes system**
✅ **Progressive content loading with scroll actions**
✅ **Improved Chrome process management**
✅ **User-defined function templates**
✅ **Real-time visual feedback system**
🔜 **Workflow recording & replay**
🔜 **Support for API-based automation**
🔜 **Multi-tab and window handling**
🔜 **Advanced form interaction capabilities**
🔜 **Context-aware selector generation with ML**

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
