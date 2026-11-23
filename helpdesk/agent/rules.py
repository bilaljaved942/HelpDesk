"""Plain rules that back up the model.

A small local model sometimes misses the obvious ("REFUND ME NOW!!!" labelled calm), so
hand-off triggers are checked twice: by the model and by these rules. Either one is enough.
"""

import re

ORDER_RE = re.compile(r"(?:order|#|no\.?|number)\s*(?:number|no\.?|#)?\s*[:#]?\s*(\d{4,6})\b", re.I)
BARE_NUMBER_RE = re.compile(r"^\s*#?(\d{4,6})\s*[.!?]?\s*$")

HUMAN_RE = re.compile(
    r"\b(human|real person|a person|someone real|live agent|an agent|representative|speak to (?:someone|a manager)|"
    r"talk to (?:someone|a manager|support)|manager|supervisor|call me)\b", re.I)
REFUND_RE = re.compile(r"\b(refund|refunded|money back|my money|reimburse|chargeback|charge ?back)\b", re.I)
ANGRY_RE = re.compile(
    r"\b(ridiculous|unacceptable|terrible|worst|furious|angry|scam|useless|disgusting|fed up|sick of|"
    r"never again|lawyer|sue|wtf|damn|hell|third time|3rd time|still waiting|again\?!)\b", re.I)
YES_RE = re.compile(r"^\s*(yes|yeah|yep|yup|sure|ok|okay|please|yes please|please do|go ahead|connect me|do it)\b", re.I)
NO_RE = re.compile(r"^\s*(no|nope|no thanks|not now|nah)\b", re.I)
GREETING_RE = re.compile(r"^\s*(hi|hello|hey|good (morning|afternoon|evening))\W*\s*$", re.I)
THANKS_RE = re.compile(r"^\s*(thanks|thank you|thx|cheers|great,? thanks|perfect,? thanks|ok thanks)\W*.{0,20}$", re.I)


def order_number(text: str) -> str | None:
    m = ORDER_RE.search(text) or BARE_NUMBER_RE.match(text)
    return m.group(1) if m else None


def shouting(text: str) -> bool:
    letters = [c for c in text if c.isalpha()]
    caps = sum(c.isupper() for c in letters)
    return len(letters) >= 12 and caps / len(letters) > 0.6


def looks_angry(text: str) -> bool:
    return bool(ANGRY_RE.search(text)) or shouting(text) or text.count("!") >= 3


def wants_human(text: str) -> bool:
    return bool(HUMAN_RE.search(text))


def wants_refund(text: str) -> bool:
    return bool(REFUND_RE.search(text))


def is_yes(text: str) -> bool:
    return bool(YES_RE.match(text)) and len(text) < 60


def is_no(text: str) -> bool:
    return bool(NO_RE.match(text)) and len(text) < 40


def is_greeting(text: str) -> bool:
    return bool(GREETING_RE.match(text))


def is_thanks(text: str) -> bool:
    return bool(THANKS_RE.match(text)) and "?" not in text
