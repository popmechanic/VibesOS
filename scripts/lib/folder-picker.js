import { execSync } from 'child_process';

/**
 * Open a native OS folder picker dialog.
 *
 * @returns {string|null} Absolute path to the selected folder, or null if cancelled.
 * @throws {Error} On non-macOS platforms (not yet supported).
 */
export function pickFolder() {
  if (process.platform !== 'darwin') {
    throw new Error(
      `Native folder picker is not supported on platform: ${process.platform}. Only macOS (darwin) is currently supported.`
    );
  }

  try {
    const result = execSync(
      `osascript -e 'POSIX path of (choose folder with prompt "Choose a project folder")'`,
      { timeout: 120_000 }
    );
    return result.toString().trim().replace(/\/$/, '');
  } catch {
    // osascript exits with non-zero when user cancels
    return null;
  }
}
