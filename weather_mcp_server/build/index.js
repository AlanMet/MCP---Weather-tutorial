import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const NWS_API_BASE = "https://api.weather.gov"; // Still used for US-specific alerts
const USER_AGENT_BASE = "weather-app/1.0 (MCP Example)";
const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";
function debug(...args) {
    if (DEBUG) {
        console.error("[SERVER DEBUG]", ...args);
    }
}
const server = new McpServer({
    name: "weather",
    version: "1.3.0", // Using Nominatim for geocoding
    capabilities: {
        resources: {},
        tools: {},
    }
});
async function makeAPIRequest(url, isJsonResponse = true, customHeaders) {
    const headers = {
        "User-Agent": USER_AGENT_BASE,
        ...(customHeaders || {}),
    };
    if (isJsonResponse && !headers["Accept"]) {
        headers["Accept"] = "application/json";
    }
    debug("Requesting URL:", url, "with headers:", JSON.stringify(headers));
    let fetchFn = globalThis.fetch;
    let usedFetchSource = "globalThis.fetch";
    if (typeof fetchFn !== 'function') {
        debug("globalThis.fetch is not available or not a function, attempting to import node-fetch.");
        try {
            const { default: nodeFetch } = await import('node-fetch');
            fetchFn = nodeFetch;
            usedFetchSource = "node-fetch";
            debug("Successfully imported and using node-fetch.");
        }
        catch (importError) {
            console.error("Failed to import node-fetch and globalThis.fetch is not available/functional.", importError);
            return null;
        }
    }
    if (typeof fetchFn !== 'function') {
        console.error("Critical: fetch function is still not available after attempting import.");
        return null;
    }
    let responseTextForDebugging = "";
    try {
        const response = await fetchFn(url, { headers });
        debug(`Response status from ${url} (using ${usedFetchSource}):`, response.status, response.statusText);
        responseTextForDebugging = await response.text();
        if (!response.ok) {
            console.error(`Error making API request to ${url} using ${usedFetchSource}. Status: ${response.status}, Raw Body: ${responseTextForDebugging.substring(0, 500)}`);
            return null;
        }
        debug(`Raw response text from ${url} (using ${usedFetchSource}):`, responseTextForDebugging.substring(0, 1000) + "...");
        if (!isJsonResponse) {
            return responseTextForDebugging;
        }
        const jsonData = JSON.parse(responseTextForDebugging);
        debug(`Parsed JSON data from ${url} (using ${usedFetchSource}):`, JSON.stringify(jsonData, null, 2).substring(0, 500) + "...");
        return jsonData;
    }
    catch (error) {
        console.error(`Error during API request or JSON parsing for ${url} using ${usedFetchSource}:`, error.message);
        console.error(`Raw text received that might have caused error:`, responseTextForDebugging.substring(0, 1000) + "...");
        return null;
    }
}
function formatNWSAlert(feature) {
    const props = feature.properties;
    return [
        `Event: ${props.event || "Unknown"}`, `Area: ${props.areaDesc || "Unknown"}`,
        `Severity: ${props.severity || "Unknown"}`, `Status: ${props.status || "Unknown"}`,
        `Headline: ${props.headline || "No headline available"}`, `Description: ${props.description || "No description available."}`,
        `Instruction: ${props.instruction || "No specific instructions."}`, "---",
    ].join("\n");
}
const WMO_CODES = { 0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Depositing rime fog", 51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle", 56: "Light freezing drizzle", 57: "Dense freezing drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain", 66: "Light freezing rain", 67: "Heavy freezing rain", 71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall", 77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers", 95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail" };
function getWeatherDescription(code) { return code !== undefined ? WMO_CODES[code] || `Unknown weather code: ${code}` : "Not available"; }
// --- Tool Definitions ---
server.tool("get-alerts", "Get weather alerts for a US state from the National Weather Service (NWS). Example: 'CA' for California.", { state: z.string().length(2, { message: "State code must be 2 letters." }).describe("Two-letter US state code (e.g. CA, NY)"), }, async ({ state }) => {
    const stateCode = state.toUpperCase();
    const alertsUrl = `${NWS_API_BASE}/alerts/active?area=${stateCode}`;
    debug("get-alerts: stateCode", stateCode, "alertsUrl", alertsUrl);
    const alertsData = await makeAPIRequest(alertsUrl, true, { "Accept": "application/geo+json" });
    if (!alertsData) {
        debug("get-alerts: No alertsData received or failed to fetch from NWS.");
        return { content: [{ type: "text", text: `Failed to retrieve alerts data from NWS for ${stateCode}. The API might be down, the state code might be invalid, or there could be a network issue.` }], isError: true, };
    }
    const features = alertsData.features || [];
    if (features.length === 0) {
        return { content: [{ type: "text", text: `No active NWS alerts for ${stateCode} at this time.` }], };
    }
    const formattedAlerts = features.map(formatNWSAlert);
    return { content: [{ type: "text", text: `Active NWS alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}` }], };
});
server.tool("get-latlong-from-name", "Get latitude and longitude for a named location using Nominatim (OpenStreetMap API). Global coverage. Returns name, latitude, and longitude.", { locationName: z.string().min(1, { message: "Location name cannot be empty." }).describe("The name of the location (e.g., 'New York', 'Paris, France', 'Tokyo', 'Paris TX')"), }, async ({ locationName }) => {
    debug("get-latlong-from-name: locationName being processed:", locationName);
    const geocodeApiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1&addressdetails=0`; // addressdetails=0 for simpler response
    debug("get-latlong-from-name: Nominatim geocodeApiUrl:", geocodeApiUrl);
    // IMPORTANT: For production use, replace placeholder email with your actual contact information
    // as per Nominatim's Usage Policy: https://operations.osmfoundation.org/policies/nominatim/
    const nominatimUserAgent = `MCPWeatherApp/1.0 (${USER_AGENT_BASE}) your-email@example.com`;
    const geoResponse = await makeAPIRequest(geocodeApiUrl, true, {
        "User-Agent": nominatimUserAgent
    });
    debug("get-latlong-from-name: Raw geoResponse from makeAPIRequest (Nominatim):", JSON.stringify(geoResponse, null, 2));
    if (geoResponse && Array.isArray(geoResponse) && geoResponse.length > 0) {
        const firstResult = geoResponse[0];
        const lat = parseFloat(firstResult.lat);
        const lon = parseFloat(firstResult.lon);
        if (isNaN(lat) || isNaN(lon)) {
            debug("get-latlong-from-name: Nominatim returned non-numeric lat/lon:", firstResult);
            return { content: [{ type: "text", text: JSON.stringify({ error: `Nominatim returned invalid coordinate format for '${locationName}'. Received lat: ${firstResult.lat}, lon: ${firstResult.lon}` }) }], isError: true, };
        }
        const locationData = {
            name: firstResult.display_name,
            latitude: lat,
            longitude: lon,
            // Timezone is not directly available from basic Nominatim search.
            // The get-worldwide-forecast tool will use 'auto' for timezone.
        };
        debug("get-latlong-from-name: Geocoding successful with Nominatim:", locationData);
        return { content: [{ type: "text", text: JSON.stringify(locationData) }], };
    }
    else {
        debug("get-latlong-from-name: Location not found or geocoding API error from Nominatim. Raw Response was:", JSON.stringify(geoResponse, null, 2));
        return { content: [{ type: "text", text: JSON.stringify({ error: `Could not find coordinates for the location: '${locationName}' using Nominatim. Please be more specific, check spelling, or the location might not be found.` }) }], isError: true, };
    }
});
server.tool("get-worldwide-forecast", "Get the current weather and a multi-day forecast for a given latitude, longitude using Open-Meteo API (global coverage). An optional timezone (e.g. America/New_York) can be provided.", {
    latitude: z.number().min(-90).max(90).describe("Latitude of the location (e.g., from get-latlong-from-name tool)"),
    longitude: z.number().min(-180).max(180).describe("Longitude of the location (e.g., from get-latlong-from-name tool)"),
    timezone: z.string().optional().describe("Timezone (e.g., 'America/New_York', 'Europe/London'). Defaults to 'auto' if not provided. Can sometimes be inferred from get-latlong-from-name if that tool provides it."),
}, async ({ latitude, longitude, timezone }) => {
    const tzParam = (timezone && timezone.trim() !== "") ? encodeURIComponent(timezone) : "auto";
    // Request current weather, daily min/max temp, weather code, and precipitation sum for the next 7 days
    // Added temperature_unit, wind_speed_unit, precipitation_unit for clarity
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=${tzParam}&forecast_days=7`;
    debug("get-worldwide-forecast: Open-Meteo URL", forecastUrl);
    const forecastData = await makeAPIRequest(forecastUrl, true);
    if (!forecastData) {
        debug("get-worldwide-forecast: No forecast data received from Open-Meteo.");
        return { content: [{ type: "text", text: JSON.stringify({ error: "Failed to retrieve forecast data from Open-Meteo. The API might be temporarily unavailable or location parameters are invalid." }) }], isError: true };
    }
    if (forecastData.error && forecastData.reason) {
        debug("get-worldwide-forecast: Open-Meteo API returned an error:", forecastData.reason);
        return { content: [{ type: "text", text: JSON.stringify({ error: `Open-Meteo forecast error: ${forecastData.reason}` }) }], isError: true };
    }
    let responseText = `Weather Forecast for location (lat: ${latitude.toFixed(2)}, lon: ${longitude.toFixed(2)}), Timezone: ${forecastData.timezone || tzParam}:\n`;
    if (forecastData.current) {
        const current = forecastData.current;
        responseText += "\n--- Current Weather ---\n";
        responseText += `Time: ${current.time}\n`;
        responseText += `Temperature: ${current.temperature_2m}°F\n`;
        responseText += `Apparent Temp: ${current.apparent_temperature}°F\n`;
        responseText += `Humidity: ${current.relative_humidity_2m}%\n`;
        responseText += `Weather: ${getWeatherDescription(current.weather_code)}\n`;
        responseText += `Wind: ${current.wind_speed_10m} mph from ${current.wind_direction_10m}° (Gusts: ${current.wind_gusts_10m} mph)\n`;
        responseText += `Precipitation: ${current.precipitation} in\n`;
        responseText += `Cloud Cover: ${current.cloud_cover}%\n`;
        responseText += `Pressure: ${current.pressure_msl} hPa\n`;
    }
    else {
        responseText += "Current weather data not available.\n";
    }
    if (forecastData.daily && forecastData.daily.time && forecastData.daily.time.length > 0) {
        responseText += "\n--- Daily Forecast (7 days) ---\n";
        const units = forecastData.daily_units;
        for (let i = 0; i < forecastData.daily.time.length; i++) {
            responseText += `Date: ${forecastData.daily.time[i]}\n`;
            responseText += `  Weather: ${getWeatherDescription(forecastData.daily.weather_code[i])}\n`;
            responseText += `  Max Temp: ${forecastData.daily.temperature_2m_max[i]}${units?.temperature_2m_max || '°F'}\n`;
            responseText += `  Min Temp: ${forecastData.daily.temperature_2m_min[i]}${units?.temperature_2m_min || '°F'}\n`;
            if (forecastData.daily.precipitation_sum && forecastData.daily.precipitation_sum[i] !== undefined) {
                responseText += `  Precipitation Sum: ${forecastData.daily.precipitation_sum[i]}${units?.precipitation_sum || 'in'}\n`;
            }
            responseText += "  ---\n";
        }
    }
    else {
        responseText += "Daily forecast data not available.\n";
    }
    return { content: [{ type: "text", text: responseText.trim() }] };
});
async function main() {
    // Test function call is commented out for normal operation
    // await testNominatimOnServer(); 
    const transport = new StdioServerTransport();
    try {
        await server.connect(transport);
        console.error(`Weather MCP Server (Worldwide v1.3.0) running on stdio`);
    }
    catch (error) {
        console.error("Fatal error connecting server:", error);
        process.exit(1);
    }
}
main().catch((error) => {
    console.error("Fatal error in server main():", error);
    process.exit(1);
});
/*
// Optional: Test function for Nominatim Geocoding on server start
async function testNominatimOnServer() {
    console.error("\n--- [SERVER STARTUP TEST] Testing Nominatim Geocoding API ---");
    const testLocations = ["Paris TX", "London UK", "Tokyo Japan", "NonExistentPlaceXYZ"];
    const nominatimUserAgent = `MCPWeatherApp/1.0 (${USER_AGENT_BASE}) your-email@example.com`; // **IMPORTANT: Update for real use**

    for (const loc of testLocations) {
        const geocodeApiUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(loc)}&format=json&limit=1&addressdetails=0`;
        const result = await makeAPIRequest<NominatimGeocodeResponse>(geocodeApiUrl, true, {"User-Agent": nominatimUserAgent});
        console.error(`--- [SERVER STARTUP TEST] Nominatim Geocoding Result for '${loc}':`, JSON.stringify(result, null, 2));
        if (result && Array.isArray(result) && result.length > 0 && result[0].lat && result[0].lon) {
            console.error(`--- [SERVER STARTUP TEST] Geocoding for '${loc}' seems SUCCESSFUL. ---`);
        } else {
            console.error(`--- [SERVER STARTUP TEST] Geocoding for '${loc}' FAILED or returned no results. ---`);
        }
    }
    console.error("--- [SERVER STARTUP TEST] Finished Nominatim Geocoding test. --- \n");
}
*/
