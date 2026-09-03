function hostError(code, message, action) {
  const error = new Error(message);
  error.code = code;
  error.paths = [];
  error.action = action;
  return error;
}

/**
 * Validate the build-independent contributor host contract before generation
 * or recovery performs any filesystem operation. WSL2 identifies as `linux`.
 */
export function validateMintHostContract({
  nodeVersion = process.versions.node,
  platform = process.platform,
} = {}) {
  const major = Number.parseInt(nodeVersion.split(".")[0] ?? "", 10);
  if (!Number.isInteger(major) || major < 24) {
    throw hostError(
      "MINT_HOST_NODE_UNSUPPORTED",
      `Node 24 or newer is required (running ${nodeVersion})`,
      "install Node 24 or newer before running Mint",
    );
  }
  if (platform !== "darwin" && platform !== "linux") {
    throw hostError(
      "MINT_HOST_PLATFORM_UNSUPPORTED",
      `Mint artifact generation and recovery require macOS, Linux, or WSL2 (running ${platform})`,
      platform === "win32"
        ? "run Mint inside WSL2; native Windows generation and recovery are not supported"
        : "run Mint on macOS or Linux",
    );
  }
}
