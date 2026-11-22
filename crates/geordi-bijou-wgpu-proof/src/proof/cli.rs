//! Command line: JSON Lines on stdout and stderr by default, prose with `--human`.

use std::io::Write;
use std::path::Path;

/// Runs the command line and returns the process exit code.
///
/// `args` excludes the program name. `default_root` is the repository root used when
/// `--repo-root` is absent. Every line written to `stdout` or `stderr` is one JSON object, unless
/// `--human` is present.
pub fn run(
    args: &[String],
    default_root: &Path,
    stdout: &mut dyn Write,
    stderr: &mut dyn Write,
) -> u8 {
    let _unused = (args, default_root, stdout, stderr);
    1
}
