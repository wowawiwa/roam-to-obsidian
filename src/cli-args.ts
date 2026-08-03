// `pnpm run <script> -- <args>` forwards the "--" itself into argv on pnpm
// (unlike npm, which strips it), so positional args must filter it out.
export function cliArgs(): string[] {
  return process.argv.slice(2).filter((arg) => arg !== "--");
}
