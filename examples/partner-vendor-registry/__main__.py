"""A partner's vendor registry, served as an A2A v1.0 agent with the official
a2a-sdk (structure from a2aproject/a2a-samples, helloworld). PUBLIC_URL is the
https address partners reach it at; it listens on HOST:PORT behind that."""

import os

import uvicorn
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill
from starlette.applications import Starlette

from agent_executor import VendorRegistryExecutor

PUBLIC_URL = os.environ['PUBLIC_URL'].rstrip('/')

card = AgentCard(
    name='Partner Vendor Registry',
    description=(
        "A partner's registry of approved vendors. Send a vendor name (as text or as "
        '{"vendor": "..."}) and get its standing: approved, on hold or unknown, and any recent '
        'change to its bank details.'
    ),
    version='1.0.0',
    default_input_modes=['text/plain', 'application/json'],
    default_output_modes=['application/json'],
    capabilities=AgentCapabilities(streaming=False),
    supported_interfaces=[AgentInterface(protocol_binding='JSONRPC', url=f'{PUBLIC_URL}/', protocol_version='1.0')],
    skills=[
        AgentSkill(
            id='vendor_status',
            name='Vendor status',
            description='Whether a vendor is approved, on hold or unknown, and whether its bank details changed recently.',
            input_modes=['text/plain', 'application/json'],
            output_modes=['application/json'],
            tags=['vendors', 'accounts-payable'],
            examples=['ACME Industrial Supply', '{"vendor": "Cascade Cloud Services, Inc."}'],
        )
    ],
)

handler = DefaultRequestHandler(agent_executor=VendorRegistryExecutor(), task_store=InMemoryTaskStore(), agent_card=card)
app = Starlette(routes=[*create_agent_card_routes(card), *create_jsonrpc_routes(handler, '/')])

if __name__ == '__main__':
    uvicorn.run(app, host=os.environ.get('HOST', '0.0.0.0'), port=int(os.environ.get('PORT', '9999')))
