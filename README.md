# Agentic AI Browser

## Overview
This project is a **sophisticated, AI-driven web automation agent** that uses **Playwright** for browser interactions and **LLM integration** for intelligent decision-making. It's designed for **reliable, adaptable web automation** with robust element detection and contextual understanding.

## Features
- **Agentic Web Automation** – Uses AI to decide and execute actions based on page understanding
- **Intelligent Page Interpretation** – Summarizes pages for better context and decision-making
- **Adaptive Element Detection** – Handles different UI patterns across websites automatically
- **Action Verification & Recovery** – Ensures actions succeed with smart fallbacks and alternative selectors
- **Context-Aware Interaction** – Maintains task history and adapts based on successes and failures
- **Fully Containerized** – Supports **Docker & Docker Compose** for easy deployment
- **Multi-LLM Support** – Works with both **Gemini** and **Ollama** models for flexibility

---

## Setup & Installation

### 1️⃣ Prerequisites
Ensure you have the following installed:
- [Node.js 18+](https://nodejs.org/)
- [Docker](https://www.docker.com/) (optional)

### 2️⃣ Clone the Repository
```sh
git clone https://github.com/your-username/agentic-ai-browser.git
cd agentic-ai-browser
```

### 3️⃣ Configure Environment Variables
Create a .env file in the root directory:
```ini
HEADLESS=false
START_URL=https://www.google.com
LOG_DIR=./logs
SCREENSHOT_DIR=./screenshots
LLM_PROVIDER=gemini  # or ollama
GEMINI_API_KEY=your-key-here  # if using Gemini
OLLAMA_BASE_URL=http://localhost:11434  # if using Ollama
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

### 7️⃣ Run in Docker
```sh
docker build -t agentic-ai-browser .
docker run --rm -it agentic-ai-browser
```

### 8️⃣ Run with Docker Compose
```sh
docker-compose up --build -d
```

---

## Project Structure
- Dockerfile: Defines the Docker image for the agent
- docker-compose.yml: Defines the Docker services for the project
- package.json: Contains the project dependencies
- tsconfig.json: TypeScript configuration file
- src: Contains the source code for the agent
  - `automation.ts`: Core automation logic and execution flow
  - `browserExecutor.ts`: Executes browser actions using Playwright
  - `pageInterpreter.ts`: Analyzes and summarizes web pages for the LLM
  - `successPatterns.ts`: Tracks successful interaction patterns
  - `index.ts`: Entry point for the application
  - `llmProcessor.ts`: Abstraction layer for LLM integration
  - `llmProcessorGemini.ts`: Gemini-specific implementation
  - `llmProcessorOllama.ts`: Ollama-specific implementation

---

## Core Components

### **1️⃣ Intelligent Page Understanding**
The agent analyzes web pages at multiple levels:
- **Page Summarization** – High-level description of the page purpose and structure
- **Element Detection** – Identifies interactive elements across different implementation patterns
- **Context Preservation** – Maintains awareness of past interactions and successes

### **2️⃣ Adaptive Element Selection**
- Automatically detects alternative selectors when primary ones fail
- Handles different implementations of common UI patterns (search boxes, forms, etc.)
- Learns from successful interactions to improve future selections

### **3️⃣ Action Execution & Verification**
Each action is executed with robust verification:
- Clicks wait for **network idle** and verify state changes
- Inputs are **validated** after entry with alternative strategies if needed
- Navigation confirms **URL change** and page load completion
- Automatic recovery with alternative selectors when primary ones fail

---

## Troubleshooting & Logs
- Logs are stored in logs (or logs locally)
- Screenshots are saved to screenshots on failures
- Page state snapshots are recorded before each action
- To debug with visual browser:
```sh
# Set in .env or use environment variable. It's much more fun to watch the model work IMO:
HEADLESS=false npm run dev
```

---

## LLM Configuration
The agent supports multiple LLM backends:

### Gemini
```ini
LLM_PROVIDER=gemini
GEMINI_API_KEY=your-key-here
```

### Ollama (Local)
```ini
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## Future Plans
✅ **Modular execution layer (DONE)**
✅ **Action verification (DONE)**
✅ **Intelligent page interpretation (DONE)**
✅ **Multi-LLM support (DONE)**
🔜 **Workflow recording & replay**
🔜 **Support for API-based automation**
🔜 **Multi-tab and window handling**

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