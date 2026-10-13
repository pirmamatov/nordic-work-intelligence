import math

from nwi_agent.core.models import ACTIVE, IDLE, LOCKED, LOCKED_PROCESS, Sample
from nwi_agent.core.segmenter import Segmenter

T0 = 1_000_000.0


def feed(seg: Segmenter, samples):
    out = []
    for s in samples:
        out += seg.feed(s)
    return out


def active(ts, process="winword.exe", idle=0.0):
    return Sample(T0 + ts, process, idle, False)


def test_uzluksiz_ish_bitta_segment_boladi():
    seg = Segmenter("s", 300)
    assert feed(seg, [active(t) for t in range(10)]) == []
    [segment] = seg.flush()
    assert (segment.process, segment.state, segment.start, segment.end) == ("winword.exe", ACTIVE, T0, T0 + 9)
    assert seg.flush() == []


def test_dastur_almashganda_segment_yopiladi():
    seg = Segmenter("s", 300)
    closed = feed(seg, [active(0), active(1), active(2), active(3, "chrome.exe"), active(4, "chrome.exe")])
    assert [(c.process, c.start, c.end) for c in closed] == [("winword.exe", T0, T0 + 3)]
    [last] = seg.flush()
    assert (last.process, last.start, last.end) == ("chrome.exe", T0 + 3, T0 + 4)


def test_nofaollik_oxirgi_kiritish_paytidan_boshlanadi():
    seg = Segmenter("s", idle_threshold_sec=300, max_segment_sec=10_000)
    # 100 soniya ishladi, keyin kiritish to'xtadi.
    samples = [active(t) for t in range(101)] + [active(100 + i, idle=float(i)) for i in range(1, 400)]
    closed = feed(seg, samples)
    [work] = closed
    # Faol segment chegara o'tgan lahzada (t=400) emas, oxirgi kiritishda (t=100) tugaydi.
    assert (work.state, work.start, work.end) == (ACTIVE, T0, T0 + 100)
    [idle] = seg.flush()
    assert (idle.state, idle.start, idle.end) == (IDLE, T0 + 100, T0 + 499)
    assert idle.to_event()["activeSec"] == 0 and idle.to_event()["idleSec"] == 399


def test_kiritish_qaytganda_yana_faol():
    seg = Segmenter("s", 60)
    samples = [active(0)] + [active(t, idle=float(t)) for t in range(1, 91)] + [active(91), active(92)]
    closed = feed(seg, samples)
    assert [(c.state, c.start, c.end) for c in closed] == [(IDLE, T0, T0 + 91)]
    [last] = seg.flush()
    assert (last.state, last.start, last.end) == (ACTIVE, T0 + 91, T0 + 92)


def test_qulflangan_ekran_alohida_segment():
    seg = Segmenter("s", 300)
    samples = [active(0), active(1), active(2)] + [Sample(T0 + t, None, 0.0, True) for t in range(3, 8)] + [active(8), active(9)]
    closed = feed(seg, samples)
    assert [(c.process, c.state, c.start, c.end) for c in closed] == [
        ("winword.exe", ACTIVE, T0, T0 + 3),
        (LOCKED_PROCESS, LOCKED, T0 + 3, T0 + 8),
    ]
    assert closed[1].to_event()["activeSec"] == 0


def test_uzilishdan_keyin_segment_oxirgi_namunada_yopiladi():
    seg = Segmenter("s", 300)
    # Kompyuter 1 soat uxladi: uyqu vaqti ish vaqtiga qo'shilmasligi kerak.
    closed = feed(seg, [active(0), active(1), active(2), active(3602), active(3603)])
    assert [(c.start, c.end) for c in closed] == [(T0, T0 + 2)]
    [after] = seg.flush()
    assert (after.start, after.end) == (T0 + 3602, T0 + 3603)


def test_soat_orqaga_surilganda_manfiy_davomiylik_bolmaydi():
    seg = Segmenter("s", 300)
    closed = feed(seg, [active(100), active(101), active(102), active(50), active(51)])
    assert [(c.start, c.end) for c in closed] == [(T0 + 100, T0 + 102)]
    [after] = seg.flush()
    assert after.duration == 1


def test_uzun_segment_bolinadi_va_vaqt_yoqolmaydi():
    seg = Segmenter("s", 300, max_segment_sec=60)
    closed = feed(seg, [active(t) for t in range(151)]) + seg.flush()
    assert [(c.start - T0, c.end - T0) for c in closed] == [(0, 60), (60, 120), (120, 150)]
    assert len({c.id for c in closed}) == 3


def test_aniqlanmagan_oyna_tashlab_ketiladi():
    seg = Segmenter("s", 300)
    closed = feed(seg, [active(0), active(1), Sample(T0 + 2, None, 0.0, False), active(3), active(4)])
    assert closed == []
    [segment] = seg.flush()
    assert segment.duration == 4


def test_bir_soniyadan_qisqa_segment_yuborilmaydi():
    seg = Segmenter("s", 300)
    closed = feed(seg, [active(0), active(0.4, "chrome.exe"), active(5, "chrome.exe")])
    assert closed == []


def test_hodisa_server_qoidalariga_mos():
    seg = Segmenter("s", 300)
    closed = feed(seg, [active(0), active(1.5), active(2.7), active(3.2, "chrome.exe")]) + seg.flush()
    for segment in closed:
        event = segment.to_event()
        assert event["endedAt"] > event["startedAt"]
        assert event["activeSec"] + event["idleSec"] <= math.ceil(segment.duration)
        assert event["processName"] == event["processName"].lower()
        assert set(event) == {"id", "sessionId", "processName", "startedAt", "endedAt", "activeSec", "idleSec", "state"}
