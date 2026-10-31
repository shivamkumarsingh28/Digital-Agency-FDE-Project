import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np

from app.llm import OllamaLLM, get_llm
from app.rag.embeddings import OllamaEmbedder


class OllamaIntegration(unittest.TestCase):
    def tearDown(self):
        get_llm.cache_clear()

    def test_ollama_provider_uses_openai_compatible_chat_api(self):
        settings = SimpleNamespace(
            ollama_base_url="http://localhost:11434",
            ollama_model="llama3.2",
        )
        with patch("app.llm.get_settings", return_value=settings):
            with patch("openai.OpenAI") as openai_client:
                llm = OllamaLLM()

        self.assertEqual(llm.name, "ollama:llama3.2")
        self.assertFalse(llm.is_mock)
        openai_client.assert_called_once_with(
            api_key="ollama",
            base_url="http://localhost:11434/v1",
        )

    def test_configured_ollama_provider_is_selected(self):
        with patch("app.llm.get_settings", return_value=SimpleNamespace(llm_provider="ollama")):
            with patch("app.llm.OllamaLLM") as ollama:
                get_llm.cache_clear()
                get_llm()
        ollama.assert_called_once_with()

    def test_ollama_chat_sends_openai_compatible_request(self):
        received = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                received["path"] = self.path
                received["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                payload = json.dumps({
                    "id": "chatcmpl-test",
                    "object": "chat.completion",
                    "created": 0,
                    "model": "llama3.2",
                    "choices": [{
                        "index": 0,
                        "message": {"role": "assistant", "content": "Hello from Ollama"},
                        "finish_reason": "stop",
                    }],
                }).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, _format, *_args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            settings = SimpleNamespace(
                ollama_base_url=f"http://127.0.0.1:{server.server_port}",
                ollama_model="llama3.2",
            )
            with patch("app.llm.get_settings", return_value=settings):
                answer = OllamaLLM().chat("system prompt", [{"role": "user", "content": "hello"}], [], lambda *_: "")
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

        self.assertEqual(answer, "Hello from Ollama")
        self.assertEqual(received["path"], "/v1/chat/completions")
        self.assertEqual(received["body"]["model"], "llama3.2")
        self.assertEqual(received["body"]["messages"][0], {"role": "system", "content": "system prompt"})

    def test_ollama_embedder_posts_to_native_embed_api(self):
        received = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                received["path"] = self.path
                received["body"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                payload = json.dumps({"embeddings": [[3, 4], [0, 2]]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, _format, *_args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            settings = SimpleNamespace(
                ollama_base_url=f"http://127.0.0.1:{server.server_port}/v1",
                embedding_model="nomic-embed-text",
            )
            with patch("app.rag.embeddings.get_settings", return_value=settings):
                vectors = OllamaEmbedder().embed(["first", "second"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

        self.assertEqual(received["path"], "/api/embed")
        self.assertEqual(received["body"], {"model": "nomic-embed-text", "input": ["first", "second"]})
        np.testing.assert_allclose(vectors, [[0.6, 0.8], [0.0, 1.0]])


if __name__ == "__main__":
    unittest.main()
