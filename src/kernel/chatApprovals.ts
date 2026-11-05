export type ChatApprovalAction =
  | { type: 'create-app'; id: string; appType: string }
  | { type: 'create-db'; id: string }
  | { type: 'write-file'; appId: string; filename: string; content: string }
  | { type: 'launch'; appId: string };

export type ChatApprovalCommand =
  | { type: 'propose'; action: ChatApprovalAction }
  | { type: 'approve'; approvalId: string }
  | { type: 'reject'; approvalId: string }
  | { type: 'list' }
  | { type: 'invalid'; error: string };

const APP_TYPES = new Set([
  'html5-web',
  'cyber-game',
  'python-microservice',
  'node-api',
  'quantum-agent',
  'cli-utility',
]);
const APP_TYPE_ALIASES: Record<string, string> = {
  python: 'python-microservice',
  py: 'python-microservice',
  microservice: 'python-microservice',
  'python-app': 'python-microservice',
  nodejs: 'node-api',
  node: 'node-api',
  js: 'node-api',
  express: 'node-api',
  api: 'node-api',
  web: 'html5-web',
  html: 'html5-web',
  html5: 'html5-web',
  dashboard: 'html5-web',
  ui: 'html5-web',
  frontend: 'html5-web',
  game: 'cyber-game',
  arcade: 'cyber-game',
  agent: 'quantum-agent',
  ai: 'quantum-agent',
  quantum: 'quantum-agent',
  cli: 'cli-utility',
  sh: 'cli-utility',
  bash: 'cli-utility',
  tool: 'cli-utility',
  utility: 'cli-utility',
};
const SAFE_APP_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,31}$/;
const SAFE_DATABASE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
const SAFE_FILENAME = /^(?!app\.json$)[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/i;
const EDITABLE_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.mjs', '.cjs', '.json', '.md', '.txt', '.py',
  '.sh', '.yaml', '.yml', '.toml', '.conf', '.cfg', '.ini', '.sql', '.ts', '.tsx', '.svg',
]);
const ALLOWED_EXTENSIONLESS_FILENAMES = new Set([
  'modelfile', 'dockerfile', 'makefile', 'procfile', 'readme', 'license',
]);
export const MAX_PROPOSED_FILE_SIZE = 20_000;

function isEditableFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  if (ALLOWED_EXTENSIONLESS_FILENAMES.has(lower)) return true;
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx <= 0) return false;
  return EDITABLE_EXTENSIONS.has(lower.slice(dotIdx));
}

function stripTrailingMarkdownCommentary(rawContent: string, filename: string): string {
  const isMarkdownFile = /\.(md|txt)$/i.test(filename) || /^(readme|license)$/i.test(filename);
  if (isMarkdownFile) return rawContent;

  const trimmedStart = rawContent.replace(/^\s*\n/, '');
  const fenceMatch = trimmedStart.match(/^```[a-zA-Z0-9_-]*\r?\n([\s\S]*?)\r?\n```/);
  if (fenceMatch) {
    return fenceMatch[1].trimEnd() + '\n';
  }

  const lines = rawContent.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^###\s+/.test(t) || /^---\s*$/.test(t) || /^\*\*(?:Tato|Mateuszu|Uwaga|Co teraz|Dlaczego)\b/i.test(t) || /^\[AUTO-EXEC/i.test(t)) {
      break;
    }
    kept.push(line);
  }
  return kept.join('\n').replace(/\s+$/, '') + (kept.length > 0 ? '\n' : '');
}

function invalid(error: string): ChatApprovalCommand {
  return { type: 'invalid', error };
}

export function parseChatApprovalCommand(message: string): ChatApprovalCommand | null {
  if (!/^\/(?:propose|approve|reject|proposals)(?:\s|$)/i.test(message)) return null;

  const newline = message.indexOf('\n');
  const firstLine = (newline === -1 ? message : message.slice(0, newline)).replace(/\r$/, '');
  const parts = firstLine.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command === '/proposals') {
    return parts.length === 1 && newline === -1
      ? { type: 'list' }
      : invalid('Użycie: /proposals');
  }

  if (command === '/approve' || command === '/reject') {
    if (newline !== -1 || parts.length !== 2 || !/^[a-f0-9-]{36}$/i.test(parts[1])) {
      return invalid(`Użycie: ${command} <id-propozycji>`);
    }
    return { type: command.slice(1) as 'approve' | 'reject', approvalId: parts[1] };
  }

  if (command !== '/propose') return invalid('Nieznane polecenie zatwierdzania.');
  const action = parts[1]?.toLowerCase();

  if (action === 'create-app') {
    if (newline !== -1 || parts.length < 3 || parts.length > 4 || !SAFE_APP_ID.test(parts[2])) {
      return invalid('Użycie: /propose create-app <id> [typ]');
    }
    const rawType = (parts[3] || 'html5-web').toLowerCase();
    const appType = APP_TYPE_ALIASES[rawType] || rawType;
    if (!APP_TYPES.has(appType)) return invalid('Nieobsługiwany typ aplikacji.');
    return { type: 'propose', action: { type: 'create-app', id: parts[2].toLowerCase(), appType } };
  }

  if (action === 'create-db') {
    if (newline !== -1 || parts.length !== 3 || !SAFE_DATABASE_ID.test(parts[2])) {
      return invalid('Użycie: /propose create-db <id>');
    }
    return { type: 'propose', action: { type: 'create-db', id: parts[2].toLowerCase() } };
  }

  if (action === 'launch') {
    if (newline !== -1 || parts.length !== 3 || !SAFE_APP_ID.test(parts[2])) {
      return invalid('Użycie: /propose launch <id>');
    }
    return { type: 'propose', action: { type: 'launch', appId: parts[2].toLowerCase() } };
  }

  if (action === 'write-file') {
    let appIdCandidate = parts[2] || '';
    let filename = parts[3];
    if (parts.length === 3 && parts[2] && isEditableFilename(parts[2])) {
      filename = parts[2];
      const dotIdx = filename.lastIndexOf('.');
      appIdCandidate = (dotIdx > 0 ? filename.slice(0, dotIdx) : filename)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .slice(0, 32);
    }
    const rawBody = newline === -1 ? '' : message.slice(newline + 1);
    const content = rawBody.length <= MAX_PROPOSED_FILE_SIZE && filename
      ? stripTrailingMarkdownCommentary(rawBody, filename)
      : rawBody;
    if (
      (parts.length !== 4 && parts.length !== 3) ||
      !SAFE_APP_ID.test(appIdCandidate) ||
      !filename ||
      !SAFE_FILENAME.test(filename) ||
      !isEditableFilename(filename) ||
      newline === -1 ||
      content.length === 0 ||
      rawBody.length > MAX_PROPOSED_FILE_SIZE ||
      content.length > MAX_PROPOSED_FILE_SIZE
    ) {
      return invalid(
        `/propose write-file wymaga: /propose write-file <id-aplikacji> <plik>\n<treść pliku> (maks. ${MAX_PROPOSED_FILE_SIZE} znaków; app.json jest chroniony).`,
      );
    }
    return {
      type: 'propose',
      action: { type: 'write-file', appId: appIdCandidate.toLowerCase(), filename, content },
    };
  }

  return invalid(
    'Dozwolone propozycje: create-app <id> [typ], create-db <id>, write-file <id-aplikacji> <plik> + treść w następnej linii, launch <id>.',
  );
}
