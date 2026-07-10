import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { registerEntitySecretCiphertext } from "@circle-fin/developer-controlled-wallets";

const envPath = ".env";
const recoveryFilePath = "./recovery";

function parseEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .reduce((values, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        return values;
      }

      const separatorIndex = trimmed.indexOf("=");

      if (separatorIndex === -1) {
        return values;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      let value = trimmed.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      values[key] = value;
      return values;
    }, {});
}

const envValues = parseEnvFile(envPath);
const apiKey = process.env.CIRCLE_API_KEY || envValues.CIRCLE_API_KEY;

if (!apiKey) {
  throw new Error("CIRCLE_API_KEY is required in .env.");
}

if (process.env.CIRCLE_ENTITY_SECRET || envValues.CIRCLE_ENTITY_SECRET) {
  throw new Error(
    "CIRCLE_ENTITY_SECRET already exists. Refusing to overwrite it."
  );
}

const entitySecret = randomBytes(32).toString("hex");

mkdirSync(recoveryFilePath, { recursive: true });

await registerEntitySecretCiphertext({
  apiKey,
  entitySecret,
  recoveryFileDownloadPath: recoveryFilePath,
});

appendFileSync(envPath, `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);

console.log("Entity secret registered.");
console.log(`Recovery file saved to a new file in: ${recoveryFilePath}`);
console.log("CIRCLE_ENTITY_SECRET added to .env");
