"""LLM provider abstraction: OpenAI-compatible, Anthropic, or offline mock.

`chat()` runs a full tool-calling loop. The mock provider does no generation; agents in
mock mode use deterministic heuristics (see agents/mock_agents.py) so the whole system is
demonstrable and testable without any API key.
"""
from __future__ import annotations
import json
from functools import lru_cache
from typing import Callable
from .config import get_settings
from .tools.registry import Tool


class LLM:
    name = "mock"
    is_mock = True

    def chat(self, system: str, messages: list[dict], tools: list[Tool],
             run_tool: Callable[[str, dict], str], max_steps: int = 5) -> str:
        raise NotImplementedError


class OpenAILLM(LLM):
    is_mock = False

    def __init__(self):
        from openai import OpenAI
        s = get_settings()
        self.client = OpenAI(api_key=s.openai_api_key, base_url=s.openai_base_url or None)
        self.model = s.openai_model
        self.name = f"openai:{self.model}"

    def chat(self, system, messages, tools, run_tool, max_steps=5):
        msgs = [{"role": "system", "content": system}] + messages
        extra = {}
        if tools:
            extra["tools"] = [{"type": "function", "function": {"name": t.name, "description": t.description,
                                                               "parameters": t.parameters}} for t in tools]
        for _ in range(max_steps):
            m = self.client.chat.completions.create(model=self.model, messages=msgs, temperature=0.2,
                                                    **extra).choices[0].message
            if not m.tool_calls:
                return m.content or ""
            msgs.append(m.model_dump(exclude_none=True))
            for tc in m.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                msgs.append({"role": "tool", "tool_call_id": tc.id, "content": run_tool(tc.function.name, args)})
        return "I couldn't finish that request. Let me connect you with an account manager."


class OllamaLLM(OpenAILLM):
    def __init__(self):
        from openai import OpenAI
        s = get_settings()
        base_url = s.ollama_base_url.rstrip("/")
        if not base_url.endswith("/v1"):
            base_url += "/v1"
        self.client = OpenAI(api_key="ollama", base_url=base_url)
        self.model = s.ollama_model
        self.name = f"ollama:{self.model}"


class AnthropicLLM(LLM):
    is_mock = False

    def __init__(self):
        import anthropic
        s = get_settings()
        self.client = anthropic.Anthropic(api_key=s.anthropic_api_key)
        self.model = s.anthropic_model
        self.name = f"anthropic:{self.model}"

    def chat(self, system, messages, tools, run_tool, max_steps=5):
        msgs = [dict(m) for m in messages]
        while msgs and msgs[0]["role"] != "user":
            msgs.pop(0)
        extra = {}
        if tools:
            extra["tools"] = [{"name": t.name, "description": t.description, "input_schema": t.parameters} for t in tools]
        for _ in range(max_steps):
            r = self.client.messages.create(model=self.model, max_tokens=1024, system=system, messages=msgs,
                                            temperature=0.2, **extra)
            if r.stop_reason != "tool_use":
                return "".join(b.text for b in r.content if b.type == "text")
            msgs.append({"role": "assistant", "content": r.content})
            msgs.append({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": b.id, "content": run_tool(b.name, b.input)}
                for b in r.content if b.type == "tool_use"]})
        return "I couldn't finish that request. Let me connect you with an account manager."


@lru_cache(maxsize=1)
def get_llm() -> LLM:
    p = get_settings().llm_provider
    if p == "ollama":
        return OllamaLLM()
    if p == "openai":
        return OpenAILLM()
    if p == "anthropic":
        return AnthropicLLM()
    if p == "mock":
        return LLM()
    raise ValueError(f"Unsupported LLM_PROVIDER: {p}")
