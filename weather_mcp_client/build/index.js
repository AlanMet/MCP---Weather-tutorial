import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { Client as McpClientSDK } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
// --- CONFIGURATION ---
const ENABLE_DEBUG_LOGGING = false; // Set to true to enable debug logs, false to disable
// Helper function for conditional logging
function debugLog(...args) {
    if (ENABLE_DEBUG_LOGGING) {
        console.debug(...args);
    }
}
class RequestHandler {
    serverUrl;
    model;
    maxTokens;
    temperature;
    // private stop: string[]; // Retained if needed
    ready;
    fetchFn;
    errors;
    constructor(options = {}) {
        const { serverUrl = 'http://localhost:11434/v1/chat/completions', model = 'hhao/qwen2.5-coder-tools', maxTokens = 1000, temperature = 0.2,
        // stop = ["\nUser:", "\nAI:"], 
         } = options;
        debugLog(`RequestHandler Initializing with: URL='${serverUrl}', Model='${model}'`);
        this.serverUrl = serverUrl;
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        // this.stop = stop; 
        this.ready = false;
        this.fetchFn = fetch;
        this.errors = new Set();
    }
    static async create(options) {
        const instance = new RequestHandler(options);
        const { default: fetchImport } = await import('node-fetch');
        instance.fetchFn = fetchImport;
        await instance._warmup();
        return instance;
    }
    async _warmup() {
        try {
            // Warmup with a simple message array
            await this._queryInternal([{ role: 'user', content: 'Hello!' }]);
            this.ready = true;
            console.log('RequestHandler: Warmup complete, ready.');
        }
        catch (e) {
            this.recordError(e);
            console.error('RequestHandler: Warmup failed', e.message); // Log e.message
        }
    }
    async _queryInternal(messages, tools) {
        const body = {
            model: this.model,
            messages: messages,
            max_tokens: this.maxTokens,
            temperature: this.temperature,
        };
        if (tools && tools.length > 0) {
            body.tools = tools;
            body.tool_choice = "auto";
        }
        debugLog("RequestHandler: Sending to LLM:", JSON.stringify(body, null, 2));
        const res = await this.fetchFn(this.serverUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error("RequestHandler: LLM API Error:", res.status, errorText);
            throw new Error(`Request failed: ${res.status} - ${errorText}`);
        }
        const data = await res.json();
        debugLog("RequestHandler: Received from LLM:", JSON.stringify(data, null, 2));
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
            return JSON.stringify(data.choices[0].message);
        }
        throw new Error("Unexpected LLM response format from _queryInternal");
    }
    async queryWithHistory(messages, tools) {
        if (!this.ready) {
            const err = new Error('RequestHandler not ready');
            this.recordError(err);
            throw err;
        }
        return this._queryInternal(messages, tools);
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
class MCPClient {
    mcp;
    requestHandler;
    constructor(requestHandler) {
        this.requestHandler = requestHandler;
        this.mcp = new McpClientSDK({ name: 'mcp-client-cli', version: '1.0.0' });
        debugLog('MCPClient initialized.');
    }
    async connectToServer(serverPath) {
        const isJs = serverPath.endsWith('.js');
        const command = isJs ? process.execPath : 'python3';
        this.mcp.connect(new StdioClientTransport({ command, args: [serverPath] }));
        const listToolsResult = await this.mcp.listTools();
        if (listToolsResult && Array.isArray(listToolsResult.tools)) {
            console.log('Connected with tools:', listToolsResult.tools.map(t => t.name));
        }
        else {
            console.log('Connected, but no tools found or unexpected format from listTools.');
            if (listToolsResult)
                debugLog("MCPClient: listToolsResult format:", listToolsResult);
        }
    }
    async processQuery(query) {
        debugLog('MCPClient: Initial user query:', query);
        const availableMcpToolsResult = await this.mcp.listTools();
        if (!availableMcpToolsResult || !Array.isArray(availableMcpToolsResult.tools)) {
            console.error("MCPClient: Could not retrieve tools from server or format is incorrect.");
            return "Sorry, I'm having trouble accessing my tools right now.";
        }
        const formattedToolsForLLM = availableMcpToolsResult.tools.map((tool) => {
            let parametersJsonSchema = tool.inputSchema;
            if (!parametersJsonSchema || typeof parametersJsonSchema !== 'object') {
                if (ENABLE_DEBUG_LOGGING)
                    console.warn(`MCPClient: Tool '${tool.name}' has invalid or missing inputSchema. Defaulting to empty parameters. Schema:`, tool.inputSchema);
                parametersJsonSchema = { type: "object", properties: {} };
            }
            if (typeof parametersJsonSchema.type !== 'string' || parametersJsonSchema.type !== 'object') {
                parametersJsonSchema.type = "object";
            }
            if (typeof parametersJsonSchema.properties !== 'object') {
                parametersJsonSchema.properties = {};
            }
            return {
                type: "function",
                function: {
                    name: tool.name,
                    description: tool.description || "",
                    parameters: parametersJsonSchema,
                }
            };
        });
        debugLog("MCPClient: Tools formatted for LLM:", JSON.stringify(formattedToolsForLLM, null, 2));
        let conversationHistory = [{ role: "user", content: query }];
        let llmResponseJsonString = await this.requestHandler.queryWithHistory(conversationHistory, formattedToolsForLLM);
        let parsedLlmResponse = JSON.parse(llmResponseJsonString);
        while (parsedLlmResponse.tool_calls && parsedLlmResponse.tool_calls.length > 0) {
            debugLog("MCPClient: LLM responded with tool_calls:", parsedLlmResponse.tool_calls);
            conversationHistory.push(parsedLlmResponse);
            const toolCallsToExecute = parsedLlmResponse.tool_calls;
            for (const toolCall of toolCallsToExecute) {
                const toolName = toolCall.function.name;
                const toolArgsString = toolCall.function.arguments;
                let mcpCallArgs = {};
                try {
                    mcpCallArgs = JSON.parse(toolArgsString);
                }
                catch (e) {
                    console.error(`MCPClient: Failed to parse arguments for tool ${toolName} from LLM: ${toolArgsString}`, e);
                    conversationHistory.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: `Error: Could not parse arguments: ${toolArgsString}`,
                    });
                    continue;
                }
                debugLog(`MCPClient: Calling MCP tool: ${toolName} with args:`, mcpCallArgs);
                try {
                    const mcpToolResult = await this.mcp.callTool({ name: toolName, arguments: mcpCallArgs });
                    debugLog('MCPClient: MCP Tool executed. Result content:', mcpToolResult.content);
                    let toolResultString = "Tool returned no content or an unexpected format.";
                    if (Array.isArray(mcpToolResult.content) && mcpToolResult.content.length > 0) {
                        toolResultString = mcpToolResult.content
                            .map(c => c.text || (typeof c === 'object' ? JSON.stringify(c) : String(c)))
                            .join('\n');
                    }
                    if (mcpToolResult.isError) { // Check if the MCP server tool itself indicated an error
                        toolResultString = `Tool ${toolName} execution resulted in an error from server: ${toolResultString}`;
                    }
                    conversationHistory.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: toolResultString,
                    });
                }
                catch (mcpErr) {
                    console.error(`MCPClient: Error during MCP call to tool '${toolName}':`, mcpErr);
                    conversationHistory.push({
                        role: "tool",
                        tool_call_id: toolCall.id,
                        name: toolName,
                        content: `Error executing tool ${toolName} via MCP: ${mcpErr.message || 'Unknown MCP error'}`,
                    });
                }
            }
            llmResponseJsonString = await this.requestHandler.queryWithHistory(conversationHistory, formattedToolsForLLM);
            parsedLlmResponse = JSON.parse(llmResponseJsonString);
        }
        debugLog("MCPClient: Final LLM response (parsed):", parsedLlmResponse);
        return parsedLlmResponse.content || "Sorry, I couldn't get a final answer or the response was empty.";
    }
    async chatLoop() {
        const rl = readline.createInterface({ input, output });
        console.log('\nMCP Client Started! Type queries or \'quit\'.');
        try {
            while (true) {
                const msg = await rl.question('\nQuery: ');
                if (msg.toLowerCase() === 'quit')
                    break;
                const resp = await this.processQuery(msg);
                console.log('\nLLM Response:\n' + resp);
            }
        }
        catch (error) {
            console.error("Error in chat loop:", error);
        }
        finally {
            rl.close();
        }
    }
}
(async () => {
    try {
        const handler = await RequestHandler.create();
        const client = new MCPClient(handler);
        const serverScript = process.argv[2];
        if (!serverScript) {
            console.error('Usage: node build/index.js <path_to_mcp_server_script>');
            process.exit(1);
        }
        await client.connectToServer(serverScript);
        await client.chatLoop();
    }
    catch (error) {
        console.error("Fatal error in main:", error);
        process.exit(1);
    }
})();
