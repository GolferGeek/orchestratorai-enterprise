import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ExportMenu from './ExportMenu.vue';

const downloadExport = vi.fn();
vi.mock('./workflowRunsClient', () => ({
  workflowRunsClient: { downloadExport: (...a: unknown[]) => downloadExport(...a) },
}));

const props = { slug: 'decision-risk', runId: 'c1', orgSlug: 'corporate' };

describe('ExportMenu', () => {
  afterEach(() => vi.restoreAllMocks());

  it('downloads the report under the name the server gave it', async () => {
    downloadExport.mockResolvedValue({ blob: new Blob(['# Report']), fileName: 'decision-risk-berlin.pdf' });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const wrapper = mount(ExportMenu, { props });
    await wrapper.findAll('ion-button')[0]!.trigger('click');
    await flushPromises();
    expect(downloadExport).toHaveBeenCalledWith('decision-risk', 'c1', 'corporate', 'pdf');
    expect(click).toHaveBeenCalledTimes(1);
    expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe('decision-risk-berlin.pdf');
    expect(wrapper.find('.problem').exists()).toBe(false);
  });

  it("shows the server's refusal", async () => {
    downloadExport.mockRejectedValue(new Error('Run c1 is running; only a completed run can be exported'));
    const wrapper = mount(ExportMenu, { props });
    await wrapper.findAll('ion-button')[1]!.trigger('click');
    await flushPromises();
    expect(downloadExport).toHaveBeenCalledWith('decision-risk', 'c1', 'corporate', 'docx');
    expect(wrapper.find('.problem').text()).toContain('only a completed run');
  });
});
