import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Client as McpClientSDK } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// --- RequestHandler: wraps local LLM HTTP API ---
class RequestHandler {
    serverUrl;
    model;
    maxTokens;
    temperature;
    stop;
    warmupPrompt;
    ready;
    fetchFn;
    errors;
    constructor(options = {}) {
        const { serverUrl = 'http://localhost:5000/v1/completions', model = 'user_data/models/openchat-3.5-0106.Q4_K_M.gguf', maxTokens = 1000, temperature = 0.2, stop = ["\nUser:", "\nAI:"], warmupPrompt = 'User: Hello!\nAI:' } = options;
        this.serverUrl = serverUrl;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.stop = stop;
        this.warmupPrompt = warmupPrompt;
        this.ready = false;
        this.fetchFn = fetch; // will be assigned in create()
        this.errors = new Set();
    }
    static async create(options) {
        const instance = new RequestHandler(options);
        // dynamically import node-fetch
        const { default: fetchImport } = await import('node-fetch');
        instance.fetchFn = fetchImport;
        await instance._warmup();
        return instance;
    }
    async _warmup() {
        try {
            await this._queryInternal(this.warmupPrompt);
            this.ready = true;
            console.log('RequestHandler: Warmup complete, ready.');
        }
        catch (e) {
            this.recordError(e);
            console.error('RequestHandler: Warmup failed', e);
        }
    }
    async _queryInternal(prompt) {
        const body = {
            model: this.model,
            prompt,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
            stop: this.stop,
        };
        const res = await this.fetchFn(this.serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`Request failed: ${res.status} - ${errorText}`);
        }
        const data = await res.json();
        return data.choices[0].text;
    }
    async query(prompt, verbose = false) {
        if (!this.ready) {
            const err = new Error('RequestHandler not ready');
            this.recordError(err);
            throw err;
        }
        const fullPrompt = `User: ${prompt}\nAI: `;
        const response = await this._queryInternal(fullPrompt);
        if (verbose) {
            console.log(`Prompt:\n${fullPrompt}`);
            console.log(`Response:\n${response}`);
        }
        return response.trim();
    }
    recordError(error) {
        const msg = error?.message || String(error);
        this.errors.add(msg);
    }
    hasSeenError(error) {
        const msg = error?.message || String(error);
        return this.errors.has(msg);
    }
}
// --- MCP Client: middleware between local LLM and MCP server ---
class MCPClient {
    mcp;
    requestHandler;
    constructor(requestHandler) {
        this.requestHandler = requestHandler;
        this.mcp = new McpClientSDK({ name: 'mcp-client-cli', version: '1.0.0' });
        console.debug('MCPClient initialized.');
    }
    async connectToServer(serverPath) {
        const isJs = serverPath.endsWith('.js');
        const command = isJs ? process.execPath : 'python3';
        this.mcp.connect(new StdioClientTransport({ command, args: [serverPath] }));
        const { tools } = await this.mcp.listTools();
        console.log('Connected with tools:', tools.map(t => t.name));
    }
    async processQuery(query) {
        console.debug('Processing query:', query);
        // Basic parsing: split first word as tool name, rest as param string
        const [toolName, ...paramParts] = query.trim().split(' ');
        const paramString = paramParts.join(' ');
        try {
            // Check if tool exists (you can cache tool names from listTools)
            const tools = await this.mcp.listTools();
            const toolNames = tools.tools.map(t => t.name);
            if (toolNames.includes(toolName)) {
                let params = {};
                if (toolName === 'get-forecast') {
                    // allow both "lat,lon" and "lat lon" syntaxes
                    let coords;
                    if (paramString.includes(',')) {
                        coords = paramString.split(',').map(s => s.trim());
                    }
                    else {
                        coords = paramString.split(/\s+/).map(s => s.trim());
                    }
                    const [latStr, lonStr] = coords;
                    const latitude = parseFloat(latStr);
                    const longitude = parseFloat(lonStr);
                    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
                        throw new Error(`Invalid coords: "${paramString}"`);
                    }
                    params = { latitude, longitude };
                }
                else {
                    // ... other tools
                    params = { query: paramString };
                }
                const result = await this.mcp.callTool({ name: toolName, arguments: params });
                // if the server responded with a `content` array, join and return the text
                if (Array.isArray(result?.content)) {
                    return result.content
                        .map(item => item.text || JSON.stringify(item))
                        .join('\n\n');
                }
                // otherwise, handle as before
                if (typeof result?.result === 'string') {
                    return result.result;
                }
                return JSON.stringify(result ?? 'No result from tool');
            }
        }
        catch (err) {
            console.error('Error calling MCP tool:', err);
            // fallback to LLM for free-text or error recovery
        }
        // If no matching tool, fallback to LLM with original query text
        return this.requestHandler.query(query);
    }
    async chatLoop() {
        const rl = readline.createInterface({ input, output });
        console.log('\nMCP Client Started! Type queries or \'quit\'.');
        while (true) {
            const msg = await rl.question('\nQuery: ');
            if (msg.toLowerCase() === 'quit')
                break;
            const resp = await this.processQuery(msg);
            console.log('\n' + resp);
        }
        rl.close();
    }
}
// --- Main ---
(async () => {
    const handler = await RequestHandler.create();
    const client = new MCPClient(handler);
    const serverScript = process.argv[2];
    if (!serverScript) {
        console.error('Usage: node index.js <mcp-server-script>');
        process.exit(1);
    }
    await client.connectToServer(serverScript);
    await client.chatLoop();
})();
