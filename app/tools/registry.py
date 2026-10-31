"""Typed tool definitions bound to a verified request context.

Each Tool has a JSON-schema (used for LLM function calling AND for the MCP server),
a required capability, and is re-checked at call time (defence in depth), audited,
and wrapped so a failure never leaks a stack trace to the model or the user.
"""
from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from typing import Callable
from ..context import RequestContext
from ..db import connect

log = logging.getLogger("saiam.tools")


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict
    fn: Callable[..., str]
    capability: str


@dataclass
class ToolBox:
    ctx: RequestContext
    tools: dict[str, Tool] = field(default_factory=dict)
    listener: Callable[[dict], None] | None = None     # UI/trace hook

    def add(self, tool: Tool) -> None:
        self.tools[tool.name] = tool

    def for_capability(self, capability: str) -> list[Tool]:
        return [t for t in self.tools.values() if t.capability == capability and self.ctx.can(capability)]

    def names(self, *names: str) -> list[Tool]:
        return [self.tools[n] for n in names if n in self.tools and self.ctx.can(self.tools[n].capability)]

    def call(self, name: str, /, **args) -> str:
        tool = self.tools.get(name)
        if tool is None:
            return f"Error: unknown tool '{name}'."
        if self.listener:
            self.listener({"type": "tool", "name": name, "args": args, "status": "start"})
        if not self.ctx.can(tool.capability):
            out = "Not permitted: your role does not have access to this information."
        else:
            try:
                out = str(tool.fn(**args))
            except TypeError as e:
                out = f"Error: invalid arguments ({e})."
            except Exception:                                  # never leak internals
                log.exception("tool %s failed", name)
                out = "Error: the tool failed. Please try again or ask for a human account manager."
        audit(self.ctx, f"tool:{name}", json.dumps(args, default=str)[:500])
        if self.listener:
            self.listener({"type": "tool", "name": name, "args": args, "status": "done", "preview": out[:160]})
        return out


def audit(ctx: RequestContext, action: str, detail: str = "") -> None:
    try:
        with connect() as c:
            c.execute("INSERT INTO audit_logs(organization_id,user_id,role,action,detail) VALUES (?,?,?,?,?)",
                      (ctx.org_id, ctx.user_id, ctx.role, action, detail))
    except Exception:
        log.exception("audit write failed")
