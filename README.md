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
Weather MCP Server (Worldwide v1.3.0) running on stdio
Connected with tools: [ 'get-alerts', 'get-latlong-from-name', 'get-worldwide-forecast' ]

MCP Client Started! Type queries or 'quit'.
```

## 🧪 Sample Interaction


Query: what's the weather like in houston, texas?

LLM Response:
The current weather in Houston, Texas, is a thunderstorm with temperatures reaching up to 87.8°F and humidity at 88%. The forecast for the next week shows mostly thunderstorms and heavy rain on some days, with occasional light drizzle or overcast conditions.

Here's a summary of the forecast:

- **Current Weather:**
  - Time: 2025-05-25T21:30
  - Temperature: 80.5°F
  - Apparent Temp: 87.8°F
  - Humidity: 88%
  - Weather: Thunderstorm
  - Wind: 10.8 mph from 159° (Gusts: 24.8 mph)
  - Precipitation: 0 in
  - Cloud Cover: 99%
  - Pressure: 1013.6 hPa

- **Daily Forecast for the Next 7 Days:**
  - **May 25:** Thunderstorm, Max Temp: 88.3°F, Min Temp: 78.5°F
  - **May 26:** Thunderstorm, Max Temp: 84.9°F, Min Temp: 74.5°F
  - **May 27:** Heavy rain, Max Temp: 96.2°F, Min Temp: 66.3°F
  - **May 28:** Thunderstorm, Max Temp: 87.4°F, Min Temp: 76.8°F
  - **May 29:** Overcast, Max Temp: 94.2°F, Min Temp: 77.5°F
  - **May 30:** Light drizzle, Max Temp: 89.5°F, Min Temp: 75.1°F
  - **May 31:** Overcast, Max Temp: 90.6°F, Min Temp: 69.6°F

Stay prepared for the changing weather conditions in Houston!

Query: what about in paris, france?

LLM Response:
Thank you for the weather forecast information for Paris, France. Here's a summary of the key points:

1. **Current Weather**:
   - Time: 2025-05-26T04:30
   - Temperature: 53.3°F (Apparent Temp: 49.9°F)
   - Humidity: 77%
   - Weather: Clear sky
   - Wind: 5.9 mph from 263° (Gusts: 14.1 mph)
   - Precipitation: 0 in
   - Cloud Cover: 0%
   - Pressure: 1019.3 hPa

2. **Daily Forecast for the Next 7 Days**:
   - **May 26**: Slight rain showers, Max Temp: 66.3°F, Min Temp: 51.8°F
   - **May 27**: Slight rain, Max Temp: 65.5°F, Min Temp: 55°F
   - **May 28**: Slight rain showers, Max Temp: 68.7°F, Min Temp: 58.1°F
   - **May 29**: Overcast, Max Temp: 75.8°F, Min Temp: 55.5°F
   - **May 30**: Partly cloudy, Max Temp: 79.3°F, Min Temp: 62.9°F
   - **May 31**: Overcast, Max Temp: 77.5°F, Min Temp: 58.1°F
   - **June 1**: Thunderstorm, Max Temp: 78.6°F, Min Temp: 59.5°F

### Recommendations:
- **Clothing**: Given the current clear sky and mild temperatures, you might want to wear light clothing with a jacket for cooler evenings.
- **Rain Gear**: Be prepared for occasional showers in the coming days, especially on May 28, 29, and 30. Bring an umbrella or raincoat if necessary.
- **Sun Protection**: Since the forecast suggests clear skies initially, you might want to apply sunscreen during the day.

If you need more detailed information or have any specific questions about this weather data, feel free to ask!


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
