#!/usr/bin/env node
import { execFileSync } from "child_process";
import { writeFileSync } from "fs";
import { cliArgs } from "../../common/cli-args.ts";
import { LINE_BREAK_PLACEHOLDER } from "../../common/config.ts";

// A real line break inside a JSON string is encoded in the file as the
// two source characters `\` `n` (an escape sequence), which the JSON
// parser turns into a single newline character (0x0A) once loaded.
// A literal backslash followed by an `n` typed by the user (e.g. inside
// a pasted code block) is instead encoded as `\\n` (escaped backslash +
// `n`), which the JSON parser turns into the two characters `\` `n`.
// So once jq has parsed the file, matching the single control character
// "\n" in gsub only ever matches real line breaks, never escaped ones.
const JQ_FILTER = `
  walk(
    if type == "object" and has("string") and (.string | type) == "string"
    then .string |= gsub("\\n"; $sep)
    else .
    end
  )
`;

const HELP = `replace-roam-linebreaks — replace line breaks inside Roam block text

Usage:
  replace-roam-linebreaks <roam-export.json> [output.json]

Finds every "string" key anywhere in a Roam Research JSON export and
replaces real line breaks in its value with "${LINE_BREAK_PLACEHOLDER}".
Escaped line breaks (a literal backslash followed by "n", as opposed to
an actual line break) are left untouched.

If [output.json] is omitted, the result is printed to stdout.
`;

export function replaceRoamLinebreaks(inputFile: string, outputFile?: string): string {
  const result = execFileSync(
    "jq",
    ["--arg", "sep", LINE_BREAK_PLACEHOLDER, JQ_FILTER, inputFile],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 },
  );

  if (outputFile) {
    writeFileSync(outputFile, result, "utf8");
    console.log(`Wrote ${outputFile}`);
  } else {
    process.stdout.write(result);
  }

  return result;
}

function main() {
  const [inputFile, outputFile] = cliArgs();
  if (!inputFile) {
    console.log(HELP);
    process.exit(1);
  }

  replaceRoamLinebreaks(inputFile, outputFile);
}

if (import.meta.main) main();
