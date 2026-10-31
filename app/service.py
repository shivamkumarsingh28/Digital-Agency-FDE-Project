"""ChatService: runs one conversational turn and yields UI events (route, tool, sources, token, done)."""
from __future__ import annotations
import logging
import queue
import threading
from typing import Iterator
from . import memory
from .agents.graph import Deps, build_graph
from .context import RequestContext
from .llm import get_llm
from .mcp_layer.client import MCPManager
from .config import get_settings
from .tools.builtin import build_builtin_tools

log = logging.getLogger("saiam.service")


class ChatService:
    def __init__(self):
        self.llm = get_llm()
        self.mcp = MCPManager(get_settings().mcp_config)

    def start(self):
        self.mcp.start()

    def stop(self):
        try:
            self.mcp.stop()
        except Exception:
            pass

    def stream(self, ctx: RequestContext, message: str, thread_id: str | None) -> Iterator[dict]:
        thread_id = memory.ensure_thread(ctx, thread_id, message)       # raises PermissionError if not owner
        history = memory.load_history(thread_id)
        memory.append(thread_id, "user", message)
        yield {"type": "thread", "thread_id": thread_id, "llm": self.llm.name}

        q: queue.Queue = queue.Queue()
        box = build_builtin_tools(ctx)
        for t in self.mcp.tools:
            box.add(t)
        box.listener = q.put
        graph = build_graph(Deps(ctx=ctx, llm=self.llm, box=box, emit=q.put))
        result: dict = {}

        def worker():
            try:
                result.update(graph.invoke({"message": message, "history": history}))
            except Exception:
                log.exception("graph failed")
                q.put({"type": "error", "message": "Something went wrong. Please try again."})
            finally:
                q.put(None)

        threading.Thread(target=worker, daemon=True).start()
        while (ev := q.get()) is not None:
            yield ev
        answer = result.get("answer", "")
        if answer:
            memory.append(thread_id, "assistant", answer, {"route": result.get("route")})
        yield {"type": "done", "route": result.get("route")}
