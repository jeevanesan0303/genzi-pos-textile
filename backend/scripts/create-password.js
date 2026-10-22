import fs from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const envPath = fileURLToPath(
  new URL("../.env", import.meta.url)
);

let hidden = false;

const output = new Writable({
  write(chunk, encoding, callback) {
    if (!hidden) process.stdout.write(chunk, encoding);
    callback();
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output,
  terminal: true
});

function ask(label, secret = false) {
  process.stdout.write(label);
  hidden = secret;

  return new Promise(resolve => {
    rl.question("", answer => {
      hidden = false;
      if (secret) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

try {
  let contents = fs.readFileSync(envPath, "utf8");

  const email = (
    await ask("POS administrator email: ")
  ).trim().toLowerCase();

  const password = await ask("New POS password: ", true);
  const confirmation = await ask("Type it again: ", true);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email. Nothing was changed.");
  }

  if (password.length < 12 || Buffer.byteLength(password) > 72) {
    throw new Error(
      "Use at least 12 characters and at most 72 bytes. Nothing was changed."
    );
  }

  if (password !== confirmation) {
    throw new Error("Passwords do not match. Nothing was changed.");
  }

  const hash = await bcrypt.hash(password, 12);

  function setValue(key, value) {
    const pattern = new RegExp(
      "^\\s*" + key + "\\s*=.*$",
      "gm"
    );

    contents = contents.replace(pattern, "");
    contents = contents.trimEnd() + `\n${key}="${value}"\n`;
  }

  setValue("HOST", "127.0.0.1");
  setValue("PORT", "3001");
  setValue("ADMIN_EMAIL", email);
  setValue("ADMIN_PASSWORD_HASH", hash);

  const parsed = dotenv.parse(contents);

  if (
    parsed.ADMIN_EMAIL !== email ||
    !(await bcrypt.compare(password, parsed.ADMIN_PASSWORD_HASH))
  ) {
    throw new Error("Verification failed. Nothing was changed.");
  }

  fs.writeFileSync(envPath, contents, { mode: 0o600 });
  fs.chmodSync(envPath, 0o600);

  console.log("\nSaved and verified successfully.");
  console.log("Backend port: 3001");
  console.log("Now run: npm start");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}