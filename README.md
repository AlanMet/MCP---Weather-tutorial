# 🌦️ caMCP Weather Client/Server (Learning Project)

This project is a hands-on example to understand the **Model Context Protocol (MCP)**. It connects a custom weather tool server to a command-line client using a **local LLM (via Ollama)** for AI-driven, multi-step tool usage. Users input natural language queries, and the LLM dynamically decides which weather tools to use.

Inspired by Anthropic’s MCP quickstart tutorial — adapted for local LLM setups.



## 🧠 Project Overview

- **Local LLM Interaction**  
  Uses a local LLM (`hhao/qwen2.5-coder-tools` via Ollama) through an HTTP chat completions endpoint. The client wraps this via a `RequestHandler` class.

- **MCP Client Orchestration**  
  Acts as middleware: it presents the query and available tools to the LLM, orchestrates tool usage, and returns a final response.

- **Weather MCP Server Tools**
  - `get-alerts`: US weather alerts from the National Weather Service (NWS)
  - `get-latlong-from-name`: Global location geocoding via Nominatim (OpenStreetMap)
  - `get-worldwide-forecast`: Current + 7-day forecast using Open-Meteo API


## 🏗️ Project Structure

```
.
├── weather_mcp_client/
│   ├── build/
│   │   └── index.js            # Compiled MCP Client
│   ├── src/
│   │   └── index.ts            # Client source (TypeScript)
│   ├── package.json
│   └── tsconfig.json
└── weather_mcp_server/
    ├── build/
    │   └── index.js            # Compiled MCP Server
    ├── src/
    │   └── index.ts            # Server source (TypeScript)
    ├── package.json
    └── tsconfig.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- Ollama installed & running → https://ollama.com/
- Pull a suitable model:

  ```bash
  ollama pull hhao/qwen2.5-coder-tools
  ```

### Setup Steps

For **both** `weather_mcp_client/` and `weather_mcp_server/`:

```bash
cd <project_subdir>
npm install
npm run build
```

### Run the System

From the project root:

```bash
node weather_mcp_client/build/index.js weather_mcp_server/build/index.js
```

Expected Output:

```
RequestHandler: Warmup complete, ready.
MCPClient initialized.
Weather MCP Server (Worldwide v1.3.0) running on stdio
Connected with tools: [ 'get-alerts', 'get-latlong-from-name', 'get-worldwide-forecast' ]

MCP Client Started! Type queries or 'quit'.
```


## 💬 Example Queries

- "What is the weather forecast for Paris, Texas?"
- "Are there any weather alerts for CA?"
- "What's the current weather in London, UK and give me a 3 day forecast."
- "Tell me the weather in Tokyo."


## ⚙️ How It Works

### MCP Client (`weather_mcp_client`)

- Uses `RequestHandler` to communicate with the local LLM (default: `http://localhost:11434/v1/chat/completions`)
- Fetches tool definitions from server
- Sends user's query + tools to LLM
- If tool_calls are requested:
  - Executes tool via `mcp.callTool(...)`
  - Feeds tool result back to LLM
  - May repeat tool calls as needed
- LLM finally produces an answer

### MCP Server (`weather_mcp_server`)

- Registers 3 tools (`get-alerts`, `get-latlong-from-name`, `get-worldwide-forecast`)
- Listens for calls via `StdioServerTransport`
- Tools query external APIs:
  - NWS (US alerts)
  - Nominatim (geocoding)
  - Open-Meteo (forecast)
- Returns results or errors to the client

---

## 🛠️ Core Dependencies

### Runtime

- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- `zod`
- `node-fetch`

### Dev

- `typescript`
- `@types/node`
- (Optional: `@types/node-fetch` if using `node-fetch` v2)

### Install Example

In both `client/` and `server/` directories:

```bash
npm install @modelcontextprotocol/sdk zod node-fetch
npm install -D typescript @types/node
```

## 🔍 Debugging

### Server-Side (`weather_mcp_server`)

Enable verbose logs:

```bash
DEBUG=true node weather_mcp_client/build/index.js weather_mcp_server/build/index.js
```

### Client-Side (`weather_mcp_client`)

Edit `ENABLE_DEBUG_LOGGING` in `index.ts`. Rebuild with:

```bash
npm run build
```


## 📘 Notes

- **Learning Tool Only** – Not hardened for production use.
- **LLM Quality Matters** – Success depends on model instruction-following and Ollama setup.
- **Nominatim Usage Policy** – You *must* provide a valid User-Agent with contact info if using Nominatim heavily.
- **Extendability Ideas**:
  - Add new tools
  - Improve error handling
  - Try other models or chat templates
