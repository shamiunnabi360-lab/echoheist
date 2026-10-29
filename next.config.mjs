import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pin the tracing root to this project; otherwise Next may infer a parent
// folder as the workspace when lockfiles exist higher up the tree.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
