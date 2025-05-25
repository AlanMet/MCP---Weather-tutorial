# MCP Weather Client/Server (Test Project)

This is a **test project** to explore and understand how the [Model Context Protocol (MCP)](https://github.com/modelcontext/modelcontextprotocol) works using a local LLM backend (like Text Generation WebUI). It connects a weather tool server to a command-line client that can process free-text or structured queries using MCP.

Based on [Anthropic quickstart tutorial](https://modelcontextprotocol.io/quickstart/server#node)
---

## 🧠 Project Summary

- **Local LLM** is queried through HTTP using a `RequestHandler` wrapper.
- **MCP Client** acts as middleware: tries to match a tool call via MCP, else falls back to LLM.
- **Weather MCP Server** exposes two tools:
  - `get-alerts`: Fetch weather alerts for a US state.
  - `get-forecast`: Fetch weather forecast for given latitude/longitude using [weather.gov](https://weather.gov) API.

---

## 🏗️ Folder Structure

```
weather_mcp_client/
└── build/
    └── index.js        # MCP Client + RequestHandler

weather_mcp_server/
└── build/
    └── index.js        # MCP Server (tools + transport)
```

---

## 🏃‍♂️ How to Run

```bash
node weather_mcp_client/build/index.js weather_mcp_server/build/index.js
```

You'll see:

```text
MCP Client Started! Type queries or 'quit'.
```

Example queries:

```
get-alerts CA
get-forecast 34.05 -118.25
```

---

## 🧩 How It Works

### MCP Client

- Loads a local LLM endpoint (e.g., Text Gen WebUI running on port 5000).
- Connects to the MCP server over stdio transport.
- Tries to match query to an MCP tool:
  - If matched, it executes the tool via `mcp.callTool(...)`.
  - If not matched, falls back to the local LLM (`RequestHandler.query(...)`).

### MCP Server

- Registers `get-alerts` and `get-forecast` tools using Zod schemas.
- Makes HTTP calls to the [National Weather Service API](https://weather.gov/documentation/services-web-api).
- Uses MCP's `StdioServerTransport` for local stdio communication.

---

## 🛠️ Requirements

- Node.js
- Local LLM running with a completions endpoint (default assumed: `http://localhost:5000/v1/completions`)
- MCP SDK:
  ```
  npm install @modelcontextprotocol/sdk zod node-fetch
  ```

---

## 🔍 Debugging

You can enable verbose logging via:

```bash
DEBUG=true node weather_mcp_client/build/index.js weather_mcp_server/build/index.js
```

---

## 📘 Notes

- This is **not** production-ready.
- It is meant for **experimentation** and learning how to integrate MCP with local models.
- You can extend this by adding more tools or improving the natural language fallback logic.

---
