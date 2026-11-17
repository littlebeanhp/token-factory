// Decides what the agent process inherits from the VS Code extension host.
// Kept free of `vscode` imports so it can be unit-tested.

/**
 * Env vars the agent may inherit. Everything else is dropped: the opencode binary (and any
 * tool it spawns) must not receive the secrets exported in the shell that started VS Code.
 */
export const ENV_KEEP =
  /^(PATH|HOME|SHELL|USER|LOGNAME|LANG|TERM|TZ|TMPDIR|TMP|TEMP|PWD|LC_[A-Z_]*|XDG_[A-Z_]*|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|PATHEXT|HOMEDRIVE|HOMEPATH|USERNAME|USERDOMAIN|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|PROCESSOR_IDENTIFIER|OS|BUN_[A-Z_]*|OPENCODE_[A-Z_]*)$/;

/** Secret-bearing names cleared from the agent terminal (it inherits everything else). */
export const SECRET_ENV =
  /(^|_)(TOKEN|SECRET|SECRETS|PASSWORD|PASSWD|API_KEY|APIKEY|ACCESS_KEY|PRIVATE_KEY|CREDENTIALS?)(_|$)|^(AWS_|AZURE_|GOOGLE_|GCP_|GITLAB_|DOCKER_|HF_|HUGGINGFACE_|SLACK_|STRIPE_|SENDGRID_|TWILIO_)|^DATABASE_URL$/i;

/** The inherited part of the agent environment: allow-listed names only. */
export function inheritedEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && ENV_KEEP.test(name)) env[name] = value;
  }
  return env;
}

/** `undefined` values are what `createTerminal` needs to drop an inherited variable. */
export function clearedSecretEnv(source: NodeJS.ProcessEnv = process.env): Record<string, undefined> {
  const env: Record<string, undefined> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && SECRET_ENV.test(name)) env[name] = undefined;
  }
  return env;
}
