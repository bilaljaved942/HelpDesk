from helpdesk.agent import rules
from helpdesk.agent.grounding import quote_found, word_coverage
from helpdesk.ingest import split, title_of


def test_order_numbers():
    assert rules.order_number("where is order 1042?") == "1042"
    assert rules.order_number("order #1042") == "1042"
    assert rules.order_number("1042") == "1042"
    assert rules.order_number("I bought 2 jackets") is None


def test_handoff_triggers():
    assert rules.looks_angry("THIS IS RIDICULOUS, WHERE IS MY PARCEL")
    assert rules.looks_angry("still nothing!!!")
    assert not rules.looks_angry("Hi, where is my parcel?")
    assert rules.wants_human("can I talk to a real person")
    assert rules.wants_refund("I want my money back")
    assert not rules.wants_refund("how do returns work?")


def test_quote_must_exist_in_source():
    src = "You can return most items within 30 days of delivery."
    assert quote_found("return most items within 30 days", src)
    assert not quote_found("return most items within 60 days", src)


def test_made_up_answer_has_low_word_coverage():
    src = ["Northwind Outfitters Flagship Store, Portland. Open daily 10 am - 7 pm."]
    assert word_coverage("The store is open daily from 10 am to 7 pm.", src) >= 0.8
    assert word_coverage("The store allows service animals but not pets.", src) < 0.6


def test_split_follows_headings():
    text = "# Returns Policy\n\n## Return window\n30 days.\n\n## Footwear\nIndoors only."
    pieces = split(text)
    assert title_of(text, "x.md") == "Returns Policy"
    assert [p.heading for p in pieces] == ["Return window", "Footwear"]
