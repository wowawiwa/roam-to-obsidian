#!/usr/bin/env node

import { cliArgs } from "../cli-args.ts";
import { replaceRoamLinebreaks } from "./replace-roam-linebreaks.ts";

const DEFAULT_INPUT_FILE = "migrations/export.json";
const DEFAULT_OUTPUT_FILE = "migrations/export-processed.json";

function main() {
  const [inputFile = DEFAULT_INPUT_FILE, outputFile = DEFAULT_OUTPUT_FILE] = cliArgs();

  console.log(`Input file: ${inputFile}`);

  replaceRoamLinebreaks(inputFile, outputFile);
}

main();
