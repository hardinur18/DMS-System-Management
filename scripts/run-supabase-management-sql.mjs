import { readFile } from "node:fs/promises";
import process from "node:process";

const apiBaseUrl = "https://api.supabase.com/v1";

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let singleQuote = false;
  let doubleQuote = false;
  let lineComment = false;
  let blockComment = false;
  let dollarQuoteTag = "";

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1] || "";
    current += character;

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (character === "*" && nextCharacter === "/") {
        current += nextCharacter;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (singleQuote) {
      if (character === "'" && nextCharacter === "'") {
        current += nextCharacter;
        index += 1;
      } else if (character === "'") {
        singleQuote = false;
      }
      continue;
    }

    if (doubleQuote) {
      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter;
        index += 1;
      } else if (character === '"') {
        doubleQuote = false;
      }
      continue;
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        const tagRemainder = dollarQuoteTag.slice(1);
        current += tagRemainder;
        index += tagRemainder.length;
        dollarQuoteTag = "";
      }
      continue;
    }

    if (character === "-" && nextCharacter === "--".slice(1)) {
      current += nextCharacter;
      index += 1;
      lineComment = true;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      current += nextCharacter;
      index += 1;
      blockComment = true;
      continue;
    }

    if (character === "'") {
      singleQuote = true;
      continue;
    }

    if (character === '"') {
      doubleQuote = true;
      continue;
    }

    if (character === "$") {
      const match = sql.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        const tagRemainder = match[0].slice(1);
        current += tagRemainder;
        index += tagRemainder.length;
        dollarQuoteTag = match[0];
        continue;
      }
    }

    if (character === ";") {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function runStatement({ ref, token, statement, index, total, readOnly }) {
  const response = await fetch(`${apiBaseUrl}/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: statement,
      read_only: readOnly,
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Statement ${index}/${total} failed (${response.status}): ${bodyText || statement.slice(0, 220)}`);
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

function parseArgs(argv) {
  const args = {
    ref: process.env.SUPABASE_PROJECT_REF || "",
    file: "",
    readOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ref") {
      args.ref = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--read-only") {
      args.readOnly = true;
    } else if (!args.file) {
      args.file = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.ref) throw new Error("Set SUPABASE_PROJECT_REF or pass --ref <project-ref>.");
  if (!args.file) throw new Error("Pass a SQL file path.");
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error("Set SUPABASE_ACCESS_TOKEN.");

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sql = await readFile(args.file, "utf8");
  const statements = splitSqlStatements(sql);

  console.log(`Running ${statements.length} SQL statement(s) on ${args.ref}${args.readOnly ? " in read-only mode" : ""}.`);

  for (const [statementIndex, statement] of statements.entries()) {
    await runStatement({
      ref: args.ref,
      token: process.env.SUPABASE_ACCESS_TOKEN,
      statement,
      index: statementIndex + 1,
      total: statements.length,
      readOnly: args.readOnly,
    });
    console.log(`ok ${statementIndex + 1}/${statements.length}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
