process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection during startup/runtime:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception during startup/runtime:", error);
  process.exit(1);
});

try {
  require("./server");
} catch (error) {
  console.error("Application failed to start:", error);
  process.exit(1);
}
