# PR Lens

A command-line tool that performs deep, context-aware code reviews of GitHub Pull Requests using an LLM and **tool calling**.

Unlike a basic diff summarizer, PR Lens gives the LLM the ability to fetch full file contents from GitHub on demand so it can understand *why* a change was made, not just *what* changed.

---

## How It Works

1. You pass a GitHub PR URL to the CLI
2. PR Lens fetches the diff and comments from the GitHub API
3. It sends everything to an LLM (via [OpenRouter](https://openrouter.ai)) with a `read_github_files` tool available
4. If the LLM needs more context (e.g. the full implementation of a modified function), it calls the tool to fetch the file from GitHub
5. The loop continues until the LLM produces a final structured review

```
You ──▶ PR URL
           │
           ▼
    Fetch diff + comments
           │
           ▼
    LLM (with tools)  ◀──────────────────────┐
           │                                   │
     tool_call?  ──yes──▶  fetch file(s)  ────┘
           │
          no
           │
           ▼
    Structured review printed to terminal
```

---

## Features

- **Tool calling loop** — the LLM can request additional files mid-analysis, up to 5 rounds
- **Automatic branch detection** — fetches the PR's real base branch so file lookups never 404
- **Large file handling** — files over 1,000 lines are truncated with a note so the LLM doesn't waste its context window
- **Error handling** — clear messages for 404, rate limits, and network failures
- **Structured output** — every review follows the same Markdown format: tl;dr, Stakeholders, Changes, Risks, and Learning questions

---

## Example Output

```
📦 Fetching PR #6991 from expressjs/express...
📌 Base branch: master
⏳ Analyzing PR (tool calling enabled)...

🔧 Tool call: read_github_files
   Arguments: {"files": [{"owner":"expressjs","repo":"express","path":"lib/response.js","ref":"master"}]}
   📄 Fetching: https://raw.githubusercontent.com/expressjs/express/master/lib/response.js
   ✅ Tool returned 23,861 characters

# tl;dr
This PR improves content-type handling in res.send, reducing redundant header processing.

# Changes
## lib/response.js
- The charset is now set in a single operation instead of two separate passes...
...
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- An [OpenRouter](https://openrouter.ai) API key

### Installation

```bash
git clone https://github.com/israelakinola/pr-lens.git
cd pr-lens
npm install
```

### Configuration

```bash
cp .env.example .env
# Add your OpenRouter API key to .env
```

### Usage

```bash
npm start <github-pr-url>
```

**Example:**

```bash
npm start https://github.com/expressjs/express/pull/6991
```

### Test the file-fetching tool directly

```bash
npm run test-tool
```

---

## Changing the Model

The model is set in `pr-advice.ts`. Any [OpenRouter-compatible model](https://openrouter.ai/models) that supports tool calling will work. The default is `openai/gpt-4o-mini`.

```ts
const model = "openai/gpt-4o-mini";
```

Suggested alternatives:

| Model | Context | Notes |
|---|---|---|
| `google/gemini-2.5-flash-lite` | 1M | Fast and cheap |
| `openai/gpt-4o` | 128K | Best tool-calling accuracy |
| `openai/gpt-5-mini` | 400K | Good balance |

---

## Project Structure

```
pr-lens/
├── pr-advice.ts      # CLI entry point + tool calling loop
├── tools.ts          # readGitHubFiles function + tool schema
├── test-tool.ts      # Standalone test for the file-fetching tool
├── SYSTEM_PROMPT.md  # LLM system prompt (controls review format + tool guidance)
└── package.json
```

---

## Tech Stack

- **TypeScript** + `tsx` for zero-config execution
- **OpenAI SDK** (OpenRouter-compatible) for LLM calls
- **GitHub REST API** for diffs, comments, and base branch detection
- **raw.githubusercontent.com** for file content fetching

---

## License

MIT
