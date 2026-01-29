---
title: "Tutorial 3: Custom Tools"
---


**⏱️ Time: 45 minutes | 🎯 Goal: Create agents with custom capabilities**

Let's give your agents superpowers! In this tutorial, you'll learn how to create custom tools that extend what your agents can do beyond text generation.

## What You'll Learn

- Custom tool development in TypeScript
- Tool integration with agents
- External API usage
- Error handling in tools

## Prerequisites

- Completed [Tutorial 2: Multi-Agent Collaboration](/docs/tutorials/2-multi-agent)
- Basic understanding of TypeScript
- An LLM API key

---

## Understanding Tools

Tools extend what agents can do. They allow agents to:

- Fetch data from external APIs
- Read and write files
- Search the web
- Interact with databases
- Execute code
- And much more!

Viber provides built-in tools through `@viber/tools`, and you can create custom ones.

## Step 1: Project Setup

Create a new project:

```bash
mkdir custom-tools-demo
cd custom-tools-demo
pnpm init
pnpm add viber @viber/tools dotenv
pnpm add -D typescript tsx @types/node
```

Project structure:

```
custom-tools-demo/
├── src/
│   ├── index.ts           # Main application
│   └── tools/
│       └── weather.ts     # Custom weather tool
├── .env
├── package.json
└── tsconfig.json
```

## Step 2: Using Built-in Tools

First, let's explore the built-in tools. Create `src/index.ts`:

```typescript
import "dotenv/config";
async function main() {
  console.log("🔧 Tools Demo\n");

  // Create a workspace
  const xAgent = await XAgent.start("Research assistant with tools");
  const space = xAgent.getSpace();

  console.log(`✨ Created Space: ${space.spaceId}\n`);

  // XAgent has access to built-in tools
  // Ask it to perform a task that might use tools
  console.log("🤖 XAgent: ");
  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: "Help me understand the current trends in AI. Summarize key developments.",
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  await space.persistState();
  console.log(`💾 Saved: ${space.spaceId}`);
}

main().catch(console.error);
```

## Step 3: Understanding Tool Architecture

In Viber, tools are defined using a simple schema that LLMs can understand:

```typescript
interface Tool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
  execute: (params: Record<string, unknown>) => Promise<string>;
}
```

## Step 4: Create a Custom Tool

Let's create a custom weather tool. Create `src/tools/weather.ts`:

```typescript
/**
 * Custom Weather Tool using Open-Meteo API (free, no API key required)
 */

interface Coordinates {
  lat: number;
  lon: number;
  name: string;
  country: string;
}

interface WeatherData {
  current: {
    temperature_2m: number;
    weathercode: number;
    windspeed_10m: number;
    relative_humidity_2m: number;
  };
}

// Tool definition for the LLM
export const weatherTool = {
  name: "get_weather",
  description: "Get the current weather for a specific location",
  parameters: {
    type: "object" as const,
    properties: {
      location: {
        type: "string",
        description: "City name, e.g., 'San Francisco' or 'London, UK'",
      },
    },
    required: ["location"],
  },
};

// Tool implementation
export async function getWeather(location: string): Promise<string> {
  try {
    // Get coordinates for the location
    const coords = await getCoordinates(location);
    if (!coords) {
      return `Sorry, I couldn't find the location '${location}'. Please try a more specific location name.`;
    }

    // Get weather data
    const weather = await getWeatherData(coords);
    if (!weather) {
      return `Sorry, I couldn't get weather data for ${location}. Please try again later.`;
    }

    return formatWeather(coords, weather);
  } catch (error) {
    return `Error getting weather for ${location}: ${error}`;
  }
}

async function getCoordinates(location: string): Promise<Coordinates | null> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", location);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const response = await fetch(url);
  if (!response.ok) return null;

  const data = await response.json();
  if (!data.results || data.results.length === 0) return null;

  const result = data.results[0];
  return {
    lat: result.latitude,
    lon: result.longitude,
    name: result.name,
    country: result.country || "",
  };
}

async function getWeatherData(coords: Coordinates): Promise<WeatherData | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(coords.lat));
  url.searchParams.set("longitude", String(coords.lon));
  url.searchParams.set(
    "current",
    "temperature_2m,weathercode,windspeed_10m,relative_humidity_2m"
  );
  url.searchParams.set("timezone", "auto");

  const response = await fetch(url);
  if (!response.ok) return null;

  return response.json();
}

function formatWeather(coords: Coordinates, weather: WeatherData): string {
  const current = weather.current;
  const condition = getWeatherCondition(current.weathercode);

  const locationName = coords.country
    ? `${coords.name}, ${coords.country}`
    : coords.name;

  return `🌤️ Current Weather for ${locationName}:

🌡️ Temperature: ${current.temperature_2m}°C
💧 Humidity: ${current.relative_humidity_2m}%
💨 Wind Speed: ${current.windspeed_10m} km/h
☁️ Conditions: ${condition}

Data from Open-Meteo API`;
}

function getWeatherCondition(code: number): string {
  const conditions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    95: "Thunderstorm",
  };
  return conditions[code] || `Unknown (code: ${code})`;
}
```

## Step 5: Use Your Custom Tool

Update `src/index.ts` to use the custom tool:

```typescript
import "dotenv/config";
import { getWeather } from "./tools/weather.js";

async function main() {
  console.log("🌤️  Weather Assistant Demo\n");

  const xAgent = await XAgent.start("Weather information assistant");
  const space = xAgent.getSpace();

  console.log(`✨ Created Space: ${space.spaceId}\n`);

  // Demonstrate the custom tool
  const cities = ["San Francisco", "Tokyo", "London"];

  for (const city of cities) {
    console.log(`\n📍 Checking weather in ${city}...`);
    const weather = await getWeather(city);
    console.log(weather);
  }

  // Now use XAgent with context about the weather
  console.log("\n" + "─".repeat(50));
  console.log("\n🤖 XAgent Analysis:\n");

  const weatherSummary = await Promise.all(
    cities.map((city) => getWeather(city))
  );

  const stream = await xAgent.streamText({
    messages: [
      {
        role: "user",
        content: `Here's the current weather data I gathered:

${weatherSummary.join("\n\n")}

Based on this data, which city would be best for an outdoor picnic today? Explain your reasoning.`,
      },
    ],
    metadata: { mode: "agent", requestedAgent: "X" },
  });

  for await (const chunk of stream.textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  await space.persistState();
  console.log(`\n💾 Saved: ${space.spaceId}`);
}

main().catch(console.error);
```

## Step 6: Run the Demo

Add scripts to `package.json`:

```json
{
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```

Run:

```bash
pnpm start
```

You'll see:

```
🌤️  Weather Assistant Demo

✨ Created Space: space_abc123xyz

📍 Checking weather in San Francisco...
🌤️ Current Weather for San Francisco, United States:
🌡️ Temperature: 18°C
💧 Humidity: 65%
💨 Wind Speed: 12 km/h
☁️ Conditions: Partly cloudy

📍 Checking weather in Tokyo...
🌤️ Current Weather for Tokyo, Japan:
🌡️ Temperature: 24°C
...

──────────────────────────────────────────────────

🤖 XAgent Analysis:

Based on the weather data, I'd recommend Tokyo for your outdoor picnic...
```

## Step 7: Create a File Operations Tool

Create `src/tools/files.ts`:

```typescript
import { existsSync } from "fs";
export const fileTools = {
  read: {
    name: "read_file",
    description: "Read the contents of a file",
    parameters: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path to the file" },
      },
      required: ["path"],
    },
  },
  write: {
    name: "write_file",
    description: "Write content to a file",
    parameters: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path to the file" },
        content: { type: "string", description: "Content to write" },
      },
      required: ["path", "content"],
    },
  },
};

export async function readFileContent(path: string): Promise<string> {
  try {
    const content = await readFile(path, "utf-8");
    return content;
  } catch (error) {
    return `Error reading file: ${error}`;
  }
}

export async function writeFileContent(
  path: string,
  content: string
): Promise<string> {
  try {
    // Ensure directory exists
    const dir = dirname(path);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(path, content, "utf-8");
    return `✅ Successfully wrote to ${path}`;
  } catch (error) {
    return `Error writing file: ${error}`;
  }
}
```

## Step 8: Build an Interactive Tool-Enabled Assistant

Create `src/interactive.ts`:

```typescript
import "dotenv/config";
import { getWeather } from "./tools/weather.js";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  console.log("🔧 Interactive Tool-Enabled Assistant\n");
  console.log("Available commands:");
  console.log("  weather <city>  - Get weather for a city");
  console.log("  read <path>     - Read a file");
  console.log("  write <path>    - Write to a file");
  console.log("  ask <question>  - Ask XAgent");
  console.log("  quit            - Exit\n");

  const xAgent = await XAgent.start("Tool-enabled assistant");
  const space = xAgent.getSpace();

  console.log(`✨ Space: ${space.spaceId}\n`);

  while (true) {
    const input = await prompt("📝 > ");
    const [command, ...args] = input.trim().split(" ");

    switch (command.toLowerCase()) {
      case "weather": {
        const city = args.join(" ") || "New York";
        console.log(`\nFetching weather for ${city}...`);
        console.log(await getWeather(city));
        break;
      }

      case "read": {
        const path = args[0];
        if (!path) {
          console.log("Usage: read <path>");
          break;
        }
        console.log(`\nReading ${path}...`);
        console.log(await readFileContent(path));
        break;
      }

      case "write": {
        const path = args[0];
        if (!path) {
          console.log("Usage: write <path>");
          break;
        }
        const content = await prompt("Content: ");
        console.log(await writeFileContent(path, content));
        break;
      }

      case "ask": {
        const question = args.join(" ");
        if (!question) {
          console.log("Usage: ask <question>");
          break;
        }
        console.log("\n🤖 XAgent: ");
        const stream = await xAgent.streamText({
          messages: [{ role: "user", content: question }],
          metadata: { mode: "agent", requestedAgent: "X" },
        });
        for await (const chunk of stream.textStream) {
          process.stdout.write(chunk);
        }
        console.log("\n");
        break;
      }

      case "quit":
      case "exit":
        await space.persistState();
        console.log(`\n💾 Saved: ${space.spaceId}`);
        rl.close();
        return;

      default:
        if (input.trim()) {
          console.log("Unknown command. Try: weather, read, write, ask, quit");
        }
    }
  }
}

main().catch(console.error);
```

## 🎉 Congratulations!

You've successfully built an agent with custom capabilities! Here's what you accomplished:

✅ **Created custom tools** for weather and file operations  
✅ **Integrated external APIs** (Open-Meteo)  
✅ **Handled errors gracefully**  
✅ **Built an interactive tool-enabled assistant**  

## 💡 Key Concepts Learned

- **Tool Definition**: Describing tools with name, description, and parameters
- **Tool Implementation**: Writing TypeScript functions that do the work
- **External APIs**: Connecting to real-world data sources
- **Error Handling**: Building resilient tools that handle failures gracefully

## 🔍 Tool Design Principles

1. **Single Responsibility**: Each tool should do one thing well
2. **Clear Descriptions**: Help the LLM understand when to use the tool
3. **Error Handling**: Always handle failures gracefully
4. **Type Safety**: Use TypeScript for reliable tool implementations

## 🚀 What's Next?

Now you know how to extend agent capabilities with tools! In [Tutorial 4: Configuration Deep Dive](/docs/tutorials/4-configuration), you'll learn how to configure every aspect of your Viber workspace for production.

### Ideas for More Tools

- **Database tool**: Query PostgreSQL or MongoDB
- **Email tool**: Send notifications via SendGrid or Resend
- **Search tool**: Web search with SerpAPI or Brave Search
- **Calendar tool**: Manage events with Google Calendar API
- **Code execution**: Run Python or JavaScript code safely

## 🔧 Troubleshooting

**API errors?**

- Check your internet connection
- Verify the API endpoint is working
- Add retry logic for reliability

**Tool not producing expected results?**

- Check the tool description is clear
- Verify parameter types match expectations
- Add logging to debug

---

Ready to configure for production? Continue to [Tutorial 4: Configuration Deep Dive](/docs/tutorials/4-configuration)! ⚙️
