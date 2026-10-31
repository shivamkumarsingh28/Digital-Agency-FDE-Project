"""MCP client manager: connects to external MCP servers listed in mcp_servers.json and
exposes their tools to the `integrations_specialist` agent.

mcp_servers.json:
{ "servers": { "fetch": {"command": "uvx", "args": ["mcp-server-fetch"]},
               "crm":   {"url": "https://crm.example.com/mcp"} } }

A background asyncio loop keeps the sessions alive; agent tools (sync) call into it.
All MCP tools require the `integrations` capability (CLIENT_ADMIN and above).
"""
from __future__ import annotations
import asyncio
import json
import logging
import re
import threading
from contextlib import AsyncExitStack
from ..tools.registry import Tool

log = logging.getLogger("saiam.mcp")


class MCPManager:
    def __init__(self, config_path):
        self.config_path = config_path
        self.tools: list[Tool] = []
        self._loop: asyncio.AbstractEventLoop | None = None
        self._stack: AsyncExitStack | None = None

    # ---- lifecycle ----
    def start(self) -> None:
        if not self.config_path.exists():
            return
        try:
            servers = json.loads(self.config_path.read_text()).get("servers", {})
        except Exception:
            log.exception("bad MCP config")
            return
        if not servers:
            return
        self._loop = asyncio.new_event_loop()
        threading.Thread(target=self._loop.run_forever, daemon=True, name="mcp-loop").start()
        fut = asyncio.run_coroutine_threadsafe(self._connect_all(servers), self._loop)
        try:
            fut.result(timeout=60)
        except Exception:
            log.exception("MCP startup failed")

    def stop(self) -> None:
        if self._loop and self._stack:
            asyncio.run_coroutine_threadsafe(self._stack.aclose(), self._loop).result(timeout=10)

    async def _connect_all(self, servers: dict) -> None:
        from mcp import ClientSession, StdioServerParameters
        self._stack = AsyncExitStack()
        for name, cfg in servers.items():
            try:
                if "url" in cfg:
                    from mcp.client.streamable_http import streamablehttp_client
                    read, write, _ = await self._stack.enter_async_context(streamablehttp_client(cfg["url"]))
                else:
                    from mcp.client.stdio import stdio_client
                    params = StdioServerParameters(command=cfg["command"], args=cfg.get("args", []), env=cfg.get("env"))
                    read, write = await self._stack.enter_async_context(stdio_client(params))
                session = await self._stack.enter_async_context(ClientSession(read, write))
                await session.initialize()
                for t in (await session.list_tools()).tools:
                    self.tools.append(self._wrap(name, session, t))
                log.info("MCP server '%s' connected", name)
            except Exception:
                log.exception("MCP server '%s' failed to connect", name)

    def _wrap(self, server: str, session, t) -> Tool:
        def run(**args) -> str:
            fut = asyncio.run_coroutine_threadsafe(session.call_tool(t.name, args), self._loop)
            res = fut.result(timeout=45)
            text = "\n".join(getattr(c, "text", "") for c in res.content)
            return text[:4000] or "(empty result)"
        safe = re.sub(r"[^a-zA-Z0-9_-]", "_", f"mcp__{server}__{t.name}")[:64]
        return Tool(safe, f"[{server}] {t.description or t.name}", t.inputSchema or {"type": "object", "properties": {}},
                    run, "integrations")
