const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { execSync } = require("child_process");
const packageJson = require("../package.json");
const readline = require("readline");

const APP_NAME = packageJson.name;
const VERSION = packageJson.version;
const BUILD_DIR = path.join(__dirname, "../production");
const TARGET_DIR = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}`);
const DIST_DIR = path.join(__dirname, "../dist/win-unpacked");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Promisify the question function
const askQuestion = (query) =>
  new Promise((resolve) => rl.question(query, resolve));

async function checkAndCreateDirectory() {
  // Ensure production directory exists
  if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR);
  }

  const zipPath = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}_steam.zip`);

  // Check if zip file already exists
  if (fs.existsSync(zipPath)) {
    const answer = await askQuestion(
      `Version ${VERSION} already exists (${APP_NAME}_${VERSION}.zip). Would you like to overwrite? (Y/N): `
    );

    if (answer.toLowerCase() !== "y") {
      console.log("Build cancelled.");
      rl.close();
      process.exit(0);
    }

    // Remove existing zip file if user confirms
    fs.unlinkSync(zipPath);
  }

  // Also check and clean up target directory if it exists
  if (fs.existsSync(TARGET_DIR)) {
    fs.rmSync(TARGET_DIR, { recursive: true });
  }
}

async function createZip(sourceDir, outPath) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(outPath);

  return new Promise((resolve, reject) => {
    archive
      .directory(sourceDir, false)
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

function cleanupOldVersions(currentVersion) {
  const files = fs.readdirSync(BUILD_DIR);
  const versionPattern = new RegExp(`^${APP_NAME}_\\d+\\.\\d+\\.\\d+`);

  // Find and remove old version folders, keeping only the current version
  files.forEach((file) => {
    const fullPath = path.join(BUILD_DIR, file);
    // Skip if it's the current version's folder or zip file
    if (
      file === `${APP_NAME}_${currentVersion}_steam` ||
      file === `${APP_NAME}_${currentVersion}_steam.zip`
    ) {
      return;
    }

    // Only remove files/folders that match the version pattern (e.g., name_1.2.3)
    if (versionPattern.test(file)) {
      if (fs.statSync(fullPath).isDirectory() || file.endsWith(".zip")) {
        console.log(`Removing old version: ${file}`);
        if (fs.statSync(fullPath).isDirectory()) {
          fs.rmSync(fullPath, { recursive: true });
        } else {
          fs.unlinkSync(fullPath);
        }
      }
    }
  });
}

async function main() {
  try {
    await checkAndCreateDirectory();

    // Create build
    console.log("Building application...");
    execSync("npm run build", { stdio: "inherit" });

    // Run electron-builder
    console.log("Running electron-builder...");
    execSync("npm run pack", { stdio: "inherit" });

    // Create version directory
    fs.mkdirSync(TARGET_DIR);

    // Move electron-builder output to version directory
    console.log("Moving electron build to production folder...");
    const winUnpackedContents = fs.readdirSync(DIST_DIR);
    winUnpackedContents.forEach((item) => {
      const sourcePath = path.join(DIST_DIR, item);
      const targetPath = path.join(TARGET_DIR, item);
      fs.renameSync(sourcePath, targetPath);
    });

    // Create zip file
    console.log("Creating zip archive...");
    const zipPath = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}.zip`);

    // Wait for zip creation to complete
    await createZip(TARGET_DIR, zipPath);

    console.log(
      `\nBuild complete! Output: production/${APP_NAME}_${VERSION}_steam`
    );
    console.log(
      `Zip file created: production/${APP_NAME}_${VERSION}_steam.zip`
    );

    // Clean up folders
    console.log("Cleaning up build folders...");
    if (fs.existsSync(path.join(__dirname, "../dist"))) {
      fs.rmSync(path.join(__dirname, "../dist"), { recursive: true });
    }

    // Clean up old versions but keep the current one
    // cleanupOldVersions(VERSION);

    rl.close();
  } catch (error) {
    console.error("Build failed:", error);
    // Cleanup on failure
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true });
    }
    if (fs.existsSync(path.join(__dirname, "../dist"))) {
      fs.rmSync(path.join(__dirname, "../dist"), { recursive: true });
    }
    rl.close();
    process.exit(1);
  }
}

// Run the main function and properly handle the promise
main().catch((error) => {
  console.error("Unexpected error:", error);
  rl.close();
  process.exit(1);
});
