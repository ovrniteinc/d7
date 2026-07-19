import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("utils/favicon.jpeg", "public/favicon.jpeg");
