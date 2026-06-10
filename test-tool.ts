import { readGitHubFiles } from "./tools.js";

async function test() {
  console.log("=== readGitHubFiles test suite ===\n");

  // ----------------------------------------------------------
  // Case 1: Normal file (small, well-known)
  // ----------------------------------------------------------
  console.log("Test 1: Normal file — microsoft/vscode package.json");
  const result1 = await readGitHubFiles([
    {
      owner: "microsoft",
      repo: "vscode",
      path: "package.json",
      ref: "main",
    },
  ]);
  console.log(result1.slice(0, 500), "\n...\n");

  // ----------------------------------------------------------
  // Case 2: File that does not exist (should return 404 message)
  // ----------------------------------------------------------
  console.log("Test 2: Non-existent file");
  const result2 = await readGitHubFiles([
    {
      owner: "microsoft",
      repo: "vscode",
      path: "this-file-does-not-exist.xyz",
      ref: "main",
    },
  ]);
  console.log(result2, "\n");

  // ----------------------------------------------------------
  // Case 3: Misspelled repo name
  // ----------------------------------------------------------
  console.log("Test 3: Misspelled repo");
  const result3 = await readGitHubFiles([
    {
      owner: "microsoft",
      repo: "vscodeXXXXXX",
      path: "package.json",
      ref: "main",
    },
  ]);
  console.log(result3, "\n");

  // ----------------------------------------------------------
  // Case 4: Very large file (should be truncated at 1000 lines)
  // ----------------------------------------------------------
  console.log("Test 4: Large file — microsoft/vscode src/vs/base/common/uri.ts");
  const result4 = await readGitHubFiles([
    {
      owner: "microsoft",
      repo: "vscode",
      path: "src/vs/base/common/uri.ts",
      ref: "main",
    },
  ]);
  // Check if truncation notice appears
  if (result4.includes("[File truncated")) {
    console.log("✅ Truncation works — found truncation notice");
  } else {
    console.log("File was not truncated (it may be under 1000 lines)");
  }
  console.log(result4.slice(-200), "\n");

  // ----------------------------------------------------------
  // Case 5: Multiple files in one call
  // ----------------------------------------------------------
  console.log("Test 5: Multiple files in one call");
  const result5 = await readGitHubFiles([
    {
      owner: "microsoft",
      repo: "vscode",
      path: ".gitignore",
      ref: "main",
    },
    {
      owner: "microsoft",
      repo: "vscode",
      path: ".eslintrc.json",
      ref: "main",
    },
  ]);
  console.log(result5.slice(0, 600), "\n...\n");

  console.log("=== Tests complete ===");
}

test().catch(console.error);
