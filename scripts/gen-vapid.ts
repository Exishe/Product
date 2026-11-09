// Generates the VAPID key pair for web push (ADR-035) at deploy time and puts
// it straight where it is used. The private key is never printed.
//
//   node scripts/gen-vapid.ts --vercel preview      # vercel env add, via stdin
//   node scripts/gen-vapid.ts --to-file .env.local # appends, file mode 600
//
// Only the public key is shown (it is public: browsers get it anyway).
import { spawnSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, readFileSync } from "node:fs";

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const raw = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(pub.x as string, "base64url"),
    Buffer.from(pub.y as string, "base64url"),
  ]);
  return {
    publicKey: raw.toString("base64url"),
    privateKey: privateKey.export({ format: "jwk" }).d as string,
  };
}

function addToVercel(name: string, value: string, target: string): void {
  const result = spawnSync("npx", ["vercel", "env", "add", name, target], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) throw new Error(`vercel env add ${name} ${target} failed`);
}

function main(argv: string[]): void {
  const [mode, target] = argv;
  if (!target || (mode !== "--vercel" && mode !== "--to-file")) {
    console.error(
      "usage: node scripts/gen-vapid.ts --vercel <preview|development|production> | --to-file <path>",
    );
    process.exit(2);
  }
  const keys = generateVapidKeys();
  if (mode === "--vercel") {
    addToVercel("VAPID_PRIVATE_KEY", keys.privateKey, target);
    addToVercel("VAPID_PUBLIC_KEY", keys.publicKey, target);
  } else {
    if (existsSync(target) && /^VAPID_PRIVATE_KEY=./m.test(readFileSync(target, "utf8"))) {
      console.error(`${target} already has VAPID keys; remove them first to rotate.`);
      process.exit(1);
    }
    appendFileSync(target, `\nVAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\n`, {
      mode: 0o600,
    });
    chmodSync(target, 0o600);
  }
  console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
