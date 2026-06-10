// ==========================================================
// tools.ts — readGitHubFiles tool implementation
// ==========================================================

// Max lines before truncating to avoid token waste
const MAX_LINES = 1000;

export interface GitHubFile {
  owner: string;
  repo: string;
  path: string;
  ref?: string; // defaults to "main"
}

/**
 * Fetches one or more files from GitHub raw content and returns
 * them as a Markdown-formatted string. Large files are truncated
 * at MAX_LINES lines so the LLM does not waste its context window.
 */
export async function readGitHubFiles(
  files: GitHubFile[]
): Promise<string> {
  const sections: string[] = [];

  for (const file of files) {
    const ref = file.ref ?? "main";
    const url =
      `https://raw.githubusercontent.com/` +
      `${file.owner}/${file.repo}/${ref}/${file.path}`;

    console.log(`   📄 Fetching: ${url}`);

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "AIP444-Lab-05" },
      });

      // Handle well-known HTTP errors with clear messages
      if (response.status === 404) {
        sections.push(
          `## ${file.path}\n\n` +
            `**Error:** File not found (404). ` +
            `Checked \`${file.owner}/${file.repo}\` at ref \`${ref}\`.`
        );
        continue;
      }

      if (response.status === 429) {
        sections.push(
          `## ${file.path}\n\n` +
            `**Error:** GitHub rate limit exceeded (429). ` +
            `Unauthenticated limit is 60 req/hour. Please wait and retry.`
        );
        continue;
      }

      if (!response.ok) {
        sections.push(
          `## ${file.path}\n\n` +
            `**Error:** HTTP ${response.status} ${response.statusText}.`
        );
        continue;
      }

      const raw = await response.text();
      const lines = raw.split("\n");
      const totalLines = lines.length;

      // Truncate large files — keep first MAX_LINES lines so the LLM
      // sees the top of the file (imports, type definitions) which is
      // usually the most useful part, and knows there is more content.
      let content: string;
      if (totalLines > MAX_LINES) {
        content =
          lines.slice(0, MAX_LINES).join("\n") +
          `\n\n[File truncated: showing first ${MAX_LINES} of ${totalLines} lines]`;
      } else {
        content = raw;
      }

      sections.push(
        `## ${file.path}\n\n` + "```\n" + content + "\n```"
      );
    } catch (err) {
      // Network-level failure (DNS, timeout, etc.)
      sections.push(
        `## ${file.path}\n\n` +
          `**Error:** Network failure — ${(err as Error).message}`
      );
    }
  }

  return sections.join("\n\n---\n\n");
}

// ==========================================================
// Tool schema — passed to the LLM so it knows how to call us
// ==========================================================

export const tools = [
  {
    type: "function" as const,
    function: {
      name: "read_github_files",
      description:
        "Read one or more files from a GitHub repository. " +
        "Use this when the diff alone does not provide enough context — " +
        "for example, to see the full version of a changed file, " +
        "inspect an imported module, or understand project configuration. " +
        "Only call this for files you are confident exist in the repository.",
      parameters: {
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "Array of GitHub files to fetch.",
            items: {
              type: "object",
              properties: {
                owner: {
                  type: "string",
                  description: "GitHub repository owner or organization.",
                },
                repo: {
                  type: "string",
                  description: "Repository name.",
                },
                path: {
                  type: "string",
                  description: "Path to the file inside the repository.",
                },
                ref: {
                  type: "string",
                  description:
                    "Branch, tag, or commit SHA (e.g. 'main'). " +
                    "Use the base branch of the PR when relevant.",
                },
              },
              required: ["owner", "repo", "path", "ref"],
              additionalProperties: false,
            },
          },
        },
        required: ["files"],
        additionalProperties: false,
      },
    },
  },
];
