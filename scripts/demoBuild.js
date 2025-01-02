const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const { execSync } = require("child_process");
const packageJson = require("../package.json");
const readline = require("readline");

const APP_NAME = packageJson.name;
const VERSION = packageJson.version;
const BUILD_DIR = path.join(__dirname, "../production");
const TARGET_DIR = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}_demo`);
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

  const zipPath = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}_demo.zip`);

  // Check if zip file already exists
  if (fs.existsSync(zipPath)) {
    const answer = await askQuestion(
      `Demo version ${VERSION} already exists (${APP_NAME}_${VERSION}_demo.zip). Would you like to overwrite? (Y/N): `
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
      .directory(path.join(sourceDir, "win-unpacked"), false)
      .on("error", (err) => reject(err))
      .pipe(stream);

    stream.on("close", () => resolve());
    archive.finalize();
  });
}

async function main() {
  try {
    await checkAndCreateDirectory();

    // Create build
    console.log("Building demo application...");
    execSync("npm run build:demo", { stdio: "inherit" });

    // Run electron-builder
    console.log("Running electron-builder...");
    execSync("npm run pack", { stdio: "inherit" });

    // Create version directory
    fs.mkdirSync(TARGET_DIR);

    // Move electron-builder output to version directory
    console.log("Moving electron build to production folder...");
    fs.renameSync(DIST_DIR, path.join(TARGET_DIR, "win-unpacked"));

    // Create zip file
    console.log("Creating zip archive...");
    const zipPath = path.join(BUILD_DIR, `${APP_NAME}_${VERSION}_demo.zip`);

    await createZip(TARGET_DIR, zipPath);

    console.log(
      `\nDemo build complete! Output: production/${APP_NAME}_${VERSION}_demo`
    );
    console.log(`Zip file created: production/${APP_NAME}_${VERSION}_demo.zip`);

    // Clean up folders
    console.log("Cleaning up build folders...");
    if (fs.existsSync(path.join(__dirname, "../dist"))) {
      fs.rmSync(path.join(__dirname, "../dist"), { recursive: true });
    }
    if (fs.existsSync(TARGET_DIR)) {
      fs.rmSync(TARGET_DIR, { recursive: true });
    }

    rl.close();
  } catch (error) {
    console.error("Demo build failed:", error);
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

// Run the main function
main().catch((error) => {
  console.error("Unexpected error:", error);
  rl.close();
  process.exit(1);
});
