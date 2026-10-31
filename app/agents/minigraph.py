"""Tiny drop-in for langgraph.graph.StateGraph (same API subset) so the system runs
even where LangGraph isn't installed. With LangGraph installed it is not used."""
from __future__ import annotations

END = "__end__"


class StateGraph:
    def __init__(self, schema=None):
        self.nodes, self.edges, self.cond, self.entry = {}, {}, {}, None

    def add_node(self, name, fn): self.nodes[name] = fn
    def set_entry_point(self, name): self.entry = name
    def add_edge(self, a, b): self.edges[a] = b
    def add_conditional_edges(self, src, fn, mapping): self.cond[src] = (fn, mapping)
    def compile(self): return self

    def invoke(self, state: dict) -> dict:
        cur = self.entry
        for _ in range(50):
            if cur == END:
                return state
            state.update(self.nodes[cur](state) or {})
            if cur in self.cond:
                fn, mapping = self.cond[cur]
                cur = mapping[fn(state)]
            else:
                cur = self.edges.get(cur, END)
        raise RuntimeError("graph did not terminate")
