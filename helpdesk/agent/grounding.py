"""Checks that need no AI: is the answer really backed by the help docs?

1. quotes_found: every quote the model gives must appear word for word in its source.
2. word_coverage: share of the answer's meaningful words that appear in the sources.
   Made-up rules bring new words ("service animals", "pets") and score low.
"""

import re

STOPWORDS = set("""a an the and or but if of to in on at by for with from as is are was were be been being it its
this that these those you your yours we our us i me my they them their he she his her can could will would shall
should may might must do does did have has had not no yes so than then there here what which who whom when where why
how all any each few more most other some such only own same too very just also into about over under again
further once up down out off per via within without please let know happy help hi hello thanks thank""".split())


def _norm(t: str) -> str:
    return re.sub(r"[^a-z0-9$%.]+", " ", t.lower()).replace(" .", " ").strip(" .")


def quote_found(quote: str, source_text: str) -> bool:
    q = _norm(quote)
    return len(q) >= 8 and q in _norm(source_text)


def words(t: str) -> set[str]:
    return {w.strip(".") for w in _norm(t).split() if len(w.strip(".")) > 2 and w.strip(".") not in STOPWORDS}


def word_coverage(answer: str, sources: list[str]) -> float:
    ans = words(answer)
    if not ans:
        return 0.0
    src = set().union(*(words(s) for s in sources)) if sources else set()
    # allow simple plural / tense differences ("returns" vs "return")
    stem = lambda w: re.sub(r"(ing|ed|es|s)$", "", w)  # noqa: E731
    src_stems = {stem(w) for w in src}
    return sum(1 for w in ans if w in src or stem(w) in src_stems) / len(ans)
