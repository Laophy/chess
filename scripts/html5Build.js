const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const packageJson = require("../package.json");

// Create the production/game_version_html5 directory
const version = packageJson.version;
const outputDir = path.join(
  __dirname,
  "..",
  "production",
  `game_${version}_html5`
);

// Ensure the production directory exists
if (!fs.existsSync(path.join(__dirname, "..", "production"))) {
  fs.mkdirSync(path.join(__dirname, "..", "production"));
}

// Remove existing directory if it exists
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}

// Create the new directory
fs.mkdirSync(outputDir, { recursive: true });

// Copy build folder contents to the new directory
fs.cpSync(path.join(__dirname, "..", "build"), outputDir, { recursive: true });

console.log(`HTML5 build created successfully in: ${outputDir}`);

// Create a zip file of the build
const zipPath = `${outputDir}.zip`;
const output = fs.createWriteStream(zipPath);
const archive = archiver("zip", { zlib: { level: 9 } });

output.on("close", () => {
  console.log(`ZIP archive created successfully: ${zipPath}`);
  console.log(`Total size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
});

archive.on("error", (err) => {
  throw err;
});

archive.pipe(output);
archive.directory(outputDir, false);
archive.finalize();
