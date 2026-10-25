"""Greek tax documents (παραστατικά) for every Stripe payment.

Stripe is the source of truth for the money; the legal document is OURS, because a
Stripe invoice can never carry the ΜΑΡΚ / UID / QR that AADE returns, nor follow the
series and numbering declared to AADE.

Flow: payment -> invoice row -> atomic series number -> myDATA SendInvoices ->
store ΜΑΡΚ/UID/QR -> render the PDF -> email it. The PDF is produced AFTER myDATA
answers, because the QR only exists then.

Everything is driven by env so no tax data is hard-coded:
  ISSUER_NAME ISSUER_LEGAL_FORM ISSUER_VAT ISSUER_TAX_OFFICE ISSUER_ADDRESS
  ISSUER_CITY ISSUER_POSTAL ISSUER_GEMI ISSUER_ACTIVITY ISSUER_BRANCH
  INVOICE_SERIES VAT_RATE PRICES_INCLUDE_VAT
  MYDATA_BASE MYDATA_USER_ID MYDATA_SUBSCRIPTION_KEY
  MYDATA_TYPE_RETAIL MYDATA_TYPE_B2B MYDATA_INCOME_CLASSIFICATION MYDATA_E3
  MYDATA_VAT_CATEGORY MYDATA_ISSUED_BY_PROVIDER
"""
from __future__ import annotations

import logging
import os
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlsplit, quote

import httpx

logger = logging.getLogger(__name__)

NS = "http://www.aade.gr/myDATA/invoice/v1.0"
ICLS = "https://www.aade.gr/myDATA/incomeClassificaton/v1.0"


def _env(key: str, default: str = "") -> str:
    return (os.environ.get(key) or default).strip()


def issuer() -> dict:
    return {
        "name": _env("ISSUER_NAME"),
        "legal_form": _env("ISSUER_LEGAL_FORM"),
        "vat": _env("ISSUER_VAT"),
        "tax_office": _env("ISSUER_TAX_OFFICE"),
        "address": _env("ISSUER_ADDRESS"),
        "city": _env("ISSUER_CITY"),
        "postal": _env("ISSUER_POSTAL"),
        "gemi": _env("ISSUER_GEMI"),
        "activity": _env("ISSUER_ACTIVITY"),
        "branch": int(_env("ISSUER_BRANCH", "0") or 0),
    }


def configured() -> bool:
    i = issuer()
    return bool(i["name"] and i["vat"])


def mydata_configured() -> bool:
    return bool(_env("MYDATA_USER_ID") and _env("MYDATA_SUBSCRIPTION_KEY"))


def _vat_rate() -> float:
    # 0 by default: the business is not VAT-registered yet. Set VAT_RATE=24 the day
    # it is, and both the document and the myDATA category follow automatically.
    return float(_env("VAT_RATE", "0") or 0)


def _vat_category() -> str:
    """myDATA vatCategory: 1=24%, 2=13%, 3=6%, 4=17%, 5=9%, 6=4%, 7=0%/exempt."""
    override = _env("MYDATA_VAT_CATEGORY")
    if override:
        return override
    return {24: "1", 13: "2", 6: "3", 17: "4", 9: "5", 4: "6"}.get(int(_vat_rate()), "7")


def _split_vat(total: float) -> tuple:
    """Our listed prices are VAT-inclusive unless told otherwise."""
    rate = _vat_rate() / 100.0
    if _env("PRICES_INCLUDE_VAT", "1") in ("1", "true", "yes"):
        net = round(total / (1 + rate), 2)
        return net, round(total - net, 2), round(total, 2)
    net = round(total, 2)
    vat = round(net * rate, 2)
    return net, vat, round(net + vat, 2)


# ---------------------------------------------------------------- numbering --
async def _next_aa(db, series: str) -> int:
    """Atomic per-series counter — two concurrent payments must never share a number."""
    key = f"invoice_{series}"
    await db.counters.update_one({"id": key}, {"$inc": {"value": 1}}, upsert=True)
    row = await db.counters.find_one({"id": key}) or {}
    return int(row.get("value") or 1)


# -------------------------------------------------------------------- myDATA --
def _build_xml(inv: dict) -> bytes:
    i = issuer()
    cp = inv.get("counterparty") or {}
    root = ET.Element("InvoicesDoc", {"xmlns": NS})
    doc = ET.SubElement(root, "invoice")

    iss = ET.SubElement(doc, "issuer")
    ET.SubElement(iss, "vatNumber").text = i["vat"]
    ET.SubElement(iss, "country").text = "GR"
    ET.SubElement(iss, "branch").text = str(i["branch"])

    if cp.get("vat"):
        c = ET.SubElement(doc, "counterpart")
        ET.SubElement(c, "vatNumber").text = cp["vat"]
        ET.SubElement(c, "country").text = cp.get("country") or "GR"
        ET.SubElement(c, "branch").text = "0"

    hdr = ET.SubElement(doc, "invoiceHeader")
    ET.SubElement(hdr, "series").text = inv["series"]
    ET.SubElement(hdr, "aa").text = str(inv["aa"])
    ET.SubElement(hdr, "issueDate").text = inv["issued_at"][:10]
    ET.SubElement(hdr, "invoiceType").text = inv["doc_type"]
    ET.SubElement(hdr, "currency").text = inv.get("currency") or "EUR"

    pm = ET.SubElement(doc, "paymentMethods")
    d = ET.SubElement(pm, "paymentMethodDetails")
    ET.SubElement(d, "type").text = "3"          # 3 = card / web banking
    ET.SubElement(d, "amount").text = f"{inv['total']:.2f}"

    row = ET.SubElement(doc, "invoiceDetails")
    ET.SubElement(row, "lineNumber").text = "1"
    ET.SubElement(row, "netValue").text = f"{inv['net']:.2f}"
    ET.SubElement(row, "vatCategory").text = _vat_category()
    ET.SubElement(row, "vatAmount").text = f"{inv['vat']:.2f}"
    if _vat_category() == "7":
        # AADE rejects a 0% line without the reason for the exemption.
        ET.SubElement(row, "vatExemptionCategory").text = _env("MYDATA_VAT_EXEMPTION", "1")
    cls = ET.SubElement(row, "incomeClassification")
    ET.SubElement(cls, "{%s}classificationType" % ICLS).text = _env("MYDATA_E3", "E3_561_003")
    ET.SubElement(cls, "{%s}classificationCategory" % ICLS).text = _env(
        "MYDATA_INCOME_CLASSIFICATION", "category1_3")
    ET.SubElement(cls, "{%s}amount" % ICLS).text = f"{inv['net']:.2f}"

    summary = ET.SubElement(doc, "invoiceSummary")
    ET.SubElement(summary, "totalNetValue").text = f"{inv['net']:.2f}"
    ET.SubElement(summary, "totalVatAmount").text = f"{inv['vat']:.2f}"
    ET.SubElement(summary, "totalWithheldAmount").text = "0.00"
    ET.SubElement(summary, "totalFeesAmount").text = "0.00"
    ET.SubElement(summary, "totalStampDutyAmount").text = "0.00"
    ET.SubElement(summary, "totalOtherTaxesAmount").text = "0.00"
    ET.SubElement(summary, "totalDeductionsAmount").text = "0.00"
    ET.SubElement(summary, "totalGrossValue").text = f"{inv['total']:.2f}"
    scls = ET.SubElement(summary, "incomeClassification")
    ET.SubElement(scls, "{%s}classificationType" % ICLS).text = _env("MYDATA_E3", "E3_561_003")
    ET.SubElement(scls, "{%s}classificationCategory" % ICLS).text = _env(
        "MYDATA_INCOME_CLASSIFICATION", "category1_3")
    ET.SubElement(scls, "{%s}amount" % ICLS).text = f"{inv['net']:.2f}"

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _mydata_url(path: str) -> str:
    """AADE's ERP interface uses a DIFFERENT path per environment:
       production  https://mydatapi.aade.gr/myDATA/<path>
       sandbox     https://mydataapidev.aade.gr/<path>   (no /myDATA segment!)
    Calling the sandbox with the /myDATA prefix returns HTTP 404 "Resource not
    found", which is exactly what bit us. Only the host from MYDATA_BASE is used,
    so a value pasted with a trailing path can't break the call either.
    """
    raw = (_env("MYDATA_BASE", "https://mydataapidev.aade.gr") or "").strip().rstrip("/")
    if not raw.startswith("http"):
        raw = "https://" + raw
    host = urlsplit(raw).netloc
    prefix = "" if "dev" in host else "/myDATA"
    return f"https://{host}{prefix}/{path.lstrip('/')}"


async def send_to_mydata(inv: dict) -> dict:
    """POST one document. Returns {'mark','uid','qr','status','error'}."""
    if not mydata_configured():
        return {"status": "skipped", "error": "myDATA credentials not configured"}
    url = _mydata_url("SendInvoices")
    headers = {
        "aade-user-id": _env("MYDATA_USER_ID"),
        "ocp-apim-subscription-key": _env("MYDATA_SUBSCRIPTION_KEY"),
        "Content-Type": "application/xml",
    }
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(url, headers=headers, content=_build_xml(inv))
    except Exception as e:
        return {"status": "error", "error": f"{type(e).__name__}: {e}"}
    if r.status_code != 200:
        return {"status": "error", "error": f"HTTP {r.status_code} at {url}: {r.text[:260]}"}
    try:
        tree = ET.fromstring(r.text)
    except ET.ParseError as e:
        return {"status": "error", "error": f"bad XML: {e}"}
    find = lambda tag: next((e.text for e in tree.iter() if e.tag.endswith(tag)), "")  # noqa: E731
    status = (find("statusCode") or "").lower()
    if status != "success":
        errs = " / ".join(e.text or "" for e in tree.iter() if e.tag.endswith("message"))
        return {"status": "rejected", "error": errs or r.text[:300]}
    return {"status": "sent", "mark": find("invoiceMark") or "", "uid": find("invoiceUid") or "",
            "qr": find("qrUrl") or "", "error": ""}


# ----------------------------------------------------------------- issuance --
def _doc_type(counterparty: dict) -> str:
    """ΤΠΥ (2.1) when the buyer gave a VAT number, retail ΑΠΥ (11.2) otherwise."""
    return _env("MYDATA_TYPE_B2B", "2.1") if (counterparty or {}).get("vat") \
        else _env("MYDATA_TYPE_RETAIL", "11.2")


async def _create(db, *, user_id, total, description, stripe_ref, counterparty,
                  payment, doc_type=None, currency="EUR") -> dict:
    series = _env("INVOICE_SERIES", "A")
    aa = await _next_aa(db, series)
    net, vat, total = _split_vat(float(total))
    now = datetime.now(timezone.utc)
    inv = {
        "id": uuid.uuid4().hex,
        "user_id": user_id or "",
        "series": series,
        "aa": aa,
        "number": f"{now.strftime('%Y%m%d')}-{aa:04d}",
        "doc_type": doc_type or _doc_type(counterparty),
        "issued_at": now.isoformat(),
        "currency": (currency or "EUR").upper(),
        "net": net, "vat": vat, "total": total, "vat_rate": _vat_rate(),
        "counterparty": counterparty or {},
        "lines": [{"description": description, "qty": 1, "unit": net, "total": net}],
        "payment": payment or {},
        "stripe_ref": stripe_ref or "",
        "mark": "", "uid": "", "qr": "",
        "mydata_status": "pending", "mydata_error": "",
        "created_at": now.isoformat(),
    }
    res = await send_to_mydata(inv)
    inv.update({"mark": res.get("mark", ""), "uid": res.get("uid", ""), "qr": res.get("qr", ""),
                "mydata_status": res.get("status", "pending"), "mydata_error": res.get("error", "")})
    await db.invoices.insert_one({**inv,
                                  "counterparty": _json(inv["counterparty"]),
                                  "lines": _json(inv["lines"]),
                                  "payment": _json(inv["payment"])})
    if inv["mydata_status"] != "sent":
        logger.warning("invoice %s: myDATA %s — %s", inv["number"],
                       inv["mydata_status"], inv["mydata_error"])
    return inv


def _json(v):
    import json
    return json.dumps(v, ensure_ascii=False)


async def _already(db, ref: str) -> bool:
    """Stripe retries webhooks — a document must never be issued twice."""
    return bool(ref) and bool(await db.invoices.find_one({"stripe_ref": ref}))


def _counterparty_from(obj: dict) -> dict:
    d = obj.get("customer_details") or obj.get("customer_address") or {}
    addr = d.get("address") or obj.get("customer_address") or {}
    ids = d.get("tax_ids") or obj.get("customer_tax_ids") or []
    vat = next((t.get("value") for t in ids if t.get("value")), "")
    return {
        "name": d.get("name") or obj.get("customer_name") or "",
        "email": d.get("email") or obj.get("customer_email") or "",
        "vat": vat,
        "address": (addr or {}).get("line1") or "",
        "city": (addr or {}).get("city") or "",
        "postal": (addr or {}).get("postal_code") or "",
        "country": (addr or {}).get("country") or "GR",
    }


async def issue_invoice_for_session(db, session, tx) -> dict | None:
    """One-off purchase (Checkout in `payment` mode)."""
    if not configured():
        logger.warning("invoices: ISSUER_* not configured — skipping document")
        return None
    s = session if isinstance(session, dict) else session.to_dict()
    ref = f"cs:{s.get('id')}"
    if await _already(db, ref):
        return None
    total = (s.get("amount_total") or 0) / 100.0
    meta = s.get("metadata") or {}
    inv = await _create(
        db, user_id=meta.get("user_id") or (tx or {}).get("user_id"),
        total=total, description="Moka Pro — 30-day access",
        stripe_ref=ref, counterparty=_counterparty_from(s),
        payment={"method": "Card", "ref": s.get("payment_intent") or ""},
        currency=(s.get("currency") or "eur"))
    await _deliver(db, inv)
    return inv


async def issue_invoice_for_stripe_invoice(db, invoice: dict) -> dict | None:
    """Subscription payment — fires on the first charge AND on every renewal."""
    if not configured():
        logger.warning("invoices: ISSUER_* not configured — skipping document")
        return None
    ref = f"in:{invoice.get('id')}"
    if not invoice.get("subscription"):
        # A one-off Checkout also produces a Stripe invoice (invoice_creation), and
        # that purchase is already documented from the session — do not issue twice.
        return None
    if await _already(db, ref):
        return None
    total = (invoice.get("amount_paid") or 0) / 100.0
    if total <= 0:
        return None
    sub = invoice.get("subscription")
    user = await db.users.find_one({"stripe_subscription_id": sub}, {"_id": 0, "user_id": 1}) \
        if sub else None
    line = ((invoice.get("lines") or {}).get("data") or [{}])[0]
    period = line.get("period") or {}
    desc = line.get("description") or "Moka Pro subscription"
    if period.get("start") and period.get("end"):
        fmt = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%d/%m/%Y")  # noqa: E731
        desc = f"{desc} ({fmt(period['start'])} - {fmt(period['end'])})"
    inv = await _create(
        db, user_id=(user or {}).get("user_id"), total=total, description=desc,
        stripe_ref=ref, counterparty=_counterparty_from(invoice),
        payment={"method": "Card", "ref": invoice.get("payment_intent") or ""},
        currency=(invoice.get("currency") or "eur"))
    await _deliver(db, inv)
    return inv


async def issue_credit_note(db, charge: dict) -> dict | None:
    """Refund -> πιστωτικό (5.1), so myDATA stays balanced."""
    if not configured():
        return None
    amount = (charge.get("amount_refunded") or 0) / 100.0
    if amount <= 0:
        return None
    ref = f"re:{charge.get('id')}"
    if await _already(db, ref):
        return None
    inv = await _create(
        db, user_id="", total=amount, description="Credit note — refund",
        stripe_ref=ref, counterparty=_counterparty_from(charge),
        payment={"method": "Card refund", "ref": charge.get("payment_intent") or ""},
        doc_type=_env("MYDATA_TYPE_CREDIT", "5.1"),
        currency=(charge.get("currency") or "eur"))
    return inv


async def _deliver(db, inv: dict) -> None:
    """Email the PDF. Never let a mail failure undo a valid document, but DO record
    why it failed so it can be seen (and retried) without digging through logs."""
    to = (inv.get("counterparty") or {}).get("email")
    if not to:
        return
    try:
        from email_service import send_invoice_email
        ok, err = await send_invoice_email(to, inv, render_pdf(inv))
    except Exception as exc:
        ok, err = False, f"{type(exc).__name__}: {exc}"[:300]
        logger.exception("invoice %s: email failed", inv.get("number"))
    await db.invoices.update_one({"id": inv["id"]}, {"$set": {
        "emailed": datetime.now(timezone.utc).isoformat() if ok else "",
        "email_error": "" if ok else err,
    }})


# --------------------------------------------------------------------- PDF --
_FONT, _FONT_B = "Helvetica", "Helvetica-Bold"


def _register_fonts() -> None:
    """Helvetica has no Greek accents (Αθήνα renders as "Αθ να"), so the PDF ships
    with DejaVu — vendored in assets/ because the production image has no fonts."""
    global _FONT, _FONT_B
    if _FONT != "Helvetica":
        return
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    here = os.path.join(os.path.dirname(__file__), "assets")
    for name, file in (("DejaVuSans", "DejaVuSans.ttf"), ("DejaVuSans-Bold", "DejaVuSans-Bold.ttf")):
        path = os.path.join(here, file)
        if not os.path.exists(path):
            path = f"/usr/share/fonts/truetype/dejavu/{file}"
        if not os.path.exists(path):
            return
        pdfmetrics.registerFont(TTFont(name, path))
    _FONT, _FONT_B = "DejaVuSans", "DejaVuSans-Bold"


def render_pdf(inv: dict) -> bytes:
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    _register_fonts()

    i = issuer()
    cp = inv.get("counterparty") or {}
    pay = inv.get("payment") or {}
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    W, H = A4
    green = (0.224, 1.0, 0.078)

    def line(y, x1=20 * mm, x2=W - 20 * mm, col=(0.85, 0.85, 0.85)):
        c.setStrokeColorRGB(*col)
        c.setLineWidth(0.6)
        c.line(x1, y, x2, y)

    y = H - 22 * mm
    for logo in ("/app/frontend/public/lion-crest.png", "/app/frontend/public/lion-logo.png"):
        if os.path.exists(logo):
            try:
                c.drawImage(logo, 20 * mm, y - 6 * mm, width=18 * mm, height=18 * mm,
                            mask="auto", preserveAspectRatio=True)
                break
            except Exception:
                pass
    c.setFillColorRGB(0, 0, 0)
    c.setFont(_FONT_B, 20)
    c.drawString(42 * mm, y + 5 * mm, "LION.STATS")
    c.setFont(_FONT, 8.5)
    c.drawString(42 * mm, y, f"{i['name']} {i['legal_form']}".strip())
    c.drawString(42 * mm, y - 4 * mm, f"{i['address']}, {i['postal']} {i['city']}")
    c.drawString(42 * mm, y - 8 * mm, f"ΑΦΜ: {i['vat']}  ·  ΔΟΥ: {i['tax_office']}"
                                     + (f"  ·  ΓΕΜΗ: {i['gemi']}" if i["gemi"] else ""))

    label = {"11.2": "ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ", "2.1": "ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ",
             "5.1": "ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ"}.get(inv["doc_type"], "ΠΑΡΑΣΤΑΤΙΚΟ")
    c.setFont(_FONT_B, 11)
    c.drawRightString(W - 20 * mm, y + 5 * mm, label)
    c.setFont(_FONT, 9)
    issued = datetime.fromisoformat(inv["issued_at"])
    c.drawRightString(W - 20 * mm, y, f"Αρ. Παραστατικού: {inv['series']}-{inv['number']}")
    c.drawRightString(W - 20 * mm, y - 4 * mm, f"Ημερομηνία: {issued.strftime('%d/%m/%Y %H:%M')}")

    y -= 18 * mm
    line(y)

    y -= 8 * mm
    c.setFont(_FONT_B, 9)
    c.drawString(20 * mm, y, "ΣΤΟΙΧΕΙΑ ΠΕΛΑΤΗ")
    c.setFont(_FONT, 9)
    c.drawString(20 * mm, y - 5 * mm, cp.get("name") or cp.get("email") or "Ιδιώτης")
    if cp.get("vat"):
        c.drawString(20 * mm, y - 10 * mm, f"ΑΦΜ: {cp['vat']}")
    if cp.get("address"):
        c.drawString(20 * mm, y - 15 * mm, f"{cp['address']}, {cp.get('postal','')} {cp.get('city','')}")
    c.setFont(_FONT_B, 9)
    c.drawString(118 * mm, y, "ΠΛΗΡΩΜΗ")
    c.setFont(_FONT, 9)
    c.drawString(118 * mm, y - 5 * mm, f"Τρόπος: {pay.get('method', 'Κάρτα')}")
    c.drawString(118 * mm, y - 10 * mm, f"Α/Α Συναλλαγής: {(pay.get('ref') or '')[:32]}")

    y -= 26 * mm
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.rect(20 * mm, y - 2 * mm, W - 40 * mm, 7 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.setFont(_FONT_B, 8.5)
    c.drawString(22 * mm, y, "ΠΕΡΙΓΡΑΦΗ")
    c.drawRightString(W - 62 * mm, y, "ΠΟΣΟΤΗΤΑ")
    c.drawRightString(W - 40 * mm, y, "ΤΙΜΗ")
    c.drawRightString(W - 22 * mm, y, "ΣΥΝΟΛΟ")

    y -= 9 * mm
    c.setFont(_FONT, 9)
    for ln in inv.get("lines") or []:
        c.drawString(22 * mm, y, str(ln.get("description"))[:62])
        c.drawRightString(W - 62 * mm, y, str(ln.get("qty", 1)))
        c.drawRightString(W - 40 * mm, y, f"{float(ln.get('unit', 0)):.2f}")
        c.drawRightString(W - 22 * mm, y, f"{float(ln.get('total', 0)):.2f}")
        y -= 6 * mm

    y -= 4 * mm
    line(y)
    y -= 8 * mm
    cur = "€" if inv.get("currency", "EUR") == "EUR" else inv.get("currency")
    rate = float(inv.get("vat_rate") or 0)
    vat_label = f"ΦΠΑ {rate:.0f}%" if rate else "ΦΠΑ 0% (απαλλαγή)"
    for lbl, val in (("Καθαρή αξία", inv["net"]), (vat_label, inv["vat"])):
        c.setFont(_FONT, 9)
        c.drawRightString(W - 45 * mm, y, lbl)
        c.drawRightString(W - 22 * mm, y, f"{cur}{val:.2f}")
        y -= 6 * mm
    c.setFont(_FONT_B, 13)
    c.setFillColorRGB(*green)
    c.rect(W - 80 * mm, y - 3 * mm, 60 * mm, 10 * mm, fill=1, stroke=0)
    c.setFillColorRGB(0, 0, 0)
    c.drawRightString(W - 45 * mm, y, "ΤΕΛΙΚΟ ΠΟΣΟ")
    c.drawRightString(W - 22 * mm, y, f"{cur}{inv['total']:.2f}")

    y -= 22 * mm
    if inv.get("qr"):
        try:
            import qrcode
            from reportlab.lib.utils import ImageReader
            img = qrcode.make(inv["qr"])
            c.drawImage(ImageReader(img.get_image()), 20 * mm, y - 12 * mm,
                        width=26 * mm, height=26 * mm)
            c.setFont(_FONT, 7)
            c.drawString(20 * mm, y - 16 * mm, "Επαλήθευση Παραστατικού")
        except Exception:
            pass
    c.setFont(_FONT, 7.5)
    if inv.get("mark"):
        c.drawString(52 * mm, y + 10 * mm, f"ΜΑΡΚ: {inv['mark']}")
        c.drawString(52 * mm, y + 6 * mm, f"UID: {inv['uid']}")
    c.drawString(52 * mm, y + 2 * mm,
                 "Η έκδοση πραγματοποιήθηκε μέσω παρόχου ηλεκτρονικής τιμολόγησης"
                 if _env("MYDATA_ISSUED_BY_PROVIDER") == "1"
                 else "Διαβιβάστηκε ηλεκτρονικά στο myDATA της ΑΑΔΕ")
    c.setFont(_FONT, 7)
    c.drawCentredString(W / 2, 12 * mm, "LION.STATS · lion-stats.com · Ευχαριστούμε για την εμπιστοσύνη")
    c.showPage()
    c.save()
    return buf.getvalue()


# ----------------------------------------------------------------- routes ---
def make_invoices_router(db, current_user):
    import json as _json

    from fastapi import APIRouter, Depends, HTTPException
    from fastapi.responses import Response

    router = APIRouter(prefix="/api/invoices", tags=["invoices"])

    def _hydrate(row: dict) -> dict:
        out = dict(row)
        for k in ("counterparty", "lines", "payment"):
            v = out.get(k)
            if isinstance(v, str):
                try:
                    out[k] = _json.loads(v or "{}")
                except ValueError:
                    out[k] = {}
        return out

    async def _retry_mydata(row: dict) -> dict:
        """One extra attempt for a document that failed transmission. The number is
        already allocated, so this never creates a gap or a duplicate."""
        inv = _hydrate(row)
        attempts = int(row.get("mydata_attempts") or 0)
        res = await send_to_mydata(inv)
        await db.invoices.update_one({"id": inv["id"]}, {"$set": {
            "mark": res.get("mark", ""), "uid": res.get("uid", ""), "qr": res.get("qr", ""),
            "mydata_status": res.get("status", "pending"), "mydata_error": res.get("error", ""),
            "mydata_attempts": attempts + 1}})
        if res.get("status") == "sent":
            inv.update(res)
            inv["mydata_status"] = "sent"
            await _deliver(db, inv)   # the first email had no ΜΑΡΚ on it
        return res

    @router.get("")
    async def my_invoices(user=Depends(current_user)):
        rows = [_hydrate(r) async for r in await db.invoices.find({"user_id": user.user_id}, {"_id": 0})]
        rows.sort(key=lambda r: r.get("issued_at") or "", reverse=True)
        # Self-healing: a document that failed to reach myDATA (sandbox path, AADE
        # outage, bad credentials at the time) is retried when its owner looks at
        # the list, so it gets its ΜΑΡΚ without anyone touching the admin tools.
        for r in rows:
            if (r.get("mydata_status") == "error" and mydata_configured()
                    and int(r.get("mydata_attempts") or 0) < 6):
                res = await _retry_mydata(r)
                r.update({"mark": res.get("mark", ""), "mydata_status": res.get("status", "error")})
        def _out(r):
            o = {k: r.get(k) for k in ("id", "number", "series", "doc_type", "issued_at",
                                       "currency", "mark", "mydata_status")}
            # REAL columns come back as float32 — round for display.
            o.update({k: round(float(r.get(k) or 0), 2) for k in ("total", "net", "vat")})
            return o

        return {"invoices": [_out(r) for r in rows]}

    @router.get("/{invoice_id}/pdf")
    async def invoice_pdf(invoice_id: str, user=Depends(current_user)):
        row = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        if row.get("user_id") != user.user_id:
            raise HTTPException(status_code=403, detail="Not your invoice")
        inv = _hydrate(row)
        # HTTP headers are latin-1: the Greek series letter (Α) raised
        # UnicodeEncodeError -> HTTP 500, which is why the download button did nothing.
        pretty = f'{inv["series"]}-{inv["number"]}.pdf'
        ascii_name = f'invoice-{inv["number"]}.pdf'.encode("ascii", "ignore").decode() or "invoice.pdf"
        return Response(render_pdf(inv), media_type="application/pdf", headers={
            "Content-Disposition":
                f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(pretty)}"})

    @router.get("/admin/failed")
    async def failed_invoices(user=Depends(current_user)):
        """Anything AADE has not accepted yet, with the exact reason it gave."""
        from auth import is_admin
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admins only")
        rows = [_hydrate(r) async for r in await db.invoices.find({}, {"_id": 0})]
        bad = [r for r in rows if r.get("mydata_status") != "sent" or not r.get("emailed")]
        bad.sort(key=lambda r: r.get("issued_at") or "", reverse=True)
        # Opening this list also RETRIES each document, so one click gets the ΜΑΡΚ
        # and re-sends the corrected email to the customer.
        if mydata_configured():
            for r in bad:
                if r.get("mydata_status") == "error" and int(r.get("mydata_attempts") or 0) < 6:
                    res = await _retry_mydata(r)
                    r.update({"mark": res.get("mark", ""), "mydata_status": res.get("status", "error"),
                              "mydata_error": res.get("error", "")})
        for r in bad:
            # e.g. the mail provider rejected the sender domain at the time — now
            # that it's fixed, one click delivers the receipt.
            if not r.get("emailed") and (r.get("counterparty") or {}).get("email"):
                await _deliver(db, r)
                fresh = await db.invoices.find_one({"id": r["id"]}, {"_id": 0}) or {}
                r.update({"emailed": fresh.get("emailed"), "email_error": fresh.get("email_error")})
        return {"base": _mydata_url(""),
                "configured": mydata_configured(),
                "invoices": [{k: r.get(k) for k in
                              ("id", "number", "series", "doc_type", "issued_at", "total",
                               "mark", "mydata_status", "mydata_error", "emailed", "email_error")} for r in bad]}

    @router.post("/admin/email-test")
    async def email_test(body: dict | None = None, user=Depends(current_user)):
        """Admin diagnostic: send a plain test email and return the provider's exact error."""
        from auth import is_admin
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admins only")
        from email_service import send_test_email, _from
        to = ((body or {}).get("to") or user.email or "").strip()
        ok, err = await send_test_email(to)
        return {"ok": ok, "to": to, "from": _from(), "error": err}

    @router.post("/{invoice_id}/resend-email")
    async def resend_email(invoice_id: str, user=Depends(current_user)):
        """Admin: re-send the PDF of an already issued document (no new numbering)."""
        from auth import is_admin
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admins only")
        row = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        inv = _hydrate(row)
        await _deliver(db, inv)
        fresh = await db.invoices.find_one({"id": invoice_id}, {"_id": 0}) or {}
        return {"ok": bool(fresh.get("emailed")), "emailed": fresh.get("emailed"),
                "error": fresh.get("email_error")}

    @router.get("/admin/mydata-check")
    async def mydata_check(user=Depends(current_user)):
        """Prove the credentials work WITHOUT issuing anything: RequestDocs is a
        read-only call, so a 200 means aade-user-id + subscription key are right."""
        from auth import is_admin
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admins only")
        if not mydata_configured():
            return {"ok": False, "reason": "MYDATA_USER_ID / MYDATA_SUBSCRIPTION_KEY not set"}
        base = _mydata_url("")
        try:
            async with httpx.AsyncClient(timeout=30) as c:
                r = await c.get(_mydata_url("RequestDocs"), params={"mark": "0"}, headers={
                    "aade-user-id": _env("MYDATA_USER_ID"),
                    "ocp-apim-subscription-key": _env("MYDATA_SUBSCRIPTION_KEY")})
        except Exception as e:
            return {"ok": False, "base": base, "reason": f"{type(e).__name__}: {e}"}
        hint = {401: "wrong subscription key", 403: "wrong aade-user-id or no access to this environment",
                404: "wrong MYDATA_BASE"}.get(r.status_code, "")
        return {"ok": r.status_code == 200, "base": base, "http": r.status_code,
                "reason": hint, "body": r.text[:200]}

    @router.post("/{invoice_id}/retransmit")
    async def retransmit(invoice_id: str, user=Depends(current_user)):
        """Re-send a document to myDATA — same series number, no gap in the books.
        Needed after a rejected XML (wrong accountant code) or after switching
        MYDATA_BASE from the AADE sandbox to production."""
        from auth import is_admin
        if not is_admin(user):
            raise HTTPException(status_code=403, detail="Admins only")
        row = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
        if not row:
            raise HTTPException(status_code=404, detail="Not found")
        inv = _hydrate(row)
        if inv.get("mark"):
            return {"ok": True, "already": True, "mark": inv["mark"]}
        res = await send_to_mydata(inv)
        await db.invoices.update_one({"id": invoice_id}, {"$set": {
            "mark": res.get("mark", ""), "uid": res.get("uid", ""), "qr": res.get("qr", ""),
            "mydata_status": res.get("status", "pending"), "mydata_error": res.get("error", "")}})
        if res.get("status") == "sent":
            inv.update(res)
            await _deliver(db, inv)
        return {"ok": res.get("status") == "sent", **res}

    return router
