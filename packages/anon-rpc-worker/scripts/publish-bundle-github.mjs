#!/usr/bin/env node
/**
 * Publish the worker bundle to an orphan `keccak` branch (content-addressed path).
 * Requires GITHUB_TOKEN with repo scope (or SSH remotes configured).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pkg = path.join(root, "packages/anon-rpc-worker");
const bundlePath = path.join(pkg, "dist/relay-mesh-worker.js");
if (!existsSync(bundlePath)) {
  console.error("Missing bundle — run: pnpm --filter @relay-mesh/anon-rpc-worker build");
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(bundlePath));
const hash = Buffer.from(keccak_256(bytes)).toString("hex");
const contentPath = `${hash.slice(0, 2)}/${hash.slice(2)}`;
const repo = process.env.GITHUB_REPO ?? "KartikDehru/Relay-mesh";
const branch = process.env.RESOLVER_BRANCH ?? "keccak";
const token = process.env.GITHUB_TOKEN;

const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${contentPath}`;
console.log(`hash: 0x${hash}`);
console.log(`path: ${contentPath}`);
console.log(`raw:  ${rawUrl}`);

const tmp = `/tmp/relay-mesh-keccak-${hash.slice(0, 12)}`;
rmSync(tmp, { recursive: true, force: true });
mkdirSync(path.join(tmp, hash.slice(0, 2)), { recursive: true });
cpSync(bundlePath, path.join(tmp, contentPath));

function git(args) {
  const r = spawnSync("git", args, { cwd: tmp, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(r.stdout, r.stderr);
    throw new Error(`git ${args.join(" ")} failed`);
  }
  return r;
}

git(["init"]);
git(["checkout", "-b", branch]);
git(["add", contentPath]);
git([
  "-c",
  "user.name=Relay Mesh",
  "-c",
  "user.email=relay-mesh@users.noreply.github.com",
  "commit",
  "-m",
  `publish worker 0x${hash}`,
]);

const pushUrl = token
  ? `https://x-access-token:${token}@github.com/${repo}.git`
  : `https://github.com/${repo}.git`;

const push = spawnSync("git", ["push", "-f", pushUrl, `${branch}:${branch}`], {
  cwd: tmp,
  encoding: "utf8",
});
if (push.status !== 0) {
  console.error(push.stdout, push.stderr);
  console.error("Push failed. Export GITHUB_TOKEN with repo scope.");
  process.exit(1);
}

const out = {
  keccak256: `0x${hash}`,
  resolvers: [rawUrl],
  branch,
  contentPath,
  publishedAt: new Date().toISOString(),
};
mkdirSync(path.join(pkg, "dist"), { recursive: true });
writeFileSync(
  path.join(pkg, "dist/publish-meta.json"),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`Published to ${branch}:${contentPath}`);
console.log(`Resolver URL: ${rawUrl}`);
