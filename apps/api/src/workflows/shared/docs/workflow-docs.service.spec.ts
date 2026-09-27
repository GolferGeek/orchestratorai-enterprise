import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { parseDecisionRiskInput } from '../../decision-risk/decision-risk.handler';
import { DEFAULT_WORKFLOW_DOCS_ROOT, WorkflowDocMissingError, WorkflowDocsService } from './workflow-docs.service';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'wf-docs-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('workflow docs', () => {
  it('reads the brief, lists the docs that exist, and loads the showcase in order', async () => {
    const root = tree({
      'demo/docs/brief.md': '# Demo\n\nWhat it does.\n',
      'demo/docs/user-guide.md': '# Guide',
      'demo/docs/showcase/b-case/case.json': JSON.stringify({ title: 'B', summary: 's', input: { q: 2 } }),
      'demo/docs/showcase/a-case/case.json': JSON.stringify({ title: 'A', summary: 's', input: { q: 1 } }),
    });
    const brief = await new WorkflowDocsService(root).brief('demo');
    expect(brief).toEqual({
      slug: 'demo',
      title: 'Demo',
      markdown: 'What it does.',
      docs: ['user-guide'],
      showcase: [
        { caseSlug: 'a-case', title: 'A', summary: 's', input: { q: 1 } },
        { caseSlug: 'b-case', title: 'B', summary: 's', input: { q: 2 } },
      ],
    });
  });

  it('reports a missing brief or doc as missing, not as a server fault', async () => {
    const service = new WorkflowDocsService(tree({ 'demo/docs/brief.md': '# Demo\n' }));
    await expect(service.brief('other')).rejects.toBeInstanceOf(WorkflowDocMissingError);
    await expect(service.doc('demo', 'smoke-test')).rejects.toBeInstanceOf(WorkflowDocMissingError);
  });

  it('refuses a brief without a title, a malformed case, and an example the workflow would reject', async () => {
    await expect(new WorkflowDocsService(tree({ 'demo/docs/brief.md': 'No title' })).brief('demo')).rejects.toThrow('H1 title');
    const malformed = tree({
      'demo/docs/brief.md': '# Demo\n',
      'demo/docs/showcase/x/case.json': JSON.stringify({ title: 'X', input: {} }),
    });
    await expect(new WorkflowDocsService(malformed).brief('demo')).rejects.toThrow('needs a title, a summary');
    const rejected = tree({
      'demo/docs/brief.md': '# Demo\n',
      'demo/docs/showcase/x/case.json': JSON.stringify({ title: 'X', summary: 's', input: { wrong: 1 } }),
    });
    await expect(new WorkflowDocsService(rejected).brief('demo', parseDecisionRiskInput)).rejects.toThrow('unknown fields');
  });

  it("serves decision risk's own docs, with examples it accepts", async () => {
    const service = new WorkflowDocsService(DEFAULT_WORKFLOW_DOCS_ROOT);
    const brief = await service.brief('decision-risk', parseDecisionRiskInput);
    expect(brief.title).toBe('Decision Risk');
    expect(brief.docs).toEqual(['user-guide', 'smoke-test']);
    expect(brief.showcase.map((c) => c.caseSlug)).toEqual(['analytics-paid-tier', 'berlin-office']);
    expect(await service.doc('decision-risk', 'user-guide')).toContain('Review the mitigations');
  });
});
