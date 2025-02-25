# Playwright-LangChain Bot

## Overview
This project is a **modular, AI-driven web automation bot** that uses **Playwright** for browser interactions and **LangChain** for intelligent decision-making. It is designed for **reliable, verifiable web automation** with a structured execution flow.

## Features
- **Agentic Web Automation** – Uses AI to decide and execute actions.
- **Modular Execution** – Playwright-based browser control, with future support for CoPilotKit.
- **Action Verification** – Ensures tasks (clicks, input, navigation) succeed before proceeding.
- **Memory & Context Awareness** – Tracks task history and adapts based on past interactions.
- **Fully Containerized** – Supports **Docker & Docker Compose** for easy deployment.
- **Configurable & Extendable** – Environment settings in `.env`, modular architecture for scaling.

---

## Setup & Installation

### 1️⃣ Prerequisites
Ensure you have the following installed:
- [Node.js 18+](https://nodejs.org/)
- [Docker](https://www.docker.com/)

### 2️⃣ Clone the Repository
```sh
git clone https://github.com/your-repo/playwright-langchain-bot.git
cd playwright-langchain-bot
```

### 3️⃣ Configure Environment Variables
Create a `.env` file in the root directory:
```ini
HEADLESS=true
START_URL=https://boogle.com
LOG_DIR=/app/logs
SCREENSHOT_DIR=/app/screenshots
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
docker build -t playwright-bot .
docker run --rm -it playwright-bot
```

### 8️⃣ Run with Docker Compose
```sh
docker-compose up --build -d
```

---

## Project Structure
- `Dockerfile`: Defines the Docker image for the bot.
- `docker-compose.yml`: Defines the Docker services for the project.
- `package.json`: Contains the project dependencies.
- `tsconfig.json`: TypeScript configuration file.
- `src/`: Contains the source code for the bot.
  - `automation.ts`: Automation scripts for the bot.
  - `browserExecutor.ts`: Executes browser actions using Playwright.
  - `index.ts`: Entry point for the bot.
  - `llmProcessorOllama.ts`: Integration with Langchain.

---

## Core Components

### **1️⃣ Agentic Decision-Making**
The bot makes **real-time decisions** on:
- **Clicking elements**
- **Typing into inputs**
- **Navigating pages**
- **Extracting content**
- **Scrolling & waiting**

### **2️⃣ Modular Execution Layer**
- The browser interactions are handled in **`browserExecutor.ts`**.
- If Playwright becomes unreliable, **this can be swapped out without breaking logic**.

### **3️⃣ Action Verification**
Each action is verified to ensure success:
- Clicks wait for **network idle**
- Inputs are **validated** after entry
- Navigation confirms the **URL change**

---

## Troubleshooting & Logs
- Logs are stored in `/logs` (or `./logs` locally).
- Screenshots are saved to `/screenshots` on failures.
- To debug:
```sh
npm run dev
```

---

## Future Plans
✅ **Modular execution layer (DONE)**
✅ **Action verification (DONE)**
🔜 **CoPilotKit integration (Planned)**
🔜 **Support for API-based automation**

---

## Contributing
1. Fork the repo.
2. Create a new branch: `feature/new-thing`
3. Commit changes: `git commit -m 'Added new feature'`
4. Push to branch: `git push origin feature/new-thing`
5. Open a PR!

---

## License
MIT License. Free to use and modify.

