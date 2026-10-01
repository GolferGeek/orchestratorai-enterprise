"""The vendor registry as an A2A agent: one request, one vendor, one answer."""

from a2a.helpers import (
    get_data_parts,
    get_message_text,
    new_data_part,
    new_task_from_user_message,
    new_text_message,
)
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.tasks import TaskUpdater
from a2a.types import TaskState

from registry import look_up


def vendor_name(context: RequestContext) -> str | None:
    """The vendor asked about: {"vendor": ...} in a data part, or the message text."""
    for data in get_data_parts(context.message.parts):
        if isinstance(data, dict) and isinstance(data.get('vendor'), str) and data['vendor'].strip():
            return data['vendor'].strip()
    text = (get_message_text(context.message) or '').strip()
    return text or None


class VendorRegistryExecutor(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue) -> None:
        task = context.current_task or new_task_from_user_message(context.message)
        if not context.current_task:
            await event_queue.enqueue_event(task)
        updater = TaskUpdater(event_queue=event_queue, task_id=task.id, context_id=task.context_id)

        name = vendor_name(context)
        if name is None:
            await updater.update_status(
                state=TaskState.TASK_STATE_REJECTED,
                message=new_text_message('Send the vendor name, as text or as {"vendor": "..."}.'),
            )
            return

        answer = look_up(name)
        await updater.add_artifact(parts=[new_data_part(answer)], name='vendor-status')
        await updater.update_status(
            state=TaskState.TASK_STATE_COMPLETED,
            message=new_text_message(f"{answer['vendor']}: {answer['status']}. {answer['note']}"),
        )

    async def cancel(self, context: RequestContext, event_queue: EventQueue) -> None:
        raise NotImplementedError('A vendor lookup is answered at once; there is nothing to cancel.')
