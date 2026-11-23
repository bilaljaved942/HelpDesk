"""The LLM behind one small interface.

The agent only needs two things from a model:
  json(...)   -> a filled-in Pydantic object (classifying a message, writing a ticket)
  stream(...) -> the answer, piece by piece, for the chat window

OllamaLLM runs a local model. To use Claude or Gemini instead, write another class with
these two methods and return it from get_llm(); nothing else changes.
"""

from collections.abc import Iterator
from functools import lru_cache
from typing import Protocol, TypeVar

import ollama
from pydantic import BaseModel

from helpdesk.settings import get_settings

T = TypeVar("T", bound=BaseModel)


class LLM(Protocol):
    name: str

    def json(self, system: str, user: str, schema: type[T], think: bool = False) -> T: ...

    def stream(self, system: str, messages: list[dict]) -> Iterator[str]: ...


class OllamaLLM:
    def __init__(self, model: str, host: str):
        self.name = f"ollama/{model}"
        self.model = model
        self.client = ollama.Client(host=host, timeout=180)

    def json(self, system: str, user: str, schema: type[T], think: bool = False) -> T:
        """think=True lets Qwen3 reason step by step first (slower, more careful)."""
        r = self.client.chat(
            model=self.model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            format=schema.model_json_schema(),   # Ollama forces the output to match this JSON schema
            think=think,                          # Qwen3: hidden reasoning step (off = much faster)
            options={"temperature": 0, "seed": 7},
            keep_alive="30m",
        )
        return schema.model_validate_json(r.message.content)

    def stream(self, system: str, messages: list[dict]) -> Iterator[str]:
        for part in self.client.chat(
            model=self.model,
            messages=[{"role": "system", "content": system}, *messages],
            stream=True,
            think=False,
            options={"temperature": 0, "seed": 7},   # support answers should be repeatable
            keep_alive="30m",
        ):
            if part.message.content:
                yield part.message.content

    def is_up(self) -> bool:
        try:
            names = {m.model for m in self.client.list().models}
            return self.model in names
        except Exception:
            return False


@lru_cache
def get_llm() -> OllamaLLM:
    s = get_settings()
    return OllamaLLM(s.llm_model, s.ollama_url)
