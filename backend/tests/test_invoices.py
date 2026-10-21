"""Greek tax document pipeline — numbering, VAT split, doc type, PDF, idempotency."""
import os

import invoices as inv

os.environ.setdefault("ISSUER_NAME", "LION STATS")
os.environ.setdefault("ISSUER_VAT", "123456789")


def test_vat_zero_rated_by_default():
    # The business is not VAT-registered yet: 0%, myDATA category 7 + exemption.
    assert inv._vat_rate() == 0
    assert inv._vat_category() == "7"
    assert inv._split_vat(10.99) == (10.99, 0.0, 10.99)
    xml = inv._build_xml({"series": "A", "aa": 1, "issued_at": "2026-10-21T19:00:00+00:00",
                          "doc_type": "11.2", "currency": "EUR", "net": 10.99, "vat": 0.0,
                          "total": 10.99, "counterparty": {}}).decode()
    assert "<vatCategory>7</vatCategory>" in xml
    assert "vatExemptionCategory" in xml


def test_vat_split_inclusive(monkeypatch):
    monkeypatch.setenv("VAT_RATE", "24")
    net, vat, total = inv._split_vat(10.99)
    assert (net, vat, total) == (8.86, 2.13, 10.99)
    assert round(net + vat, 2) == total


def test_vat_split_exclusive(monkeypatch):
    monkeypatch.setenv("VAT_RATE", "24")
    monkeypatch.setenv("PRICES_INCLUDE_VAT", "0")
    net, vat, total = inv._split_vat(10.0)
    assert (net, vat, total) == (10.0, 2.4, 12.4)


def test_doc_type_retail_vs_b2b():
    assert inv._doc_type({}) == "11.2"
    assert inv._doc_type({"vat": "EL123456789"}) == "2.1"


def test_pdf_renders_greek_and_mark():
    doc = {
        "series": "A", "number": "20261021-0007", "doc_type": "2.1",
        "issued_at": "2026-10-21T19:00:00+00:00", "currency": "EUR",
        "net": 64.51, "vat": 15.48, "total": 79.99, "vat_rate": 24,
        "counterparty": {"name": "Αγγελος Μοκάκος", "vat": "EL123", "city": "Αθήνα"},
        "lines": [{"description": "Moka Pro", "qty": 1, "unit": 64.51, "total": 64.51}],
        "payment": {"method": "Κάρτα", "ref": "pi_1"},
        "mark": "400001234567890", "uid": "A1B2", "qr": "https://www1.aade.gr/q?MARK=1",
    }
    pdf = inv.render_pdf(doc)
    assert pdf.startswith(b"%PDF") and len(pdf) > 5000


def test_mydata_xml_shape(monkeypatch):
    monkeypatch.setenv("VAT_RATE", "24")
    doc = {"series": "A", "aa": 7, "issued_at": "2026-10-21T19:00:00+00:00",
           "doc_type": "11.2", "currency": "EUR", "net": 8.86, "vat": 2.13, "total": 10.99,
           "counterparty": {}}
    xml = inv._build_xml(doc).decode()
    for needle in ("<series>A</series>", "<aa>7</aa>", "<invoiceType>11.2</invoiceType>",
                   "<totalGrossValue>10.99</totalGrossValue>", "classificationCategory"):
        assert needle in xml, needle


def test_numbering_is_sequential_and_idempotent():
    import asyncio

    from database import Database, init_db

    async def run():
        await init_db()
        db = Database()
        series = inv._env("INVOICE_SERIES", "A")
        first = await inv._next_aa(db, series)
        second = await inv._next_aa(db, series)
        # restore the counter so the suite never burns real invoice numbers
        await db.counters.update_one({"id": f"invoice_{series}"},
                                     {"$set": {"value": first - 1}}, upsert=True)
        assert second == first + 1
        assert await inv._already(db, "") is False

    asyncio.run(run())
