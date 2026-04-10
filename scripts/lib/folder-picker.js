import { execFile } from 'child_process';

/**
 * Open a native OS folder picker dialog.
 *
 * @returns {Promise<string|null>} Absolute path to the selected folder, or null if cancelled.
 * @throws {Error} On non-macOS platforms (not yet supported).
 */
export async function pickFolder() {
  if (process.platform !== 'darwin') {
    throw new Error(
      `Native folder picker is not supported on platform: ${process.platform}. Only macOS (darwin) is currently supported.`
    );
  }

  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "Choose a project folder")'],
      { timeout: 120_000 },
      (err, stdout) => {
        if (err) {
          resolve(null); // User cancelled or error
          return;
        }
        const result = stdout.toString().trim().replace(/\/$/, '');
        resolve(result || null);
      }
    );
  });
}
