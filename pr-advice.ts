import OpenAI from "openai";
import dotenv from "dotenv";
import { parseArgs } from "node:util";
import fs from "fs";
import { readGitHubFiles, tools } from "./tools.js";

dotenv.config();

// ==========================================================
// Identity Header
// ==========================================================

console.log("pr-advice: Developed by ISRAEL AKINOLA - 123101172");
console.log(`Run Date: ${new Date().toISOString()}`);
console.log("--------------------------------------------------------------");

// ==========================================================
// API Key Validation
// ==========================================================

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey || apiKey.trim() === "") {
  console.error("❌ Error: OPENROUTER_API_KEY not found");
  process.exit(1);
}

console.log("✅ API key loaded");

// ==========================================================
// Parse Command Line Arguments
// ==========================================================

function parseArguments() {
  const { positionals } = parseArgs({
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    console.error("Usage: npm start <github-pr-url>");
    process.exit(1);
  }

  return positionals[0];
}

const prUrl = parseArguments();

// ==========================================================
// Read Files
// ==========================================================

async function getFileContents(path: string, description: string) {
  try {
    return await fs.promises.readFile(path, "utf8");
  } catch (err) {
    console.error(`❌ Error: ${description} not found`);
    process.exit(1);
  }
}

// ==========================================================
// Parse GitHub URL
// ==========================================================

function parsePRUrl(urlString: string) {
  const url = new URL(urlString);

  if (url.origin !== "https://github.com") {
    throw new Error("Not a GitHub URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);

  if (parts.length !== 4 || parts[2] !== "pull") {
    throw new Error("Invalid PR URL");
  }

  return {
    owner: parts[0],
    repo: parts[1],
    prNumber: parts[3],
  };
}

// ==========================================================
// Fetch Patch
// ==========================================================

async function fetchPatch(prUrl: string) {
  const response = await fetch(`${prUrl}.patch`);

  if (!response.ok) {
    throw new Error(`Patch fetch failed: ${response.status}`);
  }

  let patch = await response.text();

  if (patch.length > 95000) {
    console.warn("⚠️  Patch exceeds 95,000 chars. Truncating.");
    patch = patch.substring(0, 95000) + "\n\n...[Diff Truncated]...";
  }

  return patch;
}

// ==========================================================
// Fetch PR Base Branch
// ==========================================================

async function fetchBaseBranch(
  owner: string,
  repo: string,
  prNumber: string
): Promise<string> {
  const url =
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "AIP444-Lab-05",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) return "main"; // safe fallback

  const data = await response.json();
  return data.base?.ref ?? "main";
}

// ==========================================================
// Fetch Comments
// ==========================================================

async function fetchComments(
  owner: string,
  repo: string,
  issueNum: string
) {
  const url =
    `https://api.github.com/repos/${owner}/${repo}` +
    `/issues/${issueNum}/comments`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "AIP444-Lab-05",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API Error ${response.status}`);
  }

  const data = await response.json();

  return data.map((item: any) => ({
    username: item.user.login,
    body: item.body,
    date: item.updated_at,
  }));
}

// ==========================================================
// Tool Calling Loop
// ==========================================================

// Dispatches a tool call by name and returns its result as a string.
async function dispatchTool(
  name: string,
  rawArgs: string
): Promise<string> {
  if (name === "read_github_files") {
    const args = JSON.parse(rawArgs) as { files: any[] };
    return await readGitHubFiles(args.files);
  }

  return `Error: Unknown tool "${name}"`;
}

// Sends messages to the LLM and handles any tool calls it makes,
// looping until the model returns a plain text response.
async function runWithTools(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<string> {
  const MAX_TOOL_ROUNDS = 5; // safety cap to avoid infinite loops
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    const completion = await client.chat.completions.create({
      model,
      messages,
      tools,
      temperature: 0.3,
      max_tokens: 2000,
    });

    const message = completion.choices[0].message;

    // No tool calls — the model produced a final text answer
    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "(empty response)";
    }

    // The model wants to call one or more tools.
    // First push the assistant turn (with the tool_calls) into history.
    messages.push(message as OpenAI.Chat.ChatCompletionMessageParam);

    // Execute each tool call and push its result into history.
    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;

      const fnName = toolCall.function.name;
      const fnArgs = toolCall.function.arguments;

      console.log(`\n🔧 Tool call: ${fnName}`);
      console.log(`   Arguments: ${fnArgs}`);

      const result = await dispatchTool(fnName, fnArgs);

      console.log(`   ✅ Tool returned ${result.length} characters`);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }


  }

  return "Error: Maximum tool call rounds reached without a final response.";
}

// ==========================================================
// Generate PR Analysis
// ==========================================================

async function analyzePR() {
  const systemPrompt = await getFileContents(
    "SYSTEM_PROMPT.md",
    "System Prompt"
  );

  const { owner, repo, prNumber } = parsePRUrl(prUrl);

  console.log(`\n📦 Fetching PR #${prNumber} from ${owner}/${repo}...`);

  const [patch, comments, baseBranch] = await Promise.all([
    fetchPatch(prUrl),
    fetchComments(owner, repo, prNumber),
    fetchBaseBranch(owner, repo, prNumber),
  ]);

  console.log(`📌 Base branch: ${baseBranch}`);

  const threadXML = `
<thread>
${comments
  .map(
    (c: { username: string; body: string; date: string }) => `
<comment username="${c.username}" date="${c.date}">
${c.body}
</comment>`
  )
  .join("\n")}
</thread>
`;

  const userPrompt = `
    Analyze this GitHub Pull Request.

    Repository: ${owner}/${repo}
    PR Number: ${prNumber}
    Base branch: ${baseBranch}

    ## DIFF

    \`\`\`diff
    ${patch}
    \`\`\`

    ## COMMENTS

    ${threadXML}
    `;

  const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
  });

  const model = "openai/gpt-4o-mini";

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  try {
    console.log("⏳ Analyzing PR (tool calling enabled)...\n");

    const analysis = await runWithTools(client, model, messages);

    console.log("\n" + analysis);
  } catch (err) {
    console.error("❌ OpenRouter Error:", (err as Error).message);
    process.exit(1);
  }
}

// ==========================================================
// Main
// ==========================================================

async function main() {
  await analyzePR();
}

main();
