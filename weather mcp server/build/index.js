import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
// Simple debug flag and function
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";
function debug(...args) {
    if (DEBUG) {
        console.debug("[DEBUG]", ...args);
    }
}
const server = new McpServer({
    name: "weather",
    "version": "1.0.0",
    capapilities: {
        resources: {},
        tools: {},
    }
});
async function makeNWSRequest(url) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json",
    };
    debug("Requesting URL:", url, "with headers:", headers);
    try {
        const response = await fetch(url, { headers });
        debug("Response status:", response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        debug("Response data:", data);
        return data;
    }
    catch (error) {
        console.error("Error making NWS request:", error);
        return null;
    }
}
function formatAlert(feature) {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`,
        `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`,
        `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "No headline"}`,
        "---",
    ].join("\n");
}
server.tool("get-alerts", "Get weather alerts for a state", {
    state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
}, async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
    debug("get-alerts: stateCode", stateCode, "alertsUrl", alertsUrl);
    const alertsData = await makeNWSRequest(alertsUrl);
    if (!alertsData) {
        debug("get-alerts: No alertsData received");
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to retrieve alerts data",
                },
            ],
        };
    }
    const features = alertsData.features || [];
    debug("get-alerts: features.length", features.length);
    if (features.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `No active alerts for ${stateCode}`,
                },
            ],
        };
    }
    const formattedAlerts = features.map(formatAlert);
    const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;
    return {
        content: [
            {
                type: "text",
                text: alertsText,
            },
        ],
    };
});
server.tool("get-forecast", "Get weather forecast for a location", {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
    longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
}, async ({ latitude, longitude }) => {
    const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    debug("get-forecast: pointsUrl", pointsUrl);
    const pointsData = await makeNWSRequest(pointsUrl);
    if (!pointsData) {
        debug("get-forecast: No pointsData received");
        return {
            content: [
                {
                    type: "text",
                    text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
                },
            ],
        };
    }
    const forecastUrl = pointsData.properties?.forecast;
    debug("get-forecast: forecastUrl", forecastUrl);
    if (!forecastUrl) {
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to get forecast URL from grid point data",
                },
            ],
        };
    }
    const forecastData = await makeNWSRequest(forecastUrl);
    if (!forecastData) {
        debug("get-forecast: No forecastData received");
        return {
            content: [
                {
                    type: "text",
                    text: "Failed to retrieve forecast data",
                },
            ],
        };
    }
    const periods = forecastData.properties?.periods || [];
    debug("get-forecast: periods.length", periods.length);
    if (periods.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: "No forecast periods available",
                },
            ],
        };
    }
    const formattedForecast = periods.map((period) => [
        `${period.name || "Unknown"}:`,
        `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
        `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
        `${period.shortForecast || "No forecast available"}`,
        "---",
    ].join("\n"));
    const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;
    return {
        content: [
            {
                type: "text",
                text: forecastText,
            },
        ],
    };
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
