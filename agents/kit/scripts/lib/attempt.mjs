import fs from 'node:fs';
import path from 'node:path';
import { runAgent } from './adapters.mjs';
import { loadJson, saveJson } from './engine.mjs';

const request = loadJson(process.argv[2]);
saveJson(path.join(request.folder, 'supervisor.json'), { pid: process.pid, startedAt: Date.now() });
try {
  let pending = ''; let tokens = null;
  const result = await runAgent({ ...request.worker, env: { ...request.worker.env, AGENT_KIT_TASK: request.taskFile, AGENT_KIT_REPORT: request.report } }, request.prompt, {
    cwd: request.cwd,
    timeoutMs: request.timeoutMs,
    onData: text => {
      fs.appendFileSync(path.join(request.folder, 'agent.log'), text);
      pending += text;
      const lines = pending.split(/\r?\n/); pending = lines.pop().slice(-262144);
      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          if (request.worker.tool === 'codex' && event.type === 'turn.completed' && event.usage) tokens = { source: 'codex turn.completed', input: event.usage.input_tokens, output: event.usage.output_tokens, cached: event.usage.cached_input_tokens };
        } catch { /* Non-JSON stderr is retained in the attempt log. */ }
      }
      saveJson(path.join(request.folder, 'activity.json'), { at: Date.now(), tokens });
    },
    onStart: pid => saveJson(path.join(request.folder, 'process.json'), { pid, startedAt: Date.now() }),
  });
  saveJson(path.join(request.folder, 'exit.json'), { ...result, tokens });
} catch (error) {
  saveJson(path.join(request.folder, 'exit.json'), { failure: 'CRASH', code: 1, output: error.message });
}
